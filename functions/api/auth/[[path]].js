import { ensureSchema } from '../../_lib/schema.js';
import { getSetting } from '../../_lib/settings.js';
import { encrypt, decrypt } from '../../_lib/crypto.js';
import { audit } from '../../_lib/audit.js';
import { nowIso } from '../../_lib/db.js';
import { json, fail, readJson, clean } from '../../_lib/http.js';
import {
  hashPassword, verifyPassword, passwordProblem, startSession, sessionStaff, endSession, endAllSessions, clearCookie, safeEqual, sha256,
  newTotpSecret, verifyTotp, otpauthUri, newRecoveryCodes, mfaRequiredFor
} from '../../_lib/auth.js';
import { meInfo } from '../../_lib/admin/staff.js';

// Sign-in for the staff console. Wrong email and wrong password give the same answer, and an account locks for
// 15 minutes after 5 wrong tries, so passwords cannot be guessed by trying again and again.
const MAX_TRIES = 5, LOCK_MINUTES = 15;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function setupNeeded(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS c FROM staff WHERE role = 'superadmin' AND active = 1 AND password_hash IS NOT NULL").first();
  return r.c === 0;
}
const withCookie = (cookie, data, status = 200) => json(data, status, { 'Set-Cookie': cookie });

async function enter(env, request, staff, extra = {}) {
  const s = await startSession(env, staff, request);
  await env.DB.prepare('UPDATE staff SET failed_logins = 0, locked_until = NULL, last_seen = ? WHERE id = ?').bind(nowIso(), staff.id).run();
  const fresh = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(staff.id).first();
  return withCookie(s.cookie, { ok: true, me: meInfo(fresh, await mfaRequiredFor(env, fresh)), ...extra });
}

async function consumeRecovery(env, staff, code) {
  let list = []; try { list = JSON.parse(staff.recovery_codes || '[]'); } catch (e) { list = []; }
  const h = await sha256(String(code || '').trim().toLowerCase());
  const i = list.findIndex((x) => safeEqual(x, h));
  if (i < 0) return false;
  list.splice(i, 1);
  await env.DB.prepare('UPDATE staff SET recovery_codes = ? WHERE id = ?').bind(JSON.stringify(list), staff.id).run();
  return true;
}

async function login(env, request, b) {
  const email = clean(b.email, 120).toLowerCase(), password = String(b.password || '').slice(0, 200);
  const bad = () => fail(401, 'Wrong email or password.');
  if (!EMAIL.test(email) || !password) return bad();
  const staff = await env.DB.prepare('SELECT * FROM staff WHERE email = ?').bind(email).first();
  if (staff && staff.locked_until && staff.locked_until > nowIso()) { await verifyPassword(password, null); return fail(429, 'Too many wrong tries. Please wait 15 minutes, or ask the owner to reset your password.'); }
  const good = await verifyPassword(password, staff && staff.password_hash);
  const fail1 = async () => {
    if (staff) {
      const n = (staff.failed_logins || 0) + 1;
      await env.DB.prepare('UPDATE staff SET failed_logins = ?, locked_until = ? WHERE id = ?').bind(n >= MAX_TRIES ? 0 : n, n >= MAX_TRIES ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null, staff.id).run();
      await audit(env, email, 'staff', staff.id, n >= MAX_TRIES ? 'locked' : 'login_failed', n >= MAX_TRIES ? 'Locked after too many wrong tries' : 'Wrong password or code');
    }
    return bad();
  };
  if (!good || !staff || !staff.active) return fail1();
  if (staff.totp_enabled) {
    if (!b.code && !b.recovery) return json({ ok: true, mfa: true });
    let pass = false;
    if (b.recovery) pass = await consumeRecovery(env, staff, b.recovery);
    else { try { pass = await verifyTotp(await decrypt(env, staff.totp_secret), b.code); } catch (e) { pass = false; } }
    if (!pass) return fail1();
  }
  await audit(env, email, 'staff', staff.id, 'login', b.recovery ? 'Signed in with a recovery code' : 'Signed in');
  return enter(env, request, staff);
}

