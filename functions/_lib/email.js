import { getSetting, getSecret } from './settings.js';
import { formatMoney } from './catalogue.js';

const BASES = { resend: 'https://api.resend.com', brevo: 'https://api.brevo.com', sendgrid: 'https://api.sendgrid.com' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function emailReady(env) {
  const p = await getSetting(env, 'email_provider');
  return !!p && p !== 'none' && !!(await getSecret(env, 'email_api_key')) && !!(await getSetting(env, 'email_from_address'));
}

// Sends one email through the provider chosen in Settings, and logs the outcome. Never throws.
export async function sendEmail(env, { to, subject, text, html, kind }) {
  const list = (Array.isArray(to) ? to : String(to || '').split(',')).map((x) => x.trim()).filter(Boolean);
  const log = async (ok, error) => {
    try {
      await env.DB.prepare('INSERT INTO email_log (at, kind, recipient, subject, ok, error) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(new Date().toISOString(), kind || null, list.join(', ').slice(0, 300), String(subject || '').slice(0, 200), ok ? 1 : 0, error ? String(error).slice(0, 300) : null).run();
    } catch (e) { /* logging must never break sending */ }
  };
  if (!list.length) return { ok: false, error: 'There is no recipient.' };
  const provider = await getSetting(env, 'email_provider');
  const key = await getSecret(env, 'email_api_key');
  const from = await getSetting(env, 'email_from_address');
  const name = (await getSetting(env, 'email_from_name')) || 'MEDs Specialists Connect';
  const reply = await getSetting(env, 'email_reply_to');
  if (!provider || provider === 'none' || !key || !from) { await log(false, 'Email is not set up.'); return { ok: false, error: 'Email is not set up yet.' }; }

  const base = env.EMAIL_API_BASE || BASES[provider];
  let url, headers, body;
  if (provider === 'resend') {
    url = `${base}/emails`; headers = { Authorization: `Bearer ${key}` };
    body = { from: `${name} <${from}>`, to: list, subject, text, html, ...(reply ? { reply_to: reply } : {}) };
  } else if (provider === 'brevo') {
    url = `${base}/v3/smtp/email`; headers = { 'api-key': key };
    body = { sender: { name, email: from }, to: list.map((email) => ({ email })), subject, textContent: text, htmlContent: html, ...(reply ? { replyTo: { email: reply } } : {}) };
  } else {
    url = `${base}/v3/mail/send`; headers = { Authorization: `Bearer ${key}` };
    body = { personalizations: [{ to: list.map((email) => ({ email })) }], from: { email: from, name }, subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }], ...(reply ? { reply_to: { email: reply } } : {}) };
  }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!r.ok) {
      let msg = ''; try { msg = (await r.text()).slice(0, 160); } catch (e) { /* ignore */ }
      await log(false, `HTTP ${r.status} ${msg}`);
      return { ok: false, error: `The email service refused the message (HTTP ${r.status}). Check the API key and that the sender address is verified.` };
    }
    await log(true);
    return { ok: true };
  } catch (e) {
    await log(false, 'Network error');
    return { ok: false, error: 'Could not reach the email service.' };
  }
}

async function layout(env, title, inner) {
  const biz = (await getSetting(env, 'business_name')) || 'MEDs Specialists Connect';
  const phone = (await getSetting(env, 'business_phone')) || '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d2230">` +
    `<h2 style="color:#c8003f;margin:0 0 16px">${esc(biz)}</h2><h3 style="margin:0 0 12px">${esc(title)}</h3>${inner}` +
    `<p style="color:#666;font-size:13px;margin-top:24px">${esc(phone)}</p></div>`;
}

async function loadInvoice(env, invoiceId) {
  return env.DB.prepare(
    'SELECT i.id, i.number, i.total, i.status, i.paid_at, i.lines, r.name, r.email, r.service FROM invoices i JOIN requests r ON r.id = i.request_id WHERE i.id = ?'
  ).bind(invoiceId).first();
}
const siteOf = async (env) => ((await getSetting(env, 'site_url')) || '').replace(/\/$/, '');

