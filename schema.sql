-- CallSend schema (SQLite for demo/local; swap for Postgres in production).
-- Mirrors the Paper Send order model: immutable approvals, lease-guarded
-- worker claims, unique provider identifiers. The verbatim script is stored
-- only until the call reaches a terminal state, then purged; the SHA-256
-- fingerprint is retained for audit.

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  phone_number TEXT NOT NULL,        -- E.164, customer-supplied
  script TEXT,                       -- verbatim script; NULL after purge
  script_sha256 TEXT NOT NULL,       -- fingerprint of the approved script
  script_chars INTEGER NOT NULL,
  voice TEXT NOT NULL DEFAULT 'alloy',
  record_call INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL,           -- USD cents, server-computed (flat)
  currency TEXT NOT NULL DEFAULT 'usd',
  review_hash TEXT,
  terms_version TEXT,
  privacy_version TEXT,
  checkout_started INTEGER,          -- ms epoch
  lease_until INTEGER,               -- ms epoch; worker claim
  paid_at INTEGER,                   -- ms epoch
  session_id TEXT UNIQUE,             -- Stripe checkout session id
  payment_id TEXT UNIQUE,             -- Stripe payment intent id
  provider_call_id TEXT UNIQUE,      -- voice provider call id
  provider_status TEXT,               -- last known provider-side status
  provider_submitted_at INTEGER,      -- ms epoch of provider submission
  duration_seconds INTEGER,           -- provider-reported call duration
  recording_url TEXT,                 -- only when record_call = 1
  refund_id TEXT UNIQUE,
  fail_reason TEXT,
  tod_check TEXT,                     -- 'ok' | 'unknown' at draft time
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  purged INTEGER NOT NULL DEFAULT 0
);

-- Approval evidence is append-only: inserts allowed, updates rejected.
-- (Enforced in application code; add DB triggers when moving to Postgres.)
CREATE TABLE IF NOT EXISTS approvals (
  call_id TEXT PRIMARY KEY REFERENCES calls(id),
  review_hash TEXT NOT NULL,
  evidence TEXT NOT NULL,             -- canonical JSON (see src/approval.js)
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
  version TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- 'terms' | 'privacy'
  html TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_state ON calls(state);
CREATE INDEX IF NOT EXISTS idx_calls_lease ON calls(lease_until);
CREATE INDEX IF NOT EXISTS idx_calls_number_created ON calls(phone_number, created_at);
