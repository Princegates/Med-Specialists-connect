import { getFlags } from '../_lib/settings.js';
import { json } from '../_lib/http.js';

// Tells the website whether the billing system is switched on. Nothing secret is returned.
export async function onRequestGet({ env }) {
  try { return json(await getFlags(env)); } catch (e) { return json({ billingEnabled: false, pricesConfirmed: false }); }
}
