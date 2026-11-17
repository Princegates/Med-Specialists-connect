import { can } from '../perms.js';
import { describeSettings, saveSettings, getSecret, getSetting, markVerified, GROUPS } from '../settings.js';
import { sendEmail } from '../email.js';
import { audit } from '../audit.js';
import { json, fail, clean } from '../http.js';

export async function get(x) {
  if (!can(x.staff, 'settings.view')) return fail(403, 'Not allowed.');
  const site = ((await getSetting(x.env, 'site_url')) || '').replace(/\/$/, '');
  const log = (await x.env.DB.prepare('SELECT at, kind, recipient, subject, ok, error FROM email_log ORDER BY id DESC LIMIT 10').all()).results;
  return json({ ok: true, groups: GROUPS, settings: await describeSettings(x.env),
    encryptionKeySet: !!x.env.SETTINGS_ENC_KEY && String(x.env.SETTINGS_ENC_KEY).length >= 24,
    webhookUrl: `${site}/api/paystack-webhook`, emailLog: log });
}

export async function save(x) {
  if (!can(x.staff, 'settings.edit')) return fail(403, 'Not allowed.');
  const r = await saveSettings(x.env, x.body.values, x.body.clear, x.staff.email);
  if (r.error) return fail(400, r.error);
  if (r.changed.length) await audit(x.env, x.staff.email, 'settings', null, 'updated', r.changed.join(', '));
  return json({ ok: true, changed: r.changed });
}

export async function testEmail(x) {
  if (!can(x.staff, 'settings.edit')) return fail(403, 'Not allowed.');
  const to = clean(x.body.to, 120) || x.staff.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(400, 'Please enter a valid email address.');
  const r = await sendEmail(x.env, { to, kind: 'test', subject: 'Test email from your admin console', text: 'This is a test. Your email settings work.', html: '<p>This is a test. Your email settings work.</p>' });
  await markVerified(x.env, 'email_verified', r.ok, x.staff.email);
  await audit(x.env, x.staff.email, 'settings', null, 'test-email', r.ok ? 'passed' : 'failed');
  return r.ok ? json({ ok: true, to }) : fail(502, r.error);
}

// Asks Paystack a harmless question with the saved key to prove the key works.
export async function testPayments(x) {
  if (!can(x.staff, 'settings.edit')) return fail(403, 'Not allowed.');
  const key = await getSecret(x.env, 'paystack_secret_key');
  if (!key) return fail(400, 'Save your Paystack secret key first.');
  const base = x.env.PAYSTACK_BASE || 'https://api.paystack.co';
  let ok = false, mode = '';
  try {
    const r = await fetch(`${base}/balance`, { headers: { Authorization: `Bearer ${key}` } });
    ok = r.ok; mode = key.startsWith('sk_live') ? 'live' : key.startsWith('sk_test') ? 'test' : 'unknown';
  } catch (e) { /* treated as failed below */ }
  await markVerified(x.env, 'payments_verified', ok, x.staff.email);
  await audit(x.env, x.staff.email, 'settings', null, 'test-payments', ok ? 'passed' : 'failed');
  return ok ? json({ ok: true, mode }) : fail(502, 'Paystack did not accept the key. Check that it is the secret key, copied in full.');
}
