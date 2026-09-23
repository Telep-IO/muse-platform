import type { OwnedRecord } from "./store";

export type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
export type QueryFn = (sql: string, params?: unknown[]) => Promise<QueryResult>;

export type DraftStore<T extends OwnedRecord> = {
  kind: "memory" | "postgres";
  save(item: T): Promise<T>;
  get(id: string, ownerKeyId: string): Promise<T | undefined>;
  getById(id: string): Promise<T | undefined>;
  list(ownerKeyId: string): Promise<T[]>;
  /** Returns false when this Stripe event id was already recorded. */
  recordEvent(eventId: string, jobId: string): Promise<boolean>;
  /** Drop a previously recorded event id so a retry can claim it again. */
  releaseEvent(eventId: string): Promise<void>;
  reset(): Promise<void>;
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS muse_drafts (
    id TEXT PRIMARY KEY,
    connector TEXT NOT NULL,
    owner_key_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload JSONB NOT NULL,
    stripe_session_id TEXT,
    stripe_event_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS muse_stripe_events (
    id TEXT PRIMARY KEY,
    connector TEXT NOT NULL,
    job_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

const memoryByConnector = new Map<string, DraftStore<OwnedRecord>>();
const storesByUrl = new Map<string, DraftStore<OwnedRecord>>();
const pools = new Map<string, import("pg").Pool>();

type PgPool = import("pg").Pool;

function copy<T>(item: T): T {
  return { ...item };
}

function memoryDraftStore<T extends OwnedRecord>(connector: string): DraftStore<T> {
  const existing = memoryByConnector.get(connector);
  if (existing) return existing as DraftStore<T>;
  const items = new Map<string, T>();
  const events = new Set<string>();
  const store: DraftStore<T> = {
    kind: "memory",
    async save(item) {
      const saved = copy(item);
      items.set(item.id, saved);
      return saved;
    },
    async get(id, ownerKeyId) {
      const item = items.get(id);
      if (!item || item.ownerKeyId !== ownerKeyId) return undefined;
      return copy(item);
    },
    async getById(id) {
      const item = items.get(id);
      return item ? copy(item) : undefined;
    },
    async list(ownerKeyId) {
      return [...items.values()]
        .filter((item) => item.ownerKeyId === ownerKeyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((item) => copy(item));
    },
    async recordEvent(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
    async releaseEvent(eventId) {
      events.delete(eventId);
    },
    async reset() {
      items.clear();
      events.clear();
    },
  };
  memoryByConnector.set(connector, store as DraftStore<OwnedRecord>);
  return store;
}

function parsePayload<T>(row: Record<string, unknown> | undefined): T | undefined {
  if (!row) return undefined;
  const payload = row.payload;
  if (typeof payload === "string") return JSON.parse(payload) as T;
  if (payload && typeof payload === "object") return payload as T;
  return undefined;
}

function postgresDraftStore<T extends OwnedRecord>(connector: string, query: QueryFn): DraftStore<T> {
  let pending: Promise<void> | null = null;
  function ensure(): Promise<void> {
    if (!pending) {
      pending = (async () => {
        for (const statement of SCHEMA) await query(statement);
      })().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  }

  return {
    kind: "postgres",
    async save(item) {
      await ensure();
      const extra = item as T & { status?: string; stripeSessionId?: string; stripeEventId?: string };
      await query(
        `INSERT INTO muse_drafts (id, connector, owner_key_id, status, payload, stripe_session_id, stripe_event_id, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           payload = EXCLUDED.payload,
           owner_key_id = EXCLUDED.owner_key_id,
           stripe_session_id = COALESCE(EXCLUDED.stripe_session_id, muse_drafts.stripe_session_id),
           stripe_event_id = COALESCE(EXCLUDED.stripe_event_id, muse_drafts.stripe_event_id),
           updated_at = now()`,
        [
          item.id,
          connector,
          item.ownerKeyId,
          extra.status ?? "",
          JSON.stringify(item),
          extra.stripeSessionId ?? null,
          extra.stripeEventId ?? null,
          item.createdAt,
        ],
      );
      return copy(item);
    },
    async get(id, ownerKeyId) {
      await ensure();
      const result = await query(
        `SELECT payload FROM muse_drafts WHERE id = $1 AND connector = $2 AND owner_key_id = $3`,
        [id, connector, ownerKeyId],
      );
      return parsePayload<T>(result.rows[0]);
    },
    async getById(id) {
      await ensure();
      const result = await query(`SELECT payload FROM muse_drafts WHERE id = $1 AND connector = $2`, [id, connector]);
      return parsePayload<T>(result.rows[0]);
    },
    async list(ownerKeyId) {
      await ensure();
      const result = await query(
        `SELECT payload FROM muse_drafts WHERE connector = $1 AND owner_key_id = $2 ORDER BY created_at DESC`,
        [connector, ownerKeyId],
      );
      return result.rows.flatMap((row) => {
        const item = parsePayload<T>(row);
        return item ? [item] : [];
      });
    },
    async recordEvent(eventId, jobId) {
      await ensure();
      const result = await query(
        `INSERT INTO muse_stripe_events (id, connector, job_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [eventId, connector, jobId],
      );
      return result.rowCount === 1;
    },
    async releaseEvent(eventId) {
      await ensure();
      await query(`DELETE FROM muse_stripe_events WHERE id = $1 AND connector = $2`, [eventId, connector]);
    },
    async reset() {
      await ensure();
      await query(`DELETE FROM muse_drafts WHERE connector = $1`, [connector]);
      await query(`DELETE FROM muse_stripe_events WHERE connector = $1`, [connector]);
    },
  };
}

async function poolFor(databaseUrl: string): Promise<PgPool> {
  const existing = pools.get(databaseUrl);
  if (existing) return existing;
  const loaded = await import("pg");
  const Pool = (loaded.default?.Pool ?? loaded.Pool) as new (config: import("pg").PoolConfig) => PgPool;
  const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  pools.set(databaseUrl, pool);
  return pool;
}

export function postgresQuery(databaseUrl: string): QueryFn {
  return async (sql, params = []) => {
    const pool = await poolFor(databaseUrl);
    const result = await pool.query(sql, params);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 };
  };
}

export function createDraftStore<T extends OwnedRecord>(options: {
  connector: string;
  databaseUrl?: string;
  query?: QueryFn;
}): DraftStore<T> {
  if (options.query) return postgresDraftStore<T>(options.connector, options.query);
  const url = options.databaseUrl?.trim() ?? "";
  if (!url) return memoryDraftStore<T>(options.connector);
  const key = `${options.connector}\n${url}`;
  const cached = storesByUrl.get(key);
  if (cached) return cached as DraftStore<T>;
  const store = postgresDraftStore<T>(options.connector, postgresQuery(url));
  storesByUrl.set(key, store as DraftStore<OwnedRecord>);
  return store;
}
