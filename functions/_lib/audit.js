// A record of who did what. Values of secrets are never written here.
// Each event carries a fingerprint of the one before it, so a removed or edited entry can be detected (see verifyChain).
async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const material = (prev, at, actor, entity, entityId, action, detail) => [prev, at, actor || '', entity, entityId || '', action, detail || ''].join('|');

export async function audit(env, actor, entity, entityId, action, detail) {
  try {
    const at = new Date().toISOString(), text = detail ? String(detail).slice(0, 1000) : null;
    const last = await env.DB.prepare('SELECT hash FROM activity ORDER BY id DESC LIMIT 1').first();
    const prev = (last && last.hash) || '';
    const hash = await sha(material(prev, at, actor, entity, entityId, action, text));
    await env.DB.prepare('INSERT INTO activity (at, actor, entity, entity_id, action, detail, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(at, actor || null, entity, entityId || null, action, text, prev, hash).run();
  } catch (e) { /* never let logging break the action itself */ }
}

// Walks the log and reports the first entry whose fingerprint does not match (entries from before hashing are skipped).
export async function verifyChain(env) {
  const { results } = await env.DB.prepare('SELECT id, at, actor, entity, entity_id, action, detail, prev_hash, hash FROM activity WHERE hash IS NOT NULL ORDER BY id ASC').all();
  let prev = null, checked = 0;
  for (const r of results) {
    if (prev !== null && r.prev_hash !== prev) return { ok: false, checked, brokenAt: r.id, reason: 'An earlier entry is missing or changed.' };
    if ((await sha(material(r.prev_hash || '', r.at, r.actor, r.entity, r.entity_id, r.action, r.detail))) !== r.hash) return { ok: false, checked, brokenAt: r.id, reason: 'This entry was changed.' };
    prev = r.hash; checked++;
  }
  return { ok: true, checked };
}
