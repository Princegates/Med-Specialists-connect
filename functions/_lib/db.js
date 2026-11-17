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
    db.prepare("UPDATE requests SET status = 'invoiced' WHERE id = ? AND status IN ('received', 'awaiting_quote')").bind(requestId)
  ]);
  return { id, number, total };
}

export async function markInvoicePaid(db, invoice, channel, ref) {
  if (invoice.status === 'paid') return false;
  await db.batch([
    db.prepare("UPDATE invoices SET status = 'paid', paid_at = ?, pay_channel = ?, pay_ref = ? WHERE id = ? AND status = 'issued'")
      .bind(nowIso(), channel || null, ref || null, invoice.id),
    db.prepare("UPDATE requests SET status = 'paid' WHERE id = ? AND status IN ('received', 'awaiting_quote', 'invoiced')").bind(invoice.request_id)
  ]);
  return true;
}
