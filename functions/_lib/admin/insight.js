import { can } from '../perms.js';
import { getSetting } from '../settings.js';
import { normalizePhone } from '../clients.js';
import { json, fail } from '../http.js';

// Search across cases, clients and providers, limited to what the person's role may see.
export async function search(x) {
  const q = (x.url.searchParams.get('q') || '').trim().slice(0, 60);
  if (q.length < 2) return json({ ok: true, cases: [], clients: [], providers: [] });
  const like = `%${q}%`, db = x.env.DB, out = { ok: true, cases: [], clients: [], providers: [] };
  if (can(x.staff, 'cases.view')) {
    out.cases = (await db.prepare("SELECT r.id, r.ref, r.name, r.status, sv.label AS service FROM requests r LEFT JOIN services sv ON sv.value = r.service WHERE r.ref LIKE ? OR r.name LIKE ? OR r.phone LIKE ? ORDER BY r.created_at DESC LIMIT 6").bind(q.toUpperCase() + '%', like, like).all()).results;
  }
  if (can(x.staff, 'clients.view')) {
    const norm = normalizePhone(q);
    out.clients = (await db.prepare("SELECT id, name, phone FROM clients WHERE status != 'anonymised' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR (? != '' AND phone_norm LIKE ?)) ORDER BY created_at DESC LIMIT 6").bind(like, like, like, norm.length >= 4 ? norm : '', `%${norm}%`).all()).results;
  }
  if (can(x.staff, 'providers.view')) {
    out.providers = (await db.prepare('SELECT id, name, specialty, verification FROM providers WHERE name LIKE ? OR specialty LIKE ? OR area LIKE ? ORDER BY name LIMIT 6').bind(like, like, like).all()).results;
  }
  return json(out);
}

// Appointments for one month, for the calendar.
export async function calendar(x) {
  if (!can(x.staff, 'cases.view')) return fail(403, 'Not allowed.');
  const m = /^\d{4}-\d{2}$/.test(x.url.searchParams.get('month') || '') ? x.url.searchParams.get('month') : new Date().toISOString().slice(0, 7);
  const start = m + '-01', [y, mo] = m.split('-').map(Number), end = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
  const { results } = await x.env.DB.prepare(
    "SELECT a.id, a.scheduled_at, a.status, a.mode, a.request_id, p.name AS provider_name, r.name AS client_name, r.ref FROM appointments a LEFT JOIN providers p ON p.id = a.provider_id LEFT JOIN requests r ON r.id = a.request_id WHERE a.scheduled_at >= ? AND a.scheduled_at < ? AND a.status NOT IN ('rescheduled') ORDER BY a.scheduled_at"
  ).bind(start, end).all();
  return json({ ok: true, month: m, appointments: results });
}

const monthsBack = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (n - 1 - i)); return d.toISOString().slice(0, 7); });

// Totals and trends for the owner and managers. Only counts: no names or health details.
export async function reports(x) {
  if (!can(x.staff, 'reports.view')) return fail(403, 'Not allowed.');
  const db = x.env.DB, months = monthsBack(6), since = months[0] + '-01';
  const out = { ok: true, months };
  const bucket = (rows, key, val) => months.map((m) => { const r = rows.find((q) => q[key] === m); return { month: m, value: r ? r[val] : 0 }; });

  out.casesByMonth = bucket((await db.prepare("SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM requests WHERE created_at >= ? GROUP BY m").bind(since).all()).results, 'm', 'n');
  out.casesByService = (await db.prepare("SELECT COALESCE(sv.label, r.service) AS label, COUNT(*) AS n FROM requests r LEFT JOIN services sv ON sv.value = r.service WHERE r.created_at >= ? GROUP BY label ORDER BY n DESC LIMIT 8").bind(since).all()).results;
  out.casesByStatus = (await db.prepare("SELECT status, COUNT(*) AS n FROM requests GROUP BY status ORDER BY n DESC").all()).results;
  out.casesByChannel = (await db.prepare("SELECT COALESCE(channel, 'unknown') AS label, COUNT(*) AS n FROM requests WHERE created_at >= ? GROUP BY label ORDER BY n DESC").bind(since).all()).results;

  const hours = Number(await getSetting(x.env, 'first_response_hours')) || 2;
  const times = (await db.prepare("SELECT created_at, first_response_at FROM requests WHERE first_response_at IS NOT NULL AND created_at >= ?").bind(since).all()).results.map((r) => (Date.parse(r.first_response_at) - Date.parse(r.created_at)) / 60000).filter((n) => n >= 0);
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM requests WHERE created_at >= ?').bind(since).first()).c;
  out.response = { total, answered: times.length, averageMinutes: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null, withinTarget: times.filter((n) => n <= hours * 60).length, targetHours: hours };
  out.safety = (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE priority = 'emergency' AND created_at >= ?").bind(since).first()).c;
  out.providers = (await db.prepare("SELECT p.name, COUNT(DISTINCT r.id) AS cases, SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed FROM providers p LEFT JOIN requests r ON r.provider_id = p.id AND r.created_at >= ? LEFT JOIN appointments a ON a.provider_id = p.id AND a.created_at >= ? GROUP BY p.id HAVING cases > 0 OR completed > 0 ORDER BY cases DESC LIMIT 8").bind(since, since).all()).results;

  if (can(x.staff, 'accounts.view')) {
    out.revenueByMonth = bucket((await db.prepare("SELECT substr(received_at, 1, 7) AS m, SUM(amount) AS t FROM payments WHERE received_at >= ? GROUP BY m").bind(since).all()).results, 'm', 't');
    const inv = await db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid FROM invoices WHERE status != 'void' AND created_at >= ?").bind(since).first();
    out.invoices = { issued: inv.n || 0, paid: inv.paid || 0 };
    out.revenueByService = (await db.prepare("SELECT COALESCE(sv.label, r.service) AS label, SUM(p.amount) AS t FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN requests r ON r.id = i.request_id LEFT JOIN services sv ON sv.value = r.service WHERE p.received_at >= ? GROUP BY label ORDER BY t DESC LIMIT 8").bind(since).all()).results;
  }
  return json(out);
}
