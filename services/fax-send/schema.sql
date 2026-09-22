-- FaxSend schema (SQLite for demo/local; swap for Postgres in production).
-- Mirrors the Paper Send order model: immutable approvals, lease-guarded
-- worker claims, unique provider identifiers.

CREATE TABLE IF NOT EXISTS faxes (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  fax_number TEXT NOT NULL,          -- E.164, customer-supplied
  cover_page INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL,            -- document pages + cover page (if any)
  amount INTEGER NOT NULL,           -- USD cents, server-computed
  currency TEXT NOT NULL DEFAULT 'usd',
  document_sha256 TEXT NOT NULL,
  review_hash TEXT,
  terms_version TEXT,
  privacy_version TEXT,
  checkout_started INTEGER,          -- ms epoch
  lease_until INTEGER,               -- ms epoch; worker claim
  session_id TEXT UNIQUE,             -- Stripe checkout session id
  payment_id TEXT UNIQUE,             -- Stripe payment intent id
  provider_fax_id TEXT UNIQUE,        -- fax provider job id
  provider_status TEXT,               -- last known provider-side status
  provider_submitted_at INTEGER,      -- ms epoch of provider submission
  refund_id TEXT UNIQUE,
  fail_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  purged INTEGER NOT NULL DEFAULT 0
);

-- Approval evidence is append-only: inserts allowed, updates rejected.
-- (Enforced in application code; add DB triggers when moving to Postgres.)
CREATE TABLE IF NOT EXISTS approvals (
  fax_id TEXT PRIMARY KEY REFERENCES faxes(id),
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

CREATE INDEX IF NOT EXISTS idx_faxes_state ON faxes(state);
CREATE INDEX IF NOT EXISTS idx_faxes_lease ON faxes(lease_until);
