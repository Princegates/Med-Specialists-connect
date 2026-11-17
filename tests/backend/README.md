# Backend tests

End-to-end checks run against the real Pages Functions with `wrangler pages dev`, a fresh local D1 database and three mock services
(Paystack on :9001, Cloudflare Access keys on :9002, email provider on :9003).

1. Copy the repo to a scratch folder with a `wrangler.toml` (D1 binding `DB`, database name `meds`) and a `.dev.vars` containing:
   `SETTINGS_ENC_KEY`, `PAYSTACK_BASE=http://127.0.0.1:9001`, `EMAIL_API_BASE=http://127.0.0.1:9003`, `CF_ACCESS_TEAM_DOMAIN=test.cloudflareaccess.com`, `CF_ACCESS_AUD=aud-123`, `ACCESS_CERTS_URL=http://127.0.0.1:9002/certs`, `ADMIN_EMAILS=boss@example.com`.
2. `node tests/backend/mocks.js &` then `npx wrangler pages dev . --port 8788 --local`.
3. `node tests/backend/console.js` (API: expected 199 checks) then `node tests/backend/ui.js` (browser; needs Playwright and axe-core; expected 48 checks).
