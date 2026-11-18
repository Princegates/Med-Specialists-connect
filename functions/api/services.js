import { getServices } from '../_lib/services.js';
import { detailsFor, visitMode } from '../_lib/packages.js';
import { json, fail } from '../_lib/http.js';

// GET /api/services: the services on offer, with their current price and, for the laboratory packages, what each one
// includes. The website uses this to show people exactly what they are choosing. Nothing private is returned.
export async function onRequestGet({ env }) {
  if (!env.DB) return fail(503, 'Not available.');
  try {
    const list = await getServices(env);
    return json({
      ok: true,
      services: list.map((s) => ({
        value: s.value, label: s.label, billing: s.billing,
        price: s.billing === 'fixed' ? s.lines.reduce((t, l) => t + l.amount, 0) : null,
        details: detailsFor(s.value),
        visit: visitMode(s.value)
      }))
    });
  } catch (e) { return fail(500, 'Not available.'); }
}
