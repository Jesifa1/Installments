PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  address TEXT,
  joined_at TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','INCOME','EXPENSE'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  principal REAL NOT NULL CHECK (principal > 0),
  interest_rate REAL NOT NULL CHECK (interest_rate >= 0),
  total_installments INTEGER NOT NULL CHECK (total_installments > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY')),
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED'))
);

CREATE TABLE IF NOT EXISTS installments (
  id INTEGER PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  seq INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount_due REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  UNIQUE (loan_id, seq)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL DEFAULT (date('now')),
  description TEXT,
  loan_id INTEGER REFERENCES loans(id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit REAL NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit REAL NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit = 0) <> (credit = 0))
);

CREATE TABLE IF NOT EXISTS sms_outbox (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('PAYMENT','REMINDER')),
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  loan_id INTEGER REFERENCES loans(id),
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS fines (
  id INTEGER PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  installment_id INTEGER NOT NULL REFERENCES installments(id),
  fine_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0 AND amount_paid <= amount),
  UNIQUE (installment_id, fine_date)
);