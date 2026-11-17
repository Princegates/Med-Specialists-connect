import { getFlags, getSetting, getSecret } from '../_lib/settings.js';
import { ensureSchema } from '../_lib/schema.js';
import { CURRENCY } from '../_lib/catalogue.js';
import { json, fail, readJson } from '../_lib/http.js';

// POST /api/pay {id}: starts a Paystack checkout for an issued invoice and returns the checkout address.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail(503, 'The online system is not switched on.');
  await ensureSchema(env.DB);
  const f = await getFlags(env);
  if (!f.billingEnabled) return fail(503, 'The online system is not switched on.');
  if (!f.pricesConfirmed) return fail(403, 'Online payment is not open yet.');
  const secret = await getSecret(env, 'paystack_secret_key');
  if (!secret) return fail(503, 'Online payment is not set up yet.');

  let b;
  try { b = await readJson(request); } catch (e) { return fail(400, 'Invalid request.'); }
  const id = String(b.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, 'Invoice not found.');
  const inv = await env.DB.prepare(
    'SELECT i.id, i.number, i.status, i.total, r.email FROM invoices i JOIN requests r ON r.id = i.request_id WHERE i.id = ?'
  ).bind(id).first();
  if (!inv) return fail(404, 'Invoice not found.');
  if (inv.status !== 'issued' || inv.total <= 0) return fail(409, 'This invoice cannot be paid.');

  const base = env.PAYSTACK_BASE || 'https://api.paystack.co';
  const site = ((await getSetting(env, 'site_url')) || new URL(request.url).origin).replace(/\/$/, '');
  const reference = `${inv.number}-${Date.now().toString(36)}`;
  try {
    const r = await fetch(`${base}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inv.email || `noreply+${inv.number.toLowerCase()}@medspecialistconnect.com`,
        amount: inv.total,
        currency: CURRENCY,
        reference,
        callback_url: `${site}/invoice?id=${inv.id}`,
        metadata: { invoice_id: inv.id, invoice_number: inv.number }
      })
    });
    const data = await r.json();
    if (!r.ok || !data.status || !data.data || !data.data.authorization_url) return fail(502, 'The payment service could not start the payment.');
    return json({ ok: true, url: data.data.authorization_url });
  } catch (e) {
    return fail(502, 'The payment service is not reachable. Please try again.');
  }
}
