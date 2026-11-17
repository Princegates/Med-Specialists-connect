import { can } from '../perms.js';
import { getSetting } from '../settings.js';
import { getService } from '../services.js';
import { findOrCreateClient, CONSENT_VERSION } from '../clients.js';
import { createInvoice, nowIso } from '../db.js';
import { newRef, newToken } from '../ids.js';
import { bookable } from './providers.js';
import { emailInvoice } from '../email.js';
import { audit } from '../audit.js';
import { json, fail, clean, later } from '../http.js';

// Case statuses are those in the requirements document (section 9.1). Payment, appointment and provider
// verification have their own separate statuses, so a case can be completed while an invoice is still unpaid.
export const CASE_STATUSES = ['new', 'safety_escalation', 'under_review', 'awaiting_patient', 'awaiting_provider', 'options_presented', 'awaiting_payment', 'confirmed', 'in_progress', 'follow_up_due', 'completed', 'cancelled', 'closed', 'reopened'];
export const APPT_STATUSES = ['requested', 'awaiting_provider', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show', 'declined'];
const FINISHED = ['closed', 'completed', 'cancelled'];
const OPEN_SQL = "('closed', 'completed', 'cancelled')";
const OUTCOMES = ['service_delivered', 'information_given', 'referred_elsewhere', 'client_declined', 'unable_to_help', 'duplicate', 'no_response', 'other'];
const n = (v) => (v === undefined || v === '' ? null : v);

const stripHealth = (staff, row) => { if (!can(staff, 'health.view')) { delete row.message; delete row.notes; } return row; };

export async function list(x) {
  if (!can(x.staff, 'cases.view')) return fail(403, 'Not allowed.');
  const q = x.url.searchParams, where = [], args = [];
  const status = q.get('status');
  if (status === 'open') where.push(`r.status NOT IN ${OPEN_SQL}`);
  else if (status) { where.push('r.status = ?'); args.push(status); }
  const as = q.get('assigned');
  if (as === 'me') { where.push('r.assigned_to = ?'); args.push(x.staff.id); }
  else if (as === 'none') where.push('r.assigned_to IS NULL');
  else if (as) { where.push('r.assigned_to = ?'); args.push(as); }
  if (q.get('urgent') === '1') where.push(`(r.urgency LIKE 'Urgent%' OR r.priority IN ('high', 'emergency'))`);
  if (q.get('overdue') === '1') { where.push(`r.status NOT IN ${OPEN_SQL} AND r.next_action_due IS NOT NULL AND r.next_action_due < ?`); args.push(nowIso()); }
  const term = (q.get('q') || '').trim().slice(0, 60);
  if (term) { where.push('(r.name LIKE ? OR r.phone LIKE ? OR r.service LIKE ? OR r.id LIKE ? OR r.ref LIKE ?)'); const l = `%${term}%`; args.push(l, l, l, term + '%', term.toUpperCase() + '%'); }
  const limit = Math.min(Number(q.get('limit')) || 100, 200);
  const { results } = await x.env.DB.prepare(
    'SELECT r.id, r.ref, r.created_at, r.service, sv.label AS service_label, r.urgency, r.priority, r.for_whom, r.name, r.phone, r.email, r.area, r.status, r.assigned_to, r.provider_id, r.client_id, r.preferred_date, r.call_time, r.message, r.next_action, r.next_action_due, r.channel, ' +
    's.name AS assigned_name, p.name AS provider_name, i.id AS invoice_id, i.number AS invoice_number, i.status AS invoice_status, i.total AS invoice_total ' +
    'FROM requests r LEFT JOIN services sv ON sv.value = r.service LEFT JOIN staff s ON s.id = r.assigned_to LEFT JOIN providers p ON p.id = r.provider_id ' +
    "LEFT JOIN invoices i ON i.request_id = r.id AND i.status != 'void' " +
    (where.length ? 'WHERE ' + where.join(' AND ') : '') + " ORDER BY (r.status = 'safety_escalation') DESC, r.created_at DESC LIMIT ?"
  ).bind(...args, limit).all();
  return json({ ok: true, cases: results.map((r) => stripHealth(x.staff, r)) });
}

export async function detail(x, id) {
  if (!can(x.staff, 'cases.view')) return fail(403, 'Not allowed.');
  const db = x.env.DB;
  const c = await db.prepare(
    'SELECT r.*, sv.label AS service_label, sv.billing AS service_billing, s.name AS assigned_name, p.name AS provider_name, e.name AS escalated_name FROM requests r LEFT JOIN services sv ON sv.value = r.service LEFT JOIN staff s ON s.id = r.assigned_to LEFT JOIN providers p ON p.id = r.provider_id LEFT JOIN staff e ON e.id = r.escalated_to WHERE r.id = ?'
  ).bind(id).first();
  if (!c) return fail(404, 'Case not found.');
  const client = c.client_id ? await db.prepare('SELECT id, name, phone, email, area, status FROM clients WHERE id = ?').bind(c.client_id).first() : null;
  const patient = c.patient_id ? await db.prepare('SELECT * FROM patients WHERE id = ?').bind(c.patient_id).first() : null;
  const invoices = (await db.prepare('SELECT id, number, status, total, created_at, paid_at, pay_channel FROM invoices WHERE request_id = ? ORDER BY created_at DESC').bind(id).all()).results;
  const appointments = (await db.prepare('SELECT a.*, p.name AS provider_name FROM appointments a LEFT JOIN providers p ON p.id = a.provider_id WHERE a.request_id = ? ORDER BY a.created_at DESC').bind(id).all()).results;
  const assignments = (await db.prepare('SELECT a.*, p.name AS provider_name, p.specialty FROM assignments a LEFT JOIN providers p ON p.id = a.provider_id WHERE a.request_id = ? ORDER BY a.proposed_at DESC').bind(id).all()).results;
  const tasks = (await db.prepare('SELECT t.*, s.name AS assignee_name FROM tasks t LEFT JOIN staff s ON s.id = t.assignee WHERE t.request_id = ? ORDER BY (t.status = \'open\') DESC, t.due').bind(id).all()).results;
  const comms = (await db.prepare('SELECT m.*, s.name AS by_name FROM communications m LEFT JOIN staff s ON s.id = m.by_user WHERE m.request_id = ? ORDER BY m.at DESC').bind(id).all()).results;
  const timeline = (await db.prepare("SELECT at, actor, action, detail FROM activity WHERE entity = 'case' AND entity_id = ? ORDER BY id ASC").bind(id).all()).results;
  return json({ ok: true, case: stripHealth(x.staff, c), client, patient, invoices, appointments, assignments, tasks, communications: can(x.staff, 'health.view') ? comms : [], timeline, outcomes: OUTCOMES });
}

// Changes status, owner, doctor, next action and escalation. Every change is written to the case timeline.
export async function update(x, id) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Case not found.');
  const b = x.body, sets = [], args = [], notes = [];
  const set = (col, val) => { sets.push(`${col} = ?`); args.push(val); };

  let newStatus = c.status;
  if (b.status !== undefined && b.status !== c.status) {
    if (!CASE_STATUSES.includes(b.status)) return fail(400, 'Unknown status.');
    const why = clean(b.note, 500);
    if (['awaiting_patient', 'cancelled'].includes(b.status) && !why) return fail(400, 'Please give a reason.');
    if (FINISHED.includes(c.status) && b.status !== 'reopened') return fail(400, 'A finished case can only be reopened.');
    if (b.status === 'reopened' && !FINISHED.includes(c.status)) return fail(400, 'Only a finished case can be reopened.');
    if (b.status === 'reopened' && !why) return fail(400, 'Please say why the case is being reopened.');
    if (['closed', 'completed', 'cancelled'].includes(b.status)) {
      // Closing a case needs a reason and an outcome so it can be reviewed later (BR-012).
      if (!can(x.staff, 'cases.close')) return fail(403, 'Not allowed.');
      const reason = clean(b.closure_reason, 300) || (b.status === 'cancelled' ? why : '');
      if (!reason) return fail(400, 'Please give a closure reason.');
      if (b.status !== 'cancelled' && !OUTCOMES.includes(b.closure_outcome)) return fail(400, 'Please choose the outcome.');
      if (b.status === 'closed' && !['completed', 'cancelled'].includes(c.status) && !b.confirm_close) return fail(400, 'Mark the case completed or cancelled first, or confirm you want to close it now.');
      set('closure_reason', reason); set('closure_outcome', b.closure_outcome || null); set('closed_at', nowIso());
    }
    newStatus = b.status;
    set('status', newStatus);
    notes.push(['status', `${c.status} to ${newStatus}${why ? ': ' + why : ''}`]);
    if (newStatus === 'reopened') { set('closed_at', null); set('closure_reason', null); }
  }

  // Every open case has a next action and a date for it (BR-010).
  if (b.next_action !== undefined) set('next_action', clean(b.next_action, 200) || null);
  if (b.next_action_due !== undefined) {
    const d = clean(b.next_action_due, 40);
    if (d && Number.isNaN(Date.parse(d))) return fail(400, 'Please check the next-action date.');
    set('next_action_due', d ? new Date(d).toISOString() : null);
  }
  if (!FINISHED.includes(newStatus)) {
    const na = b.next_action === undefined ? c.next_action : clean(b.next_action, 200);
    if (!na && newStatus !== 'awaiting_payment') return fail(400, 'Every open case needs a next action.');
  } else { set('next_action', null); set('next_action_due', null); }

  if (b.priority !== undefined && b.priority !== c.priority) {
    if (!['normal', 'high', 'emergency'].includes(b.priority)) return fail(400, 'Unknown priority.');
    set('priority', b.priority); notes.push(['priority', `Priority ${c.priority} to ${b.priority}`]);
  }

  if (b.assigned_to !== undefined && (b.assigned_to || null) !== c.assigned_to) {
    // A coordinator can pick up an unassigned case; moving a case between people is for supervisors.
    const claiming = b.assigned_to === x.staff.id && !c.assigned_to;
    if (!claiming && !can(x.staff, 'cases.assign')) return fail(403, 'Only a supervisor can reassign a case.');
    let who = null;
    if (b.assigned_to) {
      who = await x.env.DB.prepare('SELECT id, name FROM staff WHERE id = ? AND active = 1').bind(String(b.assigned_to)).first();
      if (!who) return fail(400, 'That staff member is not available.');
    }
    set('assigned_to', who ? who.id : null);
    notes.push(['assigned', who ? `Assigned to ${who.name}` : 'Unassigned']);
  }

  if (b.provider_id !== undefined && (b.provider_id || null) !== c.provider_id) {
    let p = null;
    if (b.provider_id) {
      const ok = await bookable(x.env.DB, String(b.provider_id));
      if (!ok.ok) return fail(400, ok.reason);
      p = ok.provider;
    }
    set('provider_id', p ? p.id : null);
    notes.push(['provider', p ? `Doctor or provider set to ${p.name}` : 'Provider removed']);
  }

  // Escalation to a senior colleague, and what came of it.
  if (b.escalate_to !== undefined && b.escalate_to) {
    const who = await x.env.DB.prepare('SELECT id, name FROM staff WHERE id = ? AND active = 1').bind(String(b.escalate_to)).first();
    if (!who) return fail(400, 'That staff member is not available.');
    const why = clean(b.note, 500);
    if (!why) return fail(400, 'Please say why you are escalating.');
    set('escalated_to', who.id); set('escalated_at', nowIso()); set('escalation_outcome', null);
    notes.push(['escalated', `Escalated to ${who.name}: ${why}`]);
  }
  if (b.escalation_outcome !== undefined && c.escalated_to) {
    set('escalation_outcome', clean(b.escalation_outcome, 300) || null);
    notes.push(['escalation', `Escalation outcome: ${clean(b.escalation_outcome, 300)}`]);
  }

  if (!sets.length) return json({ ok: true, unchanged: true });
  await x.env.DB.prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  for (const [action, detail] of notes) await audit(x.env, x.staff.email, 'case', id, action, detail);
  if (!notes.length) await audit(x.env, x.staff.email, 'case', id, 'next_action', clean(b.next_action, 200) || 'updated');
  return json({ ok: true });
}

