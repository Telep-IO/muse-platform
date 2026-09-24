CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_name TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  reward_name TEXT NOT NULL,
  reward_category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  message TEXT,
  delivery_method TEXT NOT NULL,
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  payment_id TEXT,
  payment_status TEXT,
  tremendous_order_id TEXT,
  tremendous_reward_id TEXT,
  delivery_link TEXT,
  delivery_state TEXT,
  redemption_state TEXT,
  lease_until BIGINT NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS drafts_recipient ON drafts(recipient_key, created_at);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  claimed_at BIGINT NOT NULL,
  lease_until BIGINT NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  uuid TEXT PRIMARY KEY,
  received_at BIGINT NOT NULL
);
