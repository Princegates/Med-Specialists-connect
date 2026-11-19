import { SERVICES } from './catalogue.js';
import { newRef, newToken } from './ids.js';

// The database builds and updates itself: each migration runs once, in order, the first time the backend is used.
// Nothing needs to be pasted into the D1 console.
const MIGRATIONS = [
  {
    id: '0001_init',
    sql: [
      `CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, service TEXT NOT NULL, for_whom TEXT, urgency TEXT, message TEXT, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, preferred_date TEXT, call_time TEXT, area TEXT, status TEXT NOT NULL DEFAULT 'received', notes TEXT)`,
      `CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL REFERENCES requests(id), status TEXT NOT NULL DEFAULT 'issued', currency TEXT NOT NULL DEFAULT 'GHS', total INTEGER NOT NULL, lines TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, paid_at TEXT, pay_ref TEXT, pay_channel TEXT)`,
      `CREATE TABLE IF NOT EXISTS counters (year INTEGER PRIMARY KEY, n INTEGER NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_invoices_request ON invoices(request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_phone ON requests(phone, created_at)`
    ]
  },
  {
    id: '0002_console',
    sql: [
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, secret INTEGER NOT NULL DEFAULT 0, updated_at TEXT, updated_by TEXT)`,
      `CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_seen TEXT)`,
      `CREATE TABLE IF NOT EXISTS services (value TEXT PRIMARY KEY, label TEXT NOT NULL, billing TEXT NOT NULL, lines TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, phone_norm TEXT NOT NULL UNIQUE, email TEXT, area TEXT, language TEXT, tags TEXT, notes TEXT, consent_at TEXT, consent_version TEXT, status TEXT NOT NULL DEFAULT 'active')`,
      `CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, specialty TEXT, phone TEXT, email TEXT, area TEXT, languages TEXT, rate_note TEXT, credential_no TEXT, credential_expiry TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT)`,
      `CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, provider_id TEXT, scheduled_at TEXT, place TEXT, status TEXT NOT NULL DEFAULT 'requested', notes TEXT, created_by TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, channel TEXT, reference TEXT, source TEXT NOT NULL, received_at TEXT NOT NULL, recorded_by TEXT)`,
      `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, entity TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL, detail TEXT)`,
      `CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT, recipient TEXT, subject TEXT, ok INTEGER NOT NULL, error TEXT)`,
      `ALTER TABLE requests ADD COLUMN client_id TEXT`,
      `ALTER TABLE requests ADD COLUMN assigned_to TEXT`,
      `ALTER TABLE requests ADD COLUMN provider_id TEXT`,
      `ALTER TABLE requests ADD COLUMN created_by TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_requests_client ON requests(client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_assigned ON requests(assigned_to)`,
      `CREATE INDEX IF NOT EXISTS idx_appointments_request ON appointments(request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity(entity, entity_id)`
    ],
    after: async (db) => {
      let i = 0;
      for (const [value, s] of Object.entries(SERVICES)) {
        await db.prepare('INSERT OR IGNORE INTO services (value, label, billing, lines, active, sort, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
          .bind(value, s.label, s.billing, JSON.stringify(s.lines), i++, new Date().toISOString()).run();
      }
    }
  }
  ,
  {
    id: '0003_spec_alignment',
    sql: [
      // Cases: non-sequential reference, spec statuses, ownership and next action, escalation, closure
      `ALTER TABLE requests ADD COLUMN ref TEXT`,
      `ALTER TABLE requests ADD COLUMN track_token TEXT`,
      `ALTER TABLE requests ADD COLUMN patient_id TEXT`,
      `ALTER TABLE requests ADD COLUMN channel TEXT`,
      `ALTER TABLE requests ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`,
      `ALTER TABLE requests ADD COLUMN contact_method TEXT`,
      `ALTER TABLE requests ADD COLUMN next_action TEXT`,
      `ALTER TABLE requests ADD COLUMN next_action_due TEXT`,
      `ALTER TABLE requests ADD COLUMN first_response_at TEXT`,
      `ALTER TABLE requests ADD COLUMN escalated_to TEXT`,
      `ALTER TABLE requests ADD COLUMN escalated_at TEXT`,
      `ALTER TABLE requests ADD COLUMN escalation_outcome TEXT`,
      `ALTER TABLE requests ADD COLUMN closure_reason TEXT`,
      `ALTER TABLE requests ADD COLUMN closure_outcome TEXT`,
      `ALTER TABLE requests ADD COLUMN closed_at TEXT`,
      `ALTER TABLE requests ADD COLUMN referral_source TEXT`,
      `ALTER TABLE requests ADD COLUMN merged_into TEXT`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_ref ON requests(ref)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_token ON requests(track_token)`,
      `UPDATE requests SET status = CASE status WHEN 'received' THEN 'new' WHEN 'awaiting_quote' THEN 'under_review' WHEN 'invoiced' THEN 'awaiting_payment' WHEN 'paid' THEN 'in_progress' WHEN 'scheduled' THEN 'confirmed' WHEN 'in_service' THEN 'in_progress' WHEN 'on_hold' THEN 'awaiting_patient' ELSE status END`,
      `UPDATE staff SET role = 'supervisor' WHERE role = 'operations'`,
      // Patients, the people who arrange care for them, and consent
      `CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, age_band TEXT, area TEXT, language TEXT, accessibility TEXT, client_id TEXT, self INTEGER NOT NULL DEFAULT 0, relationship TEXT, authority TEXT, authority_evidence TEXT, authority_valid_until TEXT, status TEXT NOT NULL DEFAULT 'active')`,
      `CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, patient_id TEXT, purpose TEXT NOT NULL, notice_version TEXT, status TEXT NOT NULL, channel TEXT, given_at TEXT NOT NULL, captured_by TEXT, withdrawn_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_consents_client ON consents(client_id, purpose)`,
      // Providers: verification, credentials, locations and service modes
      `ALTER TABLE providers ADD COLUMN verification TEXT NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE providers ADD COLUMN legal_name TEXT`,
      `ALTER TABLE providers ADD COLUMN service_modes TEXT`,
      `ALTER TABLE providers ADD COLUMN locations TEXT`,
      `ALTER TABLE providers ADD COLUMN services TEXT`,
      `ALTER TABLE providers ADD COLUMN status_reason TEXT`,
      `UPDATE providers SET verification = CASE status WHEN 'active' THEN 'active' WHEN 'suspended' THEN 'suspended' WHEN 'removed' THEN 'archived' ELSE 'draft' END`,
      `CREATE TABLE IF NOT EXISTS provider_credentials (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, type TEXT NOT NULL, issuing_body TEXT, number TEXT, issued_on TEXT, expires_on TEXT, result TEXT NOT NULL DEFAULT 'pending', evidence TEXT, reviewed_by TEXT, reviewed_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_credentials_provider ON provider_credentials(provider_id)`,
      // Matching: providers proposed for a case and how they answered
      `CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, provider_id TEXT NOT NULL, proposed_by TEXT, proposed_at TEXT NOT NULL, rationale TEXT, override_reason TEXT, response TEXT NOT NULL DEFAULT 'pending', response_note TEXT, responded_at TEXT, responded_by TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_assignments_request ON assignments(request_id)`,
      // Appointments keep their history: a change creates a new booking linked to the old one
      `ALTER TABLE appointments ADD COLUMN mode TEXT NOT NULL DEFAULT 'facility'`,
      `ALTER TABLE appointments ADD COLUMN address TEXT`,
      `ALTER TABLE appointments ADD COLUMN instructions TEXT`,
      `ALTER TABLE appointments ADD COLUMN cost_info TEXT`,
      `ALTER TABLE appointments ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Africa/Accra'`,
      `ALTER TABLE appointments ADD COLUMN replaces_id TEXT`,
      `ALTER TABLE appointments ADD COLUMN assignment_id TEXT`,
      `ALTER TABLE appointments ADD COLUMN externally_confirmed INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE appointments ADD COLUMN cancelled_by TEXT`,
      `ALTER TABLE appointments ADD COLUMN cancel_reason TEXT`,
      `ALTER TABLE appointments ADD COLUMN cancelled_at TEXT`,
      `UPDATE appointments SET status = CASE status WHEN 'attended' THEN 'completed' WHEN 'reminded' THEN 'confirmed' ELSE status END`,
      // Work to do, and everything said to or about the client
      `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, request_id TEXT, type TEXT NOT NULL, title TEXT NOT NULL, assignee TEXT, due TEXT, status TEXT NOT NULL DEFAULT 'open', created_by TEXT, created_at TEXT NOT NULL, done_at TEXT, evidence TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_request ON tasks(request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee, status)`,
      `CREATE TABLE IF NOT EXISTS communications (id TEXT PRIMARY KEY, request_id TEXT, client_id TEXT, direction TEXT NOT NULL, channel TEXT NOT NULL, visibility TEXT NOT NULL, subject TEXT, body TEXT, status TEXT NOT NULL DEFAULT 'logged', at TEXT NOT NULL, by_user TEXT, error TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_comms_request ON communications(request_id)`,
      // Tamper-evident audit trail: each event carries the hash of the one before it
      `ALTER TABLE activity ADD COLUMN prev_hash TEXT`,
      `ALTER TABLE activity ADD COLUMN hash TEXT`,
      `ALTER TABLE services ADD COLUMN category TEXT`
    ],
    after: async (db) => {
      const cats = { 'Specialist appointment': 'Specialist access', 'Second medical opinion': 'Specialist access', 'Home doctor visit': 'Home healthcare', 'Home nursing': 'Home healthcare', 'MRI or CT scan': 'Diagnostics', 'Laboratory tests': 'Diagnostics', 'Ambulance coordination': 'Transport', 'Insurance claims assistance': 'Insurance assistance', 'Hospital admission assistance': 'Patient concierge', 'Medical advice on where to go': 'Patient concierge', 'Dialysis services': 'Institutional partnerships' };
      for (const [v, c] of Object.entries(cats)) await db.prepare('UPDATE services SET category = ? WHERE value = ? AND category IS NULL').bind(c, v).run();
      const { results } = await db.prepare('SELECT id FROM requests WHERE ref IS NULL OR track_token IS NULL').all();
      for (const r of results) await db.prepare('UPDATE requests SET ref = COALESCE(ref, ?), track_token = COALESCE(track_token, ?) WHERE id = ?').bind(newRef(), newToken(), r.id).run();
    }
  }
  ,
  {
    id: '0004_login',
    sql: [
      // Staff sign in with their own password; optional authenticator-app code; sessions are stored hashed.
      `ALTER TABLE staff ADD COLUMN password_hash TEXT`,
      `ALTER TABLE staff ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE staff ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE staff ADD COLUMN locked_until TEXT`,
      `ALTER TABLE staff ADD COLUMN totp_secret TEXT`,
      `ALTER TABLE staff ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE staff ADD COLUMN recovery_codes TEXT`,
      `ALTER TABLE staff ADD COLUMN password_changed_at TEXT`,
      `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen TEXT NOT NULL, ip TEXT, agent TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_staff ON sessions(staff_id)`
    ]
  },
  {
    id: '0005_superadmin',
    sql: [
      // Anyone who set up the platform as the first owner becomes the super administrator.
      `UPDATE staff SET role = 'superadmin' WHERE role = 'owner' AND password_hash IS NOT NULL AND id = (SELECT id FROM staff WHERE role = 'owner' AND password_hash IS NOT NULL ORDER BY created_at LIMIT 1) AND NOT EXISTS (SELECT 1 FROM staff WHERE role = 'superadmin')`
    ]
  }
  ,
  {
    id: '0006_hardening',
    sql: [
      // The audit chain now has a sequence number, so two events written at the same moment cannot both claim the same place.
      `ALTER TABLE activity ADD COLUMN seq INTEGER`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_seq ON activity(seq)`,
      // A case can have only one live invoice, even if two staff press the button together.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_live ON invoices(request_id) WHERE status != 'void'`,
      // An authenticator code can be used only once.
      `ALTER TABLE staff ADD COLUMN totp_last INTEGER NOT NULL DEFAULT 0`
    ]
  }
  ,
  {
    id: '0007_price_list',
    sql: [],
    // The business's real price list. New services are added; the old placeholder prices are replaced (only if nobody
    // has edited them in the console) and anything without a supplied price becomes "staff confirm the price".
    after: async (db) => {
      const now = new Date().toISOString();
      let n = 20;
      for (const [value, sv] of Object.entries(SERVICES)) {
        if (!sv.category) continue;
        await db.prepare('INSERT OR IGNORE INTO services (value, label, billing, lines, active, sort, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').bind(value, sv.label, sv.billing, JSON.stringify(sv.lines), n++, now).run();
        await db.prepare('UPDATE services SET category = ? WHERE value = ? AND category IS NULL').bind(sv.category, value).run();
      }
      const old = {
        'Specialist appointment': '[{"description":"Specialist appointment coordination","amount":10000}]',
        'Insurance claims assistance': '[{"description":"Insurance claims assistance (administrative fee)","amount":10000}]',
        'Hospital admission assistance': '[{"description":"Hospital admission assistance","amount":15000}]',
        'Dialysis services': '[{"description":"Dialysis services","amount":0}]'
      };
      for (const [value, oldLines] of Object.entries(old)) {
        const sv = SERVICES[value];
        await db.prepare('UPDATE services SET label = ?, billing = ?, lines = ?, updated_at = ? WHERE value = ? AND lines = ?').bind(sv.label, sv.billing, JSON.stringify(sv.lines), now, value, oldLines).run();
      }
      await db.prepare("UPDATE services SET label = 'Specialist appointment (other specialties)' WHERE value = 'Specialist appointment' AND label = 'Specialist appointment coordination'").run();
      await db.prepare("UPDATE services SET label = 'Other laboratory tests' WHERE value = 'Laboratory tests' AND label = 'Laboratory investigations'").run();
      // Replaced by "GP consult (home)", which has a real price.
      await db.prepare("UPDATE services SET active = 0 WHERE value = 'Home doctor visit' AND lines = '[{\"description\":\"Coordination fee\",\"amount\":10000},{\"description\":\"Doctor fee (provider charge)\",\"amount\":0}]'").run();
      // Suggested lines for the scan and ambulance quotes no longer pre-fill an invented coordination fee.
      await db.prepare("UPDATE services SET lines = ? WHERE value = 'MRI or CT scan' AND lines = ?").bind(JSON.stringify(SERVICES['MRI or CT scan'].lines), '[{"description":"Coordination fee","amount":10000},{"description":"Scan fee (provider charge)","amount":0}]').run();
      await db.prepare("UPDATE services SET lines = ? WHERE value = 'Ambulance coordination' AND lines = ?").bind(JSON.stringify(SERVICES['Ambulance coordination'].lines), '[{"description":"Coordination fee","amount":10000},{"description":"Ambulance transport (provider charge)","amount":0}]').run();
    }
  }
  ,
  {
    id: '0008_invoice_lines',
    sql: [],
    after: async (db) => {
      const home = { 'GP consult (home)': 800, 'Cardiac specialist consult (home)': 2500, 'Urologist consult (private or home)': 2000, 'Nephrologist service (private or home)': 2000, 'Hematologist consult (private or home)': 2000, 'Gynecologist consult (private or home)': 2000, 'Physician specialist (private or home)': 1500, 'Psychiatrist consult (private or home)': 3000 };
      for (const [value, cedis] of Object.entries(home)) {
        const was = JSON.stringify([{ description: `${value}, includes a lab or nurse technician for blood samples if needed`.slice(0, 120), amount: cedis * 100 }]);
        await db.prepare('UPDATE services SET lines = ? WHERE value = ? AND lines = ?').bind(JSON.stringify([{ description: value, amount: cedis * 100 }]), value, was).run();
      }
    }
  }
  ,
  {
    id: '0009_visit_type',
    // Where a consultation takes place: at the patient's home or privately (at a clinic).
    sql: [`ALTER TABLE requests ADD COLUMN visit_type TEXT`]
  },
  {
    id: '0010_passkeys',
    // Passkeys: sign in with a phone's face, fingerprint or screen lock. Challenges are one-use and expire in five minutes.
    sql: [
      `CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, public_key TEXT NOT NULL, sign_count INTEGER NOT NULL DEFAULT 0, name TEXT, created_at TEXT NOT NULL, last_used TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_passkeys_staff ON passkeys(staff_id)`,
      `CREATE TABLE IF NOT EXISTS webauthn_challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, staff_id TEXT NOT NULL, kind TEXT NOT NULL, expires_at TEXT NOT NULL)`
    ]
  }
];

let ready = null;
export function ensureSchema(db) {
  if (!ready) ready = migrate(db).catch((e) => { ready = null; throw e; });
  return ready;
}

async function migrate(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, at TEXT NOT NULL)').run();
  const { results } = await db.prepare('SELECT id FROM _migrations').all();
  const done = new Set(results.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const s of m.sql) {
      try { await db.prepare(s).run(); } catch (e) { if (!/duplicate column|UNIQUE constraint failed/i.test(String(e && e.message))) throw e; }
    }
    if (m.after) await m.after(db);
    await db.prepare('INSERT OR IGNORE INTO _migrations (id, at) VALUES (?, ?)').bind(m.id, new Date().toISOString()).run();
  }
}
