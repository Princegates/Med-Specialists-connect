import { can } from '../perms.js';
import { json, fail } from '../http.js';
import { verifyChain } from '../audit.js';

export async function verify(x) {
  if (!can(x.staff, 'audit.view')) return fail(403, 'Not allowed.');
  return json({ ok: true, ...(await verifyChain(x.env)) });
}

export async function list(x) {
  if (!can(x.staff, 'audit.view')) return fail(403, 'Not allowed.');
  const q = x.url.searchParams, where = [], args = [];
  if (q.get('entity')) { where.push('entity = ?'); args.push(q.get('entity')); }
  const limit = Math.min(Number(q.get('limit')) || 100, 300);
  const { results } = await x.env.DB.prepare(`SELECT at, actor, entity, entity_id, action, detail FROM activity ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).bind(...args, limit).all();
  return json({ ok: true, events: results });
}
