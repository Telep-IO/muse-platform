import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
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
  lease_until INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS drafts_recipient ON drafts(recipient_key, created_at);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  claimed_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  uuid TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);`;

function openSqlite(config) {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(config.dataDir, "giftsend.sqlite"));
  db.exec(SCHEMA);
  const storedMode = db.prepare("SELECT value FROM settings WHERE key='mode'").get();
  if (storedMode && storedMode.value !== config.mode) {
    db.close();
    throw new Error("Use a separate DATA_DIR for each APP_MODE.");
  }
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('mode', ?)").run(config.mode);
  return db;
}

// All callers await queries, including the local SQLite demo. A transaction owns
// its connection for the whole callback; unrelated requests never join it.
export async function openStore(config) {
  if (config.databaseUrl) return openPostgres(config);
  const raw = openSqlite(config);
  let pending = Promise.resolve();
  const exclusive = (fn) => {
    const result = pending.then(fn);
    pending = result.catch(() => {});
    return result;
  };
  return {
    dialect: "sqlite",
    prepare: (sql) =>
      Object.fromEntries(
        ["get", "all", "run"].map((method) => [method, (...args) => exclusive(() => raw.prepare(sql)[method](...args))]),
      ),
    transaction: (fn) =>
      exclusive(async () => {
        raw.exec("BEGIN IMMEDIATE");
        try {
          const value = await fn(raw);
          raw.exec("COMMIT");
          return value;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        }
      }),
    close: () => exclusive(() => raw.close()),
  };
}

function postgresQueries(client) {
  return {
    prepare(sql) {
      let index = 0;
      const query = sql.replace(/\?/g, () => `$${++index}`);
      return {
        get: async (...args) => (await client.query(query, args)).rows[0],
        all: async (...args) => (await client.query(query, args)).rows,
        run: async (...args) => ({ changes: (await client.query(query, args)).rowCount }),
      };
    },
  };
}

async function openPostgres(config) {
  const { Pool, types } = await import("pg");
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: "giftsend",
    types: {
      getTypeParser: (oid, format) =>
        oid === 20 && format !== "binary"
          ? (value) => {
              const n = Number(value);
              if (!Number.isSafeInteger(n)) throw new Error("Database integer exceeds safe range.");
              return n;
            }
          : types.getTypeParser(oid, format),
    },
  });
  pool.on("error", () => console.error("Database connection interrupted; reconnecting."));
  const store = {
    dialect: "postgres",
    ...postgresQueries(pool),
    close: () => pool.end(),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(postgresQueries(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
  try {
    await store.transaction(async (tx) => {
      await tx.prepare("SELECT pg_advisory_xact_lock(73627383)").get();
      const { readFile } = await import("node:fs/promises");
      await tx.prepare(await readFile(new URL("./schema.postgres.sql", import.meta.url), "utf8")).run();
      await tx.prepare("INSERT INTO settings (key,value) VALUES ('mode',?) ON CONFLICT DO NOTHING").run(config.mode);
      const stored = await tx.prepare("SELECT value FROM settings WHERE key='mode'").get();
      if (stored.value !== config.mode) throw new Error("Use a separate database for each APP_MODE.");
    });
    return store;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
