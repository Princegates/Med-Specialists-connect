import { ensureSchema } from '../_lib/schema.js';
import { json, fail } from '../_lib/http.js';

// What a client may see about their own request, in plain words. Needs the case reference and the private token
// from their link, so a reference alone is not enough. No health details, no staff notes, no provider contact details.
const WORDS = {
  new: ['We have your request', 'We received it and a coordinator will contact you soon.'],
  safety_escalation: ['We are treating this as urgent', 'If this is an emergency, call 112 or go to the nearest hospital now. Our team is contacting you.'],
  under_review: ['We are reviewing your request', 'A coordinator is working out the best option for you.'],
  awaiting_patient: ['We are waiting for you', 'We need a little more information from you. Please check your phone or messages.'],
  awaiting_provider: ['Waiting for the doctor or provider', 'We have asked a provider to confirm availability.'],
  options_presented: ['We have options for you', 'Your coordinator will go through the options with you.'],
  awaiting_payment: ['Waiting for payment', 'Your invoice is ready. Once paid, we will go ahead.'],
  confirmed: ['Appointment confirmed', 'Your booking is confirmed. Details are below.'],
  in_progress: ['We are arranging your service', 'Your coordinator is working on it.'],
  follow_up_due: ['We will check in with you', 'Your service has taken place. We will follow up to see how it went.'],
  completed: ['Completed', 'We have completed what you asked for.'],
  cancelled: ['Cancelled', 'This request was cancelled.'],
  closed: ['Closed', 'This request is closed.'],
  reopened: ['Reopened', 'This request has been reopened.']
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return fail(503, 'Not available.');
  await ensureSchema(env.DB);
  const u = new URL(request.url), ref = (u.searchParams.get('ref') || '').trim().toUpperCase(), t = (u.searchParams.get('t') || '').trim();
  if (!ref || !t) return fail(400, 'Please use the link we sent you.');
  const c = await env.DB.prepare(
    'SELECT r.id, r.ref, r.created_at, r.status, r.track_token, sv.label AS service_label FROM requests r LEFT JOIN services sv ON sv.value = r.service WHERE r.ref = ?'
  ).bind(ref).first();
  // Same answer whether the reference is unknown or the token is wrong.
  if (!c || c.track_token !== t) return fail(404, 'We could not find that request. Please check the link.');
  const inv = await env.DB.prepare("SELECT id, number, status, total FROM invoices WHERE request_id = ? AND status != 'void' ORDER BY created_at DESC LIMIT 1").bind(c.id).first();
  const appts = (await env.DB.prepare("SELECT a.scheduled_at, a.status, a.mode, a.place, a.address, a.instructions, p.name AS provider FROM appointments a LEFT JOIN providers p ON p.id = a.provider_id WHERE a.request_id = ? AND a.status IN ('requested','confirmed') ORDER BY a.scheduled_at").bind(c.id).all()).results;
  const [headline, text] = WORDS[c.status] || ['In progress', 'We are working on it.'];
  return json({
    ok: true, ref: c.ref, received: c.created_at, service: c.service_label, headline, text,
    invoice: inv ? { number: inv.number, status: inv.status, total: inv.total, url: `/invoice?id=${inv.id}` } : null,
    appointments: appts.map((a) => ({ when: a.scheduled_at, confirmed: a.status === 'confirmed', mode: a.mode, provider: a.provider, place: a.place, address: a.address, instructions: a.instructions }))
  });
}