export async function emailInvoice(env, invoiceId) {
  if (!(await emailReady(env)) || (await getSetting(env, 'send_invoice_email')) !== 'true') return { skipped: true };
  const inv = await loadInvoice(env, invoiceId);
  if (!inv || !inv.email) return { skipped: true };
  const link = `${await siteOf(env)}/invoice?id=${inv.id}`;
  const lines = JSON.parse(inv.lines).map((l) => `<tr><td style="padding:4px 12px 4px 0">${esc(l.description)}</td><td style="text-align:right">${esc(formatMoney(l.amount))}</td></tr>`).join('');
  return sendEmail(env, {
    to: inv.email, kind: 'invoice', subject: `Your invoice ${inv.number}`,
    text: `Hello ${inv.name},\n\nYour invoice ${inv.number} for ${formatMoney(inv.total)} is ready. View and pay it here:\n${link}\n`,
    html: await layout(env, `Invoice ${inv.number}`, `<p>Hello ${esc(inv.name)},</p><table style="width:100%;border-collapse:collapse">${lines}</table><p><strong>Total ${esc(formatMoney(inv.total))}</strong></p><p><a href="${esc(link)}" style="background:#c8003f;color:#fff;padding:10px 18px;border-radius:20px;text-decoration:none">View and pay your invoice</a></p>`)
  });
}

export async function emailReceipt(env, invoiceId) {
  if (!(await emailReady(env)) || (await getSetting(env, 'send_receipt_email')) !== 'true') return { skipped: true };
  const inv = await loadInvoice(env, invoiceId);
  if (!inv || !inv.email) return { skipped: true };
  const link = `${await siteOf(env)}/invoice?id=${inv.id}`;
  return sendEmail(env, {
    to: inv.email, kind: 'receipt', subject: `Receipt for invoice ${inv.number}`,
    text: `Hello ${inv.name},\n\nThank you. We received your payment of ${formatMoney(inv.total)} for invoice ${inv.number}.\nYou can print or save your receipt here: ${link}\n`,
    html: await layout(env, 'Payment received', `<p>Hello ${esc(inv.name)},</p><p>Thank you. We received your payment of <strong>${esc(formatMoney(inv.total))}</strong> for invoice ${esc(inv.number)}.</p><p><a href="${esc(link)}">View or print your receipt</a></p>`)
  });
}

export async function emailTeamNewRequest(env, r) {
  if (!(await emailReady(env)) || (await getSetting(env, 'notify_new_request')) !== 'true') return { skipped: true };
  const to = (await getSetting(env, 'email_notify_to')) || (await getSetting(env, 'business_email'));
  const urgent = !!r.emergency || /^Urgent/.test(r.urgency || '');
  // Minimum necessary: by default the email names the case, not the patient. Staff open the console (sign-in, role checks and an access log) for the details.
  const full = (await getSetting(env, 'email_include_details')) === 'true';
  const rows = (full
    ? [['Case reference', r.ref], ['Service', r.serviceLabel], ['Visit', r.visit], ['Name', r.name], ['Phone', r.phone], ['Email', r.email], ['Urgency', r.urgency], ['For', r.for_whom], ['Area', r.area], ['Preferred date', r.preferred_date], ['Best time to call', r.call_time], ['Note', r.message], ['Invoice', r.invoiceNumber]]
    : [['Case reference', r.ref], ['Service', r.serviceLabel], ['Visit', r.visit], ['Urgency', r.urgency], ['Invoice', r.invoiceNumber]]).filter((x) => x[1]);
  return sendEmail(env, {
    to, kind: 'team', subject: `${r.emergency ? '[EMERGENCY FLAG] ' : urgent ? '[URGENT] ' : ''}New request${r.ref ? ' ' + r.ref : ''}: ${r.serviceLabel}${full ? ' from ' + r.name : ''}`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (full ? '' : '\nOpen the admin console to see the patient details.'),
    html: await layout(env, 'New care request', `<table>${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p><a href="${esc(await siteOf(env))}/admin/">Open the admin console</a></p>`)
  });
}
