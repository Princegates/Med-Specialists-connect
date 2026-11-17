import { can, ROLES, permsFor } from '../perms.js';
import { nowIso } from '../db.js';
import { audit } from '../audit.js';
import { json, fail, clean } from '../http.js';

export async function listFull(x) {
  if (!can(x.staff, 'staff.edit')) return fail(403, 'Not allowed.');
  const { results } = await x.env.DB.prepare('SELECT id, email, name, role, active, created_at, last_seen FROM staff ORDER BY created_at').all();
  return json({ ok: true, staff: results, roles: ROLES });
}

// Names only, for choosing who a case is assigned to.
export async function listLite(x) {
  if (!can(x.staff, 'cases.view')) return fail(403, 'Not allowed.');
  const { results } = await x.env.DB.prepare('SELECT id, name, role FROM staff WHERE active = 1 ORDER BY name').all();
  return json({ ok: true, staff: results });
}

export async function create(x) {
  if (!can(x.staff, 'staff.edit')) return fail(403, 'Not allowed.');
  const email = clean(x.body.email, 120).toLowerCase(), name = clean(x.body.name, 100), role = x.body.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Please enter a valid email address.');
  if (!name) return fail(400, 'Please enter the name.');
  if (!ROLES[role]) return fail(400, 'Please choose a role.');
  if (role === 'owner' && x.staff.role !== 'owner') return fail(403, 'Only an owner can add another owner.');
  if (await x.env.DB.prepare('SELECT id FROM staff WHERE email = ?').bind(email).first()) return fail(409, 'This email is already a staff member.');
  const id = crypto.randomUUID();
  await x.env.DB.prepare('INSERT INTO staff (id, email, name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)').bind(id, email, name, role, nowIso()).run();
  await audit(x.env, x.staff.email, 'staff', id, 'created', `${email} as ${role}`);
  return json({ ok: true, id, reminder: 'Also add this email to the Cloudflare Access policy so they can sign in.' });
}

export async function update(x, id) {
  if (!can(x.staff, 'staff.edit')) return fail(403, 'Not allowed.');
  const s = await x.env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first();
  if (!s) return fail(404, 'Staff member not found.');
  const b = x.body, role = b.role === undefined ? s.role : b.role, active = b.active === undefined ? s.active : b.active ? 1 : 0;
  if (!ROLES[role]) return fail(400, 'Please choose a role.');
  if ((role === 'owner' || s.role === 'owner') && x.staff.role !== 'owner') return fail(403, 'Only an owner can change an owner.');
  // The business must always keep at least one active owner.
  if (s.role === 'owner' && s.active && (role !== 'owner' || !active)) {
    const owners = (await x.env.DB.prepare("SELECT COUNT(*) AS c FROM staff WHERE role = 'owner' AND active = 1").first()).c;
    if (owners <= 1) return fail(409, 'There must always be at least one active owner.');
  }
  await x.env.DB.prepare('UPDATE staff SET name = ?, role = ?, active = ? WHERE id = ?').bind(clean(b.name, 100) || s.name, role, active, id).run();
  await audit(x.env, x.staff.email, 'staff', id, 'updated', `${s.email}: role ${s.role} to ${role}, ${active ? 'active' : 'off'}`);
  return json({ ok: true });
}

export const meInfo = (staff) => ({ id: staff.id, email: staff.email, name: staff.name, role: staff.role, roleLabel: ROLES[staff.role], perms: permsFor(staff.role) });
