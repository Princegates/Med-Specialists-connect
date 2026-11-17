// Mock Paystack (port 9001) and mock Cloudflare Access key service (port 9002) for local tests.
const http = require('http'), crypto = require('crypto'), fs = require('fs');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
fs.writeFileSync(__dirname + '/keys.json', JSON.stringify({ privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
const inits = {}; const succeeded = new Set();
const body = (req) => new Promise((res) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => res(d)); });
http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'POST' && req.url === '/transaction/initialize') {
    if (req.headers.authorization !== 'Bearer sk_test_local_secret') return send(401, { status: false });
    const b = JSON.parse(await body(req)); inits[b.reference] = b;
    return send(200, { status: true, data: { authorization_url: 'https://checkout.paystack.com/mock-' + b.reference, reference: b.reference } });
  }
  if (req.method === 'POST' && req.url.startsWith('/mock/succeed/')) { succeeded.add(decodeURIComponent(req.url.split('/').pop())); return send(200, { ok: true }); }
  if (req.method === 'GET' && req.url.startsWith('/transaction/verify/')) {
    const ref = decodeURIComponent(req.url.split('/').pop()); const i = inits[ref];
    if (!i) return send(404, { status: false });
    return send(200, { status: true, data: { status: succeeded.has(ref) ? 'success' : 'abandoned', amount: i.amount, currency: i.currency, reference: ref, channel: 'mobile_money', metadata: i.metadata } });
  }
  if (req.method === 'GET' && req.url === '/mock/inits') return send(200, inits);
  send(404, {});
}).listen(9001, '127.0.0.1');
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(9002, '127.0.0.1');
console.log('mocks up');
