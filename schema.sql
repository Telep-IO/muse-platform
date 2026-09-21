-- InkSend schema (SQLite for demo/local; swap for Postgres in production).
-- Mirrors the Paper Send order model: immutable approvals, lease-guarded
-- worker claims, unique provider identifiers. The letter message text is
-- stored (needed for provider submission and the human review page) and
-- purged 30 days after a terminal state.

CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  message TEXT NOT NULL,             -- exact handwriting text, 10-2000 chars
  message_sha256 TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_line1 TEXT NOT NULL,
  recipient_line2 TEXT,
  recipient_city TEXT NOT NULL,
  recipient_state TEXT NOT NULL,
  recipient_zip TEXT NOT NULL,
  recipient_country TEXT NOT NULL DEFAULT 'US',
  card TEXT NOT NULL DEFAULT 'plain-letter',
  handwriting_style TEXT,
  amount INTEGER NOT NULL,           -- USD cents, server-computed (flat 399)
  currency TEXT NOT NULL DEFAULT 'usd',
  review_hash TEXT,
  terms_version TEXT,
  privacy_version TEXT,
  checkout_started INTEGER,          -- ms epoch
  lease_until INTEGER,               -- ms epoch; worker claim
  session_id TEXT UNIQUE,             -- Stripe checkout session id
  payment_id TEXT UNIQUE,             -- Stripe payment intent id
  provider_letter_id TEXT UNIQUE,     -- handwriting provider job id
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
  letter_id TEXT PRIMARY KEY REFERENCES letters(id),
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

CREATE INDEX IF NOT EXISTS idx_letters_state ON letters(state);
CREATE INDEX IF NOT EXISTS idx_letters_lease ON letters(lease_until);
