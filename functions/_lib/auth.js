// Staff sign-in: passwords (PBKDF2), sessions kept in the database as hashes, and authenticator-app codes (TOTP).
import { getSetting } from './settings.js';
import { nowIso } from './db.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/.{2}/g) || [], (x) => parseInt(x, 16));
export const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

export function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

// ---- passwords. Workers allow at most 100,000 PBKDF2 rounds.
const ROUNDS = 100000;
async function derive(password, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ROUNDS}$${hex(salt)}$${await derive(password, salt, ROUNDS)}`;
}
export async function verifyPassword(password, stored) {
  const [kind, rounds, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !salt) { await derive(password, new Uint8Array(16), ROUNDS); return false; } // same work whether or not the account exists
  return safeEqual(await derive(password, fromHex(salt), Number(rounds)), hash);
}

const COMMON = ['password', 'password1', 'password123', 'qwerty123', '1234567890', 'letmein123', 'welcome123', 'admin12345', 'iloveyou12', 'ghana12345'];
export function passwordProblem(pw, email, name) {
  pw = String(pw || '');
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 128) return 'That password is too long.';
  const low = pw.toLowerCase();
  if (COMMON.includes(low)) return 'That password is too easy to guess.';
  const local = String(email || '').toLowerCase().split('@')[0];
  if (local.length > 3 && low.includes(local)) return 'Do not use your email name in your password.';
  if (!/[a-z]/i.test(pw) || !/[0-9\W_]/.test(pw)) return 'Use letters and at least one number or symbol.';
  const squashed = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (squashed.length > 3 && low.includes(squashed)) return 'Do not use your name in your password.';
  return null;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz23456789';
export function tempPassword() {
  const b = crypto.getRandomValues(new Uint8Array(14));
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('') + '-7';
}

// ---- sessions
export const COOKIE = '__Host-msc_session';
function cookieOf(request, name) {
  for (const part of String(request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
export async function startSession(env, staff, request) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hours = Math.min(Math.max(Number(await getSetting(env, 'session_hours')) || 12, 1), 72);
  const now = nowIso(), expires = new Date(Date.now() + hours * 3600000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, staff_id, created_at, expires_at, last_seen, ip, agent) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256(token), staff.id, now, expires, now, request.headers.get('CF-Connecting-IP') || null, String(request.headers.get('User-Agent') || '').slice(0, 160)).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  return { cookie: `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${hours * 3600}`, expires };
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

// The signed-in staff member for this request, or null.
export async function sessionStaff(env, request) {
  const token = cookieOf(request, COOKIE);
  if (!token || token.length < 40) return null;
  const id = await sha256(token);
  const row = await env.DB.prepare('SELECT s.*, x.expires_at AS session_expires, x.last_seen AS session_seen FROM sessions x JOIN staff s ON s.id = x.staff_id WHERE x.id = ?').bind(id).first();
  if (!row || row.session_expires < nowIso() || !row.active) return null;
  // Automatic log-off: a session that has been idle too long is ended, so a screen left open cannot show patient records.
  const idle = Math.min(Math.max(Number(await getSetting(env, 'idle_minutes')) || 20, 5), 120);
  if (row.session_seen && Date.now() - Date.parse(row.session_seen) > idle * 60000) { await endSession(env, id); return null; }
  await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').bind(nowIso(), id).run();
  return { ...row, session_id: id };
}
export const endSession = (env, id) => env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
export const endAllSessions = (env, staffId, exceptId) => env.DB.prepare('DELETE FROM sessions WHERE staff_id = ? AND id != ?').bind(staffId, exceptId || '').run();

// ---- authenticator-app codes (RFC 6238: 6 digits, 30 seconds, SHA-1)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  const b = crypto.getRandomValues(new Uint8Array(20)); let bits = '', out = '';
  for (const x of b) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function b32bytes(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
  const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}
async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32bytes(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8); new DataView(msg.buffer).setUint32(4, counter);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15, n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
// Returns the 30-second step the code belongs to (so the caller can refuse a code that was already used), or 0.
export async function verifyTotp(secret, code) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code) || !secret) return 0;
  const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) if (safeEqual(await hotp(secret, step + d), code)) return step + d;
  return 0;
}
export const otpauthUri = (secret, email, issuer) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

export function newRecoveryCodes() {
  return Array.from({ length: 8 }, () => { const b = crypto.getRandomValues(new Uint8Array(10)); return [...b].map((x) => '0123456789abcdefghjkmnpqrstvwxyz'[x % 32]).join('').replace(/(.{5})(.{5})/, '$1-$2'); });
}

export const PRIVILEGED = ['superadmin', 'owner', 'supervisor', 'finance', 'admin'];
export async function mfaRequiredFor(env, staff) {
  const policy = await getSetting(env, 'mfa_policy');
  if (policy === 'off') return false;
  if (policy === 'everyone') return true;
  return PRIVILEGED.includes(staff.role);
}
