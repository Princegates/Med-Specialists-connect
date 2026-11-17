import { CURRENCY } from './catalogue.js';

export const nowIso = () => new Date().toISOString();

// Next invoice number, e.g. MSC-2026-0007. The counter update is a single statement, so it is safe
// when two requests arrive at the same moment.
export async function nextInvoiceNumber(db) {
  const year = new Date().getUTCFullYear();
  const row = await db
    .prepare('INSERT INTO counters (year, n) VALUES (?, 1) ON CONFLICT(year) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(year).first();
  return `MSC-${year}-${String(row.n).padStart(4, '0')}`;
}

// Creates and issues an invoice for a request. Lines are [{description, amount}] with amounts in pesewas.
export async function createInvoice(db, requestId, lines, note) {
  const existing = await db
    .prepare("SELECT id FROM invoices WHERE request_id = ? AND status != 'void'").bind(requestId).first();
  if (existing) return { conflict: true };
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const id = crypto.randomUUID();
  const number = await nextInvoiceNumber(db);
  await db.batch([
    db.prepare('INSERT INTO invoices (id, number, request_id, status, currency, total, lines, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, number, requestId, 'issued', CURRENCY, total, JSON.stringify(lines), note || null, nowIso()),
    db.prepare("UPDATE requests SET status = 'awaiting_payment', next_action = 'Waiting for the client to pay', next_action_due = NULL WHERE id = ? AND status IN ('new', 'under_review', 'awaiting_patient', 'awaiting_provider', 'options_presented')").bind(requestId)
  ]);
  return { id, number, total };
}

// Marks an invoice paid exactly once (a repeated notification changes nothing) and records the payment in the ledger.
// `invoice` needs id, status, total, request_id.
export async function markInvoicePaid(db, invoice, channel, ref, by) {
  if (invoice.status === 'paid') return false;
  const at = nowIso();
  const r = await db.prepare("UPDATE invoices SET status = 'paid', paid_at = ?, pay_channel = ?, pay_ref = ? WHERE id = ? AND status = 'issued'")
    .bind(at, channel || null, ref || null, invoice.id).run();
  if (!r.meta || r.meta.changes === 0) return false;
  await db.batch([
    db.prepare('INSERT INTO payments (id, invoice_id, amount, currency, channel, reference, source, received_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), invoice.id, invoice.total, CURRENCY, channel || null, ref || null, channel === 'manual' ? 'manual' : 'paystack', at, by || null),
    db.prepare("UPDATE requests SET status = 'in_progress', next_action = 'Payment received: arrange the service', next_action_due = ? WHERE id = ? AND status = 'awaiting_payment'").bind(at, invoice.request_id)
  ]);
  return true;
}
