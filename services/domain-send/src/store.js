import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

function openSqlite(config) {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(config.dataDir, 'domainsend.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      domain TEXT NOT NULL, tld TEXT NOT NULL, years INTEGER NOT NULL,
      price_per_year INTEGER NOT NULL, amount INTEGER NOT NULL, registrant TEXT NOT NULL,
      session_id TEXT UNIQUE, checkout_url TEXT, checkout_started INTEGER, consent_at INTEGER,
      payment_id TEXT UNIQUE, provider_domain_id TEXT UNIQUE,
      registered_at INTEGER, expires_at INTEGER,
      first_attempt INTEGER, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0, error TEXT, refund_id TEXT,
      refund_started INTEGER, purged INTEGER NOT NULL DEFAULT 0,
      checked_at INTEGER NOT NULL DEFAULT 0, available_at_check INTEGER NOT NULL DEFAULT 0,
      payment_total INTEGER, payment_tax INTEGER
    );
    CREATE INDEX IF NOT EXISTS domains_work ON domains(state, next_attempt, lease_until);
    CREATE UNIQUE INDEX IF NOT EXISTS domains_open_domain ON domains(domain) WHERE purged=0;`);
  db.exec(`CREATE TABLE IF NOT EXISTS policies (
      version TEXT PRIMARY KEY, kind TEXT NOT NULL, html TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approvals (
      domain_id TEXT PRIMARY KEY REFERENCES domains(id), accepted_at INTEGER NOT NULL,
      terms_version TEXT NOT NULL REFERENCES policies(version), privacy_version TEXT NOT NULL REFERENCES policies(version),
      confirmation TEXT NOT NULL, evidence TEXT NOT NULL, review_hash TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS immutable_approval BEFORE UPDATE ON approvals BEGIN SELECT RAISE(ABORT, 'Approval records are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_policy BEFORE UPDATE ON policies BEGIN SELECT RAISE(ABORT, 'Policy archives are immutable'); END;`);
  const storedMode = db.prepare("SELECT value FROM settings WHERE key='mode'").get();
  if (storedMode && storedMode.value !== config.mode) { db.close(); throw new Error('Use a separate DATA_DIR for each APP_MODE.'); }
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('mode', ?)").run(config.mode);
  return db;
}

// All callers await queries, including the local SQLite demo. A transaction owns
// its connection for the whole callback; unrelated requests never join it.
export async function openStore(config) {
  if (config.databaseUrl) return openPostgres(config);
  const raw = openSqlite(config);
  let pending = Promise.resolve();
  const exclusive = fn => {
    const result = pending.then(fn);
    pending = result.catch(() => {});
    return result;
  };
  return {
    dialect: 'sqlite',
    prepare: sql => Object.fromEntries(['get', 'all', 'run'].map(method => [method, (...args) => exclusive(() => raw.prepare(sql)[method](...args))])),
    transaction: fn => exclusive(async () => {
      raw.exec('BEGIN IMMEDIATE');
      try { const value = await fn(raw); raw.exec('COMMIT'); return value; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    }),
    close: () => exclusive(() => raw.close()),
  };
}

function postgresQueries(client) {
  return { prepare(sql) {
    let index = 0;
    // Only internal SQL uses this adapter; values always remain parameters.
    const query = sql.replace(/\?/g, () => `$${++index}`);
    return {
      get: async (...args) => (await client.query(query, args)).rows[0],
      all: async (...args) => (await client.query(query, args)).rows,
      run: async (...args) => ({ changes: (await client.query(query, args)).rowCount }),
    };
  } };
}

async function openPostgres(config) {
  const { Pool, types } = await import('pg');
  const pool = new Pool({ connectionString: config.databaseUrl, max: 5,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    statement_timeout: 15000, application_name: 'domainsend',
    types: { getTypeParser: (oid, format) => oid === 20 && format !== 'binary'
      ? value => { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error('Database integer exceeds safe range.'); return n; }
      : types.getTypeParser(oid, format) },
  });
  pool.on('error', () => console.error('Database connection interrupted; reconnecting.'));
  const store = { dialect: 'postgres', ...postgresQueries(pool), close: () => pool.end(),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(postgresQueries(client));
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
  };
  try {
    await store.transaction(async tx => {
      // Serialize first boot/migrations, including through Neon's pooled URL.
      await tx.prepare('SELECT pg_advisory_xact_lock(73627383)').get();
      const { readFile } = await import('node:fs/promises');
      await tx.prepare(await readFile(new URL('./schema.postgres.sql', import.meta.url), 'utf8')).run();
      await tx.prepare("INSERT INTO settings (key,value) VALUES ('mode',?) ON CONFLICT DO NOTHING").run(config.mode);
      const stored = await tx.prepare("SELECT value FROM settings WHERE key='mode'").get();
      if (stored.value !== config.mode) throw new Error('Use a separate database for each APP_MODE.');
    });
    return store;
  } catch (error) { await pool.end(); throw error; }
}
