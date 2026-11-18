const crypto = require('crypto');
const B = 'http://127.0.0.1:8788';
async function req(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
const PW = 'Test-Password-123!';
const sessions = {}, known = {};
const hdrs = (cookie) => ({ Cookie: cookie, Origin: B });
// Signs a staff member in (changing a one-time password if needed) and remembers their session cookie.
async function login(email, extra = {}) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B }, body: JSON.stringify({ email, password: known[email] || PW, ...extra }) });
  const j = await r.json().catch(() => ({}));
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie()[0] : null;
  return { status: r.status, j, cookie: sc ? sc.split(';')[0] : null };
}
async function adminHdr(email) {
  if (!sessions[email]) {
    const l = await login(email);
    if (!l.cookie) return { Origin: B };
    sessions[email] = l.cookie;
    if (l.j.me && l.j.me.mustChange) {
      await fetch(B + '/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...hdrs(l.cookie) }, body: JSON.stringify({ current: known[email], next: PW }) });
      known[email] = PW;
    }
  }
  return hdrs(sessions[email]);
}
const forget = (email) => { delete sessions[email]; };
// Authenticator codes, computed the same way a phone app does.
// An authenticator code works only once, so the tests keep track of the last 30-second step they used.
let usedStep = 0;
function codeFor(secret, step) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of secret) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
  const msg = Buffer.alloc(8); msg.writeUInt32BE(step, 4);
  const h = crypto.createHmac('sha1', key).update(msg).digest(); const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0');
}
function totp(secret, offset = 0) { const step = Math.floor(Date.now() / 30000) + offset; usedStep = Math.max(usedStep, step); return codeFor(secret, step); }
// A code the server has not seen yet: the oldest step in its accepted window that is newer than the last one used (waits if it must).
async function nextTotp(secret) {
  for (;;) {
    const cur = Math.floor(Date.now() / 30000);
    for (const step of [cur - 1, cur, cur + 1]) if (step > usedStep) { usedStep = step; return codeFor(secret, step); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
let pass = 0, fails = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } };
const done = () => { console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails ? 1 : 0); };
const hmac = (body) => crypto.createHmac('sha512', 'sk_test_local_secret').update(body).digest('hex');
const mk = (o = {}) => ({ service: 'GP consult (home)', name: 'Ama Mensah', phone: '0244000111', consent: true, urgency: 'Routine', for_whom: 'Myself', ...o });
module.exports = { B, PW, req, login, adminHdr, forget, known, sessions, totp, nextTotp, ok, done, hmac, mk };
