import { SERVICES, flags } from '../../_lib/catalogue.js';
import { createInvoice, markInvoicePaid } from '../../_lib/db.js';
import { requireAdmin } from '../../_lib/access.js';
import { json, fail, readJson, clean } from '../../_lib/http.js';

const REQUEST_STATUSES = ['received', 'awaiting_quote', 'invoiced', 'paid', 'scheduled', 'closed'];

// Everything under /api/admin needs a Cloudflare Access sign-in. Changes also need a same-origin request.
export async function onRequest({ request, env, params }) {
  if (!env.DB) return fail(503, 'The database is not set up yet.');
  const admin = await requireAdmin(request, env);
  if (!admin) return fail(401, 'Sign-in required.');
  const method = request.method;
  if (method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) return fail(403, 'Cross-site request refused.');
  const path = (params.path || []).join('/');

  if (method === 'GET' && path === 'catalogue') {
    return json({ ok: true, flags: flags(env), admin: admin.email, services: Object.entries(SERVICES).map(([value, s]) => ({ value, label: s.label, billing: s.billing, lines: s.lines })) });
  }

  if (method === 'GET' && path === 'requests') {
    const { results } = await env.DB.prepare(
      'SELECT r.id, r.created_at, r.service, r.for_whom, r.urgency, r.message, r.name, r.phone, r.email, r.preferred_date, r.call_time, r.area, r.status, r.notes, ' +
      'i.id AS invoice_id, i.number AS invoice_number, i.status AS invoice_status, i.total AS invoice_total ' +
      "FROM requests r LEFT JOIN invoices i ON i.request_id = r.id AND i.status != 'void' ORDER BY r.created_at DESC LIMIT 200"
    ).all();
    return json({ ok: true, requests: results });
  }

  if (method === 'POST') {
    let b;
    try { b = await readJson(request); } catch (e) { return fail(400, 'Invalid request.'); }

    if (path === 'invoice') {
      const requestId = clean(b.requestId, 40);
      const req = await env.DB.prepare('SELECT id FROM requests WHERE id = ?').bind(requestId).first();
      if (!req) return fail(404, 'Request not found.');
      const raw = Array.isArray(b.lines) ? b.lines.slice(0, 20) : [];
      const lines = [];
      for (const l of raw) {
        const description = clean(l.description, 120);
        const amount = Math.round(Number(l.amountGhs) * 100);
        if (!description || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) return fail(400, 'Each line needs a description and an amount above zero.');
        lines.push({ description, amount });
      }
      if (!lines.length) return fail(400, 'Add at least one line.');
      const made = await createInvoice(env.DB, requestId, lines, clean(b.note, 500));
      if (made.conflict) return fail(409, 'This request already has an invoice. Void it first to issue a new one.');
      return json({ ok: true, invoice: { id: made.id, number: made.number, total: made.total, url: `/invoice?id=${made.id}` } });
    }

    if (path === 'invoice-status') {
      const inv = await env.DB.prepare('SELECT id, status, request_id FROM invoices WHERE id = ?').bind(clean(b.invoiceId, 40)).first();
      if (!inv) return fail(404, 'Invoice not found.');
      if (b.status === 'paid') {
        if (inv.status !== 'issued') return fail(409, 'Only an issued invoice can be marked paid.');
        await markInvoicePaid(env.DB, inv, 'manual', clean(b.reference, 80) || `manual:${admin.email}`);
        return json({ ok: true });
      }
      if (b.status === 'void') {
        if (inv.status !== 'issued') return fail(409, 'Only an unpaid invoice can be voided.');
        await env.DB.batch([
          env.DB.prepare("UPDATE invoices SET status = 'void', note = COALESCE(note || ' | ', '') || ? WHERE id = ?").bind('Voided by ' + admin.email, inv.id),
          env.DB.prepare("UPDATE requests SET status = 'received' WHERE id = ? AND status = 'invoiced'").bind(inv.request_id)
        ]);
        return json({ ok: true });
      }
      return fail(400, 'Unknown status.');
    }

    if (path === 'request-status') {
      if (!REQUEST_STATUSES.includes(b.status)) return fail(400, 'Unknown status.');
      await env.DB.prepare('UPDATE requests SET status = ?, notes = COALESCE(?, notes) WHERE id = ?')
        .bind(b.status, b.notes === undefined ? null : clean(b.notes, 1000), clean(b.requestId, 40)).run();
      return json({ ok: true });
    }
  }
  return fail(404, 'Not found.');
}
