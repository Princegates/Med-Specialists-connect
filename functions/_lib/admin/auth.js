import { sessionStaff, mfaRequiredFor } from '../auth.js';
import { ensureSchema } from '../schema.js';

// The signed-in staff member for an admin request, or the reason they cannot continue.
export async function resolveStaff(request, env, path) {
  await ensureSchema(env.DB);
  const s = await sessionStaff(env, request);
  if (!s) return { status: 401, error: 'Please sign in.' };
  if (path !== 'me') {
    if (s.must_change) return { status: 403, error: 'Please choose a new password first.', code: 'must_change' };
    if (!s.totp_enabled && (await mfaRequiredFor(env, s))) return { status: 403, error: 'Please set up your authenticator app first.', code: 'mfa_setup' };
  }
  return { staff: s };
}
