import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SQLITE_SCHEMA = `
PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
  checkout_lock INTEGER NOT NULL DEFAULT 0,
  printify_order_id TEXT,
  printify_status TEXT,
  tracking TEXT,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  printify_order_id TEXT,
  created_at INTEGER NOT NULL
);`;

function openSqlite(config) {
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(config.dataDir, "print-merch.sqlite"));
  db.exec(SQLITE_SCHEMA);
  const storedMode = db.prepare("SELECT value FROM settings WHERE key='mode'").get();
  if (storedMode && storedMode.value !== config.mode) {
    db.close();
    throw new Error("Use a separate DATA_DIR for each APP_MODE.");
  }
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('mode', ?)").run(config.mode);
  return db;
}

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
      Object.fromEntries(["get", "all", "run"].map((method) => [method, (...args) => exclusive(() => raw.prepare(sql)[method](...args))])),
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
    application_name: "print-merch",
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
      await tx.prepare("SELECT pg_advisory_xact_lock(73627382)").get();
      const { readFile } = await import("node:fs/promises");
      const sql = await readFile(new URL("./schema.postgres.sql", import.meta.url), "utf8");
      for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
        await tx.prepare(statement).run();
      }
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
