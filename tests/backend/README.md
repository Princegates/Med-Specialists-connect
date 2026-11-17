# Backend tests

End-to-end checks run against the real Pages Functions with `wrangler pages dev`, a fresh local D1 database and three mock services
(Paystack on :9001, email provider on :9003).

1. Copy the repo to a scratch folder with a `wrangler.toml` (D1 binding `DB`, database name `meds`) and a `.dev.vars` containing:
   `SETTINGS_ENC_KEY`, `SETUP_CODE=test-setup-code-1234`, `PAYSTACK_BASE=http://127.0.0.1:9001`, `EMAIL_API_BASE=http://127.0.0.1:9003`.
2. `node tests/backend/mocks.js &` then `npx wrangler pages dev . --port 8788 --local`.
3. `node tests/backend/console.js` (API, expected 261 checks). Then reset to a fresh database and run `node tests/backend/ui.js` (browser, needs Playwright and axe-core, expected 142 checks). Both start from an empty database because they create the owner through the set-up page or API.
