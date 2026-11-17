import { can } from '../perms.js';
import { markInvoicePaid } from '../db.js';
import { emailInvoice, emailReceipt } from '../email.js';
import { audit } from '../audit.js';
import { json, fail, clean, later } from '../http.js';

export async function listInvoices(x) {
  if (!can(x.staff, 'billing.view')) return fail(403, 'Not allowed.');
  const q = x.url.searchParams, where = [], args = [];
  if (q.get('status')) { where.push('i.status = ?'); args.push(q.get('status')); }
  if (q.get('from')) { where.push('i.created_at >= ?'); args.push(q.get('from')); }
  if (q.get('to')) { where.push('i.created_at < ?'); args.push(q.get('to') + 'T23:59:59.999Z'); }
  const term = (q.get('q') || '').trim().slice(0, 60);
  if (term) { where.push('(i.number LIKE ? OR r.name LIKE ? OR r.phone LIKE ?)'); const l = `%${term}%`; args.push(l, l, l); }
  const { results } = await x.env.DB.prepare(
    'SELECT i.id, i.number, i.status, i.total, i.created_at, i.paid_at, i.pay_channel, r.id AS case_id, r.name, r.phone, r.email, sv.label AS service_label ' +
    'FROM invoices i JOIN requests r ON r.id = i.request_id LEFT JOIN services sv ON sv.value = r.service ' +
    (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY i.created_at DESC LIMIT 200'
  ).bind(...args).all();
  return json({ ok: true, invoices: results });
}

export async function invoiceDetail(x, id) {
  if (!can(x.staff, 'billing.view')) return fail(403, 'Not allowed.');
  const i = await x.env.DB.prepare('SELECT i.*, r.name, r.phone, r.email, sv.label AS service_label FROM invoices i JOIN requests r ON r.id = i.request_id LEFT JOIN services sv ON sv.value = r.service WHERE i.id = ?').bind(id).first();
  if (!i) return fail(404, 'Invoice not found.');
  const payments = (await x.env.DB.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY received_at').bind(id).all()).results;
  const timeline = (await x.env.DB.prepare("SELECT at, actor, action, detail FROM activity WHERE entity = 'invoice' AND entity_id = ? ORDER BY id").bind(id).all()).results;
  return json({ ok: true, invoice: { ...i, lines: JSON.parse(i.lines) }, payments, timeline });
}

export async function setStatus(x, id) {
  if (!can(x.staff, 'billing.manage')) return fail(403, 'Only finance or the owner can do this.');
  const inv = await x.env.DB.prepare('SELECT id, status, total, request_id FROM invoices WHERE id = ?').bind(id).first();
  if (!inv) return fail(404, 'Invoice not found.');
  if (x.body.status === 'paid') {
    if (inv.status !== 'issued') return fail(409, 'Only an issued invoice can be marked paid.');
    const ref = clean(x.body.reference, 80);
    if (!ref) return fail(400, 'Please give the payment reference.');
    if (await markInvoicePaid(x.env.DB, inv, 'manual', ref, x.staff.email)) {
      await audit(x.env, x.staff.email, 'invoice', id, 'paid', `Recorded by hand: ${ref}`);
      later(x.context, emailReceipt(x.env, id));
    }
    return json({ ok: true });
  }
  if (x.body.status === 'void') {
    if (inv.status !== 'issued') return fail(409, 'Only an unpaid invoice can be voided.');
    const reason = clean(x.body.reason, 300);
    if (!reason) return fail(400, 'Please give a reason.');
    await x.env.DB.batch([
      x.env.DB.prepare("UPDATE invoices SET status = 'void' WHERE id = ?").bind(id),
      x.env.DB.prepare("UPDATE requests SET status = 'received' WHERE id = ? AND status = 'invoiced'").bind(inv.request_id)
    ]);
    await audit(x.env, x.staff.email, 'invoice', id, 'void', reason);
    return json({ ok: true });
  }
  return fail(400, 'Unknown status.');
}

export async function resend(x, id) {
  if (!can(x.staff, 'billing.create')) return fail(403, 'Not allowed.');
  const inv = await x.env.DB.prepare('SELECT id, status FROM invoices WHERE id = ?').bind(id).first();
  if (!inv) return fail(404, 'Invoice not found.');
  if (inv.status !== 'issued') return fail(409, 'Only an unpaid invoice can be sent again.');
  const r = await emailInvoice(x.env, id);
  if (r.skipped) return fail(409, 'Email is not set up, switched off for invoices, or the client has no email address.');
  if (!r.ok) return fail(502, r.error);
  await audit(x.env, x.staff.email, 'invoice', id, 'emailed', 'Invoice sent again');
  return json({ ok: true });
}

export async function listPayments(x) {
  if (!can(x.staff, 'billing.view')) return fail(403, 'Not allowed.');
  const q = x.url.searchParams, where = [], args = [];
  if (q.get('from')) { where.push('p.received_at >= ?'); args.push(q.get('from')); }
  if (q.get('to')) { where.push('p.received_at < ?'); args.push(q.get('to') + 'T23:59:59.999Z'); }
  const { results } = await x.env.DB.prepare(
    'SELECT p.id, p.amount, p.currency, p.channel, p.reference, p.source, p.received_at, p.recorded_by, i.number AS invoice_number, i.id AS invoice_id, r.name ' +
    'FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN requests r ON r.id = i.request_id ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.received_at DESC LIMIT 300'
  ).bind(...args).all();
  return json({ ok: true, payments: results });
}
