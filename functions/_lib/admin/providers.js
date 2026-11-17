import { can } from '../perms.js';
import { nowIso } from '../db.js';
import { audit } from '../audit.js';
import { json, fail, clean } from '../http.js';

export const PROVIDER_TYPES = ['specialist', 'hospital', 'clinic', 'laboratory', 'imaging', 'ambulance', 'home_nursing', 'other'];
// Verification is separate from everything else about a provider (requirements, Appendix B).
export const VERIFICATION = ['draft', 'pending_review', 'active', 'expiring_soon', 'expired', 'suspended', 'rejected', 'archived'];
export const PROVIDER_STATUSES = VERIFICATION;
export const CREDENTIAL_TYPES = ['licence', 'registration', 'facility_licence', 'insurance', 'contract', 'identity', 'other'];
export const SERVICE_MODES = ['facility', 'home', 'virtual', 'mobile'];
const dateOk = (d) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// What a provider's state really is today: an 'active' provider whose credential has lapsed is treated as expired,
// and one with a credential running out within 60 days is flagged as expiring soon. Neither depends on someone remembering.
export function effective(p, credentials) {
  if (p.verification !== 'active' && p.verification !== 'expiring_soon') return p.verification;
  const dates = credentials.filter((c) => c.expires_on && c.result !== 'rejected').map((c) => c.expires_on);
  if (p.credential_expiry) dates.push(p.credential_expiry);
  const earliest = dates.sort()[0];
  if (earliest && earliest < today()) return 'expired';
  if (earliest && earliest <= inDays(60)) return 'expiring_soon';
  return 'active';
}

// May this provider be proposed to a client or booked? Only verified providers whose credentials are in date.
export async function bookable(db, id) {
  const p = await db.prepare('SELECT * FROM providers WHERE id = ?').bind(id).first();
  if (!p) return { ok: false, reason: 'That provider was not found.' };
  const creds = (await db.prepare('SELECT * FROM provider_credentials WHERE provider_id = ?').bind(id).all()).results;
  const state = effective(p, creds);
  if (state !== 'active' && state !== 'expiring_soon') return { ok: false, provider: p, reason: `${p.name} cannot be used: verification is ${state.replace('_', ' ')}.` };
  return { ok: true, provider: p, state };
}