export async function addNote(x, id) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const text = clean(x.body.text, 1000);
  if (!text) return fail(400, 'Please write a note.');
  if (!(await x.env.DB.prepare('SELECT id FROM requests WHERE id = ?').bind(id).first())) return fail(404, 'Case not found.');
  await audit(x.env, x.staff.email, 'case', id, 'note', text);
  return json({ ok: true });
}

// Records a call, message or visit with the client (or on their behalf). The first outbound contact stops the response clock.
export async function logCommunication(x, id) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT id, client_id, status, first_response_at FROM requests WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Case not found.');
  const b = x.body;
  const direction = ['outbound', 'inbound'].includes(b.direction) ? b.direction : null;
  const channel = ['phone', 'whatsapp', 'sms', 'email', 'in_person', 'other'].includes(b.channel) ? b.channel : null;
  if (!direction || !channel) return fail(400, 'Please choose the direction and the way you were in touch.');
  const body = clean(b.body, 2000);
  if (!body) return fail(400, 'Please write what was said or agreed.');
  const at = nowIso();
  await x.env.DB.prepare('INSERT INTO communications (id, request_id, client_id, direction, channel, visibility, subject, body, status, at, by_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, c.client_id, direction, channel, b.visibility === 'client' ? 'client' : 'internal', clean(b.subject, 160) || null, body, 'logged', at, x.staff.id).run();
  const moves = [];
  if (direction === 'outbound' && !c.first_response_at) moves.push(x.env.DB.prepare('UPDATE requests SET first_response_at = ? WHERE id = ?').bind(at, id));
  if (direction === 'outbound' && ['new', 'safety_escalation'].includes(c.status)) moves.push(x.env.DB.prepare("UPDATE requests SET status = 'under_review' WHERE id = ?").bind(id));
  if (moves.length) await x.env.DB.batch(moves);
  await audit(x.env, x.staff.email, 'case', id, 'contact', `${direction} ${channel}`);
  return json({ ok: true });
}

