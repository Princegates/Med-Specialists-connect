# MEDs Specialists Connect

The website and staff platform for MEDs Specialists Connect, a healthcare coordination service in Accra. Patients and
families ask for care, doctors refer patients, hospitals and clinics get in touch about specialized units, and the
team runs every case from the staff console.

It runs on **Cloudflare Pages** with **Pages Functions** and a **D1** database. There is no build step: the repository
root is the site.

## What is where

| Path | What it is |
| --- | --- |
| `index.html`, `network.html`, `privacy.html`, `disclaimer.html` | The public website. Styled by `site.css` alone; behaviour in `script.js`. |
| `offline.html`, `sw.js`, `manifest.webmanifest` | Lets the site install like an app and open without a connection. |
| `track.html`, `invoice.html` (+ `.js`, `invoice.css`) | A patient's private tracking page and invoice page. These use `styles.css`. |
| `admin/` | The staff console and its sign-in page. |
| `functions/api/` | The backend: requests, tracking, invoices, Paystack payments and webhook, staff sign-in, admin API. |
| `functions/_lib/` | Shared backend code: database migrations (`schema.js`), auth, permissions, email, audit log. |
| `migrations/0001_init.sql` | Reference copy of the first schema. The live database migrates itself on first use. |
| `docs/BILLING_SETUP.md` | How to switch on email, payments and billing from the console. |
| `tests/backend/` | End-to-end tests for the backend (API) and the browser (site and console). |
| `assets/` | Logo, icons, photos and self-hosted fonts. |

`_redirects` sends `/functions`, `/migrations`, `/docs`, `/tests` and this README to the home page, because Pages serves
the whole repository root.

## The public site's design

"Follow the line": in a hospital you find your way by signs and coloured lines on the floor, and MEDs is the line a
patient follows. The home page opens on a "You are here" marker and a lobby-style directory board for choosing a
service; a route line runs down the page and fills as you read, with a station at each section. Line colours mean
something: pink for patients and families, green for doctors, blue for hospitals and clinics, and signal yellow only
for emergency notices.

- Headings: **Overpass** (descended from US highway signage lettering). Reading text: **Atkinson Hyperlegible Next**
  (made by the Braille Institute for low-vision readers). Both are self-hosted under the SIL Open Font License.
- Display options (text size, high contrast, easy-to-read letters, less movement) are saved on the visitor's device.
- Motion is one arrival moment, the route line, and transitions that answer what the visitor does (the day/night
  switch, the request form's steps, questions opening, moving between pages). All of it is off for "Less movement"
  and for devices set to reduce motion.

## Running it locally

You need Node 18 or newer and Wrangler (`npm i -D wrangler`, or `npx wrangler`).

1. Add a `wrangler.toml` next to `index.html` (it is not committed, since production settings live in Cloudflare):

   ```toml
   name = "meds-local"
   compatibility_date = "2025-01-01"
   pages_build_output_dir = "."

   [[d1_databases]]
   binding = "DB"
   database_name = "meds"
   database_id = "00000000-0000-0000-0000-000000000000"
   ```

2. Add a `.dev.vars` (also not committed):

   ```
   SETTINGS_ENC_KEY=any-local-key-of-at-least-24-characters
   SETUP_CODE=a-local-setup-code
   ```

3. Start it, then open http://localhost:8788 for the site and http://localhost:8788/admin/ for the console:

   ```bash
   npx wrangler pages dev . --port 8788 --local
   ```

The first visit to `/admin/` asks for the set-up code and creates the super administrator.

## Tests

See `tests/backend/README.md`. In short: run the mock payment and email services, start `wrangler pages dev` on a fresh
local database, then run `node tests/backend/console.js` (backend, 261 checks) and, on another fresh database,
`node tests/backend/ui.js` (browser and accessibility, 145 checks; needs Playwright and axe-core).

## Deploying

Connect the repository to a Cloudflare Pages project with no build command and `/` as the output directory, add the
D1 binding `DB` and the secrets `SETTINGS_ENC_KEY` and `SETUP_CODE`, and deploy. `docs/BILLING_SETUP.md` covers the
rest, from creating the first account to taking live payments.

When you change `site.css` or `script.js`, bump the `?v=` number where the pages load them, and `VERSION` in `sw.js`,
so phones that installed the site pick up the new files.
