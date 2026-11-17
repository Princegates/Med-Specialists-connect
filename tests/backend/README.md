# Backend tests

These check the billing backend (requests, invoices, Paystack payments, admin sign-in) against a local copy of
the Cloudflare runtime, a mock Paystack and a mock Cloudflare Access key service. Nothing here touches your real
accounts.

## Run them

1. In a scratch folder outside the repository, copy the site (everything except `.git`) and add a `wrangler.toml`:

   ```toml
   name = "meds-test"
   compatibility_date = "2024-11-01"
   pages_build_output_dir = "."

   [[d1_databases]]
   binding = "DB"
   database_name = "meds"
   database_id = "local-test"
   ```

2. Add a `.dev.vars` file with test settings:

   ```
   BILLING_ENABLED=true
   PRICES_CONFIRMED=false
   PAYSTACK_SECRET_KEY=sk_test_local_secret
   PAYSTACK_BASE=http://127.0.0.1:9001
   SITE_URL=http://127.0.0.1:8788
   CF_ACCESS_TEAM_DOMAIN=test.cloudflareaccess.com
   CF_ACCESS_AUD=aud-123
   ACCESS_CERTS_URL=http://127.0.0.1:9002/certs
   ADMIN_EMAILS=boss@example.com
   ```

3. Create the local database: `npx wrangler d1 execute meds --local --file=migrations/0001_init.sql`
4. In another terminal: `node tests/backend/mocks.js` (starts the mock Paystack and the mock sign-in keys).
5. Start the site: `npx wrangler pages dev . --port 8788 --ip 127.0.0.1`
6. Run `node tests/backend/phaseA.js` (prices not confirmed).
7. Stop the site, set `PRICES_CONFIRMED=true` in `.dev.vars`, start it again, then run
   `node tests/backend/phaseB.js` (payments) and `node tests/backend/ui.js` (browser checks; needs the
   `playwright` and `axe-core` packages).

Expected: phase A 40 passed, phase B 27 passed, browser checks 28 passed.
