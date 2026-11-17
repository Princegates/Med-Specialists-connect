// Encrypts secrets (API keys) before they are stored in the database. The key comes from the SETTINGS_ENC_KEY
// secret in Cloudflare, which is never stored in the database or the repository.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(env) {
  const m = env.SETTINGS_ENC_KEY;
  if (!m || String(m).length < 24) throw new Error('SETTINGS_ENC_KEY_MISSING');
  const h = await crypto.subtle.digest('SHA-256', enc.encode(String(m)));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(env, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(plain));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}
export async function decrypt(env, stored) {
  const [v, iv, ct] = String(stored).split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('BAD_CIPHERTEXT');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct));
  return dec.decode(pt);
}
