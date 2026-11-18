# Platform audit: security, privacy, reliability and improvements

Date: 18 November 2026. Scope: the public website, the request, invoice and payment flow, the staff console and its
API, sign-in, the database, and how the code is deployed. Method: reading the code, running the 420 automated checks (266 for the backend, 154 in the browser),
and testing suspected problems on a local copy. Not covered: your live Cloudflare, Paystack and email-provider
settings (those can only be checked from your accounts), and a penetration test by an outside party.

## What is already good
- **Payments are verified, not trusted.** The browser's "I paid" is never believed. The signed Paystack message
  (HMAC-SHA512, compared in constant time) or a direct check with Paystack is, and the amount and currency must
  match the invoice. A repeated message changes nothing.
- **No guessable links.** Invoices use random IDs; case references are random; a tracking link needs a reference and a
  24-byte secret, and shows no health details.
- **Strong sign-in basics.** Salted slow-hashed passwords; secure, HttpOnly, same-site session cookie kept hashed in the
  database; lock-out after five wrong tries; authenticator app with recovery codes; sessions ended on switch-off or
  reset; same-origin check on every change; sign-in refusal messages that do not say which part was wrong.
- **Least privilege by role**, enforced on the server (not just by hiding buttons), with health details limited to
  roles that need them.
- **Secrets are encrypted** (AES-GCM) and never sent back to the browser; all changes are in an audit log.
- **Tiny attack surface.** The backend has no third-party code libraries and the site loads no scripts, fonts or
  images from other companies, so there is no supply-chain risk from either.
- **Output safety.** The console builds pages with text, never HTML, so a client's typed words cannot run as code.

## Fixed during this audit
| # | Problem found | Fix |
| --- | --- | --- |
| 1 | **The audit-log tamper check gave false alarms.** Tested with 25 requests at once: 28 of 62 entries looked "broken". | Each entry now takes a numbered place; two arriving together retry instead of colliding. The check now reports real gaps and edits only. Tested with 25 simultaneous requests. |
| 2 | **Two staff pressing "Create invoice" together could make two invoices** for one case. | The database now allows one live invoice per case. Tested: six simultaneous presses make one invoice. |
| 3 | **A payment could be marked paid without its ledger entry** if the second step failed. | Marking paid, the ledger entry and the case update now succeed or fail together. |
| 4 | **An authenticator code could be reused** within its 30 seconds. | Each code now works once. |
| 5 | **A locked account answered differently** from an unknown one, revealing which emails exist. | Both now answer identically. |
| 6 | **No browser-side protections.** No content policy, so injected code would have run. | Strict Content-Security-Policy (own scripts only, no framing, no plugins), HSTS, Permissions-Policy and cross-origin isolation on every page. The page-start script moved into a file to allow this. |
| 7 | **Invoice and tracking pages could be kept on a shared phone** by the offline feature. | They are never stored, and are marked do-not-store. |
| 8 | **Every request was also copied to a third-party form service** (including the health note). | When your own system has emailed the team, the copy is no longer sent. |

## Do next: security (highest value first)
1. **Protect against bots and guessing at the edge (Cloudflare).** The app limits requests per phone number only, and
   has no per-address limit on sign-in. Add a Cloudflare rate-limiting rule for `/api/auth/*` and `/api/request`, and
   add **Turnstile** (free) to the request and call-back forms. This also stops someone locking the super
   administrator out by repeatedly entering a wrong password.
2. **Lock down your accounts.** Turn on two-step sign-in for Cloudflare, GitHub, Paystack, your email provider and the
   email account that owns the domain. A takeover of any of these bypasses everything in the code.
3. **Remove `SETUP_CODE` now** that set-up is finished, and delete the unused `CF_ACCESS_*` and `ADMIN_EMAILS`
   variables. Keep the encryption key in a password manager (if it is lost, saved keys and authenticator keys cannot
   be recovered; there is no key-rotation tool yet).
4. **Protect `main`.** In GitHub, require a pull request and a passing test run before changes reach `main`. Two
   sessions have pushed straight to `main` and one overwrote the other's design. Add a GitHub Action that runs the
   two test suites on every change.
5. **Restrict where the console can be opened from.** A Cloudflare WAF rule limiting `/admin*` to Ghana (or to your
   office addresses), or Cloudflare Access as a second lock, shrinks exposure a great deal.
