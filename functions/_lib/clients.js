import { nowIso } from './db.js';

// Ghana-style numbers are matched however they are typed: 024 456 0080, +233 24 456 0080 and 233244560080 are one person.
export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '233' + d.slice(1);
  return d;
}

export const CONSENT_VERSION = 'privacy-2026-11-16';

// Finds the client by phone number or creates them. Missing details on an existing client are filled in.
export async function findOrCreateClient(db, c) {
  const norm = normalizePhone(c.phone);
  const found = await db.prepare('SELECT * FROM clients WHERE phone_norm = ?').bind(norm).first();
  if (found) {
    await db.prepare('UPDATE clients SET email = COALESCE(email, ?), area = COALESCE(area, ?), consent_at = COALESCE(consent_at, ?), consent_version = COALESCE(consent_version, ?) WHERE id = ?')
      .bind(c.email || null, c.area || null, c.consent ? nowIso() : null, c.consent ? CONSENT_VERSION : null, found.id).run();
    return found.id;
  }
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO clients (id, created_at, name, phone, phone_norm, email, area, language, consent_at, consent_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, nowIso(), c.name, c.phone, norm, c.email || null, c.area || null, c.language || null, c.consent ? nowIso() : null, c.consent ? CONSENT_VERSION : null).run();
  return id;
}
