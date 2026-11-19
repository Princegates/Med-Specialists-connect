import { ensureSchema } from '../../_lib/schema.js';
import { resolveStaff } from '../../_lib/admin/auth.js';
import { mfaRequiredFor } from '../../_lib/auth.js';
import { getFlags, getSetting } from '../../_lib/settings.js';
import { can } from '../../_lib/perms.js';
import { json, fail, readJson } from '../../_lib/http.js';
import * as cases from '../../_lib/admin/cases.js';
import * as clients from '../../_lib/admin/clients.js';
import * as providers from '../../_lib/admin/providers.js';
import * as billing from '../../_lib/admin/billing.js';
import * as accounts from '../../_lib/admin/accounts.js';
import * as services from '../../_lib/admin/services.js';
import * as settings from '../../_lib/admin/settings.js';
import * as staffApi from '../../_lib/admin/staff.js';
import * as dash from '../../_lib/admin/dashboard.js';
import * as audit from '../../_lib/admin/audit.js';
import * as insight from '../../_lib/admin/insight.js';
import * as tasks from '../../_lib/admin/tasks.js';
import { TASK_TYPES } from '../../_lib/admin/tasks.js';
import { CASE_STATUSES, APPT_STATUSES } from '../../_lib/admin/cases.js';
import { PROVIDER_TYPES, PROVIDER_STATUSES, CREDENTIAL_TYPES, SERVICE_MODES } from '../../_lib/admin/providers.js';

