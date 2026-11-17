// Verifies the sign-in token Cloudflare Access adds to every request it lets through to /admin and /api/admin.
// Needs CF_ACCESS_TEAM_DOMAIN (e.g. yourname.cloudflareaccess.com) and CF_ACCESS_AUD (the application's AUD tag).
// Who counts as staff is decided by the Staff list in the admin console, not here.
const dec = new TextDecoder();
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

let cache = { at: 0, url: '', keys: null };
async function certs(url) {
  if (cache.keys && cache.url === url && Date.now() - cache.at < 3600000) return cache.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error('certs');
  const j = await r.json();
  cache = { at: Date.now(), url, keys: j.keys };
  return j.keys;
}

export async function requireAdmin(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const team = env.CF_ACCESS_TEAM_DOMAIN, aud = env.CF_ACCESS_AUD;
  if (!token || !team || !aud) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(dec.decode(b64u(parts[0])));
    const payload = JSON.parse(dec.decode(b64u(parts[1])));
    if (header.alg !== 'RS256') return null;
    const keys = await certs(env.ACCESS_CERTS_URL || `https://${team}/cdn-cgi/access/certs`);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    if (!([].concat(payload.aud || [])).includes(aud)) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== (env.ACCESS_ISSUER || `https://${team}`)) return null;
    const email = String(payload.email || '').toLowerCase();
    if (!email) return null;
    return { email };
  } catch (e) {
    return null;
  }
}
