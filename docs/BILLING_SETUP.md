# Setting up the staff console, billing and payments

The backend lives in `functions/` and runs on Cloudflare Pages with a D1 database. Nothing is switched on until you do it
from the staff console, so deploying this is safe: the website keeps emailing requests exactly as before.

## 1. One-time Cloudflare set-up
1. **D1 database.** Workers & Pages → D1 → Create database `meds`. Then Pages project → Settings → Bindings → add a D1 binding named `DB` pointing at it (Production).
2. **Encryption key.** Pages project → Settings → Variables and Secrets → add a **secret** called `SETTINGS_ENC_KEY`: at least 24 random characters. API keys you save in the console are encrypted with it. Keep a copy somewhere safe: if it is lost, saved keys must be entered again.
3. **Sign-in (Cloudflare Access).** Zero Trust → Access → Applications → Add a self-hosted application for the hostnames `www.medspecialistconnect.com` and `medspecialistconnect.com` with paths `admin*` and `api/admin*`. Add an *Allow* policy listing the staff emails, and turn on one-time PIN or Google sign-in. For staff with sensitive roles, also require multi-factor authentication in the policy.
4. Copy the application's **Audience (AUD) tag** and your **team domain** (`yourteam.cloudflareaccess.com`). Add them as variables `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN`.
5. Optional: `ADMIN_EMAILS` (comma separated). If set, only these emails can become the first owner.
6. Redeploy. The database tables create themselves the first time the console opens.

## 2. First sign-in
Open `https://www.medspecialistconnect.com/admin/`. The first allowed person to sign in becomes the **owner**. Add everyone else under **Staff** (and in the Access policy). Roles: owner, supervisor, coordinator, finance, network manager, compliance, management (read-only), administrator.

## 3. Switch on, from the console
Go to **Settings** and work down the Dashboard go-live checklist:
1. **Email**: choose Resend, Brevo or SendGrid, paste the API key, set the sender address (on a domain you verified with that provider), save, press *Send a test email*.
2. **Payments**: paste your Paystack **test** secret key, save, press *Test the Paystack connection*. In Paystack set the webhook URL shown on that page.
3. **Services and prices**: replace the placeholder prices with your real fees, then turn on **Prices are confirmed** (Settings → Billing and prices).
4. **Billing and prices → Online requests, invoices and payment are switched on**.
5. Make one real test request on the website with the test key; pay with a Paystack test card/number; confirm the invoice shows paid and a receipt email arrives.
6. When satisfied, replace the test key with your live key and test again.

Environment variables (`BILLING_ENABLED`, `PRICES_CONFIRMED`, `SITE_URL`, `PAYSTACK_SECRET_KEY`, `EMAIL_API_KEY`) still work as fallbacks, but anything saved in the console takes priority.

## What the system does
- Website request → client record, patient record, consent record, case with a random reference (`MSC-XXXXXXXX`) and private tracking link (`/track`).
- Emergency flag → case goes to *Safety escalation*, due immediately, never invoiced, team emailed with an `[EMERGENCY FLAG]` subject.
- Fixed-fee services are invoiced at once (once prices are confirmed); quote services are invoiced by staff after agreeing a price. Payment is verified with Paystack (never trusted from the browser) and is idempotent.
- Cases follow the statuses in the requirements document. Every open case needs a next action and date; closing needs a reason and outcome; reopening needs a reason.
- Providers must be verified (credential checked, in date) before they can be proposed or booked. Expired credentials block booking automatically.
- Appointments are only "confirmed" when the provider has confirmed; a change of time keeps the old booking as history.
- The audit log is hash-chained; the Audit page can check it is intact.

## Not built yet (later phases of the requirements document)
Patient sign-in with OTP and document upload, provider portal, SMS/WhatsApp automated reminders, complaints and satisfaction surveys, refunds workflow, dialysis and supplies procurement, multi-branch. Legal review of the privacy notice, terms and disclaimer is needed before payments go live.
