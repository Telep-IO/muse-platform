CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft',
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  domain TEXT NOT NULL, tld TEXT NOT NULL, years INTEGER NOT NULL,
  price_per_year INTEGER NOT NULL, amount INTEGER NOT NULL, registrant TEXT NOT NULL,
  session_id TEXT UNIQUE, checkout_url TEXT, checkout_started BIGINT, consent_at BIGINT,
  payment_id TEXT UNIQUE, provider_domain_id TEXT UNIQUE,
  registered_at BIGINT, expires_at BIGINT,
  first_attempt BIGINT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0,
  lease_until BIGINT NOT NULL DEFAULT 0, error TEXT, refund_id TEXT,
  refund_started BIGINT, purged INTEGER NOT NULL DEFAULT 0,
  checked_at BIGINT NOT NULL DEFAULT 0, available_at_check INTEGER NOT NULL DEFAULT 0,
  payment_total INTEGER, payment_tax INTEGER
);
CREATE INDEX IF NOT EXISTS domains_work ON domains(state, next_attempt, lease_until);
CREATE UNIQUE INDEX IF NOT EXISTS domains_open_domain ON domains(domain) WHERE purged=0;
CREATE TABLE IF NOT EXISTS policies (
  version TEXT PRIMARY KEY, kind TEXT NOT NULL, html TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  domain_id TEXT PRIMARY KEY REFERENCES domains(id), accepted_at BIGINT NOT NULL,
  terms_version TEXT NOT NULL REFERENCES policies(version), privacy_version TEXT NOT NULL REFERENCES policies(version),
  confirmation TEXT NOT NULL, evidence TEXT NOT NULL, review_hash TEXT NOT NULL
);
CREATE OR REPLACE FUNCTION domainsend_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Approval records and policy archives are immutable'; END;
$$;
DROP TRIGGER IF EXISTS immutable_approval ON approvals;
CREATE TRIGGER immutable_approval BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION domainsend_reject_update();
DROP TRIGGER IF EXISTS immutable_policy ON policies;
CREATE TRIGGER immutable_policy BEFORE UPDATE ON policies FOR EACH ROW EXECUTE FUNCTION domainsend_reject_update();
