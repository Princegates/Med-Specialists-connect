import { can } from '../perms.js';
import { getSetting, getFlags, getSecret } from '../settings.js';
import { emailReady } from '../email.js';
import { json } from '../http.js';

// The numbers an owner wants first thing: what needs doing, what is owed, what came in.
export async function dashboard(x) {
  const db = x.env.DB, out = { ok: true };
  if (can(x.staff, 'cases.view')) {
    out.cases = {
      open: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status NOT IN ('closed', 'completed', 'cancelled')").first()).c,
      safety: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'safety_escalation'").first()).c,
      awaitingPayment: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'awaiting_payment'").first()).c,
      overdueActions: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status NOT IN ('closed', 'completed', 'cancelled') AND next_action_due IS NOT NULL AND next_action_due < ?").bind(new Date().toISOString()).first()).c,
      myTasks: (await db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status = 'open' AND assignee = ?").bind(x.staff.id).first()).c,
      unassigned: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE assigned_to IS NULL AND status NOT IN ('closed', 'completed', 'cancelled')").first()).c,
      urgent: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE (urgency LIKE 'Urgent%' OR priority IN ('high', 'emergency')) AND status NOT IN ('closed', 'completed', 'cancelled')").first()).c,
      mine: (await db.prepare("SELECT COUNT(*) AS c FROM requests WHERE assigned_to = ? AND status NOT IN ('closed', 'completed', 'cancelled')").bind(x.staff.id).first()).c,
      today: (await db.prepare('SELECT COUNT(*) AS c FROM requests WHERE created_at >= ?').bind(new Date().toISOString().slice(0, 10)).first()).c
    };
    out.upcoming = (await db.prepare("SELECT a.id, a.scheduled_at, a.status, a.request_id, p.name AS provider_name FROM appointments a LEFT JOIN providers p ON p.id = a.provider_id WHERE a.scheduled_at >= ? AND a.status IN ('requested', 'awaiting_provider', 'confirmed') ORDER BY a.scheduled_at LIMIT 8").bind(new Date().toISOString()).all()).results;
  }
  if (can(x.staff, 'accounts.view') || can(x.staff, 'billing.view')) {
    const days = Number(await getSetting(x.env, 'overdue_days')) || 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const month = new Date().toISOString().slice(0, 7);
    out.money = {
      collectedThisMonth: (await db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM payments WHERE received_at >= ?').bind(month).first()).t,
      outstanding: (await db.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM invoices WHERE status = 'issued'").first()).t,
      overdueCount: (await db.prepare("SELECT COUNT(*) AS c FROM invoices WHERE status = 'issued' AND created_at < ?").bind(cutoff).first()).c
    };
  }
  if (can(x.staff, 'providers.view')) {
    const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    out.expiringCredentials = (await db.prepare("SELECT provider_id AS id, (SELECT name FROM providers WHERE id = provider_id) AS name, MIN(expires_on) AS credential_expiry FROM provider_credentials WHERE expires_on IS NOT NULL AND expires_on <= ? AND result != 'rejected' AND provider_id IN (SELECT id FROM providers WHERE verification IN ('active', 'expiring_soon', 'expired')) GROUP BY provider_id ORDER BY credential_expiry LIMIT 8").bind(soon).all()).results;
  }
  if (can(x.staff, 'settings.view')) {
    const f = await getFlags(x.env);
    out.setup = {
      billingEnabled: f.billingEnabled, pricesConfirmed: f.pricesConfirmed,
      emailReady: await emailReady(x.env), emailVerified: (await getSetting(x.env, 'email_verified')) === 'true',
      paymentsKey: !!(await getSecret(x.env, 'paystack_secret_key')), paymentsVerified: (await getSetting(x.env, 'payments_verified')) === 'true',
      encryptionKey: !!x.env.SETTINGS_ENC_KEY && String(x.env.SETTINGS_ENC_KEY).length >= 24
    };
    out.emailFailures = (await db.prepare('SELECT COUNT(*) AS c FROM email_log WHERE ok = 0 AND at >= ?').bind(new Date(Date.now() - 7 * 86400000).toISOString()).first()).c;
  }
  return json(out);
}
