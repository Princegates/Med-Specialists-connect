// A record of who did what. Values of secrets are never written here.
// Each event carries a sequence number and a fingerprint of the one before it, so a removed or edited entry can be
// detected (see verifyChain). The unique sequence number means two events written at the same moment cannot both
// take the same place: the second one simply tries again.
async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const material = (prev, seq, at, actor, entity, entityId, action, detail) => [prev, seq, at, actor || '', entity, entityId || '', action, detail || ''].join('|');

export async function audit(env, actor, entity, entityId, action, detail) {
  const at = new Date().toISOString(), text = detail ? String(detail).slice(0, 1000) : null;
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const last = await env.DB.prepare('SELECT seq, hash FROM activity WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1').first();
      const seq = last ? last.seq + 1 : 1, prev = last ? last.hash : '';
      const hash = await sha(material(prev, seq, at, actor, entity, entityId, action, text));
      try {
        await env.DB.prepare('INSERT INTO activity (at, actor, entity, entity_id, action, detail, prev_hash, hash, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(at, actor || null, entity, entityId || null, action, text, prev, hash, seq).run();
        return;
      } catch (e) {
        if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e; // someone else took this place: try the next one
      }
    }
    // Could not get a place after many tries: still keep the event, outside the chain, rather than lose it.
    await env.DB.prepare('INSERT INTO activity (at, actor, entity, entity_id, action, detail) VALUES (?, ?, ?, ?, ?, ?)').bind(at, actor || null, entity, entityId || null, action, text).run();
  } catch (e) { /* never let logging break the action itself */ }
}

// Walks the chain in order and reports the first entry that does not fit (older entries without a sequence number are skipped).
export async function verifyChain(env) {
  const { results } = await env.DB.prepare('SELECT seq, at, actor, entity, entity_id, action, detail, prev_hash, hash FROM activity WHERE seq IS NOT NULL ORDER BY seq ASC').all();
  let prev = '', expected = 1, checked = 0;
  for (const r of results) {
    if (r.seq !== expected) return { ok: false, checked, brokenAt: expected, reason: 'An entry is missing from the log.' };
    if (r.prev_hash !== prev) return { ok: false, checked, brokenAt: r.seq, reason: 'This entry does not follow the one before it.' };
    if ((await sha(material(r.prev_hash, r.seq, r.at, r.actor, r.entity, r.entity_id, r.action, r.detail))) !== r.hash) return { ok: false, checked, brokenAt: r.seq, reason: 'This entry was changed.' };
    prev = r.hash; expected++; checked++;
  }
  return { ok: true, checked };
}
