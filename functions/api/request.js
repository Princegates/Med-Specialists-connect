import { getFlags, getSetting } from '../_lib/settings.js';
import { ensureSchema } from '../_lib/schema.js';
import { getService } from '../_lib/services.js';
import { createInvoice, nowIso } from '../_lib/db.js';
import { findOrCreateClient, CONSENT_VERSION } from '../_lib/clients.js';
import { newRef, newToken } from '../_lib/ids.js';
import { emailInvoice, emailTeamNewRequest, emailReady } from '../_lib/email.js';
import { audit } from '../_lib/audit.js';
import { json, fail, readJson, clean, later } from '../_lib/http.js';
import { visitMode, lineLabel, VISIT_LABEL, splitPackageLines } from '../_lib/packages.js';

const OPEN = "('closed', 'completed', 'cancelled')";

// POST /api/request: a visitor chooses a service. The request is stored against their client record, and a
// fixed-fee service is invoiced on the spot (once prices are confirmed) so they can pay straight away.
// A request marked as an emergency is never invoiced: it is flagged for immediate staff action instead.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return fail(503, 'The online system is not switched on.');
  await ensureSchema(env.DB);
  const f = await getFlags(env);
  if (!f.billingEnabled) return fail(503, 'The online system is not switched on.');

  let b;
  try { b = await readJson(request); } catch (e) { return fail(400, 'Invalid request.'); }
  if (b.botcheck) return json({ ok: true, status: 'new', invoice: null }); // spam trap: pretend it worked

  const service = clean(b.service, 80);
  const def = await getService(env, service);
  if (!def || !def.active) return fail(400, 'Please choose a service.');
  const name = clean(b.name, 100), phone = clean(b.phone, 30), email = clean(b.email, 120);
  if (!name) return fail(400, 'Please enter your name.');
  if (!/^[+0-9()\s-]{7,30}$/.test(phone)) return fail(400, 'Please enter a valid phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Please check the email address.');
  if (b.consent !== true) return fail(400, 'Please agree to the privacy notice.');
  // Private or home: the patient must choose for the six consultations that offer both; the two home-only ones are home visits.
  const mode = visitMode(def.value);
  let visit = null;
  if (mode === 'home') visit = 'home';
  else if (mode === 'choose') {
    visit = clean(b.visit, 10);
    if (visit !== 'home' && visit !== 'private') return fail(400, 'Please choose private or home.');
  }
  const date = clean(b.preferred_date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'Please check the preferred date.');

  // Simple flood guard: no more than 5 requests an hour from the same phone number.
  const since = new Date(Date.now() - 3600000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM requests WHERE phone = ? AND created_at > ?').bind(phone, since).first();
  if (recent && recent.c >= 5) return fail(429, 'Too many requests. Please call us instead.');

  const clientId = await findOrCreateClient(env.DB, { name, phone, email, area: clean(b.area, 100), consent: true });

  const urgency = clean(b.urgency, 80);
  const emergency = /^Emergency/i.test(urgency);
  const forWhom = clean(b.for_whom, 80);

  let assignedTo = null;
  if (!emergency && (await getSetting(env, 'auto_assign')) === 'true') {
    const pick = await env.DB.prepare(
      `SELECT s.id, COUNT(r.id) AS c FROM staff s LEFT JOIN requests r ON r.assigned_to = s.id AND r.status NOT IN ${OPEN} ` +
      "WHERE s.active = 1 AND s.role = 'coordinator' GROUP BY s.id ORDER BY c ASC, s.created_at ASC LIMIT 1"
    ).first();
    if (pick) assignedTo = pick.id;
  }

  const id = crypto.randomUUID(), ref = newRef(), token = newToken(), now = nowIso();
  const hours = Number(await getSetting(env, 'first_response_hours')) || 2;
  const due = emergency ? now : new Date(Date.now() + hours * 3600000).toISOString();
  const status = emergency ? 'safety_escalation' : 'new';
  const nextAction = emergency ? 'Call the client now: possible emergency' : 'Make first contact and review the request';
  const row = { service, for_whom: forWhom, urgency, message: clean(b.message, 2000), name, phone, email: email || null, preferred_date: date || null, call_time: clean(b.call_time, 40), area: clean(b.area, 100) };

  // The patient is the client themselves, or someone the client is arranging care for.
  const patientId = crypto.randomUUID();
  const self = !forWhom || /^myself$/i.test(forWhom);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO requests (id, created_at, service, for_whom, urgency, message, name, phone, email, preferred_date, call_time, area, status, client_id, assigned_to, ref, track_token, patient_id, channel, priority, next_action, next_action_due, visit_type) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, now, service, row.for_whom, row.urgency, row.message, name, phone, row.email, row.preferred_date, row.call_time, row.area, status, clientId, assignedTo, ref, token, patientId, 'website', emergency ? 'emergency' : /^Urgent/i.test(urgency) ? 'high' : 'normal', nextAction, due, visit),
    env.DB.prepare('INSERT INTO patients (id, created_at, name, area, client_id, self, relationship, authority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(patientId, now, self ? name : 'Patient (name to be confirmed)', row.area || null, clientId, self ? 1 : 0, self ? 'self' : forWhom, self ? 'self' : 'to_be_confirmed'),
    env.DB.prepare('INSERT INTO consents (id, client_id, patient_id, purpose, notice_version, status, channel, given_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), clientId, patientId, 'care_coordination', CONSENT_VERSION, 'given', 'website', now)
  ]);
  await audit(env, 'website', 'case', id, 'created', emergency ? 'Request from the website (EMERGENCY FLAG)' : 'Request from the website');

  let invoice = null;
  if (!emergency && def.billing === 'fixed' && f.pricesConfirmed && def.lines.length) {
    const made = await createInvoice(env.DB, id, splitPackageLines(service, def.lines.map((l) => ({ ...l, description: lineLabel(l.description, visit) }))), null);
    if (!made.conflict) {
      invoice = { id: made.id, number: made.number, total: made.total, url: `/invoice?id=${made.id}` };
      await audit(env, 'system', 'invoice', made.id, 'issued', made.number);
      later(context, emailInvoice(env, made.id));
    }
  }
  later(context, emailTeamNewRequest(env, { ...row, serviceLabel: def.label, invoiceNumber: invoice && invoice.number, emergency, ref, visit: visit ? VISIT_LABEL[visit] : null }));

  // Tells the website it can skip its own email to the team, because this system has already emailed them.
  const teamNotified = (await emailReady(env)) && (await getSetting(env, 'notify_new_request')) === 'true' && (await getSetting(env, 'email_verified')) === 'true';
  return json({
    ok: true, requestId: id, ref, track: `/track?ref=${ref}&t=${token}`, emergency, billing: def.billing,
    status: invoice ? 'awaiting_payment' : status, invoice, teamNotified
  });
}
