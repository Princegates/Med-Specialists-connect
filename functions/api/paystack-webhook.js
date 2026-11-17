import { getFlags, getSecret } from '../_lib/settings.js';
import { ensureSchema } from '../_lib/schema.js';
import { CURRENCY } from '../_lib/catalogue.js';
import { markInvoicePaid } from '../_lib/db.js';
import { emailReceipt } from '../_lib/email.js';
import { audit } from '../_lib/audit.js';
import { json, fail, later } from '../_lib/http.js';

const enc = new TextEncoder();
async function hmacSha512Hex(secret, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// POST /api/paystack-webhook: the source of truth for payments. Only a correctly signed message is believed,
// and the amount and currency must match the invoice before it is marked paid.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return fail(503, 'Not enabled.');
  await ensureSchema(env.DB);
  const secret = await getSecret(env, 'paystack_secret_key');
  if (!(await getFlags(env)).billingEnabled || !secret) return fail(503, 'Not enabled.');
  const body = await request.text();
  const given = request.headers.get('x-paystack-signature') || '';
  if (!safeEqual(given.toLowerCase(), await hmacSha512Hex(secret, body))) return fail(401, 'Bad signature.');

  let event;
  try { event = JSON.parse(body); } catch (e) { return fail(400, 'Invalid body.'); }
  if (event.event === 'charge.success' && event.data) {
    const t = event.data;
    const invoiceId = t.metadata && t.metadata.invoice_id;
    if (invoiceId) {
      const inv = await env.DB.prepare('SELECT id, status, total, request_id FROM invoices WHERE id = ?').bind(String(invoiceId)).first();
      if (inv && inv.status === 'issued' && t.amount === inv.total && t.currency === CURRENCY) {
        if (await markInvoicePaid(env.DB, inv, t.channel, t.reference)) {
          await audit(env, 'paystack', 'invoice', inv.id, 'paid', `${t.channel || 'online'} ${t.reference}`);
          later(context, emailReceipt(env, inv.id));
        }
      }
    }
  }
  return json({ ok: true }); // always 200 for a valid signature so Paystack does not keep retrying
}
