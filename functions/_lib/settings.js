import { encrypt, decrypt } from './crypto.js';
import { ensureSchema } from './schema.js';

// Every setting the business can change from the admin console. Secrets are stored encrypted and never sent back.
export const GROUPS = [
  { id: 'business', label: 'Business details' },
  { id: 'billing', label: 'Billing and prices' },
  { id: 'email', label: 'Email' },
  { id: 'payments', label: 'Payments' },
  { id: 'security', label: 'Security' }
];

export const DEFS = [
  { group: 'business', key: 'business_name', label: 'Business name', type: 'text', default: 'MEDs Specialists Connect' },
  { group: 'business', key: 'business_phone', label: 'Phone numbers shown on invoices', type: 'text', default: '0243 560 080 · 0556 924 777' },
  { group: 'business', key: 'business_email', label: 'Business email shown on invoices', type: 'email', default: 'medspecialistsconnect@gmail.com' },
  { group: 'business', key: 'business_address', label: 'Address shown on invoices', type: 'text', default: '6 Worship Curve, Spintex Road' },
  { group: 'business', key: 'invoice_note', label: 'Note printed on every invoice', type: 'textarea', default: 'Charges by doctors, hospitals and laboratories, where they apply, are shown as separate lines.' },
  { group: 'business', key: 'site_url', label: 'Website address', type: 'text', default: 'https://www.medspecialistconnect.com', help: 'Used in emails and for the return from payment.' },

  { group: 'billing', key: 'billing_enabled', label: 'Online requests, invoices and payment are switched on', type: 'bool', default: 'false', help: 'When off, the website only emails requests to the team.' },
  { group: 'billing', key: 'prices_confirmed', label: 'Prices are confirmed', type: 'bool', default: 'false', help: 'Until this is on, no invoice is issued automatically and nothing can be paid online.' },
  { group: 'billing', key: 'auto_assign', label: 'Assign new requests to the least busy coordinator', type: 'bool', default: 'false' },
  { group: 'billing', key: 'first_response_hours', label: 'Hours allowed to make first contact with a new request', type: 'number', default: '2', help: 'New cases get this as their first deadline. Emergency flags are due immediately.' },
  { group: 'billing', key: 'overdue_days', label: 'Days before an unpaid invoice counts as overdue', type: 'number', default: '7' },

  { group: 'email', key: 'email_provider', label: 'Email service', type: 'select', options: ['none', 'resend', 'brevo', 'sendgrid'], default: 'none', help: 'The company that sends your emails. You need an account with one of them.' },
  { group: 'email', key: 'email_api_key', label: 'Email service API key', type: 'secret' },
  { group: 'email', key: 'email_from_name', label: 'Sender name', type: 'text', default: 'MEDs Specialists Connect' },
  { group: 'email', key: 'email_from_address', label: 'Sender email address', type: 'email', help: 'Must be an address on a domain you have verified with the email service.' },
  { group: 'email', key: 'email_reply_to', label: 'Reply-to address', type: 'email' },
  { group: 'email', key: 'email_notify_to', label: 'Team notification recipients (comma separated)', type: 'text' },
  { group: 'email', key: 'notify_new_request', label: 'Email the team when a request arrives', type: 'bool', default: 'true' },
  { group: 'email', key: 'send_invoice_email', label: 'Email the client their invoice', type: 'bool', default: 'true' },
  { group: 'email', key: 'send_receipt_email', label: 'Email the client a receipt when they pay', type: 'bool', default: 'true' },
  { group: 'email', key: 'email_verified', label: 'Email sending verified by a successful test', type: 'bool', default: 'false', readonly: true },

  { group: 'payments', key: 'payment_provider', label: 'Payment provider', type: 'select', options: ['paystack'], default: 'paystack' },
  { group: 'payments', key: 'paystack_secret_key', label: 'Paystack secret key', type: 'secret', help: 'Use your test key (sk_test_...) first, then your live key (sk_live_...).' },
  { group: 'security', key: 'require_mfa', label: 'Require an authenticator-app code for owners, supervisors, finance and administrators', type: 'bool', default: 'true', help: 'Strongly recommended: patient information is sensitive. Staff set it up the first time they sign in.' },
  { group: 'security', key: 'session_hours', label: 'Hours before staff must sign in again', type: 'number', default: '12' },
  { group: 'payments', key: 'payments_verified', label: 'Payment connection verified by a successful test', type: 'bool', default: 'false', readonly: true }
];

// Used only when a setting has not been saved in the admin console yet.
const ENV_FALLBACK = {
  billing_enabled: 'BILLING_ENABLED', prices_confirmed: 'PRICES_CONFIRMED', site_url: 'SITE_URL',
  paystack_secret_key: 'PAYSTACK_SECRET_KEY', email_api_key: 'EMAIL_API_KEY'
};

