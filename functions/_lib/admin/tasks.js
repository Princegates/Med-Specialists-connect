import { can } from '../perms.js';
import { nowIso } from '../db.js';
import { audit } from '../audit.js';
import { json, fail, clean } from '../http.js';

export const TASK_TYPES = ['call_client', 'call_provider', 'get_quote', 'send_documents', 'confirm_booking', 'payment_followup', 'follow_up', 'other'];

export async function list(x) {
  if (!can(x.staff, 'tasks.view')) return fail(403, 'Not allowed.');
  const q = x.url.searchParams, where = [], args = [];
  where.push('t.status = ?'); args.push(q.get('status') === 'done' ? 'done' : 'open');
  const who = q.get('assignee');
  if (who === 'me') { where.push('t.assignee = ?'); args.push(x.staff.id); }
  else if (who) { where.push('t.assignee = ?'); args.push(who); }
  if (q.get('overdue') === '1') { where.push('t.due IS NOT NULL AND t.due < ?'); args.push(nowIso()); }
  const { results } = await x.env.DB.prepare(
    `SELECT t.*, s.name AS assignee_name, r.ref, r.name AS client_name FROM tasks t LEFT JOIN staff s ON s.id = t.assignee LEFT JOIN requests r ON r.id = t.request_id WHERE ${where.join(' AND ')} ORDER BY (t.due IS NULL), t.due LIMIT 200`
  ).bind(...args).all();
  return json({ ok: true, tasks: can(x.staff, 'health.view') ? results : results.map((t) => ({ ...t, client_name: undefined })), types: TASK_TYPES });
}

export async function create(x) {
  if (!can(x.staff, 'tasks.edit')) return fail(403, 'Not allowed.');
  const b = x.body, title = clean(b.title, 160);
  if (!title) return fail(400, 'Please say what needs doing.');
  const type = TASK_TYPES.includes(b.type) ? b.type : 'other';
  let due = clean(b.due, 40) || null;
  if (due) { if (Number.isNaN(Date.parse(due))) return fail(400, 'Please check the due date.'); due = new Date(due).toISOString(); }
  const rid = clean(b.request_id, 60) || null;
  if (rid && !(await x.env.DB.prepare('SELECT id FROM requests WHERE id = ?').bind(rid).first())) return fail(404, 'Case not found.');
  let assignee = clean(b.assignee, 60) || x.staff.id;
  if (!(await x.env.DB.prepare('SELECT id FROM staff WHERE id = ? AND active = 1').bind(assignee).first())) return fail(400, 'That staff member is not available.');
  const id = crypto.randomUUID();
  await x.env.DB.prepare('INSERT INTO tasks (id, request_id, type, title, assignee, due, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, rid, type, title, assignee, due, 'open', x.staff.id, nowIso()).run();
  if (rid) await audit(x.env, x.staff.email, 'case', rid, 'task', `Task: ${title}`);
  return json({ ok: true, id });
}

export async function complete(x, id) {
  if (!can(x.staff, 'tasks.edit')) return fail(403, 'Not allowed.');
  const t = await x.env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  if (!t) return fail(404, 'Task not found.');
  if (t.status === 'done') return json({ ok: true, unchanged: true });
  await x.env.DB.prepare("UPDATE tasks SET status = 'done', done_at = ?, evidence = ? WHERE id = ?").bind(nowIso(), clean(x.body.evidence, 300) || null, id).run();
  if (t.request_id) await audit(x.env, x.staff.email, 'case', t.request_id, 'task', `Done: ${t.title}`);
  return json({ ok: true });
}
