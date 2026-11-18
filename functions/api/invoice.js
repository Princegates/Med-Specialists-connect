import { getFlags, getSetting, getSecret } from '../_lib/settings.js';
import { ensureSchema } from '../_lib/schema.js';
import { json, fail } from '../_lib/http.js';
import { detailsFor, packageFor } from '../_lib/packages.js';

const mask = (p) => { const d = String(p).replace(/\D/g, ''); return d.length > 6 ? d.slice(0, 3) + ' *** ' + d.slice(-3) : '***'; };

// GET /api/invoice?id=<uuid>: what the invoice page shows. The id is long and random, so only
// someone who was given the link can open it. No health details are returned.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return fail(503, 'The online system is not switched on.');
  await ensureSchema(env.DB);
  const f = await getFlags(env);
  if (!f.billingEnabled) return fail(503, 'The online system is not switched on.');
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, 'Invoice not found.');
  const row = await env.DB.prepare(
    'SELECT i.number, i.status, i.currency, i.total, i.lines, i.note, i.created_at, i.paid_at, r.name, r.phone, r.service ' +
    'FROM invoices i JOIN requests r ON r.id = i.request_id WHERE i.id = ?'
  ).bind(id).first();
  if (!row) return fail(404, 'Invoice not found.');
  return json({
    ok: true,
    invoice: {
      number: row.number, status: row.status, currency: row.currency, total: row.total,
      lines: JSON.parse(row.lines), note: row.note, issuedAt: row.created_at, paidAt: row.paid_at,
      billTo: row.name, contact: mask(row.phone)
    },
    business: {
      name: await getSetting(env, 'business_name'), phone: await getSetting(env, 'business_phone'),
      email: await getSetting(env, 'business_email'), address: await getSetting(env, 'business_address'), note: await getSetting(env, 'invoice_note')
    },
    included: detailsFor(row.service),
    package: packageFor(row.service),
    payable: f.pricesConfirmed && !!(await getSecret(env, 'paystack_secret_key')) && row.status === 'issued' && row.total > 0,
    testMode: !f.pricesConfirmed
  });
}
