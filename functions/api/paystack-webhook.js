import { flags, CURRENCY } from '../_lib/catalogue.js';
import { markInvoicePaid } from '../_lib/db.js';
import { json, fail } from '../_lib/http.js';

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
export async function onRequestPost({ request, env }) {
  if (!flags(env).billingEnabled || !env.PAYSTACK_SECRET_KEY) return fail(503, 'Not enabled.');
  const body = await request.text();
  const given = request.headers.get('x-paystack-signature') || '';
  const expected = await hmacSha512Hex(env.PAYSTACK_SECRET_KEY, body);
  if (!safeEqual(given.toLowerCase(), expected)) return fail(401, 'Bad signature.');

  let event;
  try { event = JSON.parse(body); } catch (e) { return fail(400, 'Invalid body.'); }
  if (event.event === 'charge.success' && event.data) {
    const t = event.data;
    const invoiceId = t.metadata && t.metadata.invoice_id;
    if (invoiceId) {
      const inv = await env.DB.prepare('SELECT id, status, total, request_id FROM invoices WHERE id = ?').bind(String(invoiceId)).first();
      if (inv && inv.status === 'issued' && t.amount === inv.total && t.currency === CURRENCY) {
        await markInvoicePaid(env.DB, inv, t.channel, t.reference);
      }
    }
  }
  return json({ ok: true }); // always 200 for a valid signature so Paystack does not keep retrying
}
