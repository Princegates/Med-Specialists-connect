# Setting up the staff console, billing and payments

The backend lives in `functions/` and runs on Cloudflare Pages with a D1 database. Nothing is switched on until you do it
from the staff console, so deploying this is safe: the website keeps emailing requests exactly as before.

## 1. One-time Cloudflare set-up
1. **D1 database.** Workers & Pages → D1 → Create a database. Then Pages project → Settings → Bindings → add a D1 binding named `DB` pointing at it (Production).
2. **Encryption key.** Settings → Variables and Secrets → add a **secret** `SETTINGS_ENC_KEY`: at least 24 random characters. API keys and authenticator keys saved in the platform are encrypted with it. Keep a copy somewhere safe.
3. **Set-up code.** Add a second **secret** `SETUP_CODE`: at least 12 random characters. It is needed once, to create the owner account, and stops anyone else claiming the platform first.
4. Redeploy. The database tables create themselves the first time the platform is opened.

The platform has its own sign-in, so Cloudflare Access is **not** needed. If you created an Access application for `/admin*` earlier, delete it (or keep it only if you want a second lock in front, in which case staff sign in twice).

## 2. Create the super administrator account
Open `https://www.medspecialistconnect.com/admin/`. On a new platform you will see **Set up your platform**: enter the set-up code, your name, your email and a password (at least 10 characters). You become the **super administrator** and are taken straight to setting up an authenticator app (Google Authenticator, Microsoft Authenticator or Authy) and saving eight one-time recovery codes. Once a super administrator exists, the set-up page can never be used again.

Add everyone else under **Staff**: you are shown a one-time password for each person, which you give them in person or by phone. They choose their own password at first sign-in. The super administrator can do everything and is the only role that can create, change, reset or switch off other super administrators and owners (business directors, who have full access to the business but cannot touch the super administrators). There is always at least one active super administrator, so the platform cannot lock itself out. Other roles: supervisor, coordinator, finance, network manager, compliance, management (read-only), administrator.

Security built in: passwords are salted and slow-hashed; five wrong tries lock an account for 15 minutes; owners, supervisors, finance and administrators must use an authenticator app (Settings → Security); sessions last 12 hours; switching someone off or resetting their password signs them out everywhere; every sign-in, failure and reset is in the audit log. If someone loses their phone they use a recovery code, or the owner resets their authenticator under Staff.

## 3. Switch on, from the console
Go to **Settings** and work down the Dashboard go-live checklist:
1. **Email**: choose Resend, Brevo or SendGrid, paste the API key, set the sender address (on a domain you verified with that provider), save, press *Send a test email*.
2. **Payments**: paste your Paystack **test** secret key, save, press *Test the Paystack connection*. In Paystack set the webhook URL shown on that page.
3. **Services and prices**: replace the placeholder prices with your real fees, then turn on **Prices are confirmed** (Settings → Billing and prices).
4. **Billing and prices → Online requests, invoices and payment are switched on**.
5. Make one real test request on the website with the test key; pay with a Paystack test card/number; confirm the invoice shows paid and a receipt email arrives.
6. When satisfied, replace the test key with your live key and test again.

The `CF_ACCESS_*` and `ADMIN_EMAILS` variables are no longer used. Environment variables (`BILLING_ENABLED`, `PRICES_CONFIRMED`, `SITE_URL`, `PAYSTACK_SECRET_KEY`, `EMAIL_API_KEY`) still work as fallbacks, but anything saved in the console takes priority.

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
