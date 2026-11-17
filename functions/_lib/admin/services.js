import { can } from '../perms.js';
import { getServices } from '../services.js';
import { nowIso } from '../db.js';
import { audit } from '../audit.js';
import { json, fail, clean } from '../http.js';

const BILLING = ['fixed', 'quote', 'none'];

function parseLines(b, billing) {
  const out = [];
  for (const l of Array.isArray(b.lines) ? b.lines.slice(0, 12) : []) {
    const description = clean(l.description, 120), amount = Math.round(Number(l.amountGhs) * 100);
    if (!description) continue;
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) return { error: 'Please check the amounts.' };
    out.push({ description, amount });
  }
  if (billing === 'fixed' && !out.some((l) => l.amount > 0)) return { error: 'A fixed-fee service needs at least one line with an amount above zero.' };
  return { lines: out };
}

export async function list(x) {
  if (!can(x.staff, 'services.view')) return fail(403, 'Not allowed.');
  return json({ ok: true, services: await getServices(x.env, { onlyActive: false }) });
}

export async function create(x) {
  if (!can(x.staff, 'services.edit')) return fail(403, 'Not allowed.');
  const value = clean(x.body.value, 80), label = clean(x.body.label, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9 &'-]{1,79}$/.test(value)) return fail(400, 'The service key can use letters, numbers, spaces and hyphens.');
  if (!label) return fail(400, 'Please give the service a name.');
  const billing = x.body.billing;
  if (!BILLING.includes(billing)) return fail(400, 'Please choose how it is billed.');
  const p = parseLines(x.body, billing);
  if (p.error) return fail(400, p.error);
  if (await x.env.DB.prepare('SELECT value FROM services WHERE value = ?').bind(value).first()) return fail(409, 'A service with this key already exists.');
  const sort = ((await x.env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM services').first()).m || 0) + 1;
  await x.env.DB.prepare('INSERT INTO services (value, label, billing, lines, active, sort, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(value, label, billing, JSON.stringify(p.lines), sort, nowIso()).run();
  await audit(x.env, x.staff.email, 'service', value, 'created', label);
  return json({ ok: true });
}

export async function update(x, value) {
  if (!can(x.staff, 'services.edit')) return fail(403, 'Not allowed.');
  const s = await x.env.DB.prepare('SELECT * FROM services WHERE value = ?').bind(value).first();
  if (!s) return fail(404, 'Service not found.');
  const b = x.body, billing = b.billing === undefined ? s.billing : b.billing;
  if (!BILLING.includes(billing)) return fail(400, 'Please choose how it is billed.');
  const p = b.lines === undefined ? { lines: JSON.parse(s.lines) } : parseLines(b, billing);
  if (p.error) return fail(400, p.error);
  if (billing === 'fixed' && !p.lines.some((l) => l.amount > 0)) return fail(400, 'A fixed-fee service needs at least one line with an amount above zero.');
  const label = clean(b.label, 120) || s.label, active = b.active === undefined ? s.active : b.active ? 1 : 0;
  await x.env.DB.prepare('UPDATE services SET label = ?, billing = ?, lines = ?, active = ?, updated_at = ? WHERE value = ?').bind(label, billing, JSON.stringify(p.lines), active, nowIso(), value).run();
  const total = p.lines.reduce((t, l) => t + l.amount, 0);
  await audit(x.env, x.staff.email, 'service', value, 'updated', `${billing}, ${active ? 'active' : 'off'}, total ${(total / 100).toFixed(2)}`);
  return json({ ok: true });
}