// Staff log a request that came by phone, WhatsApp, referral or walk-in.
export async function create(x) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const b = x.body;
  const def = await getService(x.env, clean(b.service, 80));
  if (!def) return fail(400, 'Please choose a service.');
  const name = clean(b.name, 100), phone = clean(b.phone, 30), email = clean(b.email, 120);
  if (!name) return fail(400, 'Please enter the name.');
  if (!/^[+0-9()\s-]{7,30}$/.test(phone)) return fail(400, 'Please enter a valid phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Please check the email address.');
  const channel = ['phone', 'whatsapp', 'referral', 'walk-in', 'email'].includes(b.channel) ? b.channel : 'phone';
  const emergency = !!b.emergency;
  const clientId = await findOrCreateClient(x.env.DB, { name, phone, email, area: clean(b.area, 100), consent: b.consent_confirmed === true });
  const id = crypto.randomUUID(), now = nowIso(), patientId = crypto.randomUUID();
  const hours = Number(await getSetting(x.env, 'first_response_hours')) || 2;
  const forWhom = clean(b.for_whom, 80) || 'Myself', self = /^myself$/i.test(forWhom);
  const patientName = clean(b.patient_name, 100);
  const stmts = [
    x.env.DB.prepare(
      'INSERT INTO requests (id, created_at, service, for_whom, urgency, message, name, phone, email, preferred_date, call_time, area, status, client_id, assigned_to, created_by, ref, track_token, patient_id, channel, priority, next_action, next_action_due, referral_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, now, def.value, forWhom, emergency ? 'Emergency' : clean(b.urgency, 80) || 'Routine', clean(b.message, 2000), name, phone, n(email), n(clean(b.preferred_date, 10)), clean(b.call_time, 40), clean(b.area, 100),
      emergency ? 'safety_escalation' : 'under_review', clientId, x.staff.role === 'coordinator' ? x.staff.id : null, x.staff.id, newRef(), newToken(), patientId, channel,
      emergency ? 'emergency' : 'normal', clean(b.next_action, 200) || (emergency ? 'Direct the client to emergency care now' : 'Contact the client and confirm what they need'),
      emergency ? now : new Date(Date.now() + hours * 3600000).toISOString(), clean(b.referral_source, 120) || null),
    x.env.DB.prepare('INSERT INTO patients (id, created_at, name, area, client_id, self, relationship, authority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(patientId, now, self ? name : (patientName || 'Patient (name to be confirmed)'), clean(b.area, 100) || null, clientId, self ? 1 : 0, self ? 'self' : forWhom, self ? 'self' : (b.consent_confirmed === true ? 'confirmed_by_staff' : 'to_be_confirmed'))
  ];
  if (b.consent_confirmed === true) stmts.push(x.env.DB.prepare('INSERT INTO consents (id, client_id, patient_id, purpose, notice_version, status, channel, given_at, captured_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), clientId, patientId, 'care_coordination', CONSENT_VERSION, 'given', channel, now, x.staff.id));
  await x.env.DB.batch(stmts);
  await audit(x.env, x.staff.email, 'case', id, 'created', `Logged by staff (${channel})${emergency ? ', EMERGENCY FLAG' : ''}`);
  return json({ ok: true, id });
}

// Providers put forward for a case, how they answered, and (if a supervisor overrode the usual matching) why.
export async function propose(x, id) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT id, status FROM requests WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Case not found.');
  const ok = await bookable(x.env.DB, String(x.body.provider_id || ''));
  if (!ok.ok) return fail(400, ok.reason);
  const dup = await x.env.DB.prepare("SELECT id FROM assignments WHERE request_id = ? AND provider_id = ? AND response IN ('pending', 'accepted')").bind(id, ok.provider.id).first();
  if (dup) return fail(409, 'This provider has already been proposed for this case.');
  const aid = crypto.randomUUID();
  await x.env.DB.prepare('INSERT INTO assignments (id, request_id, provider_id, proposed_by, proposed_at, rationale, override_reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(aid, id, ok.provider.id, x.staff.id, nowIso(), clean(x.body.rationale, 500) || null, clean(x.body.override_reason, 300) || null).run();
  if (['new', 'under_review', 'options_presented'].includes(c.status)) await x.env.DB.prepare("UPDATE requests SET status = 'awaiting_provider', next_action = ? WHERE id = ?").bind(`Waiting for ${ok.provider.name} to respond`, id).run();
  await audit(x.env, x.staff.email, 'case', id, 'proposed', `Asked ${ok.provider.name}${x.body.override_reason ? ' (override: ' + clean(x.body.override_reason, 200) + ')' : ''}`);
  return json({ ok: true, id: aid });
}

export async function respond(x, aid) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const a = await x.env.DB.prepare('SELECT a.*, p.name AS pname FROM assignments a JOIN providers p ON p.id = a.provider_id WHERE a.id = ?').bind(aid).first();
  if (!a) return fail(404, 'Not found.');
  const r = x.body.response;
  if (!['accepted', 'declined', 'no_response'].includes(r)) return fail(400, 'Please choose accepted, declined or no response.');
  await x.env.DB.prepare('UPDATE assignments SET response = ?, response_note = ?, responded_at = ?, responded_by = ? WHERE id = ?').bind(r, clean(x.body.note, 300) || null, nowIso(), x.staff.id, aid).run();
  if (r === 'accepted') {
    await x.env.DB.prepare("UPDATE requests SET provider_id = ?, status = CASE WHEN status IN ('awaiting_provider', 'under_review', 'new') THEN 'options_presented' ELSE status END, next_action = ? WHERE id = ?").bind(a.provider_id, `Confirm the booking with ${a.pname} and the client`, a.request_id).run();
  } else {
    await x.env.DB.prepare("UPDATE requests SET next_action = ? WHERE id = ? AND status NOT IN ('closed', 'completed', 'cancelled')").bind(`${a.pname} ${r === 'declined' ? 'declined' : 'did not respond'}: find another provider`, a.request_id).run();
  }
  await audit(x.env, x.staff.email, 'case', a.request_id, 'provider_response', `${a.pname}: ${r}${x.body.note ? ', ' + clean(x.body.note, 200) : ''}`);
  return json({ ok: true });
}

export async function addAppointment(x, id) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const c = await x.env.DB.prepare('SELECT id, status FROM requests WHERE id = ?').bind(id).first();
  if (!c) return fail(404, 'Case not found.');
  const ok = await bookable(x.env.DB, String(x.body.provider_id || ''));
  if (!ok.ok) return fail(400, ok.reason);
  const when = clean(x.body.scheduled_at, 40);
  if (!when || Number.isNaN(Date.parse(when))) return fail(400, 'Please give the appointment date and time.');
  const mode = ['facility', 'home', 'virtual', 'mobile'].includes(x.body.mode) ? x.body.mode : 'facility';
  // An appointment counts as confirmed only once the provider has said so.
  const confirmed = x.body.provider_confirmed === true;
  const apptId = crypto.randomUUID();
  await x.env.DB.batch([
    x.env.DB.prepare('INSERT INTO appointments (id, request_id, provider_id, scheduled_at, place, status, notes, created_by, created_at, mode, address, instructions, cost_info, externally_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(apptId, id, ok.provider.id, when, clean(x.body.place, 200), confirmed ? 'confirmed' : 'requested', clean(x.body.notes, 500), x.staff.id, nowIso(), mode, clean(x.body.address, 300) || null, clean(x.body.instructions, 500) || null, clean(x.body.cost_info, 300) || null, confirmed ? 1 : 0),
    x.env.DB.prepare('UPDATE requests SET provider_id = ? WHERE id = ?').bind(ok.provider.id, id),
    confirmed
      ? x.env.DB.prepare("UPDATE requests SET status = 'confirmed', next_action = 'Remind the client before the appointment', next_action_due = ? WHERE id = ? AND status IN ('new', 'under_review', 'awaiting_provider', 'options_presented', 'in_progress')").bind(new Date(Date.parse(when) - 86400000).toISOString(), id)
      : x.env.DB.prepare("UPDATE requests SET status = 'awaiting_provider', next_action = ? WHERE id = ? AND status IN ('new', 'under_review', 'options_presented')").bind(`Get ${ok.provider.name} to confirm the booking`, id)
  ]);
  await audit(x.env, x.staff.email, 'case', id, 'appointment', `${confirmed ? 'Booked' : 'Requested'} ${ok.provider.name} on ${when}`);
  return json({ ok: true, id: apptId });
}

// A change of time, provider or place is kept as history: the old booking is marked rescheduled and a new one is linked to it (BR-011).
export async function updateAppointment(x, id) {
  if (!can(x.staff, 'cases.edit')) return fail(403, 'Not allowed.');
  const a = await x.env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first();
  if (!a) return fail(404, 'Appointment not found.');
  const b = x.body, status = b.status === undefined ? a.status : b.status;
  if (!APPT_STATUSES.includes(status)) return fail(400, 'Unknown status.');
  if (['cancelled', 'declined', 'no_show'].includes(status) && status !== a.status && !clean(b.reason, 300)) return fail(400, 'Please give a reason.');
  const when = b.scheduled_at === undefined ? a.scheduled_at : clean(b.scheduled_at, 40);
  if (b.scheduled_at !== undefined && Number.isNaN(Date.parse(when))) return fail(400, 'Please check the date and time.');
  const moved = b.scheduled_at !== undefined && when !== a.scheduled_at;
  const place = b.place === undefined ? a.place : clean(b.place, 200);
  if (moved) {
    const nid = crypto.randomUUID();
    await x.env.DB.batch([
      x.env.DB.prepare("UPDATE appointments SET status = 'rescheduled', cancel_reason = ?, cancelled_by = ?, cancelled_at = ? WHERE id = ?").bind(clean(b.reason, 300) || 'Time changed', x.staff.id, nowIso(), id),
      x.env.DB.prepare('INSERT INTO appointments (id, request_id, provider_id, scheduled_at, place, status, notes, created_by, created_at, mode, address, instructions, cost_info, replaces_id, externally_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(nid, a.request_id, a.provider_id, when, place, b.provider_confirmed === true ? 'confirmed' : 'requested', b.notes === undefined ? a.notes : clean(b.notes, 500), x.staff.id, nowIso(), a.mode, a.address, a.instructions, a.cost_info, id, b.provider_confirmed === true ? 1 : 0)
    ]);
    await audit(x.env, x.staff.email, 'case', a.request_id, 'appointment', `Appointment rescheduled from ${a.scheduled_at} to ${when}${b.reason ? ': ' + clean(b.reason, 200) : ''}`);
    return json({ ok: true, id: nid });
  }
  const cancelled = ['cancelled', 'declined', 'no_show'].includes(status) && status !== a.status;
  await x.env.DB.prepare('UPDATE appointments SET status = ?, place = ?, notes = ?, externally_confirmed = ?, cancel_reason = ?, cancelled_by = ?, cancelled_at = ? WHERE id = ?')
    .bind(status, place, b.notes === undefined ? a.notes : clean(b.notes, 500), status === 'confirmed' ? 1 : a.externally_confirmed, cancelled ? clean(b.reason, 300) : a.cancel_reason, cancelled ? x.staff.id : a.cancelled_by, cancelled ? nowIso() : a.cancelled_at, id).run();
  if (status === 'confirmed' && a.status !== 'confirmed') await x.env.DB.prepare("UPDATE requests SET status = 'confirmed' WHERE id = ? AND status IN ('new', 'under_review', 'awaiting_provider', 'options_presented', 'in_progress')").bind(a.request_id).run();
  if (status === 'completed' && a.status !== 'completed') await x.env.DB.prepare("UPDATE requests SET status = 'follow_up_due', next_action = 'Follow up with the client after the visit', next_action_due = ? WHERE id = ? AND status IN ('confirmed', 'in_progress')").bind(new Date(Date.now() + 2 * 86400000).toISOString(), a.request_id).run();
  await audit(x.env, x.staff.email, 'case', a.request_id, 'appointment', `Appointment ${status}${cancelled && b.reason ? ': ' + clean(b.reason, 200) : ''}`);
  return json({ ok: true });
}

export async function issueInvoice(x, id) {
  if (!can(x.staff, 'billing.create')) return fail(403, 'Not allowed.');
  if (!(await x.env.DB.prepare('SELECT id FROM requests WHERE id = ?').bind(id).first())) return fail(404, 'Case not found.');
  const raw = Array.isArray(x.body.lines) ? x.body.lines.slice(0, 20) : [];
  const lines = [];
  for (const l of raw) {
    const description = clean(l.description, 120), amount = Math.round(Number(l.amountGhs) * 100);
    if (!description || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) return fail(400, 'Each line needs a description and an amount above zero.');
    lines.push({ description, amount });
  }
  if (!lines.length) return fail(400, 'Add at least one line.');
  const made = await createInvoice(x.env.DB, id, lines, clean(x.body.note, 500));
  if (made.conflict) return fail(409, 'This case already has an invoice. Void it first to issue a new one.');
  await audit(x.env, x.staff.email, 'case', id, 'invoice', `Issued ${made.number}`);
  await audit(x.env, x.staff.email, 'invoice', made.id, 'issued', made.number);
  later(x.context, emailInvoice(x.env, made.id));
  return json({ ok: true, invoice: { id: made.id, number: made.number, total: made.total, url: `/invoice?id=${made.id}` } });
}