export async function list(x) {
  if (!can(x.staff, 'providers.view')) return fail(403, 'Not allowed.');
  const q = x.url.searchParams, where = [], args = [];
  if (q.get('type')) { where.push('type = ?'); args.push(q.get('type')); }
  if (q.get('status')) { where.push('verification = ?'); args.push(q.get('status')); }
  const term = (q.get('q') || '').trim().slice(0, 60);
  if (term) { where.push('(name LIKE ? OR specialty LIKE ? OR area LIKE ? OR services LIKE ?)'); const l = `%${term}%`; args.push(l, l, l, l); }
  const { results } = await x.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM requests r WHERE r.provider_id = p.id AND r.status NOT IN ('closed', 'completed', 'cancelled')) AS open_cases FROM providers p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.name LIMIT 300`
  ).bind(...args).all();
  const creds = (await x.env.DB.prepare('SELECT provider_id, expires_on, result FROM provider_credentials').all()).results;
  return json({
    ok: true,
    providers: results.map((p) => {
      const mine = creds.filter((c) => c.provider_id === p.id);
      const state = effective(p, mine);
      return { ...p, status: state, effective: state, credential_expiring: state === 'expiring_soon' || state === 'expired' || (!!p.credential_expiry && p.credential_expiry <= inDays(60)) };
    })
  });
}

const list2 = (v) => (Array.isArray(v) ? v.map((s) => clean(s, 60)).filter(Boolean).join(', ') : clean(v, 300)) || null;

function fields(b) {
  const type = b.type === undefined ? 'specialist' : b.type;
  return {
    type, name: clean(b.name, 120), legal_name: clean(b.legal_name, 160) || null, specialty: clean(b.specialty, 120) || null, phone: clean(b.phone, 40) || null, email: clean(b.email, 120) || null,
    area: clean(b.area, 120) || null, languages: clean(b.languages, 120) || null, rate_note: clean(b.rate_note, 300) || null, credential_no: clean(b.credential_no, 80) || null,
    credential_expiry: clean(b.credential_expiry, 10) || null, notes: clean(b.notes, 1000) || null, service_modes: list2(b.service_modes), locations: list2(b.locations), services: list2(b.services)
  };
}

export async function create(x) {
  if (!can(x.staff, 'providers.edit')) return fail(403, 'Not allowed.');
  const f = fields(x.body);
  if (!f.name) return fail(400, 'Please enter the name.');
  if (!PROVIDER_TYPES.includes(f.type)) return fail(400, 'Please choose a type.');
  if (!dateOk(f.credential_expiry)) return fail(400, 'Please check the credential expiry date.');
  const id = crypto.randomUUID();
  // A new provider starts as a draft. It cannot be proposed to a client until the network manager verifies it.
  await x.env.DB.prepare('INSERT INTO providers (id, created_at, name, legal_name, type, specialty, phone, email, area, languages, rate_note, credential_no, credential_expiry, status, verification, service_modes, locations, services, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, nowIso(), f.name, f.legal_name, f.type, f.specialty, f.phone, f.email, f.area, f.languages, f.rate_note, f.credential_no, f.credential_expiry, 'draft', 'draft', f.service_modes, f.locations, f.services, f.notes).run();
  await audit(x.env, x.staff.email, 'provider', id, 'created', f.name);
  return json({ ok: true, id });
}

export async function detail(x, id) {
  if (!can(x.staff, 'providers.view')) return fail(403, 'Not allowed.');
  const p = await x.env.DB.prepare('SELECT * FROM providers WHERE id = ?').bind(id).first();
  if (!p) return fail(404, 'Provider not found.');
  const credentials = (await x.env.DB.prepare('SELECT * FROM provider_credentials WHERE provider_id = ? ORDER BY expires_on').bind(id).all()).results;
  const cases = (await x.env.DB.prepare('SELECT r.id, r.ref, r.created_at, r.service, r.status, r.name FROM requests r WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT 50').bind(id).all()).results;
  const appointments = (await x.env.DB.prepare('SELECT id, request_id, scheduled_at, status, place FROM appointments WHERE provider_id = ? ORDER BY scheduled_at DESC LIMIT 50').bind(id).all()).results;
  const timeline = (await x.env.DB.prepare("SELECT at, actor, action, detail FROM activity WHERE entity = 'provider' AND entity_id = ? ORDER BY id ASC").bind(id).all()).results;
  const state = effective(p, credentials);
  return json({ ok: true, provider: { ...p, status: state, effective: state }, credentials, cases: can(x.staff, 'health.view') ? cases : cases.map((c) => ({ ...c, name: undefined })), appointments, timeline });
}

export async function update(x, id) {
  if (!can(x.staff, 'providers.edit')) return fail(403, 'Not allowed.');
  const p = await x.env.DB.prepare('SELECT * FROM providers WHERE id = ?').bind(id).first();
  if (!p) return fail(404, 'Provider not found.');
  const b = x.body, f = fields({ ...p, ...b, type: b.type === undefined ? p.type : b.type });
  if (!f.name) return fail(400, 'Please enter the name.');
  if (!PROVIDER_TYPES.includes(f.type)) return fail(400, 'Please choose a type.');
  if (!dateOk(f.credential_expiry)) return fail(400, 'Please check the credential expiry date.');
  let verification = p.verification, reason = p.status_reason;
  if (b.status !== undefined && b.status !== p.verification && b.status !== p.status) {
    if (!VERIFICATION.includes(b.status)) return fail(400, 'Unknown status.');
    if (['active', 'rejected', 'suspended', 'archived'].includes(b.status) && !can(x.staff, 'providers.verify')) return fail(403, 'Only the network manager or owner can verify, reject, suspend or archive a provider.');
    if (['rejected', 'suspended', 'archived'].includes(b.status) && !clean(b.reason, 300)) return fail(400, 'Please give a reason.');
    if (b.status === 'active') {
      const creds = (await x.env.DB.prepare('SELECT result FROM provider_credentials WHERE provider_id = ?').bind(id).all()).results;
      if (!creds.some((c) => c.result === 'verified')) return fail(400, 'Verify at least one credential before activating this provider.');
    }
    verification = b.status; reason = clean(b.reason, 300) || null;
  }
  await x.env.DB.prepare('UPDATE providers SET name = ?, legal_name = ?, type = ?, specialty = ?, phone = ?, email = ?, area = ?, languages = ?, rate_note = ?, credential_no = ?, credential_expiry = ?, status = ?, verification = ?, status_reason = ?, service_modes = ?, locations = ?, services = ?, notes = ? WHERE id = ?')
    .bind(f.name, f.legal_name, f.type, f.specialty, f.phone, f.email, f.area, f.languages, f.rate_note, f.credential_no, f.credential_expiry, verification, verification, reason, f.service_modes, f.locations, f.services, f.notes, id).run();
  await audit(x.env, x.staff.email, 'provider', id, verification !== p.verification ? 'verification' : 'updated', verification !== p.verification ? `${p.verification} to ${verification}${reason ? ': ' + reason : ''}` : Object.keys(b).join(', '));
  return json({ ok: true });
}

// A credential is something a provider must hold (licence, registration, insurance, contract). Verified by a person, with an expiry.
export async function addCredential(x, id) {
  if (!can(x.staff, 'providers.edit')) return fail(403, 'Not allowed.');
  if (!(await x.env.DB.prepare('SELECT id FROM providers WHERE id = ?').bind(id).first())) return fail(404, 'Provider not found.');
  const b = x.body, type = CREDENTIAL_TYPES.includes(b.type) ? b.type : null;
  if (!type) return fail(400, 'Please choose the type of credential.');
  const expires = clean(b.expires_on, 10), issued = clean(b.issued_on, 10);
  if (!dateOk(expires) || !dateOk(issued)) return fail(400, 'Please check the dates.');
  const cid = crypto.randomUUID();
  await x.env.DB.prepare('INSERT INTO provider_credentials (id, provider_id, type, issuing_body, number, issued_on, expires_on, result, evidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(cid, id, type, clean(b.issuing_body, 120) || null, clean(b.number, 80) || null, issued || null, expires || null, 'pending', clean(b.evidence, 300) || null).run();
  await audit(x.env, x.staff.email, 'provider', id, 'credential', `Added ${type}${expires ? ', expires ' + expires : ''}`);
  return json({ ok: true, id: cid });
}

export async function reviewCredential(x, id) {
  if (!can(x.staff, 'providers.verify')) return fail(403, 'Only the network manager or owner can verify credentials.');
  const c = await x.env.DB.prepare('SELECT * FROM provider_credentials WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Credential not found.');
  if (!['verified', 'rejected', 'pending'].includes(x.body.result)) return fail(400, 'Please choose verified, rejected or pending.');
  await x.env.DB.prepare('UPDATE provider_credentials SET result = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').bind(x.body.result, x.staff.id, nowIso(), id).run();
  await audit(x.env, x.staff.email, 'provider', c.provider_id, 'credential', `${c.type} marked ${x.body.result}`);
  return json({ ok: true });
}