// Every route under /api/admin: GET reads, POST changes. Sign-in comes from Cloudflare Access; what each person
// may do comes from their role in the Staff list.
const ROUTES = [
  ['GET', /^me$/, async (x) => json({ ok: true, me: staffApi.meInfo(x.staff, await mfaRequiredFor(x.env, x.staff)), idleMinutes: Math.min(Math.max(Number(await getSetting(x.env, 'idle_minutes')) || 20, 5), 120) })],
  ['GET', /^meta$/, async (x) => json({ ok: true, flags: await getFlags(x.env), caseStatuses: CASE_STATUSES, providerTypes: PROVIDER_TYPES, providerStatuses: PROVIDER_STATUSES, credentialTypes: CREDENTIAL_TYPES, taskTypes: TASK_TYPES, serviceModes: SERVICE_MODES, apptStatuses: APPT_STATUSES, outcomes: ['service_delivered','information_given','referred_elsewhere','client_declined','unable_to_help','duplicate','no_response','other'], services: (await services.list(x).then((r) => r.json())).services || [] })],
  ['GET', /^dashboard$/, dash.dashboard],
  ['GET', /^cases$/, cases.list],
  ['POST', /^cases$/, cases.create],
  ['POST', /^cases\/delete$/, cases.remove],
  ['GET', /^cases\/([\w-]+)$/, (x, m) => cases.detail(x, m[1])],
  ['POST', /^cases\/([\w-]+)\/update$/, (x, m) => cases.update(x, m[1])],
  ['POST', /^cases\/([\w-]+)\/note$/, (x, m) => cases.addNote(x, m[1])],
  ['POST', /^cases\/([\w-]+)\/contact$/, (x, m) => cases.logCommunication(x, m[1])],
  ['POST', /^cases\/([\w-]+)\/propose$/, (x, m) => cases.propose(x, m[1])],
  ['POST', /^assignments\/([\w-]+)$/, (x, m) => cases.respond(x, m[1])],
  ['GET', /^search$/, insight.search],
  ['GET', /^calendar$/, insight.calendar],
  ['GET', /^reports$/, insight.reports],
  ['GET', /^tasks$/, tasks.list],
  ['POST', /^tasks$/, tasks.create],
  ['POST', /^tasks\/([\w-]+)\/done$/, (x, m) => tasks.complete(x, m[1])],
  ['POST', /^providers\/([\w-]+)\/credentials$/, (x, m) => providers.addCredential(x, m[1])],
  ['POST', /^credentials\/([\w-]+)$/, (x, m) => providers.reviewCredential(x, m[1])],
  ['GET', /^audit\/verify$/, audit.verify],
  ['POST', /^cases\/([\w-]+)\/appointments$/, (x, m) => cases.addAppointment(x, m[1])],
  ['POST', /^cases\/([\w-]+)\/invoice$/, (x, m) => cases.issueInvoice(x, m[1])],
  ['POST', /^appointments\/([\w-]+)$/, (x, m) => cases.updateAppointment(x, m[1])],
  ['GET', /^clients$/, clients.list],
  ['POST', /^clients$/, clients.create],
  ['GET', /^clients\/([\w-]+)$/, (x, m) => clients.detail(x, m[1])],
  ['POST', /^clients\/([\w-]+)\/update$/, (x, m) => clients.update(x, m[1])],
  ['POST', /^clients\/([\w-]+)\/note$/, (x, m) => clients.addNote(x, m[1])],
  ['GET', /^clients\/([\w-]+)\/export$/, (x, m) => clients.exportData(x, m[1])],
  ['POST', /^clients\/([\w-]+)\/anonymise$/, (x, m) => clients.anonymise(x, m[1])],
  ['GET', /^providers$/, providers.list],
  ['POST', /^providers$/, providers.create],
  ['GET', /^providers\/([\w-]+)$/, (x, m) => providers.detail(x, m[1])],
  ['POST', /^providers\/([\w-]+)\/update$/, (x, m) => providers.update(x, m[1])],
  ['GET', /^invoices$/, billing.listInvoices],
  ['GET', /^invoices\/([\w-]+)$/, (x, m) => billing.invoiceDetail(x, m[1])],
  ['POST', /^invoices\/([\w-]+)\/status$/, (x, m) => billing.setStatus(x, m[1])],
  ['POST', /^invoices\/([\w-]+)\/resend$/, (x, m) => billing.resend(x, m[1])],
  ['GET', /^payments$/, billing.listPayments],
  ['GET', /^accounts\/summary$/, accounts.summary],
  ['GET', /^accounts\/export$/, accounts.exportCsv],
  ['GET', /^services$/, services.list],
  ['POST', /^services$/, services.create],
  ['POST', /^services\/(.+)\/update$/, (x, m) => services.update(x, decodeURIComponent(m[1]))],
  ['GET', /^settings$/, settings.get],
  ['POST', /^settings$/, settings.save],
  ['POST', /^settings\/test-email$/, settings.testEmail],
  ['POST', /^settings\/test-payments$/, settings.testPayments],
  ['GET', /^staff$/, staffApi.listFull],
  ['GET', /^staff-lite$/, staffApi.listLite],
  ['POST', /^staff$/, staffApi.create],
  ['POST', /^staff\/([\w-]+)\/update$/, (x, m) => staffApi.update(x, m[1])],
  ['GET', /^audit$/, audit.list]
];

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return fail(503, 'The database is not set up yet.');
  try {
    await ensureSchema(env.DB);
    const url = new URL(request.url), method = request.method;
    const path = (params.path || []).map(decodeURIComponent).join('/');
    const who = await resolveStaff(request, env, path);
    if (!who.staff) return json({ ok: false, error: who.error, code: who.code }, who.status);
    if (method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'Cross-site request refused.');
    let body = {};
    if (method === 'POST') { try { body = await readJson(request, 60000); } catch (e) { return fail(400, 'Invalid request.'); } }
    const x = { context, request, env, url, staff: who.staff, body };
    for (const [m, re, fn] of ROUTES) {
      const hit = m === method && re.exec(path);
      if (hit) return await fn(x, hit);
    }
    return fail(404, 'Not found.');
  } catch (e) {
    console.error('admin api error', e && e.message);
    return fail(500, 'Something went wrong. Please try again.');
  }
}
