import { can } from '../perms.js';
import { normalizePhone } from '../clients.js';
import { nowIso } from '../db.js';
import { audit, logView } from '../audit.js';
import { json, fail, clean } from '../http.js';

const stripHealth = (staff, c) => { if (!can(staff, 'health.view')) delete c.notes; return c; };

export async function list(x) {
  if (!can(x.staff, 'clients.view')) return fail(403, 'Not allowed.');
  const term = (x.url.searchParams.get('q') || '').trim().slice(0, 60), args = [];
  let where = "WHERE c.status != 'anonymised'";
  if (term) { where += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.phone_norm LIKE ?)'; const l = `%${term}%`; args.push(l, l, l, `%${normalizePhone(term)}%`); }
  const { results } = await x.env.DB.prepare(
    `SELECT c.id, c.created_at, c.name, c.phone, c.email, c.area, c.status, c.tags, (SELECT COUNT(*) FROM requests r WHERE r.client_id = c.id) AS cases, (SELECT MAX(r.created_at) FROM requests r WHERE r.client_id = c.id) AS last_case FROM clients c ${where} ORDER BY COALESCE(last_case, c.created_at) DESC LIMIT 200`
  ).bind(...args).all();
  return json({ ok: true, clients: results });
}

export async function create(x) {
  if (!can(x.staff, 'clients.edit')) return fail(403, 'Not allowed.');
  const b = x.body, name = clean(b.name, 100), phone = clean(b.phone, 30);
  if (!name) return fail(400, 'Please enter the name.');
  if (!/^[+0-9()\s-]{7,30}$/.test(phone)) return fail(400, 'Please enter a valid phone number.');
  const norm = normalizePhone(phone);
  if (await x.env.DB.prepare('SELECT id FROM clients WHERE phone_norm = ?').bind(norm).first()) return fail(409, 'A client with this phone number already exists.');
  const id = crypto.randomUUID();
  await x.env.DB.prepare('INSERT INTO clients (id, created_at, name, phone, phone_norm, email, area, language, tags, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, nowIso(), name, phone, norm, clean(b.email, 120) || null, clean(b.area, 100) || null, clean(b.language, 40) || null, clean(b.tags, 200) || null, clean(b.notes, 2000) || null).run();
  await audit(x.env, x.staff.email, 'client', id, 'created', name);
  return json({ ok: true, id });
}

export async function detail(x, id) {
  if (!can(x.staff, 'clients.view')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Client not found.');
  await logView(x.env, x.staff, 'client', id);
  const cases = (await x.env.DB.prepare('SELECT r.id, r.ref, r.created_at, r.service, sv.label AS service_label, r.status, r.urgency FROM requests r LEFT JOIN services sv ON sv.value = r.service WHERE r.client_id = ? ORDER BY r.created_at DESC').bind(id).all()).results;
  const invoices = (await x.env.DB.prepare('SELECT i.id, i.number, i.status, i.total, i.created_at, i.paid_at FROM invoices i JOIN requests r ON r.id = i.request_id WHERE r.client_id = ? ORDER BY i.created_at DESC').bind(id).all()).results;
  const timeline = (await x.env.DB.prepare("SELECT at, actor, action, detail FROM activity WHERE entity = 'client' AND entity_id = ? ORDER BY id ASC").bind(id).all()).results;
  return json({ ok: true, client: stripHealth(x.staff, c), cases, invoices, timeline,
    totals: { invoiced: invoices.filter((i) => i.status !== 'void').reduce((s, i) => s + i.total, 0), paid: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0) } });
}

export async function update(x, id) {
  if (!can(x.staff, 'clients.edit')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Client not found.');
  if (c.status === 'anonymised') return fail(409, 'This client has been anonymised and cannot be edited.');
  const b = x.body, st = b.status === undefined ? c.status : b.status;
  if (!['active', 'archived'].includes(st)) return fail(400, 'Unknown status.');
  const pick = (k, max) => (b[k] === undefined ? c[k] : clean(b[k], max) || null);
  await x.env.DB.prepare('UPDATE clients SET name = ?, email = ?, area = ?, language = ?, tags = ?, notes = ?, status = ? WHERE id = ?')
    .bind(clean(b.name, 100) || c.name, pick('email', 120), pick('area', 100), pick('language', 40), pick('tags', 200), pick('notes', 2000), st, id).run();
  await audit(x.env, x.staff.email, 'client', id, 'updated', Object.keys(b).join(', '));
  return json({ ok: true });
}

export async function addNote(x, id) {
  if (!can(x.staff, 'clients.edit')) return fail(403, 'Not allowed.');
  const text = clean(x.body.text, 1000);
  if (!text) return fail(400, 'Please write a note.');
  if (!(await x.env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(id).first())) return fail(404, 'Client not found.');
  await audit(x.env, x.staff.email, 'client', id, 'note', text);
  return json({ ok: true });
}

// Everything held about one client, so they can be given a copy of it.
export async function exportData(x, id) {
  if (!can(x.staff, 'clients.export')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Client not found.');
  const cases = (await x.env.DB.prepare('SELECT * FROM requests WHERE client_id = ?').bind(id).all()).results;
  const ids = cases.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const invoices = ids.length ? (await x.env.DB.prepare(`SELECT * FROM invoices WHERE request_id IN (${ph})`).bind(...ids).all()).results : [];
  const appointments = ids.length ? (await x.env.DB.prepare(`SELECT * FROM appointments WHERE request_id IN (${ph})`).bind(...ids).all()).results : [];
  const patients = (await x.env.DB.prepare('SELECT * FROM patients WHERE client_id = ?').bind(id).all()).results;
  const consents = (await x.env.DB.prepare('SELECT * FROM consents WHERE client_id = ?').bind(id).all()).results;
  const communications = (await x.env.DB.prepare('SELECT * FROM communications WHERE client_id = ?').bind(id).all()).results;
  await audit(x.env, x.staff.email, 'client', id, 'exported', 'Data copy produced');
  return json({ ok: true, exportedAt: nowIso(), client: c, patients, consents, communications, cases, invoices, appointments });
}

// Erases a person's details while keeping the money records (invoices and payments) for accounting.
export async function anonymise(x, id) {
  if (!can(x.staff, 'clients.anonymise')) return fail(403, 'Only the owner can do this.');
  if (x.body.confirm !== 'ANONYMISE') return fail(400, 'Type ANONYMISE to confirm.');
  const c = await x.env.DB.prepare('SELECT id, status FROM clients WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Client not found.');
  await x.env.DB.batch([
    x.env.DB.prepare("UPDATE clients SET name = 'Removed client', phone = 'removed', phone_norm = ?, email = NULL, area = NULL, language = NULL, tags = NULL, notes = NULL, status = 'anonymised' WHERE id = ?").bind('removed-' + id, id),
    x.env.DB.prepare("UPDATE requests SET name = 'Removed client', phone = 'removed', email = NULL, message = NULL, notes = NULL, area = NULL, track_token = NULL WHERE client_id = ?").bind(id),
    x.env.DB.prepare("UPDATE patients SET name = 'Removed patient', area = NULL, accessibility = NULL, authority_evidence = NULL, status = 'anonymised' WHERE client_id = ?").bind(id),
    x.env.DB.prepare("UPDATE communications SET body = 'Removed', subject = NULL WHERE client_id = ?").bind(id)
  ]);
  await audit(x.env, x.staff.email, 'client', id, 'anonymised', 'Personal details erased');
  return json({ ok: true });
}
