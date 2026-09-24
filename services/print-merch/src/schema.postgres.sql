CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  owner_key_id TEXT NOT NULL,
  status TEXT NOT NULL,
  blueprint_id INTEGER NOT NULL,
  print_provider_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  artwork_url TEXT NOT NULL,
  artwork_attested INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  quote TEXT NOT NULL,
  mockup_urls TEXT NOT NULL,
  printify_product_id TEXT,
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  checkout_lock BIGINT NOT NULL DEFAULT 0,
  printify_order_id TEXT,
  printify_status TEXT,
  tracking TEXT,
  note TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  printify_order_id TEXT,
  created_at BIGINT NOT NULL
);
