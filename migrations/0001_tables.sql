-- Alethes client portal database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS families (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL            -- month-end snapshot published from the ledger (JSON)
);
CREATE TABLE IF NOT EXISTS users (
  email     TEXT PRIMARY KEY,   -- lower case, as verified by Cloudflare Access
  role      TEXT NOT NULL CHECK (role IN ('client', 'staff')),
  family_id TEXT REFERENCES families(id)  -- required for clients, empty for staff
);
CREATE TABLE IF NOT EXISTS accounts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id TEXT NOT NULL REFERENCES families(id),
  pos       INTEGER NOT NULL,
  name      TEXT NOT NULL,
  ent       TEXT NOT NULL,
  value     INTEGER NOT NULL,   -- latest month-end balance, $ thousands
  bucket    TEXT NOT NULL,
  cls       TEXT NOT NULL,
  liq       TEXT NOT NULL,
  inv       TEXT NOT NULL,
  note      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS accounts_family ON accounts(family_id, pos);
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id    TEXT NOT NULL REFERENCES families(id),
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  field        TEXT NOT NULL CHECK (field IN ('bucket', 'cls', 'liq', 'inv')),
  from_value   TEXT NOT NULL,
  to_value     TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('wait', 'ok', 'no')),
  decided_at   TEXT,
  decided_by   TEXT,
  reason       TEXT
);
CREATE INDEX IF NOT EXISTS requests_family ON requests(family_id, status);
CREATE TABLE IF NOT EXISTS notes_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id  TEXT NOT NULL REFERENCES families(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  text       TEXT NOT NULL,
  noted_by   TEXT NOT NULL,
  noted_at   TEXT NOT NULL
);
