import { flags } from '../_lib/catalogue.js';
import { json, fail } from '../_lib/http.js';

const mask = (p) => { const d = String(p).replace(/\D/g, ''); return d.length > 6 ? d.slice(0, 3) + ' *** ' + d.slice(-3) : '***'; };

// GET /api/invoice?id=<uuid>: what the invoice page shows. The id is long and random, so only
// someone who was given the link can open it. No health details are returned.
export async function onRequestGet({ request, env }) {
  const f = flags(env);
  if (!f.billingEnabled) return fail(503, 'The online system is not switched on.');
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(404, 'Invoice not found.');
  const row = await env.DB.prepare(
    'SELECT i.number, i.status, i.currency, i.total, i.lines, i.note, i.created_at, i.paid_at, r.name, r.phone ' +
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
    payable: f.pricesConfirmed && !!env.PAYSTACK_SECRET_KEY && row.status === 'issued' && row.total > 0,
    testMode: !f.pricesConfirmed
  });
}
