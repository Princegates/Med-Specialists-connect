import { ensureSchema } from './schema.js';

// The service list lives in the database so it can be edited in the admin console.
export async function getServices(env, { onlyActive = true } = {}) {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare(`SELECT value, label, billing, lines, active, sort FROM services ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sort, label`).all();
  return results.map((r) => ({ value: r.value, label: r.label, billing: r.billing, lines: JSON.parse(r.lines), active: !!r.active, sort: r.sort }));
}
export async function getService(env, value) {
  await ensureSchema(env.DB);
  const r = await env.DB.prepare('SELECT value, label, billing, lines, active FROM services WHERE value = ?').bind(value).first();
  return r ? { value: r.value, label: r.label, billing: r.billing, lines: JSON.parse(r.lines), active: !!r.active } : null;
}
