# Billing system: setup and go-live

The billing system stores care requests, issues invoices, takes payment through Paystack and gives staff an
admin page. It is **switched off** until you set it up, so the live website keeps working exactly as it does now.
Order matters: do the steps in sequence, test with Paystack test keys first, and only then go live.

## What you need first

- The real prices (see "Set the prices" below).
- A **Paystack** account for Ghana with business verification done, and Ghana cedi (GHS) payments enabled.
- A Cloudflare account with **Zero Trust** (Access) turned on. The free plan covers up to 50 staff users.
- Someone to review the privacy notice and terms before launch (suggested wording is at the end).

## 1. Create the database

1. Cloudflare dashboard, **Storage & databases, D1 SQL database, Create**. Name it `meds`.
2. Open the database, **Console**, paste the whole contents of `migrations/0001_init.sql`, and run it.

## 2. Connect the database to the website

1. **Workers & Pages**, your project, **Settings, Bindings** (called "Functions" on some accounts), **Add, D1 database**.
2. Variable name: `DB`. Choose the `meds` database. Add it for both Production and Preview.

## 3. Add the settings

**Settings, Variables and secrets.** Add these (mark the key as a *Secret*):

| Name | Value | Notes |
| --- | --- | --- |
| `BILLING_ENABLED` | `true` | Turns the system on. Leave it unset until steps 1 to 5 are done |
| `PRICES_CONFIRMED` | `false` for now | Set to `true` only when the real prices are in place (step 7) |
| `SITE_URL` | `https://www.medspecialistconnect.com` | Where Paystack sends people back to |
| `PAYSTACK_SECRET_KEY` | Your Paystack **test** secret key (`sk_test_...`) | Secret. Swap for the live key at go-live |
| `CF_ACCESS_TEAM_DOMAIN` | For example `yourteam.cloudflareaccess.com` | From Zero Trust, Settings |
| `CF_ACCESS_AUD` | The "Application Audience (AUD) tag" | From step 4 |
| `ADMIN_EMAILS` | Comma-separated staff emails allowed in | Optional extra safety check |

Changes to settings apply to the **next deployment**: after editing, go to Deployments and retry the latest one.

## 4. Protect the staff pages with Cloudflare Access

1. **Zero Trust, Access, Applications, Add an application, Self-hosted**.
2. Add two destinations on `www.medspecialistconnect.com`: path `admin*` and path `api/admin*`.
3. Policy: **Allow**, include the email addresses of your staff. Require one-time PIN or your login provider.
4. Save, then copy the **Application Audience (AUD) tag** into `CF_ACCESS_AUD` (step 3).

Never skip this step: without it nobody can use the admin page, and the code refuses every admin request that
does not carry a valid Access sign-in.

## 5. Connect Paystack

1. Paystack dashboard, **Settings, API Keys & Webhooks**.
2. Set the **Test webhook URL** to `https://www.medspecialistconnect.com/api/paystack-webhook`.
3. Use test cards and test Mobile Money numbers from Paystack's documentation while testing.

## 6. Test (with the test key, prices not confirmed)

- Send a request on the website. It should appear in `/admin`. No invoice is created automatically yet.
- In `/admin`, create an invoice for it. Open the invoice link: it shows a "Test invoice" banner and cannot be paid.
- Send a request for a variable-price service: it appears as "Awaiting quote".

## 7. Set the prices and go live

1. Edit `functions/_lib/catalogue.js`. Amounts are in **pesewas** (GH₵100.00 is `10000`). Replace every placeholder.
   Changing a price only affects invoices created afterwards.
2. Set `PRICES_CONFIRMED` to `true` and retry the deployment.
3. Test again with Paystack test cards: a fixed-fee request should create an invoice at once, and paying it should
   mark it paid (watch `/admin`).
4. Swap in the live `PAYSTACK_SECRET_KEY` and set the **Live webhook URL** in Paystack. Make one small real payment
   and check it reconciles.
5. Update the privacy notice and terms (below), have them reviewed, and publish.

## How it behaves

- **Fixed-fee services** (specialist appointment, insurance claims, hospital admission): invoiced automatically
  once prices are confirmed.
- **Variable-price services**: land as "Awaiting quote". Staff build the invoice in `/admin` with the provider
  charge and the coordination fee as separate lines.
- **Payment** is confirmed only from Paystack's signed notification (or a direct check with Paystack when the
  patient returns). The amount and currency must match. Screenshots are never proof.
- **Manual payments** (cash, bank transfer): staff use "Mark paid" and record a reference.
- **Issued invoices cannot be edited.** To change one, void it and issue a new one. Numbers are never reused.
- **Invoices show the service name only**, never health details. Each invoice link is a long random address.

## Suggested additions to the privacy notice (have a lawyer review)

- *Payments.* "If you pay online, your payment is handled by Paystack, our payment provider. We receive the
  amount, the method used and a payment reference, and we do not see your card details or Mobile Money PIN."
- *Invoices and records.* "We keep a record of your request, the invoice and the payment so we can provide the
  service, answer questions and meet our accounting obligations."
- *Email.* "If you give an email address, we use it to send your invoice and receipt."
- *Service providers.* Add the hosting database to the list of services that help run the site.

Also update the fees paragraph of the terms if the way you charge changes.
