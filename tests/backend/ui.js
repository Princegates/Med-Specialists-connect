// Browser checks: the public request form, safety notice, tracking page, invoice page and every staff console screen.
// Run after console.js against the same local server (or on its own: it sets up what it needs through the API).
const { chromium } = require('playwright');
const fs = require('fs');
const { B, req, jwt, claims, adminHdr, ok, done, mk } = require('./lib.js');
const S = process.env.SHOTS || __dirname + '/';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const axe = async (p, label) => {
  await p.evaluate(AXE);
  const r = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  ok(label + ': no accessibility violations', r.violations.length === 0, r.violations.map((v) => v.id + ' ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')));
};
const A = (who, path, body) => req('/api/admin/' + path, body === undefined ? { headers: adminHdr(who) } : { method: 'POST', headers: adminHdr(who), body });
const OWNER = 'boss@example.com', COORD = 'ui-coord@example.com', NET = 'ui-net@example.com';

(async () => {
  // ---- set-up through the API
  await A(OWNER, 'settings', { values: { billing_enabled: 'true', prices_confirmed: 'true', site_url: B } });
  await A(OWNER, 'staff', { email: COORD, name: 'UI Coordinator', role: 'coordinator' });
  await A(OWNER, 'staff', { email: NET, name: 'UI Network', role: 'network' });
  const staff = (await A(OWNER, 'staff')).j.staff;
  let r = await A(OWNER, 'providers', { name: 'Dr Abena Owusu', type: 'specialist', specialty: 'Paediatrics', area: 'Osu' });
  const dr = r.j.id;
  r = await A(OWNER, `providers/${dr}/credentials`, { type: 'licence', expires_on: new Date(Date.now() + 500 * 86400000).toISOString().slice(0, 10) });
  await A(OWNER, `credentials/${r.j.id}`, { result: 'verified' });
  await A(OWNER, `providers/${dr}/update`, { status: 'active' });

  const b = await chromium.launch();
  const web3 = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('https://api.web3forms.com/**', (r) => { web3.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/401|403|404/.test(m.text())) errs.push(m.text()); });

  console.log('Public request form: safety notice and tracking');
  await p.goto(B + '/index.html'); await p.waitForTimeout(600);
  ok('the emergency notice is hidden at first', !(await p.isVisible('#r-safety')));
  await p.selectOption('#r-urgency', 'Emergency (right now)');
  ok('choosing Emergency shows the 112 notice at once', (await p.isVisible('#r-safety')) && /112/.test(await p.innerText('#r-safety')));
  await p.selectOption('#r-urgency', 'Routine');
  ok('choosing something else hides it again', !(await p.isVisible('#r-safety')));
  await p.selectOption('#r-service', 'Specialist appointment');
  await p.fill('#r-name', 'Efua Boateng'); await p.fill('#r-phone', '0501234567'); await p.fill('#r-area', 'Spintex');
  await p.check('#request-form input[name=consent]');
  await p.click('#request-form button[type=submit]'); await p.waitForSelector('#request-form .form-status a', { timeout: 8000 });
  const status = await p.innerText('#request-form .form-status');
  ok('the success message shows the invoice, the case reference and a tracking link', /MSC-\d{4}-\d{4}/.test(status) && /MSC-[A-Z0-9]{8}/.test(status) && /Follow your request/.test(status), status);
  ok('the team email carries the new case reference', web3.length === 1 && /^MSC-[A-Z0-9]{8}$/.test(web3[0]['Case reference']), web3[0] && web3[0]['Case reference']);
  const trackHref = await p.getAttribute('#request-form .form-status a:has-text("Follow")', 'href');
  await p.goto(B + trackHref); await p.waitForSelector('#track:not([hidden])');
  ok('the tracking page shows plain-language status, reference and invoice', /Waiting for payment/.test(await p.innerText('#headline')) && /^MSC-/.test(await p.innerText('#ref')) && (await p.isVisible('#inv')), await p.innerText('#headline'));
  ok('the tracking page shows no phone number or health details', !/0501234567/.test(await p.innerText('body')));
  await axe(p, 'tracking page');
  await p.goto(B + '/track?ref=MSC-AAAAAAAA&t=nope'); await p.waitForTimeout(600);
  ok('a wrong tracking link says it could not be found', /could not find/i.test(await p.innerText('#state')));
  await p.goto(B + '/index.html'); await p.waitForTimeout(500);
  await p.selectOption('#r-service', 'Ambulance coordination'); await p.selectOption('#r-urgency', 'Emergency (right now)');
  await p.fill('#r-name', 'Yaw Sarpong'); await p.fill('#r-phone', '0209990077'); await p.check('#request-form input[name=consent]');
  await p.click('#request-form button[type=submit]'); await p.waitForTimeout(1500);
  ok('an emergency request tells the person to call 112 and is not invoiced', /112/.test(await p.innerText('#request-form .form-status')) && !/invoice/i.test(await p.innerText('#request-form .form-status')), await p.innerText('#request-form .form-status'));

  console.log('Staff console as the owner');
  const oc = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwt(claims({ email: OWNER })) } });
  const ap = await oc.newPage(); const aerrs = []; ap.on('pageerror', (e) => aerrs.push(e.message)); ap.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text())) aerrs.push(m.text()); });
  await ap.goto(B + '/admin/'); await ap.waitForSelector('#view h1'); await ap.waitForTimeout(500);
  const nav = (await ap.locator('#c-nav a').allInnerTexts()).join('|');
  ok('the owner sees every section', ['Dashboard', 'Cases', 'Tasks', 'Clients', 'Doctors and providers', 'Invoices', 'Accounts', 'Services and prices', 'Settings', 'Staff', 'Audit log'].every((t) => nav.includes(t)), nav);
  ok('the dashboard shows the safety flag count and a go-live checklist', /Safety flags/.test(await ap.innerText('#view')) && /Go-live checklist/.test(await ap.innerText('#view')));
  await axe(ap, 'dashboard');
  await ap.screenshot({ path: S + 'ui-console-dashboard.png' });

  await ap.goto(B + '/admin/#/cases'); await ap.waitForSelector('.c-table tbody tr');
  ok('the case list leads with the emergency case', /Emergency/.test(await ap.locator('.c-table tbody tr').first().innerText()), await ap.locator('.c-table tbody tr').first().innerText());
  await axe(ap, 'case list');
  await ap.locator('.c-table tbody tr').first().locator('a').first().click(); await ap.waitForSelector('.c-alert');
  ok('the emergency case shows the call-now alert', /112/.test(await ap.innerText('.c-alert')));
  // log a call
  await ap.click('button:has-text("Log a call or message")'); await ap.waitForSelector('dialog[open]');
  await axe(ap, 'contact dialog');
  await ap.fill('dialog textarea', 'Called Yaw, ambulance on the way, family told to go to Korle Bu.'); await ap.click('dialog button[type=submit]');
  await ap.waitForSelector('text=Called Yaw'); await ap.waitForTimeout(300);
  ok('the call is in the contact log and the case moved on from the safety flag', /Under review/.test(await ap.innerText('.c-view')) && /Called Yaw/.test(await ap.innerText('.c-view')));
  // task
  await ap.click('button:has-text("Add a task")'); await ap.waitForSelector('dialog[open]');
  await ap.fill('dialog input[type=text]', 'Check the patient reached hospital'); await ap.click('dialog button[type=submit]');
  await ap.waitForSelector('text=Check the patient reached hospital');
  await ap.click('button:has-text("Mark done")'); await ap.waitForSelector('text=Done', { timeout: 5000 });
  ok('a task can be added and ticked off', true);
  // ask a provider
  await ap.click('button:has-text("Ask a provider")'); await ap.waitForSelector('dialog[open]');
  ok('only verified providers are offered', /Dr Abena Owusu/.test(await ap.innerText('dialog select')));
  await ap.fill('dialog input[type=text]', 'Closest paediatrician'); await ap.click('dialog button[type=submit]'); await ap.waitForSelector('text=They accepted');
  await ap.click('button:has-text("They accepted")'); await ap.waitForSelector('.c-tag:has-text("Accepted")');
  ok('a provider answer can be recorded', true);
  // closing needs reason and outcome
  await ap.selectOption('.c-form select >> nth=0', 'completed');
  await ap.fill('.c-form input[type=text] >> nth=1', ''); await ap.click('button:has-text("Save changes")'); await ap.waitForTimeout(500);
  ok('closing without a reason is refused with a clear message', /closure reason/i.test(await ap.innerText('#toast')), await ap.innerText('#toast'));
  await axe(ap, 'case detail');
  await ap.screenshot({ path: S + 'ui-console-case.png', fullPage: true });

  await ap.goto(B + '/admin/#/providers'); await ap.waitForSelector('.c-table tbody tr');
  ok('providers show a verification badge', /Active/.test(await ap.innerText('.c-table')));
  await ap.locator('.c-table a:has-text("Dr Abena Owusu")').first().click(); await ap.waitForSelector('text=Credentials and contracts');
  ok('the provider page lists credentials with their check result', /Verified/.test(await ap.innerText('.c-view')));
  await axe(ap, 'provider page');

  await ap.goto(B + '/admin/#/tasks'); await ap.waitForSelector('.c-view h1');
  await axe(ap, 'tasks page');
  await ap.goto(B + '/admin/#/services'); await ap.waitForSelector('.c-table tbody tr');
  await ap.locator('button:has-text("Edit")').first().click(); await ap.waitForSelector('dialog[open]');
  ok('a service opens with its price lines', (await ap.locator('dialog .c-line').count()) >= 1);
  await axe(ap, 'service dialog'); await ap.click('dialog button:has-text("Cancel")');
  await ap.goto(B + '/admin/#/settings?tab=email'); await ap.waitForSelector('.c-form');
  ok('email settings show the test button and recent emails', (await ap.isVisible('button:has-text("Send a test email")')) && /Recent emails/.test(await ap.innerText('.c-view')));
  ok('the saved API key is never shown', !(await ap.content()).includes('SECRET123') && (await ap.locator('input[type=password]').first().inputValue()) === '');
  await axe(ap, 'settings');
  await ap.goto(B + '/admin/#/settings?tab=payments'); await ap.waitForSelector('code');
  ok('payment settings show the webhook address to copy into Paystack', /paystack-webhook/.test(await ap.innerText('code')));
  await ap.goto(B + '/admin/#/staff'); await ap.waitForSelector('.c-table tbody tr');
  ok('staff page lists people with their roles', /Network manager/.test(await ap.innerText('.c-table')));
  await axe(ap, 'staff page');
  await ap.goto(B + '/admin/#/audit'); await ap.waitForSelector('.c-table tbody tr');
  await ap.click('button:has-text("Check the log is intact")'); await ap.waitForTimeout(700);
  ok('the audit page can check the log chain', /intact|Warning/.test(await ap.innerText('.c-view')));
  await axe(ap, 'audit page');
  ok('no script errors in the console', aerrs.length === 0, aerrs);

  console.log('Roles and small screens');
  const cc = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwt(claims({ email: COORD })) } });
  const cp = await cc.newPage(); await cp.goto(B + '/admin/'); await cp.waitForSelector('#view h1');
  const cnav = (await cp.locator('#c-nav a').allInnerTexts()).join('|');
  ok('a coordinator sees cases and tasks but not settings, staff or accounts', /Cases/.test(cnav) && /Tasks/.test(cnav) && !/Settings|Staff|Accounts|Audit/.test(cnav), cnav);
  await cp.goto(B + '/admin/#/settings'); await cp.waitForTimeout(500);
  ok('typing the settings address as a coordinator shows a polite refusal', /not available to your role/.test(await cp.innerText('#view')));
  const nc = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwt(claims({ email: NET })) } });
  const np = await nc.newPage(); await np.goto(B + '/admin/#/providers'); await np.waitForSelector('.c-table tbody tr');
  ok('a network manager can open providers but the nav has no cases', !/Cases/.test((await np.locator('#c-nav a').allInnerTexts()).join('|')));

  const mc = await b.newContext({ viewport: { width: 390, height: 800 }, extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwt(claims({ email: OWNER })) } });
  const mp = await mc.newPage(); await mp.goto(B + '/admin/#/cases'); await mp.waitForSelector('.c-table tbody tr');
  ok('on a phone the menu is behind a button', !(await mp.isVisible('#c-nav')) && (await mp.isVisible('#menu-btn')));
  await mp.click('#menu-btn'); ok('the menu button opens it', await mp.isVisible('#c-nav'));
  await mp.keyboard.press('Escape'); await mp.click('#menu-btn');
  for (const route of ['dashboard', 'cases', 'providers', 'settings']) {
    await mp.goto(B + '/admin/#/' + route); await mp.waitForTimeout(700);
    ok(`no sideways scrolling on a phone: ${route}`, await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await mp.evaluate(() => document.documentElement.scrollWidth));
  }
  await mp.screenshot({ path: S + 'ui-console-mobile.png' });

  console.log('Not signed in');
  const anon = await b.newContext(); const anp = await anon.newPage(); await anp.goto(B + '/admin/'); await anp.waitForTimeout(900);
  ok('without sign-in the console shows a sign-in message and no data', /sign in/i.test(await anp.innerText('#view')) && (await anp.locator('.c-table').count()) === 0);

  await b.close();
  done();
})().catch((e) => { console.error('UI TEST CRASH', e); process.exit(2); });
