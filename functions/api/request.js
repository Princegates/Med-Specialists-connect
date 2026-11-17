import { SERVICES, flags } from '../_lib/catalogue.js';
import { createInvoice, nowIso } from '../_lib/db.js';
import { json, fail, readJson, clean } from '../_lib/http.js';

// POST /api/request: stores a care request and, for fixed-fee services once prices are confirmed,
// issues the invoice straight away.
export async function onRequestPost({ request, env }) {
  const f = flags(env);
  if (!f.billingEnabled) return fail(503, 'The online system is not switched on.');

  let b;
  try { b = await readJson(request); } catch (e) { return fail(400, 'Invalid request.'); }
  if (b.botcheck) return json({ ok: true, status: 'received', invoice: null }); // spam trap: pretend it worked

  const service = clean(b.service, 80);
  const def = SERVICES[service];
  if (!def) return fail(400, 'Please choose a service.');
  const name = clean(b.name, 100);
  const phone = clean(b.phone, 30);
  const email = clean(b.email, 120);
  if (!name) return fail(400, 'Please enter your name.');
  if (!/^[+0-9()\s-]{7,30}$/.test(phone)) return fail(400, 'Please enter a valid phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Please check the email address.');
  if (b.consent !== true) return fail(400, 'Please agree to the privacy notice.');
  const date = clean(b.preferred_date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'Please check the preferred date.');

  // Simple flood guard: no more than 5 requests an hour from the same phone number.
  const since = new Date(Date.now() - 3600000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM requests WHERE phone = ? AND created_at > ?').bind(phone, since).first();
  if (recent && recent.c >= 5) return fail(429, 'Too many requests. Please call us instead.');

  const id = crypto.randomUUID();
  const status = def.billing === 'quote' ? 'awaiting_quote' : 'received';
  await env.DB.prepare(
    'INSERT INTO requests (id, created_at, service, for_whom, urgency, message, name, phone, email, preferred_date, call_time, area, status) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, nowIso(), service, clean(b.for_whom, 80), clean(b.urgency, 80), clean(b.message, 2000), name, phone,
    email || null, date || null, clean(b.call_time, 40), clean(b.area, 100), status
  ).run();

  let invoice = null;
  if (def.billing === 'fixed' && f.pricesConfirmed) {
    const made = await createInvoice(env.DB, id, def.lines, null);
    if (!made.conflict) invoice = { id: made.id, number: made.number, total: made.total, url: `/invoice?id=${made.id}` };
  }
  return json({ ok: true, requestId: id, billing: def.billing, status: invoice ? 'invoiced' : status, invoice });
}
