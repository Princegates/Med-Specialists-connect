// Browser checks: the public request form, safety notice, tracking page, invoice page and every staff console screen.
// Run after console.js against the same local server (or on its own: it sets up what it needs through the API).
const { chromium } = require('playwright');
const fs = require('fs');
const { B, PW, req, adminHdr, sessions, totp, ok, done, mk } = require('./lib.js');
const S = process.env.SHOTS || __dirname + '/';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const axe = async (p, label) => {
  await p.evaluate(AXE);
  const r = await p.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
  ok(label + ': no accessibility violations', r.violations.length === 0, r.violations.map((v) => v.id + ' ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')));
};
const A = (who, path, body) => req('/api/admin/' + path, body === undefined ? { headers: adminHdr(who) } : { method: 'POST', headers: adminHdr(who), body });
const OWNER = 'boss@example.com', COORD = 'ui-coord@example.com', NET = 'ui-net@example.com', SETUP_CODE = 'test-setup-code-1234';
const COOKIE = '__Host-msc_session';

(async () => {
  const b = await chromium.launch();
  const aerrs = [];
  const track = (p) => { p.on('pageerror', (e) => { if (!/Transition was aborted/.test(e.message)) aerrs.push(e.message); }); p.on('console', (m) => { if (m.type() === 'error' && !/status of (400|401|403|404|429)|ViewTransition|ERR_INTERNET_DISCONNECTED/.test(m.text())) aerrs.push(m.text()); }); return p; };
  const cookieOf = async (ctx) => { const c = (await ctx.cookies()).find((x) => x.name === COOKIE); return c ? COOKIE + '=' + c.value : null; };
  // Signs in through the real login page. Returns the page, already inside the console.
  async function uiLogin(ctx, email, password, secret) {
    const pg = track(await ctx.newPage());
    await pg.goto(B + '/admin/'); await pg.waitForSelector('#form-login:not([hidden])');
    await pg.fill('#email', email); await pg.fill('#password', password); await pg.click('#form-login button[type=submit]');
    if (secret) { await pg.waitForSelector('#form-mfa:not([hidden])'); await pg.fill('#code', totp(secret)); await pg.click('#form-mfa button[type=submit]'); }
    await pg.waitForSelector('#view h1'); await pg.waitForTimeout(400);
    return pg;
  }

  console.log('First run: set-up page, owner account, authenticator app');
  const oc = await b.newContext({ viewport: { width: 1280, height: 900 } });
  let ap = track(await oc.newPage());
  await ap.goto(B + '/admin/'); await ap.waitForSelector('#form-setup:not([hidden])');
  ok('opening the console when not signed in lands on the branded login page', /admin\/login/.test(ap.url()) && /Set up your platform/.test(await ap.innerText('#title')), ap.url());
  await axe(ap, 'set-up page');
  await ap.screenshot({ path: S + 'ui-login-setup.png' });
  await ap.fill('#s-code', 'wrong-code-wrong'); await ap.fill('#s-name', 'The Owner'); await ap.fill('#s-email', OWNER); await ap.fill('#s-pass', PW);
  await ap.click('#form-setup button[type=submit]'); await ap.waitForSelector('#error:not([hidden])');
  ok('a wrong set-up code shows a clear message on the page', /set-up code/i.test(await ap.innerText('#error')), await ap.innerText('#error'));
  await ap.fill('#s-code', SETUP_CODE); await ap.fill('#s-pass', 'short'); await ap.click('#form-setup button[type=submit]'); await ap.waitForTimeout(500);
  ok('a weak password is explained', /10 characters/.test(await ap.innerText('#error')), await ap.innerText('#error'));
  await ap.fill('#s-pass', PW); await ap.click('#form-setup button[type=submit]'); await ap.waitForSelector('#view h1');
  await ap.waitForTimeout(500);
  ok('the owner lands in the console, limited to My account until the authenticator app is set up', (await ap.locator('#c-nav a').count()) === 1 && /authenticator app/i.test(await ap.innerText('.c-alert')), await ap.locator('#c-nav a').allInnerTexts());
  await ap.click('button:has-text("Set up the authenticator app")'); await ap.waitForSelector('.c-key');
  const secret = (await ap.innerText('.c-key')).replace(/\s/g, '');
  ok('the set-up key is shown for the phone app', /^[A-Z2-7]{32}$/.test(secret), secret);
  await axe(ap, 'authenticator set-up');
  await ap.fill('input[autocomplete="one-time-code"]', totp(secret)); await ap.click('button:has-text("Turn on")'); await ap.waitForSelector('.c-codes');
  ok('turning it on shows 8 recovery codes once', (await ap.locator('.c-codes li').count()) === 8);
  await ap.screenshot({ path: S + 'ui-console-recovery.png' });
  await ap.click('button:has-text("I have saved them")'); await ap.waitForSelector('.c-kpis', { timeout: 8000 });
  ok('after that the whole console opens', (await ap.locator('#c-nav a').count()) >= 10);
  sessions[OWNER] = await cookieOf(oc);
  ok('the session cookie is HttpOnly (the page cannot read it)', !(await ap.evaluate(() => document.cookie)).includes('msc_session'));

  console.log('Sign out and sign in again');
  await ap.click('#signout'); await ap.waitForSelector('#form-login:not([hidden])');
  await axe(ap, 'login page');
  await ap.screenshot({ path: S + 'ui-login.png' });
  await ap.fill('#email', OWNER); await ap.fill('#password', 'Not-The-Password-1'); await ap.click('#form-login button[type=submit]'); await ap.waitForSelector('#error:not([hidden])');
  ok('a wrong password says so without saying which part was wrong', /Wrong email or password/.test(await ap.innerText('#error')), await ap.innerText('#error'));
  await ap.fill('#password', PW); await ap.click('#form-login button[type=submit]'); await ap.waitForSelector('#form-mfa:not([hidden])');
  ok('the right password asks for the app code', /authenticator/i.test(await ap.innerText('#title')));
  await ap.fill('#code', '000000'); await ap.click('#form-mfa button[type=submit]'); await ap.waitForSelector('#error:not([hidden])');
  ok('a wrong code is refused', /Wrong/.test(await ap.innerText('#error')));
  await ap.fill('#code', totp(secret)); await ap.click('#form-mfa button[type=submit]'); await ap.waitForSelector('.c-kpis', { timeout: 8000 });
  ok('the right code opens the console', /Dashboard/.test(await ap.title()));
  sessions[OWNER] = await cookieOf(oc);

  // ---- set-up through the API now that the owner has a session
  await fetch(B + '/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessions[OWNER], Origin: B }, body: JSON.stringify({ values: { billing_enabled: 'true', prices_confirmed: 'true', site_url: B, mfa_policy: 'privileged' } }) });
  const A = async (who, path, body) => req('/api/admin/' + path, body === undefined ? { headers: await adminHdr(who) } : { method: 'POST', headers: await adminHdr(who), body });
  const known = require('./lib.js').known;
  let r = await A(OWNER, 'staff', { email: COORD, name: 'UI Coordinator', role: 'coordinator' }); known[COORD] = r.j.tempPassword;
  r = await A(OWNER, 'staff', { email: NET, name: 'UI Network', role: 'network' }); known[NET] = r.j.tempPassword;
  await adminHdr(COORD); await adminHdr(NET); // first sign-in, new password
  r = await A(OWNER, 'providers', { name: 'Dr Abena Owusu', type: 'specialist', specialty: 'Paediatrics', area: 'Osu' });
  const dr = r.j.id;
  r = await A(OWNER, `providers/${dr}/credentials`, { type: 'licence', expires_on: new Date(Date.now() + 500 * 86400000).toISOString().slice(0, 10) });
  await A(OWNER, `credentials/${r.j.id}`, { result: 'verified' });
  await A(OWNER, `providers/${dr}/update`, { status: 'active' });

  const web3 = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('https://api.web3forms.com/**', (r) => { web3.push(JSON.parse(r.request().postData())); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
  const p = track(await ctx.newPage()); const errs = aerrs;
  // The request form has three steps. This walks through them like a person would.
  async function fillRequest(pg, o) {
    if (o.service) await pg.selectOption('#r-service', o.service);
    if (o.urgency) await pg.selectOption('#r-urgency', o.urgency);
    await pg.click('#wiz-next');
    await pg.click('#wiz-next');
    await pg.fill('#r-name', o.name); await pg.fill('#r-phone', o.phone);
    if (o.area) await pg.fill('#r-area', o.area);
    await pg.check('#request-form input[name=consent]');
  }

  console.log('Public request form: safety notice and tracking');
  await p.goto(B + '/index.html'); await p.waitForTimeout(600);
  ok('the emergency notice is hidden at first', !(await p.isVisible('#r-safety')));
  await p.selectOption('#r-urgency', 'Emergency (right now)');
  ok('choosing Emergency shows the 112 notice at once', (await p.isVisible('#r-safety')) && /112/.test(await p.innerText('#r-safety')));
  await p.selectOption('#r-urgency', 'Routine');
  ok('choosing something else hides it again', !(await p.isVisible('#r-safety')));
  await fillRequest(p, { service: 'Specialist appointment', name: 'Efua Boateng', phone: '0501234567', area: 'Spintex' });
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
  await p.goto(B + '/index.html'); await p.waitForTimeout(400);
  ok('the footer has a Staff login link that opens the login page', (await p.locator('footer a:has-text("Staff login")').count()) === 1);
  await p.click('footer a:has-text("Staff login")'); await p.waitForSelector('#form-login:not([hidden])');
  ok('it lands on the staff sign-in page', /admin\/login/.test(p.url()), p.url());
  await p.goto(B + '/index.html'); await p.waitForTimeout(500);
  await fillRequest(p, { service: 'Ambulance coordination', urgency: 'Emergency (right now)', name: 'Yaw Sarpong', phone: '0209990077' });
  await p.click('#request-form button[type=submit]'); await p.waitForTimeout(1500);
  ok('an emergency request tells the person to call 112 and is not invoiced', /112/.test(await p.innerText('#request-form .form-status')) && !/invoice/i.test(await p.innerText('#request-form .form-status')), await p.innerText('#request-form .form-status'));


  console.log('Public site: steps, big buttons, display options');
  await p.goto(B + '/index.html'); await p.waitForTimeout(900);
  ok('the page has no banner above the menu, and has quick call buttons', (await p.locator('.strip').count()) === 0 && (await p.locator('.reach a').count()) === 2);
  await p.click('.pick a[data-service="Laboratory tests"]'); await p.waitForTimeout(700);
  ok('tapping a big button picks that service in the form', (await p.inputValue('#r-service')) === 'Laboratory tests');
  ok('and the form shows step 1 of 3', /1 of 3/.test(await p.innerText('.wiz-count')) && (await p.isVisible('#r-urgency')) && !(await p.isVisible('#r-name')));
  await p.evaluate(() => { const s = document.querySelector('#r-service'); s.selectedIndex = 0; s.dispatchEvent(new Event('change', { bubbles: true })); }); await p.click('#wiz-next');
  ok('Next without choosing a service explains what is missing', /Please choose one/.test(await p.innerText('#request-form')) && (await p.getAttribute('#r-service', 'aria-invalid')) === 'true');
  await p.selectOption('#r-service', 'Home nursing'); await p.click('#wiz-next');
  ok('after a valid step the next step opens, with Back available', /2 of 3/.test(await p.innerText('.wiz-count')) && (await p.isVisible('#wiz-back')));
  await p.click('#wiz-back');
  ok('Back returns to step 1 with the choice kept', (await p.inputValue('#r-service')) === 'Home nursing');
  await p.reload(); await p.waitForTimeout(600);
  ok('a half-finished form is kept for this visit only (session, not stored for later)', (await p.inputValue('#r-service')) === 'Home nursing' && (await p.evaluate(() => localStorage.getItem('draft-v1'))) === null);
  await axe(p, 'home page (steps)');
  await p.screenshot({ path: S + 'ui-site-top.png' });

  await p.click('#opts-btn'); await p.waitForSelector('dialog[open]'); await p.waitForTimeout(500);
  await axe(p, 'display options');
  await p.check('input[name=size][value=largest]'); await p.check('input[name=font][value=easy]'); await p.check('input[name=contrast]'); await p.check('input[name=motion][value=reduced]');
  ok('display options apply at once', (await p.getAttribute('html', 'data-size')) === 'largest' && (await p.getAttribute('html', 'data-font')) === 'easy' && (await p.getAttribute('html', 'data-contrast')) === 'high' && (await p.getAttribute('html', 'data-motion')) === 'reduced');
  await p.click('dialog button:has-text("Done")');
  await p.reload(); await p.waitForTimeout(500);
  ok('and are remembered on this device', (await p.getAttribute('html', 'data-size')) === 'largest' && (await p.getAttribute('html', 'data-contrast')) === 'high');
  ok('the biggest text does not break the layout on a laptop', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(200); // a reload keeps the old scroll position, which larger text moves under the top bar
  await axe(p, 'home page (largest text, easy font, high contrast)');
  await p.screenshot({ path: S + 'ui-site-access.png' });
  await p.click('#opts-btn'); await p.waitForSelector('dialog[open]'); await p.click('#opts-reset'); await p.click('dialog button:has-text("Done")');
  ok('Reset puts everything back', !(await p.getAttribute('html', 'data-size')) && !(await p.getAttribute('html', 'data-contrast')));
  await p.click('#theme-toggle'); await p.waitForTimeout(900);
  await axe(p, 'home page (night)');
  await p.click('#theme-toggle');

  await p.goto(B + '/index.html'); await p.waitForTimeout(500);
  await p.fill('#c-name', 'Kojo Appiah'); await p.fill('#c-phone', '0200000000'); await p.check('#callback-form input[name=consent]');
  const before = web3.length;
  await p.click('#callback-form button[type=submit]'); await p.waitForTimeout(1200);
  ok('the call-back form needs only a name, a number and consent, and says thank you', web3.length === before + 1 && /We will call you back/.test(await p.innerText('#callback-form .form-status')), await p.innerText('#callback-form .form-status'));

  console.log('Look and feel');
  await p.goto(B + '/index.html'); await p.waitForTimeout(1200);
  ok('headings are set in Newsreader and reading text in Atkinson Hyperlegible Next', await p.evaluate(async () => { await document.fonts.ready; return getComputedStyle(document.querySelector('h1')).fontFamily.startsWith('Newsreader') && getComputedStyle(document.body).fontFamily.startsWith('"Atkinson Hyperlegible Next"') && document.fonts.check('450 40px Newsreader') && document.fonts.check('400 18px "Atkinson Hyperlegible Next"'); }));
  ok('the home page opens on the green panel with the headline, a way to ask for care and the framed photo, all on the first screen', await p.evaluate(() => { const vis = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.height > 0 && r.top < innerHeight; }; const i = document.querySelector('.photo-hero img'); return vis('.hero h1') && vis('.hero-cta .btn') && vis('.photo-hero') && getComputedStyle(document.querySelector('.hero-band')).backgroundColor === 'rgb(11, 48, 42)' && getComputedStyle(document.querySelector('.photo-hero'), '::after').borderTopWidth === '1px' && i.complete && i.naturalWidth > 100; }));
  ok('the service card overlaps the green panel', await p.evaluate(() => document.querySelector('.brief').getBoundingClientRect().top < document.querySelector('.hero-band').getBoundingClientRect().bottom));
  ok('the menu bar is solid and readable from the start', await p.evaluate(() => getComputedStyle(document.querySelector('.site-header')).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.nav a')).color === 'rgb(14, 58, 51)'));
  await p.evaluate(() => document.querySelector('#fees').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(500);
  ok('after scrolling the top bar gains an edge', await p.evaluate(() => document.querySelector('.site-header').classList.contains('scrolled')));
  ok('the main buttons are consulting-room green with white text', await p.evaluate(() => { const b = getComputedStyle(document.querySelector('#wiz-next')); return b.backgroundColor === 'rgb(14, 58, 51)' && b.color === 'rgb(255, 255, 255)'; }));
  await p.evaluate(() => document.querySelector('#patients').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(300);
  await p.hover('.dir li:nth-child(3)'); await p.waitForTimeout(300);
  ok('pointing at a service shows its photo beside the list', await p.evaluate(() => document.querySelectorAll('.desk-view img')[2].classList.contains('on') && document.querySelectorAll('.desk-view img.on').length === 1));
  ok('the request form shows its three steps', await p.evaluate(() => document.querySelectorAll('.wiz-stops li').length === 3 && document.querySelector('#request-form').getAttribute('data-at') === '0'));
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(300);
  await p.screenshot({ path: S + 'ui-site-look.png' });

  console.log('Menu, founder, vision, specialist finder, network page');
  await p.goto(B + '/index.html'); await p.waitForTimeout(600);
  const navText = await p.innerText('#nav');
  ok('the menu follows the recommended structure', ['Home', 'About us', 'Our services', 'Find a specialist', 'Contact us'].every((t) => navText.includes(t)) && /Request (healthcare assistance|care)/.test(navText), navText);
  ok('the top bar fits on one line at laptop width', await p.evaluate(() => [...document.querySelectorAll('#nav > a, #nav .nav-drop')].every((e) => e.getBoundingClientRect().height < 50)));
  ok('the About menu starts closed', !(await p.isVisible('#about-menu')) && (await p.getAttribute('.nav-drop', 'aria-expanded')) === 'false');
  await p.click('.nav-drop'); await p.waitForSelector('#about-menu:not([hidden])');
  ok('About us opens Our company, Founder\'s message, Our vision and mission, Our healthcare network', /Our company[\s\S]*Founder.s message[\s\S]*Our vision and mission[\s\S]*Our healthcare network/.test(await p.innerText('#about-menu')) && (await p.getAttribute('.nav-drop', 'aria-expanded')) === 'true');
  await axe(p, 'About menu open');
  await p.keyboard.press('Escape');
  ok('Escape closes it and keeps your place', !(await p.isVisible('#about-menu')) && (await p.evaluate(() => document.activeElement.className)).includes('nav-drop'));
  await p.click('.nav-drop'); await p.click('#about-menu a[href="#founder"]'); await p.waitForTimeout(1500);
  ok('choosing Founder\'s message scrolls to it and closes the menu', !(await p.isVisible('#about-menu')) && (await p.evaluate(() => document.querySelector('#founder').getBoundingClientRect().top)) < 300);
  ok('the founder section shows his name, title and the full message', /Daniel Asamoah Appiah/.test(await p.innerText('#founder')) && /Founder & Managing Director, MEDs Specialist Connect/.test(await p.innerText('#founder')) && /should not be a complicated experience/.test(await p.innerText('#founder')) && /bridge the gap between patients, medical specialists and healthcare service providers/.test(await p.innerText('#founder')) && /more convenient and more patient-centred/.test(await p.innerText('#founder')));
  await p.waitForTimeout(500);
  ok('and his photo loads with a description', await p.evaluate(() => { const i = document.querySelector('#founder img'); return i.complete && i.naturalWidth > 100 && /Daniel Asamoah Appiah/.test(i.alt); }));
  await p.screenshot({ path: S + 'ui-site-founder.png' });
  ok('there is a vision and mission section with all three statements', (await p.locator('#vision .statement').count()) === 3 && /Our vision[\s\S]*Our mission[\s\S]*Our commitment/.test(await p.innerText('#vision')));
  await p.selectOption('#find-spec', 'Paediatrician (children)'); await p.fill('#find-area', 'Osu');
  await p.click('#find-form button[type=submit]'); await p.waitForTimeout(900);
  ok('Find a specialist starts the request with the specialty and area filled in', (await p.inputValue('#r-service')) === 'Specialist appointment' && /Paediatrician/.test(await p.inputValue('#r-msg')) && /Osu/.test(await p.inputValue('#r-msg')) && /1 of 3/.test(await p.innerText('.wiz-count')));
  await p.click('#find-form button[type=submit]');
  await p.goto(B + '/index.html'); await p.waitForTimeout(400);
  await p.click('#find-form button[type=submit]');
  ok('choosing nothing asks for a specialty first', (await p.getAttribute('#find-spec', 'aria-invalid')) === 'true');
  await p.waitForTimeout(700);
  await axe(p, 'home page with founder, vision and finder');
  await p.goto(B + '/network'); await p.waitForTimeout(400);
  ok('the network page explains who is in the network and how they are chosen, and invents no partners', /Our healthcare network/.test(await p.innerText('h1')) && /How we choose/.test(await p.innerText('main')) && /Partner listings are on their way/.test(await p.innerText('main')));
  ok('its menu links work from the sub-page', (await p.getAttribute('#nav a:has-text("Find a specialist")', 'href')) === '/#find');
  await axe(p, 'network page');
  await p.screenshot({ path: S + 'ui-site-network.png' });
  const m2 = await b.newContext({ viewport: { width: 390, height: 844 } }); const mp2 = await m2.newPage();
  await mp2.goto(B + '/index.html'); await mp2.waitForTimeout(500); await mp2.click('#more-btn');
  ok('on a phone the More sheet lists the founder\'s message, vision and the network page', /Founder.s message/.test(await mp2.innerText('#more')) && /Our vision and mission/.test(await mp2.innerText('#more')) && /Our healthcare network/.test(await mp2.innerText('#more')) && /Find a specialist/.test(await mp2.innerText('#more')));
  await mp2.click('#more-close');
  await mp2.evaluate(() => document.querySelector('#founder').scrollIntoView({ behavior: 'instant' })); await mp2.waitForTimeout(700);
  await mp2.screenshot({ path: S + 'ui-site-founder-mobile.png' });
  ok('the founder section fits a phone without sideways scrolling', await mp2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await axe(mp2, 'founder on a phone');
  for (const page of ['/privacy', '/disclaimer']) {
    await p.goto(B + page); await p.waitForTimeout(400);
    await axe(p, 'legal page ' + page);
  }
  const mob = await b.newContext({ viewport: { width: 390, height: 844 } }); const mpg = track(await mob.newPage());
  await mpg.goto(B + '/index.html'); await mpg.waitForTimeout(700);
  ok('on a phone there is an app-style bottom bar: Home, Services, Request, Call, More', await mpg.isVisible('.actionbar') && (await mpg.locator('.actionbar > *').count()) === 5 && /Home[\s\S]*Services[\s\S]*Request[\s\S]*Call[\s\S]*More/.test(await mpg.innerText('.actionbar')));
  ok('the old menu button is gone on a phone', !(await mpg.isVisible('.nav-toggle')));
  await mpg.click('#more-btn'); await mpg.waitForSelector('#more[open]'); await mpg.waitForTimeout(500);
  ok('More opens a sheet with the rest of the pages, WhatsApp and display options', /For doctors/.test(await mpg.innerText('#more')) && /WhatsApp/.test(await mpg.innerText('#more')) && /Display and reading options/.test(await mpg.innerText('#more')));
  await axe(mpg, 'More sheet');
  await mpg.screenshot({ path: S + 'ui-site-sheet.png' });
  await mpg.click('#more a[href="#fees"]'); await mpg.waitForTimeout(2200);
  ok('choosing a page closes the sheet and goes there', !(await mpg.isVisible('#more')) && (await mpg.evaluate(() => document.querySelector('#fees').getBoundingClientRect().top)) < 400);
  await mpg.click('#more-btn'); await mpg.click('#more-opts'); await mpg.waitForSelector('#opts[open]');
  ok('Display options opens from the sheet', await mpg.isVisible('#opts')); await mpg.click('#opts button:has-text("Done")');
  await mpg.evaluate(() => scrollTo(0, 0)); await mpg.waitForTimeout(500);
  ok('the Home tab is marked as the current place at the top', (await mpg.getAttribute('.actionbar a[data-tab=top]', 'aria-current')) === 'page');
  await mpg.evaluate(() => document.querySelector('#how').scrollIntoView()); await mpg.waitForTimeout(500);
  await mpg.evaluate(() => window.scrollBy(0, 400)); await mpg.waitForTimeout(500);
  ok('reading down the page tucks the top bar away', await mpg.evaluate(() => document.querySelector('.site-header').classList.contains('tuck')));
  await mpg.evaluate(() => window.scrollBy(0, -200)); await mpg.waitForTimeout(500);
  ok('and scrolling back up brings it back', !(await mpg.evaluate(() => document.querySelector('.site-header').classList.contains('tuck'))));
  await mpg.evaluate(() => document.querySelector('#request').scrollIntoView()); await mpg.waitForTimeout(400);
  ok('on the phone the Back and Next buttons stay in reach above the bar', await mpg.evaluate(() => { const r = document.querySelector('.wiz-nav').getBoundingClientRect(); return r.bottom <= innerHeight - 56; }));
  ok('no sideways scrolling on a phone', await mpg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await mpg.evaluate(() => document.documentElement.scrollWidth));
  ok('every big button is at least 44px tall', await mpg.evaluate(() => [...document.querySelectorAll('.pick a, .actionbar a, .btn')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().height >= 44)));
  await mpg.evaluate(() => scrollTo(0, 0)); await mpg.waitForTimeout(400);
  await axe(mpg, 'home page on a phone');
  await mpg.screenshot({ path: S + 'ui-site-mobile.png' });
  await mpg.screenshot({ path: S + 'ui-site-mobile-full.png', fullPage: true });
  // installable, and keeps working when the signal drops
  ok('the page has an app manifest with icons and shortcuts', await mpg.evaluate(async () => { const m = await (await fetch('/manifest.webmanifest')).json(); return m.display === 'standalone' && m.icons.length >= 2 && m.shortcuts.length >= 1 && m.start_url === '/'; }));
  await mpg.goto(B + '/index.html'); await mpg.waitForTimeout(1200);
  ok('the service worker is running', await mpg.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)));
  await mpg.goto(B + '/index.html'); await mpg.waitForTimeout(800);
  await mob.setOffline(true);
  await mpg.reload().catch(() => {}); await mpg.waitForTimeout(800);
  ok('offline, the home page still opens from the phone', /Healthcare made easier/.test(await mpg.innerText('h1')));
  ok('and says you are offline, with the phone number', await mpg.isVisible('#offline') && /0243 560 080/.test(await mpg.innerText('#offline')));
  await mpg.goto(B + '/privacy').catch(() => {}); await mpg.waitForTimeout(600);
  ok('a page that was never opened shows the friendly offline page', /You are offline/.test(await mpg.innerText('h1')) && /0243 560 080/.test(await mpg.innerText('body')), await mpg.innerText('body'));
  await mob.setOffline(false);
  const rm = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }); const rp = await rm.newPage();
  await rp.goto(B + '/index.html'); await rp.waitForTimeout(400);
  ok('with "reduce motion" on the device, nothing is animated', await rp.evaluate(() => [...document.querySelectorAll('.hero h1, .pick li, .path li')].every((e) => getComputedStyle(e).animationName === 'none')));

  console.log('Staff console as the owner');
  await ap.goto(B + '/admin/'); await ap.waitForSelector('#view h1'); await ap.waitForTimeout(500);
  const nav = (await ap.locator('#c-nav a').allInnerTexts()).join('|');
  ok('the owner sees every section', ['Dashboard', 'Cases', 'Tasks', 'Calendar', 'Clients', 'Doctors and providers', 'Invoices', 'Accounts', 'Reports', 'Services and prices', 'Settings', 'Staff', 'Audit log'].every((t) => nav.includes(t)), nav);
  ok('the dashboard greets the person and shows what needs attention and a go-live checklist', /Good (morning|afternoon|evening), The/.test(await ap.innerText('#view')) && /possible emergenc/.test(await ap.innerText('#view')) && /Go-live checklist/.test(await ap.innerText('#view')), (await ap.innerText('#view')).slice(0, 300));
  await axe(ap, 'dashboard');
  await ap.screenshot({ path: S + 'ui-console-dashboard.png' });

  await ap.goto(B + '/admin/#/cases'); await ap.waitForSelector('.c-table tbody tr');
  await ap.click('.c-seg button:has-text("Board")'); await ap.waitForSelector('.c-board');
  ok('the case board groups cases into columns and the emergency card is marked', (await ap.locator('.c-kcol').count()) === 4 && /Emergency/.test(await ap.innerText('.c-kcol >> nth=0')));
  await axe(ap, 'case board');
  await ap.screenshot({ path: S + 'ui-console-board.png' });
  await ap.click('.c-seg button:has-text("List")'); await ap.waitForSelector('.c-table tbody tr');
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

  await ap.goto(B + '/admin/#/calendar'); await ap.waitForSelector('.c-cal');
  ok('the calendar shows the month with a Today button and a list below', (await ap.locator('.c-cal-d').count()) >= 28 && (await ap.isVisible('button:has-text("Today")')));
  await axe(ap, 'calendar');
  await ap.screenshot({ path: S + 'ui-console-calendar.png' });
  await ap.goto(B + '/admin/#/reports'); await ap.waitForSelector('.c-kpis');
  ok('reports show key figures, charts and money received', /Requests received/.test(await ap.innerText('.c-view')) && /Money received by month/.test(await ap.innerText('.c-view')) && (await ap.locator('.c-cols-chart').count()) >= 2);
  await axe(ap, 'reports');
  await ap.screenshot({ path: S + 'ui-console-reports.png', fullPage: true });
  await ap.fill('#gsearch', 'Boateng'); await ap.waitForSelector('#gresults:not([hidden]) a');
  ok('the search box finds cases and clients by name', /Boateng/.test(await ap.innerText('#gresults')) && /cases/i.test(await ap.innerText('#gresults')));
  await ap.keyboard.press('Escape');
  await ap.click('#theme-btn'); ok('the theme button switches to night mode', (await ap.getAttribute('html', 'data-theme')) === 'dark');
  await axe(ap, 'dashboard in night mode');
  await ap.click('#theme-btn');
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
  await ap.goto(B + '/admin/#/settings?tab=security'); await ap.waitForSelector('.c-form select');
  ok('the security tab offers who must use an authenticator app', /Every staff member/.test(await ap.innerText('.c-form')) && /Nobody/.test(await ap.innerText('.c-form')));
  await ap.selectOption('.c-form select >> nth=0', 'off'); await ap.click('button:has-text("Save settings")'); await ap.waitForSelector('dialog[open]');
  ok('turning it off asks for your password first', /Lower the sign-in protection/.test(await ap.innerText('dialog')));
  await axe(ap, 'confirm dialog');
  await ap.fill('dialog input[type=password]', 'Wrong-Password-9!'); await ap.click('dialog button[type=submit]'); await ap.waitForSelector('dialog .c-error:not([hidden])');
  ok('a wrong password is explained inside the dialog', /password/i.test(await ap.innerText('dialog .c-error')));
  await ap.click('dialog button:has-text("Cancel")');
  await ap.goto(B + '/admin/#/staff'); await ap.waitForSelector('.c-table tbody tr');
  ok('staff page lists people with their roles', /Network manager/.test(await ap.innerText('.c-table')));
  await axe(ap, 'staff page');
  await ap.goto(B + '/admin/#/audit'); await ap.waitForSelector('.c-table tbody tr');
  await ap.click('button:has-text("Check the log is intact")'); await ap.waitForTimeout(700);
  ok('the audit page can check the log chain', /intact|Warning/.test(await ap.innerText('.c-view')));
  await axe(ap, 'audit page');
  ok('no script errors in the console', aerrs.length === 0, aerrs);

  console.log('Roles and small screens');
  const cc = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const cp = await uiLogin(cc, COORD, PW);
  const cnav = (await cp.locator('#c-nav a').allInnerTexts()).join('|');
  ok('a coordinator sees cases and tasks but not settings, staff or accounts', /Cases/.test(cnav) && /Tasks/.test(cnav) && !/Settings|Staff|Accounts|Audit/.test(cnav), cnav);
  await cp.goto(B + '/admin/#/settings'); await cp.waitForTimeout(500);
  ok('typing the settings address as a coordinator shows a polite refusal', /not available to your role/.test(await cp.innerText('#view')));
  const nc = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const np = await uiLogin(nc, NET, PW); await np.goto(B + '/admin/#/providers'); await np.waitForSelector('.c-table tbody tr');
  ok('a network manager can open providers but the nav has no cases', !/Cases/.test((await np.locator('#c-nav a').allInnerTexts()).join('|')));

  const mc = await b.newContext({ viewport: { width: 390, height: 800 } });
  const mp = await uiLogin(mc, OWNER, PW, secret); await mp.goto(B + '/admin/#/cases'); await mp.waitForSelector('.c-table tbody tr');
  ok('on a phone the menu is behind a button', !(await mp.isVisible('#c-nav')) && (await mp.isVisible('#menu-btn')));
  await mp.click('#menu-btn'); ok('the menu button opens it', await mp.isVisible('#c-nav'));
  await mp.keyboard.press('Escape'); await mp.click('#menu-btn');
  for (const route of ['dashboard', 'cases', 'calendar', 'reports', 'providers', 'settings']) {
    await mp.goto(B + '/admin/#/' + route); await mp.waitForTimeout(700);
    ok(`no sideways scrolling on a phone: ${route}`, await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await mp.evaluate(() => document.documentElement.scrollWidth));
  }
  await mp.screenshot({ path: S + 'ui-console-mobile.png' });

  console.log('Not signed in');
  const anon = await b.newContext(); const anp = await anon.newPage(); await anp.goto(B + '/admin/#/cases'); await anp.waitForSelector('#form-login:not([hidden])');
  ok('without a session the console sends you to the login page and shows no data', /login/.test(anp.url()) && (await anp.locator('.c-table').count()) === 0);
  const apiAnon = await req('/api/admin/cases');
  ok('and the data itself is refused (401)', apiAnon.status === 401, apiAnon.status);

  await b.close();
  done();
})().catch((e) => { console.error('UI TEST CRASH', e); process.exit(2); });
