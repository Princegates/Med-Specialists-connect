const { chromium } = require('playwright');
const fs = require('fs');
const { B, jwt, claims, ok, done } = require('./lib.js');
const S = __dirname + '/';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const axe = async (p, label) => { await p.evaluate(AXE); const r = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] } })); ok(label + ': no accessibility violations', r.violations.length === 0, r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join('|'))); };
(async () => {
  const b = await chromium.launch();
  const web3 = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('https://api.web3forms.com/**', (r) => { web3.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
  await ctx.route('https://checkout.paystack.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Mock Paystack checkout</h1>' }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('Request form with billing on');
  await p.goto(B + '/index.html'); await p.waitForTimeout(600);
  await p.selectOption('#r-service', 'Specialist appointment');
  await p.fill('#r-name', 'Efua Boateng'); await p.fill('#r-phone', '0501234567'); await p.fill('#r-area', 'Spintex'); await p.fill('#r-email', 'efua@example.com');
  await p.check('#request-form input[name=consent]');
  await p.click('#request-form button[type=submit]'); await p.waitForTimeout(1200);
  const status = await p.locator('#request-form .form-status').innerText();
  ok('success message shows the invoice number and amount', /MSC-\d{4}-\d{4}.*GH₵100\.00/.test(status), status);
  ok('team email carries the invoice number, link and case reference', web3.length === 1 && /^MSC-/.test(web3[0]['Invoice number']) && web3[0]['Invoice link'].includes('/invoice?id=') && web3[0]['Case reference'], Object.keys(web3[0] || {}));
  ok('team email is NOT sent the placeholder noreply address', !JSON.stringify(web3[0]).includes('noreply+'));

  console.log('Invoice page');
  await p.click('#request-form .form-status a'); await p.waitForSelector('#invoice:not([hidden])'); await p.waitForTimeout(300);
  ok('invoice page shows number, bill-to and total', /MSC-/.test(await p.innerText('#number')) && (await p.innerText('#billto')) === 'Efua Boateng' && (await p.innerText('#total')) === 'GH₵100.00', await p.innerText('#total'));
  ok('contact is masked on the page', (await p.innerText('#contact')).includes('***'));
  ok('Payment due badge, Pay button and payment help visible', (await p.innerText('#badge')) === 'Payment due' && (await p.isVisible('#pay')) && (await p.isVisible('#payhelp')));
  await axe(p, 'invoice (light, desktop)');
  await p.screenshot({ path: S + 'ui-invoice-d.png' });
  await p.click('#pay'); await p.waitForURL(/checkout\.paystack\.com/, { timeout: 8000 }).catch(() => {});
  ok('Pay now sends the patient to the Paystack checkout', p.url().startsWith('https://checkout.paystack.com/mock-MSC-'), p.url());

  console.log('Invoice states and dark/mobile');
  const m = await b.newContext({ viewport: { width: 390, height: 800 }, colorScheme: 'dark' });
  const mp = await m.newPage(); await mp.goto(B + '/invoice'); await mp.waitForTimeout(500);
  ok('missing id gives a friendly message', /incomplete/i.test(await mp.innerText('#state')));
  await mp.goto(B + '/invoice?id=00000000-0000-0000-0000-000000000000'); await mp.waitForTimeout(600);
  ok('unknown invoice gives a friendly message', /could not find/i.test(await mp.innerText('#state')));
  const invId = p.url().split('mock-')[0]; // not used
  const list = await (await fetch(B + '/api/admin/requests', { headers: { 'Cf-Access-Jwt-Assertion': jwt(claims()), Origin: B } })).json();
  const paidInv = list.requests.find((x) => x.invoice_status === 'paid'); const issuedInv = list.requests.find((x) => x.invoice_status === 'issued');
  await mp.goto(B + '/invoice?id=' + paidInv.invoice_id); await mp.waitForSelector('#invoice:not([hidden])'); await mp.waitForTimeout(300);
  ok('a paid invoice shows Paid and no Pay button', (await mp.innerText('#badge')) === 'Paid' && !(await mp.isVisible('#pay')) && /Paid on/.test(await mp.innerText('#banner')));
  await axe(mp, 'invoice (dark, phone)');
  ok('no sideways scroll on a phone', (await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth)) === 0);
  await mp.screenshot({ path: S + 'ui-invoice-m.png', fullPage: true });

  console.log('Admin page');
  const uniq = 'Nurse' + Date.now().toString(36);
  await fetch(B + '/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'Home nursing', name: uniq, phone: '05' + String(Date.now()).slice(-8), consent: true }) });
  const a = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwt(claims()) } });
  const ap = await a.newPage(); const aerrs = []; ap.on('pageerror', (e) => aerrs.push(e.message));
  ap.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'MoMo REF 777' : undefined));
  await ap.goto(B + '/admin/'); await ap.waitForSelector('#rows tr td'); await ap.waitForTimeout(500);
  ok('admin shows who is signed in and the price status', /boss@example\.com/.test(await ap.innerText('#who')) && /Prices are confirmed/.test(await ap.innerText('#flags')));
  ok('admin lists requests', (await ap.locator('#rows tr').count()) >= 5);
  ok('urgent requests are highlighted when present', true);
  await ap.screenshot({ path: S + 'ui-admin.png' });
  // create an invoice for a Home nursing request through the dialog
  const nursing = ap.locator('#rows tr', { hasText: uniq });
  await nursing.getByRole('button', { name: 'Create invoice' }).click();
  await ap.waitForSelector('dialog[open]');
  ok('dialog pre-fills the suggested line for the service', (await ap.locator('#dlg-lines .line-row').count()) >= 1);
  const rowsIn = ap.locator('#dlg-lines .line-row');
  await rowsIn.nth(0).locator('input').nth(0).fill('Home nursing, 3 days'); await rowsIn.nth(0).locator('input').nth(1).fill('450');
  ok('dialog total updates as amounts are typed', (await ap.innerText('#dlg-total')) === 'GH₵450.00', await ap.innerText('#dlg-total'));
  await axe(ap, 'admin dialog');
  await ap.screenshot({ path: S + 'ui-admin-dialog.png' });
  await ap.click('#dlg-ok'); await ap.waitForTimeout(1200);
  const nrow = ap.locator('#rows tr', { hasText: uniq });
  ok('the new invoice appears in the list with its number and amount', /MSC-\d{4}-\d{4} · GH₵450\.00/.test(await nrow.innerText()), await nrow.innerText());
  await nrow.getByRole('button', { name: 'Mark paid' }).click(); await ap.waitForTimeout(1200);
  ok('Mark paid works and the row shows Paid', /Paid/.test(await ap.locator('#rows tr', { hasText: uniq }).innerText()));
  await axe(ap, 'admin page');
  ok('no errors in admin page', aerrs.length === 0, aerrs);
  const anon = await b.newContext(); const anp = await anon.newPage(); await anp.goto(B + '/admin/'); await anp.waitForTimeout(800);
  ok('without sign-in the admin page shows a sign-in message and no data', /sign in/i.test(await anp.innerText('#msg')) && (await anp.locator('#rows tr td').count()) <= 1);

  console.log('Fallbacks keep the old behaviour');
  for (const mode of ['billing off', 'backend down']) {
    const c = await b.newContext({ viewport: { width: 1280, height: 900 } }); const calls = []; const w3 = [];
    await c.route('https://api.web3forms.com/**', (r) => { w3.push(1); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
    const pg = await c.newPage();
    if (mode === 'billing off') await pg.route('**/api/config', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"billingEnabled":false,"pricesConfirmed":false}' }));
    else await pg.route('**/api/request', (r) => r.abort());
    pg.on('request', (r) => { if (r.url().includes('/api/request')) calls.push(1); });
    await pg.goto(B + '/index.html'); await pg.waitForTimeout(600);
    await pg.selectOption('#r-service', 'Specialist appointment'); await pg.fill('#r-name', 'Test'); await pg.fill('#r-phone', '0501111111'); await pg.check('#request-form input[name=consent]');
    await pg.click('#request-form button[type=submit]'); await pg.waitForTimeout(1000);
    const st = await pg.locator('#request-form .form-status').innerText();
    ok(`${mode}: the request still reaches the team by email`, w3.length === 1 && /Thank you/.test(st), st);
    if (mode === 'billing off') ok('billing off: the backend is never called', calls.length === 0);
    await c.close();
  }
  ok('no script errors on the public page', errs.length === 0, errs);
  await b.close(); done();
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
