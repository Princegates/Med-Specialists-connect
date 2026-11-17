import { getFlags, getSecret } from '../_lib/settings.js';
import { ensureSchema } from '../_lib/schema.js';
import { CURRENCY } from '../_lib/catalogue.js';
import { markInvoicePaid } from '../_lib/db.js';
import { emailReceipt } from '../_lib/email.js';
import { audit } from '../_lib/audit.js';
import { json, fail, readJson, later } from '../_lib/http.js';

// POST /api/verify {id, reference}: when a patient comes back from checkout, asks Paystack directly
// whether the payment succeeded, so the page updates at once. The webhook is the safety net.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return fail(503, 'Payment checking is not available.');
  await ensureSchema(env.DB);
  const secret = await getSecret(env, 'paystack_secret_key');
  if (!(await getFlags(env)).billingEnabled || !secret) return fail(503, 'Payment checking is not available.');
  let b;
  try { b = await readJson(request); } catch (e) { return fail(400, 'Invalid request.'); }
  const id = String(b.id || ''), reference = String(b.reference || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[A-Za-z0-9._-]{6,80}$/.test(reference)) return fail(400, 'Invalid request.');
  const inv = await env.DB.prepare('SELECT id, number, status, total, request_id FROM invoices WHERE id = ?').bind(id).first();
  if (!inv || !reference.startsWith(inv.number)) return fail(404, 'Invoice not found.');
  if (inv.status === 'paid') return json({ ok: true, status: 'paid' });

  const base = env.PAYSTACK_BASE || 'https://api.paystack.co';
  try {
    const r = await fetch(`${base}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const data = await r.json();
    const t = data && data.data;
    const good = r.ok && data.status && t && t.status === 'success' && t.amount === inv.total && t.currency === CURRENCY && t.metadata && t.metadata.invoice_id === inv.id;
    if (good) {
      if (await markInvoicePaid(env.DB, inv, t.channel, reference)) {
        await audit(env, 'system', 'invoice', inv.id, 'paid', `${t.channel || 'online'} ${reference}`);
        later(context, emailReceipt(env, inv.id));
      }
      return json({ ok: true, status: 'paid' });
    }
    return json({ ok: true, status: inv.status });
  } catch (e) {
    return json({ ok: true, status: inv.status });
  }
}