6. **Sessions.** Add an idle timeout (today: fixed 12 hours), a "your signed-in devices" list with sign-out, and an
   alert email on a sign-in from a new device. Record the address and device in the audit log for sign-ins.
7. **Passwords.** The platform's host caps the password-hashing cost at 100,000 rounds, below today's guidance for
   this method. That is why two-step sign-in is required for powerful roles and should stay on for everyone with
   access to patient data (Settings, Security: choose "Every staff member"). Add a breached-password check.
8. **Make the audit log harder to quietly rewrite.** It detects edits, but someone with database write access could
   rebuild the whole chain. Email yourself a daily fingerprint of the latest entry (or store it outside the database).
9. **Record-level access.** Every coordinator can see every case and client. The requirements document asks for
   access limited to a person's own and unassigned cases. Add that scope, with a supervisor override that is logged.
10. **Tracking links.** They never expire. Expire them 90 days after a case closes and let staff re-issue one.
11. **Webhook hygiene.** Keep test and live Paystack keys strictly separate; after go-live, rotate the live key if it
    was ever pasted anywhere else, and confirm Paystack's webhook log shows only 200 responses.

## Privacy and legal (Ghana Data Protection Act, 2012, Act 843). Check with a lawyer; this is not legal advice
- Register with the **Data Protection Commission** as a data controller, and name a person responsible.
- Health information is **special personal data**: keep the privacy notice, consent wording and the terms reviewed by a
  lawyer before real patients use the site. The platform already records consent with a version number.
- **Retention:** decide how long closed cases, health notes and contact details are kept, and add an automatic
  clean-up (today they are kept until a person anonymises a client).
- **Cross-border:** Cloudflare, your email provider and Paystack process data outside Ghana. Say so in the privacy
  notice and use their data-processing terms. Move the remaining Web3Forms-based forms (call-back, doctor referral,
  hospital enquiry) to your own backend so no health-related text goes to a third party.
- Write a short **breach procedure**: who is told, within what time, and how patients are notified.
- Consider encrypting the free-text health note field individually, so a leaked database copy does not expose it.

## Reliability and operations
- **Backups:** D1 can restore to a point in the last 30 days, but schedule your own weekly export to storage you control
  and practise one restore. Without a tested restore you do not really have a backup.
- **Monitoring:** turn on Cloudflare notifications for deployment failures and error spikes, and add an uptime check on
  the website and on `/api/config`. Today a failing page would be noticed only by a patient.
- **Reconcile payments daily** against Paystack, to catch a payment whose webhook was missed.
- **Scheduled jobs** (overdue-invoice reminders, appointment reminders, credential-expiry emails, retention clean-up)
  need a small separate Cloudflare Worker with cron triggers, because Pages itself cannot run schedules.
- **Email deliverability:** set SPF, DKIM and a DMARC policy on your domain so invoices do not land in spam and nobody
  can send mail pretending to be you.
- **Lists** show up to 200 rows; add paging and a faster search once volume grows.

## Product improvements worth building
1. **Patient sign-in with a one-time code** to see their cases, invoices and appointments, and upload documents
   (private file storage with expiry).
2. **WhatsApp and SMS reminders** for appointments and unpaid invoices, using the number patients already prefer.
3. **Quote approval online**: staff send a price, the client approves it on the tracking page, then pays.
4. **Provider portal**: a doctor or clinic confirms or declines a request and manages their own availability.
5. **Duplicate detection and merge** of clients and cases, and refunds with an approval step.
6. **Complaints and satisfaction follow-up** after each completed case, feeding the reports.
7. **A public network page that updates itself** from providers who have agreed to be listed (a switch per provider).
8. **Staff notifications** when a case is assigned, escalated or overdue; a service-level timer on the dashboard.
9. **Twi and other Ghanaian-language support** for the request form and key pages.
10. Run an **assistive-technology check** (screen reader on phone and laptop) and a usability test with five patients,
    including older people, to complement the automated accessibility checks, which pass.

## What I could not check
Live Cloudflare settings (WAF, rate limits, Access, bot protection, notifications), your Paystack and email-provider
configuration, your domain's mail records, and whether your accounts have two-step sign-in. A short review of those with
you would close most of the remaining risk.
