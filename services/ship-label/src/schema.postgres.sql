CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  parcel TEXT NOT NULL,
  carrier_hint TEXT,
  rates TEXT NOT NULL,
  easypost_shipment_id TEXT,
  selected_rate_id TEXT,
  postage_cents INTEGER,
  fee_cents INTEGER,
  platform_fee_cents INTEGER,
  total_cents INTEGER,
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  payment_id TEXT,
  payment_status TEXT,
  label_id TEXT UNIQUE,
  label_url TEXT,
  tracking_code TEXT,
  label_status TEXT,
  refund_status TEXT,
  purchased INTEGER NOT NULL DEFAULT 0,
  lease_until BIGINT NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE IF NOT EXISTS claims (
  draft_id TEXT PRIMARY KEY,
  claimed_at BIGINT NOT NULL,
  lease_until BIGINT NOT NULL,
  state TEXT NOT NULL
);
