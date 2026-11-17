const crypto = require('crypto');
const B = 'http://127.0.0.1:8788';
const keys = require('./keys.json');
async function req(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
function jwt(payload, { kid = 'test-kid', key = keys.privatePem, tamper = false } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'RS256', kid, typ: 'JWT' }), p = enc(payload);
  let sig = crypto.sign('sha256', Buffer.from(h + '.' + p), key).toString('base64url');
  if (tamper) sig = sig.slice(0, -4) + 'AAAA';
  return h + '.' + p + '.' + sig;
}
const claims = (o = {}) => ({ aud: ['aud-123'], iss: 'https://test.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600, email: 'boss@example.com', ...o });
const adminHdr = (token) => ({ 'Cf-Access-Jwt-Assertion': token || jwt(claims()), Origin: B });
let pass = 0, fails = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } };
const done = () => { console.log(`\n${pass} passed, ${fails} failed`); process.exit(fails ? 1 : 0); };
const hmac = (body) => crypto.createHmac('sha512', 'sk_test_local_secret').update(body).digest('hex');
const mk = (o = {}) => ({ service: 'Specialist appointment', name: 'Ama Mensah', phone: '0244000111', consent: true, urgency: 'Routine', for_whom: 'Myself', ...o });
module.exports = { B, req, jwt, claims, adminHdr, ok, done, hmac, mk };
