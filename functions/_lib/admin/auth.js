import { requireAdmin } from '../access.js';
import { ensureSchema } from '../schema.js';
import { audit } from '../audit.js';
import { nowIso } from '../db.js';

// Turns a Cloudflare Access sign-in into a staff member. The very first person to sign in becomes the owner
// (limited to ADMIN_EMAILS if that setting exists). Everyone after that must be added under Staff by the owner.
export async function resolveStaff(request, env) {
  const a = await requireAdmin(request, env);
  if (!a) return { status: 401, error: 'Sign-in required.' };
  await ensureSchema(env.DB);
  let s = await env.DB.prepare('SELECT * FROM staff WHERE email = ?').bind(a.email).first();
  if (!s) {
    const n = (await env.DB.prepare('SELECT COUNT(*) AS c FROM staff').first()).c;
    const allow = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    if (n === 0 && (allow.length === 0 || allow.includes(a.email))) {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO staff (id, email, name, role, active, created_at, last_seen) VALUES (?, ?, ?, ?, 1, ?, ?)')
        .bind(id, a.email, a.email.split('@')[0], 'owner', nowIso(), nowIso()).run();
      await audit(env, a.email, 'staff', id, 'created', 'First sign-in became the owner');
      s = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first();
    } else {
      return { status: 403, error: 'Your email is not set up as a staff member. Ask the owner to add you under Staff.' };
    }
  }
  if (!s.active) return { status: 403, error: 'This account is switched off. Ask the owner.' };
  await env.DB.prepare('UPDATE staff SET last_seen = ? WHERE id = ?').bind(nowIso(), s.id).run();
  return { staff: s };
}