async function setup(env, request, b) {
  if (!(await setupNeeded(env))) return fail(409, 'The platform is already set up. Please sign in.');
  const code = String(env.SETUP_CODE || '');
  if (code.length < 12) return fail(503, 'Set-up is locked until a SETUP_CODE of at least 12 characters is added in Cloudflare (Settings, Variables and Secrets), then redeploy.');
  if (!safeEqual(String(b.code || ''), code)) { await audit(env, 'setup', 'staff', null, 'setup_failed', 'Wrong set-up code'); return fail(403, 'That set-up code is not right.'); }
  const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 100);
  if (!EMAIL.test(email)) return fail(400, 'Please enter a valid email address.');
  if (!name) return fail(400, 'Please enter your name.');
  const problem = passwordProblem(b.password, email, name);
  if (problem) return fail(400, problem);
  const hash = await hashPassword(String(b.password));
  const existing = await env.DB.prepare('SELECT id FROM staff WHERE email = ?').bind(email).first();
  let id = existing && existing.id;
  if (id) await env.DB.prepare("UPDATE staff SET name = ?, role = 'superadmin', active = 1, password_hash = ?, must_change = 0, password_changed_at = ? WHERE id = ?").bind(name, hash, nowIso(), id).run();
  else {
    id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO staff (id, email, name, role, active, created_at, password_hash, must_change, password_changed_at) VALUES (?, ?, ?, 'superadmin', 1, ?, ?, 0, ?)").bind(id, email, name, nowIso(), hash, nowIso()).run();
  }
  await audit(env, email, 'staff', id, 'created', 'Super administrator created at set-up');
  return enter(env, request, await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first());
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return fail(503, 'The database is not set up yet.');
  try {
    await ensureSchema(env.DB);
    const url = new URL(request.url), method = request.method;
    const path = (params.path || []).join('/');
    if (method === 'GET' && path === 'state') {
      const me = await sessionStaff(env, request);
      return json({ ok: true, setupNeeded: await setupNeeded(env), signedIn: !!me, name: await getSetting(env, 'business_name') });
    }
    if (method !== 'POST') return fail(404, 'Not found.');
    if (request.headers.get('Origin') !== url.origin) return fail(403, 'Cross-site request refused.');
    let b; try { b = await readJson(request, 4000); } catch (e) { return fail(400, 'Invalid request.'); }

    if (path === 'login') return await login(env, request, b);
    if (path === 'setup') return await setup(env, request, b);
    if (path === 'logout') {
      const me = await sessionStaff(env, request);
      if (me) { await endSession(env, me.session_id); await audit(env, me.email, 'staff', me.id, 'logout', 'Signed out'); }
      return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
    }

    // Everything below needs a signed-in person.
    const me = await sessionStaff(env, request);
    if (!me) return fail(401, 'Please sign in.');

    if (path === 'password') {
      if (!(await verifyPassword(String(b.current || ''), me.password_hash))) return fail(403, 'Your current password is not right.');
      const problem = passwordProblem(b.next, me.email, me.name);
      if (problem) return fail(400, problem);
      if (await verifyPassword(String(b.next), me.password_hash)) return fail(400, 'Choose a password you have not used before.');
      await env.DB.prepare('UPDATE staff SET password_hash = ?, must_change = 0, password_changed_at = ? WHERE id = ?').bind(await hashPassword(String(b.next)), nowIso(), me.id).run();
      await endAllSessions(env, me.id, me.session_id);
      await audit(env, me.email, 'staff', me.id, 'password', 'Changed their password');
      return json({ ok: true });
    }

    if (path === 'mfa/begin') {
      if (me.totp_enabled) return fail(409, 'An authenticator app is already set up. Turn it off first to change it.');
      const secret = newTotpSecret();
      await env.DB.prepare('UPDATE staff SET totp_secret = ? WHERE id = ?').bind(await encrypt(env, secret), me.id).run();
      return json({ ok: true, secret, uri: otpauthUri(secret, me.email, 'MEDs Specialists Connect') });
    }
    if (path === 'mfa/confirm') {
      if (me.totp_enabled) return fail(409, 'Already set up.');
      if (!me.totp_secret) return fail(400, 'Start the set-up first.');
      let ok = false; try { ok = await verifyTotp(await decrypt(env, me.totp_secret), b.code); } catch (e) { ok = false; }
      if (!ok) return fail(400, 'That code is not right. Check the time on your phone and try the newest code.');
      const codes = newRecoveryCodes();
      await env.DB.prepare('UPDATE staff SET totp_enabled = 1, recovery_codes = ? WHERE id = ?').bind(JSON.stringify(await Promise.all(codes.map((c) => sha256(c)))), me.id).run();
      await audit(env, me.email, 'staff', me.id, 'mfa', 'Authenticator app turned on');
      return json({ ok: true, recoveryCodes: codes });
    }
    if (path === 'mfa/disable') {
      if (await mfaRequiredFor(env, me)) return fail(400, 'Your role must use an authenticator app, so it cannot be turned off.');
      if (!(await verifyPassword(String(b.password || ''), me.password_hash))) return fail(403, 'Your password is not right.');
      await env.DB.prepare('UPDATE staff SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL WHERE id = ?').bind(me.id).run();
      await audit(env, me.email, 'staff', me.id, 'mfa', 'Authenticator app turned off');
      return json({ ok: true });
    }
    return fail(404, 'Not found.');
  } catch (e) {
    console.error('auth error', e && e.message);
    return fail(500, 'Something went wrong. Please try again.');
  }
}
