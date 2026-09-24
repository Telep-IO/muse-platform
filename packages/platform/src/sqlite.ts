import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HttpError } from "./errors";
import { envValue, readAppMode, type Env } from "./runtime";

/**
 * Durable per-connector SQLite for demo drafts. One file per {PREFIX}_APP_MODE under
 * {PREFIX}_DATA_DIR (default: $TMPDIR/muse-{slug}), so demo rows never mix with test/live.
 * `schema` runs on every open; use CREATE ... IF NOT EXISTS.
 */
export function withSqlite<T>(slug: string, schema: string, env: Env, fn: (db: DatabaseSync) => T): T {
  const prefix = slug.toUpperCase().replace(/-/g, "_");
  const mode = readAppMode(`${prefix}_APP_MODE`, env);
  const root = envValue(`${prefix}_DATA_DIR`, env) || join(tmpdir(), `muse-${slug}`);
  const file = join(root, mode, `${slug.replace(/-/g, "")}.sqlite`);
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);\n${schema}`);
    const stored = db.prepare("SELECT value FROM settings WHERE key='mode'").get() as { value: string } | undefined;
    if (stored && stored.value !== mode) {
      throw new HttpError(500, "mode_mismatch", `Use a separate DATA_DIR for each ${prefix}_APP_MODE.`);
    }
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('mode', ?)").run(mode);
    return fn(db);
  } finally {
    db.close();
  }
}