let cache = { at: 0, db: null, rows: null };
async function rows(env) {
  if (!env.DB) return new Map();
  if (cache.rows && cache.db === env.DB && Date.now() - cache.at < 8000) return cache.rows;
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare('SELECT key, value, secret FROM settings').all();
  cache = { at: Date.now(), db: env.DB, rows: new Map(results.map((r) => [r.key, r])) };
  return cache.rows;
}
export const forgetSettings = () => { cache.at = 0; };

export async function getSetting(env, key) {
  const r = (await rows(env)).get(key);
  if (r && !r.secret && r.value !== null && r.value !== undefined) return r.value;
  const ev = ENV_FALLBACK[key] && env[ENV_FALLBACK[key]];
  if (ev !== undefined && ev !== '') return String(ev);
  const def = DEFS.find((d) => d.key === key);
  return def ? def.default : undefined;
}

export async function getSecret(env, key) {
  const r = (await rows(env)).get(key);
  if (r && r.secret && r.value) { try { return await decrypt(env, r.value); } catch (e) { return null; } }
  const ev = ENV_FALLBACK[key] && env[ENV_FALLBACK[key]];
  return ev || null;
}

export async function getFlags(env) {
  if (!env.DB) return { billingEnabled: false, pricesConfirmed: false };
  return {
    billingEnabled: (await getSetting(env, 'billing_enabled')) === 'true',
    pricesConfirmed: (await getSetting(env, 'prices_confirmed')) === 'true'
  };
}

// The settings page: everything the admin can see. Secrets show only whether one is saved.
export async function describeSettings(env) {
  const m = await rows(env);
  const out = [];
  for (const d of DEFS) {
    const r = m.get(d.key);
    if (d.type === 'secret') out.push({ ...d, set: !!(r && r.value) || !!(ENV_FALLBACK[d.key] && env[ENV_FALLBACK[d.key]]) });
    else out.push({ ...d, value: await getSetting(env, d.key) });
  }
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate(def, v) {
  v = String(v ?? '').trim();
  if (def.type === 'bool') return v === 'true' || v === 'false' ? v : null;
  if (def.type === 'number') return /^\d{1,3}$/.test(v) ? v : null;
  if (def.type === 'select') return def.options.includes(v) ? v : null;
  if (def.type === 'email') return v === '' || EMAIL.test(v) ? v : null;
  if (def.key === 'email_notify_to') return v.split(',').map((x) => x.trim()).filter(Boolean).every((x) => EMAIL.test(x)) ? v.split(',').map((x) => x.trim()).filter(Boolean).join(', ') : null;
  if (def.type === 'textarea') return v.length <= 600 ? v : null;
  return v.length <= 300 ? v : null;
}

// Returns {error} or {changed:[keys]}. Secrets are only changed when a new value is sent or clearing is asked for.
export async function saveSettings(env, values, clear, actor) {
  await ensureSchema(env.DB);
  const stmts = [], changed = [];
  const now = new Date().toISOString();
  const upsert = (key, value, secret) => env.DB.prepare(
    'INSERT INTO settings (key, value, secret, updated_at, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, secret = excluded.secret, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
  ).bind(key, value, secret ? 1 : 0, now, actor);
  for (const [key, raw] of Object.entries(values || {})) {
    const def = DEFS.find((d) => d.key === key);
    if (!def || def.readonly) return { error: `Unknown or read-only setting: ${key}` };
    if (def.type === 'secret') {
      const v = String(raw ?? '').trim();
      if (!v) continue;
      if (v.length > 400) return { error: `${def.label} is too long.` };
      try { stmts.push(upsert(key, await encrypt(env, v), true)); } catch (e) {
        if (String(e.message) === 'SETTINGS_ENC_KEY_MISSING') return { error: 'The encryption key is not set. Add a secret called SETTINGS_ENC_KEY (at least 24 random characters) in Cloudflare, redeploy, then save again.' };
        throw e;
      }
      changed.push(key);
      continue;
    }
    const v = validate(def, raw);
    if (v === null) return { error: `Please check: ${def.label}.` };
    stmts.push(upsert(key, v, false)); changed.push(key);
  }
  for (const key of clear || []) {
    const def = DEFS.find((d) => d.key === key && d.type === 'secret');
    if (!def) return { error: `Cannot clear ${key}.` };
    stmts.push(env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key)); changed.push(key);
  }
  // Changing how email or payments connect means the earlier successful test no longer proves anything.
  if (changed.some((k) => ['email_provider', 'email_api_key', 'email_from_address'].includes(k))) stmts.push(upsert('email_verified', 'false', false));
  if (changed.includes('paystack_secret_key')) stmts.push(upsert('payments_verified', 'false', false));
  if (stmts.length) await env.DB.batch(stmts);
  forgetSettings();
  return { changed };
}

export async function markVerified(env, key, on, actor) {
  await env.DB.prepare('INSERT INTO settings (key, value, secret, updated_at, updated_by) VALUES (?, ?, 0, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
    .bind(key, on ? 'true' : 'false', new Date().toISOString(), actor).run();
  forgetSettings();
}
