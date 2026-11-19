// Passkeys (WebAuthn): sign in with the phone's face, fingerprint or screen lock, or by scanning a code on the sign-in
// page with the phone's camera. No third-party code: this checks the browser's signed proof with the platform's own
// crypto. Only the ES256 (P-256) key type is accepted, which every phone and computer supports.
const enc = new TextEncoder();

export const b64u = {
  enc: (buf) => { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (str) => { const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); }
};
const sha256 = async (data) => new Uint8Array(await crypto.subtle.digest('SHA-256', data));
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

// The site's id for passkeys: the host without a leading "www.", so the same passkey works on both addresses.
export const rpIdOf = (url) => new URL(url).hostname.replace(/^www\./, '');

// ---- a small CBOR reader (enough for attestation objects and COSE keys)
function cbor(b, o = { i: 0 }) {
  const first = b[o.i++], major = first >> 5, info = first & 31;
  const len = () => {
    if (info < 24) return info;
    if (info === 24) return b[o.i++];
    if (info === 25) { const v = (b[o.i] << 8) | b[o.i + 1]; o.i += 2; return v; }
    if (info === 26) { const v = ((b[o.i] << 24) | (b[o.i + 1] << 16) | (b[o.i + 2] << 8) | b[o.i + 3]) >>> 0; o.i += 4; return v; }
    throw new Error('cbor: length too large');
  };
  if (major === 0) return len();
  if (major === 1) return -1 - len();
  if (major === 2) { const n = len(); const v = b.slice(o.i, o.i + n); o.i += n; return v; }
  if (major === 3) { const n = len(); const v = new TextDecoder().decode(b.slice(o.i, o.i + n)); o.i += n; return v; }
  if (major === 4) { const n = len(), a = []; for (let k = 0; k < n; k++) a.push(cbor(b, o)); return a; }
  if (major === 5) { const n = len(), m = new Map(); for (let k = 0; k < n; k++) { const key = cbor(b, o); m.set(key, cbor(b, o)); } return m; }
  if (major === 7) { if (info === 20) return false; if (info === 21) return true; if (info === 22) return null; return undefined; }
  throw new Error('cbor: unsupported');
}

function parseAuthData(ad) {
  if (ad.length < 37) throw new Error('short');
  const out = { rpIdHash: ad.slice(0, 32), flags: ad[32], signCount: ((ad[33] << 24) | (ad[34] << 16) | (ad[35] << 8) | ad[36]) >>> 0, cred: null };
  if (out.flags & 0x40) {
    const idLen = (ad[53] << 8) | ad[54];
    const id = ad.slice(55, 55 + idLen), o = { i: 55 + idLen }, key = cbor(ad, o);
    out.cred = { id, key };
  }
  return out;
}

function checkClientData(clientDataJSON, type, challenge, origin) {
  const data = JSON.parse(new TextDecoder().decode(clientDataJSON));
  if (data.type !== type) throw new Error('wrong type');
  if (!same(enc.encode(String(data.challenge)), enc.encode(challenge))) throw new Error('wrong challenge');
  if (data.origin !== origin) throw new Error('wrong origin');
  if (data.crossOrigin === true) throw new Error('cross origin');
}

// Checks a new passkey and returns what to store.
export async function verifyRegistration({ credential, challenge, origin, rpId }) {
  const clientDataJSON = b64u.dec(credential.response.clientDataJSON);
  checkClientData(clientDataJSON, 'webauthn.create', challenge, origin);
  const att = cbor(b64u.dec(credential.response.attestationObject));
  const authData = att instanceof Map ? att.get('authData') : null;
  if (!(authData instanceof Uint8Array)) throw new Error('no authData');
  const p = parseAuthData(authData);
  if (!same(p.rpIdHash, await sha256(enc.encode(rpId)))) throw new Error('wrong site');
  if (!(p.flags & 0x01) || !(p.flags & 0x04)) throw new Error('not verified by the person');
  if (!p.cred || !(p.cred.key instanceof Map)) throw new Error('no key');
  const k = p.cred.key, x = k.get(-2), y = k.get(-3);
  if (k.get(1) !== 2 || k.get(3) !== -7 || k.get(-1) !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) throw new Error('unsupported key');
  const raw = new Uint8Array(65); raw[0] = 4; raw.set(x, 1); raw.set(y, 33);
  const id = b64u.enc(p.cred.id);
  if (credential.id && credential.id !== id) throw new Error('id mismatch');
  return { id, publicKey: b64u.enc(raw), signCount: p.signCount };
}

// ECDSA signatures arrive in DER form; the platform's verify wants the two numbers side by side.
function derToRaw(der) {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { if (der[i++] !== 0x02) throw new Error('bad signature'); let n = der[i++]; let v = der.slice(i, i + n); i += n; while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); if (v.length > 32) throw new Error('bad signature'); out.set(v, 32 - v.length); return out; };
  const r = read(), s = read(); const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32); return raw;
}

// Checks a sign-in. Returns the new signature counter, or throws.
export async function verifyAssertion({ credential, challenge, origin, rpId, publicKey, signCount }) {
  const clientDataJSON = b64u.dec(credential.response.clientDataJSON), authData = b64u.dec(credential.response.authenticatorData);
  checkClientData(clientDataJSON, 'webauthn.get', challenge, origin);
  const p = parseAuthData(authData);
  if (!same(p.rpIdHash, await sha256(enc.encode(rpId)))) throw new Error('wrong site');
  if (!(p.flags & 0x01) || !(p.flags & 0x04)) throw new Error('not verified by the person');
  const key = await crypto.subtle.importKey('raw', b64u.dec(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const signed = new Uint8Array([...authData, ...(await sha256(clientDataJSON))]);
  const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(b64u.dec(credential.response.signature)), signed);
  if (!good) throw new Error('bad signature');
  // A counter that goes backwards suggests a cloned key. Many phone passkeys always send 0, which is fine.
  if ((signCount > 0 || p.signCount > 0) && p.signCount <= signCount) throw new Error('counter went back');
  return p.signCount;
}
