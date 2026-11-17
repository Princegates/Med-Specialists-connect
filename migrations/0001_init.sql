-- MEDs Specialists Connect: requests, invoices and the invoice-number counter.
CREATE TABLE IF NOT EXISTS requests (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  service        TEXT NOT NULL,
  for_whom       TEXT,
  urgency        TEXT,
  message        TEXT,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  preferred_date TEXT,
  call_time      TEXT,
  area           TEXT,
  status         TEXT NOT NULL DEFAULT 'received',
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  number      TEXT NOT NULL UNIQUE,
  request_id  TEXT NOT NULL REFERENCES requests(id),
  status      TEXT NOT NULL DEFAULT 'issued',
  currency    TEXT NOT NULL DEFAULT 'GHS',
  total       INTEGER NOT NULL,
  lines       TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  paid_at     TEXT,
  pay_ref     TEXT,
  pay_channel TEXT
);

CREATE TABLE IF NOT EXISTS counters (
  year INTEGER PRIMARY KEY,
  n    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_request ON invoices(request_id);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON requests(phone, created_at);
