export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }
  });
}
export const fail = (status, error) => json({ ok: false, error }, status);

export async function readJson(request, maxBytes = 20000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('too large');
  return JSON.parse(text || '{}');
}

export const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

// Runs follow-up work (emails) after the response has been sent, without letting a failure affect the visitor.
export function later(context, promise) {
  const p = Promise.resolve(promise).catch(() => {});
  if (context && typeof context.waitUntil === 'function') context.waitUntil(p);
  return p;
}
