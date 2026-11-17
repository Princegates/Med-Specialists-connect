import { can, ROLES, permsFor } from '../perms.js';
import { nowIso } from '../db.js';
import { audit } from '../audit.js';
import { json, fail, clean } from '../http.js';
import { hashPassword, tempPassword, endAllSessions } from '../auth.js';

const TOP = ['superadmin', 'owner'];

export async function listFull(x) {
  if (!can(x.staff, 'staff.edit')) return fail(403, 'Not allowed.');
  const { results } = await x.env.DB.prepare('SELECT id, email, name, role, active, created_at, last_seen, totp_enabled, must_change, locked_until FROM staff ORDER BY created_at').all();
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
  if (TOP.includes(role) && x.staff.role !== 'superadmin') return fail(403, 'Only a super administrator can add an owner or another super administrator.');
  if (await x.env.DB.prepare('SELECT id FROM staff WHERE email = ?').bind(email).first()) return fail(409, 'This email is already a staff member.');
  const id = crypto.randomUUID();
  // A one-time password is shown once. They must choose their own the first time they sign in.
  const temp = tempPassword();
  await x.env.DB.prepare('INSERT INTO staff (id, email, name, role, active, created_at, password_hash, must_change) VALUES (?, ?, ?, ?, 1, ?, ?, 1)').bind(id, email, name, role, nowIso(), await hashPassword(temp)).run();
  await audit(x.env, x.staff.email, 'staff', id, 'created', `${email} as ${role}`);
  return json({ ok: true, id, tempPassword: temp, reminder: 'Give them this one-time password in person or by phone. They must choose their own when they first sign in.' });
}

export async function update(x, id) {
  if (!can(x.staff, 'staff.edit')) return fail(403, 'Not allowed.');
  const s = await x.env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first();
  if (!s) return fail(404, 'Staff member not found.');
  const b = x.body, role = b.role === undefined ? s.role : b.role, active = b.active === undefined ? s.active : b.active ? 1 : 0;
  if (!ROLES[role]) return fail(400, 'Please choose a role.');
  if ((TOP.includes(role) || TOP.includes(s.role)) && x.staff.role !== 'superadmin') return fail(403, 'Only a super administrator can change an owner or a super administrator.');
  // There must always be at least one active super administrator, so the platform can never be locked out.
  if (s.role === 'superadmin' && s.active && (role !== 'superadmin' || !active)) {
    const n = (await x.env.DB.prepare("SELECT COUNT(*) AS c FROM staff WHERE role = 'superadmin' AND active = 1").first()).c;
    if (n <= 1) return fail(409, 'There must always be at least one active super administrator.');
  }
  await x.env.DB.prepare('UPDATE staff SET name = ?, role = ?, active = ? WHERE id = ?').bind(clean(b.name, 100) || s.name, role, active, id).run();
  await audit(x.env, x.staff.email, 'staff', id, 'updated', `${s.email}: role ${s.role} to ${role}, ${active ? 'active' : 'off'}`);
  // Switching someone off, or changing their role, signs them out everywhere at once.
  if (!active || role !== s.role) await endAllSessions(x.env, id);
  const out = { ok: true };
  if (b.reset_password) {
    const temp = tempPassword();
    await x.env.DB.prepare('UPDATE staff SET password_hash = ?, must_change = 1, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(await hashPassword(temp), id).run();
    await endAllSessions(x.env, id);
    await audit(x.env, x.staff.email, 'staff', id, 'password_reset', `Password reset for ${s.email}`);
    out.tempPassword = temp;
  }
  if (b.reset_mfa) {
    await x.env.DB.prepare('UPDATE staff SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL WHERE id = ?').bind(id).run();
    await endAllSessions(x.env, id);
    await audit(x.env, x.staff.email, 'staff', id, 'mfa_reset', `Authenticator reset for ${s.email}`);
  }
  return json(out);
}

export const meInfo = (staff, mfaRequired) => ({ id: staff.id, email: staff.email, name: staff.name, role: staff.role, roleLabel: ROLES[staff.role], perms: permsFor(staff.role), mfaEnabled: !!staff.totp_enabled, mfaRequired: !!mfaRequired, mustChange: !!staff.must_change });
