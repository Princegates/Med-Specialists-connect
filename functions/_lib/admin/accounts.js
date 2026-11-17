import { can } from '../perms.js';
import { getSetting } from '../settings.js';
import { audit } from '../audit.js';
import { json, fail } from '../http.js';

const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);
function range(url) {
  const to = day(url.searchParams.get('to')) || new Date().toISOString().slice(0, 10);
  const from = day(url.searchParams.get('from')) || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to, toEnd: to + 'T23:59:59.999Z' };
}

// Money in, money owed, and where it came from, for a date range.
export async function summary(x) {
  if (!can(x.staff, 'accounts.view')) return fail(403, 'Not allowed.');
  const { from, to, toEnd } = range(x.url), db = x.env.DB;
  const issued = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices WHERE status != 'void' AND created_at >= ? AND created_at <= ?").bind(from, toEnd).first();
  const paid = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM payments WHERE received_at >= ? AND received_at <= ?").bind(from, toEnd).first();
  const voided = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices WHERE status = 'void' AND created_at >= ? AND created_at <= ?").bind(from, toEnd).first();
  const byService = (await db.prepare("SELECT COALESCE(sv.label, r.service) AS label, COUNT(*) AS n, SUM(p.amount) AS total FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN requests r ON r.id = i.request_id LEFT JOIN services sv ON sv.value = r.service WHERE p.received_at >= ? AND p.received_at <= ? GROUP BY label ORDER BY total DESC").bind(from, toEnd).all()).results;
  const byChannel = (await db.prepare("SELECT COALESCE(channel, 'unknown') AS channel, COUNT(*) AS n, SUM(amount) AS total FROM payments WHERE received_at >= ? AND received_at <= ? GROUP BY channel ORDER BY total DESC").bind(from, toEnd).all()).results;
  const byMonth = (await db.prepare("SELECT substr(received_at, 1, 7) AS month, COUNT(*) AS n, SUM(amount) AS total FROM payments WHERE received_at >= ? AND received_at <= ? GROUP BY month ORDER BY month").bind(from, toEnd).all()).results;
  // Everything still unpaid today, by age.
  const open = (await db.prepare("SELECT total, created_at FROM invoices WHERE status = 'issued'").all()).results;
  const now = Date.now(), buckets = { '0-7 days': 0, '8-30 days': 0, 'over 30 days': 0 }, counts = { '0-7 days': 0, '8-30 days': 0, 'over 30 days': 0 };
  for (const i of open) {
    const age = (now - Date.parse(i.created_at)) / 86400000, k = age <= 7 ? '0-7 days' : age <= 30 ? '8-30 days' : 'over 30 days';
    buckets[k] += i.total; counts[k]++;
  }
  return json({ ok: true, from, to, currency: 'GHS', issued, paid, voided, byService, byChannel, byMonth,
    outstanding: { total: open.reduce((s, i) => s + i.total, 0), count: open.length, ageing: Object.keys(buckets).map((k) => ({ band: k, count: counts[k], total: buckets[k] })) },
    overdueAfterDays: Number(await getSetting(x.env, 'overdue_days')) || 7 });
}

const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

// A spreadsheet for the accountant. Cells that could run as formulas are neutralised.
export async function exportCsv(x) {
  if (!can(x.staff, 'accounts.export')) return fail(403, 'Not allowed.');
  const type = x.url.searchParams.get('type') === 'payments' ? 'payments' : 'invoices';
  const { from, toEnd } = range(x.url), db = x.env.DB;
  let head, rows;
  if (type === 'payments') {
    head = ['Received', 'Invoice', 'Client', 'Amount (GHS)', 'Channel', 'Reference', 'Source', 'Recorded by'];
    rows = (await db.prepare('SELECT p.received_at, i.number, r.name, p.amount, p.channel, p.reference, p.source, p.recorded_by FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN requests r ON r.id = i.request_id WHERE p.received_at >= ? AND p.received_at <= ? ORDER BY p.received_at').bind(from, toEnd).all()).results
      .map((r) => [r.received_at, r.number, r.name, (r.amount / 100).toFixed(2), r.channel, r.reference, r.source, r.recorded_by]);
  } else {
    head = ['Number', 'Date', 'Client', 'Service', 'Status', 'Total (GHS)', 'Paid on', 'Channel'];
    rows = (await db.prepare('SELECT i.number, i.created_at, r.name, COALESCE(sv.label, r.service) AS service, i.status, i.total, i.paid_at, i.pay_channel FROM invoices i JOIN requests r ON r.id = i.request_id LEFT JOIN services sv ON sv.value = r.service WHERE i.created_at >= ? AND i.created_at <= ? ORDER BY i.created_at').bind(from, toEnd).all()).results
      .map((r) => [r.number, r.created_at, r.name, r.service, r.status, (r.total / 100).toFixed(2), r.paid_at, r.pay_channel]);
  }
  await audit(x.env, x.staff.email, 'accounts', null, 'exported', `${type} ${from}`);
  const body = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${type}-${from}-to-${range(x.url).to}.csv"`, 'Cache-Control': 'no-store' } });
}
