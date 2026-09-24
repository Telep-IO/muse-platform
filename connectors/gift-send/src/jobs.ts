import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCheckoutSession, envValue, HttpError, providerRequest, readAppMode, type Env } from "@telep/platform";
import { assertGiftSendReady } from "./provider";

/** Tremendous fee on gift cards, Visa/Mastercard prepaid, and charity. */
export const PROVIDER_FEE_CENTS = 0;
export const DEFAULT_SERVICE_FEE_CENTS = 299;
export const MAX_PAYOUT_CENTS = 200_000;
export const MAX_RECIPIENT_DAY_CENTS = 1_000_000;
const DAY_MS = 86_400_000;

const ALLOWED = new Set(["merchant_card", "visa_card", "charity"]);
const CASH = new Set(["ach", "paypal", "venmo", "instant_debit_transfer", "cash_app", "international_bank", "wallet"]);
const DELIVERY = new Set(["EMAIL", "PHONE", "LINK"]);

/** Keep aligned with services/gift-send/src/catalog.js. Cash rows exist so create can reject them. */
const STUB_PRODUCTS = [
  { id: "OKMHM2X2OHYV", name: "Amazon.com", category: "merchant_card", min: 1, max: 2000, countries: ["US"] },
  { id: "Q24BD9EZ332JT", name: "Virtual Visa", category: "visa_card", min: 1, max: 2000, countries: ["US"] },
  { id: "MCVIRTUALSTUB1", name: "Virtual Mastercard", category: "visa_card", min: 1, max: 2000, countries: ["US"] },
  { id: "CHARITYSTUB01", name: "Doctors Without Borders", category: "charity", min: 1, max: 2000, countries: ["US"] },
  { id: "KV934TZ93NQM", name: "PayPal", category: "paypal", min: 1, max: 2000, countries: ["US"] },
  { id: "VENMOSTUB0001", name: "Venmo", category: "venmo", min: 1, max: 2000, countries: ["US"] },
];

export type Quote = {
  face_cents: number;
  fee_cents: number;
  provider_fee_cents: 0;
  total_cents: number;
  currency: "usd";
};

export type RewardProduct = {
  reward_id: string;
  name: string;
  brand: string;
  min_cents: number;
  max_cents: number;
  fee_cents: number;
};

export type Gift = {
  draft_id: string;
  gift_id: string;
  status: string;
  recipient: { name: string; email?: string; phone?: string };
  reward_id: string;
  reward_name: string;
  amount_cents: number;
  message: string | null;
  delivery_method: "EMAIL" | "PHONE" | "LINK";
  quote: Quote;
  checkout_url: string | null;
  delivery_state: string;
  redemption_state: string;
  tremendous_order_id: string | null;
  tremendous_reward_id: string | null;
  delivery_link: string | null;
  mode: string;
  ordered: boolean;
};

type CatalogProduct = RewardProduct & { category: string; countries: string[] };

type DraftRow = {
  id: string;
  owner_key: string;
  status: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_name: string;
  recipient_key: string;
  reward_id: string;
  reward_name: string;
  amount_cents: number;
  fee_cents: number;
  total_cents: number;
  message: string | null;
  delivery_method: string;
  session_id: string | null;
  checkout_url: string | null;
  tremendous_order_id: string | null;
  tremendous_reward_id: string | null;
  delivery_link: string | null;
  delivery_state: string | null;
  redemption_state: string | null;
  created_at: number;
};

export function serviceFeeCents(env: Env = process.env): number {
  const raw = (env.GIFT_SEND_SERVICE_FEE_CENTS ?? "").trim();
  if (!raw) return DEFAULT_SERVICE_FEE_CENTS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new HttpError(500, "invalid_fee", "GIFT_SEND_SERVICE_FEE_CENTS must be a non-negative integer number of cents.");
  }
  return n;
}

/** Customer total = face value + configured service fee. Tremendous's gift-card fee is $0. */
export function quoteCents(faceCents: number, feeCents: number = DEFAULT_SERVICE_FEE_CENTS): number {
  if (!Number.isInteger(faceCents) || faceCents < 0) {
    throw new HttpError(400, "invalid_amount", "face value must be a non-negative integer number of cents.");
  }
  if (!Number.isInteger(feeCents) || feeCents < 0) {
    throw new HttpError(400, "invalid_fee", "fee_cents must be a non-negative integer.");
  }
  return faceCents + feeCents;
}

export function buildQuote(faceCents: number, env: Env = process.env): Quote {
  const fee = serviceFeeCents(env);
  return {
    face_cents: faceCents,
    fee_cents: fee,
    provider_fee_cents: PROVIDER_FEE_CENTS,
    total_cents: quoteCents(faceCents, fee),
    currency: "usd",
  };
}

function money(cents: number): string {
  const [whole, frac] = (cents / 100).toFixed(2).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function catalogProduct(id: string): CatalogProduct | null {
  const found = STUB_PRODUCTS.find((product) => product.id === id);
  if (!found) return null;
  return {
    reward_id: found.id,
    name: found.name,
    brand: found.name,
    category: found.category,
    min_cents: found.min * 100,
    max_cents: found.max * 100,
    fee_cents: 0,
    countries: found.countries,
  };
}

function rejection(product: CatalogProduct | null): { status: number; code: string; message: string } | null {
  if (!product) return { status: 400, code: "unknown_reward", message: "That reward is not in the Tremendous catalog." };
  if (CASH.has(product.category)) {
    return {
      status: 400,
      code: "cash_payout_disabled",
      message: `Cash payouts are disabled in GiftSend v1 (${product.category}). Gift cards, Visa/Mastercard prepaid, and charity only.`,
    };
  }
  if (!ALLOWED.has(product.category)) {
    return {
      status: 400,
      code: "reward_not_allowed",
      message: `Reward category ${product.category || "unknown"} is not available in GiftSend v1.`,
    };
  }
  return null;
}

function publicProduct(product: CatalogProduct): RewardProduct {
  return {
    reward_id: product.reward_id,
    name: product.name,
    brand: product.brand,
    min_cents: product.min_cents,
    max_cents: product.max_cents,
    fee_cents: product.fee_cents,
  };
}

export function listStubRewardProducts(query: { country?: string; category?: string } = {}): RewardProduct[] {
  return STUB_PRODUCTS.map((product) => catalogProduct(product.id)!)
    .filter((product) => !rejection(product))
    .filter((product) => {
      if (query.category && product.category !== String(query.category).trim()) return false;
      if (query.country) {
        const code = String(query.country).trim().toUpperCase();
        if (product.countries.length && !product.countries.includes(code)) return false;
      }
      return true;
    })
    .map(publicProduct);
}

function safeId(id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new HttpError(400, "invalid_id", "Invalid id");
  return id;
}

function text(value: unknown, max: number): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned.length > max || /[\u0000-\u001f\u007f]/.test(cleaned)) return "";
  return cleaned;
}

function recipientOf(input: unknown, method: string): { email: string | null; phone: string | null; name: string; key: string } {
  if (!input || typeof input !== "object") throw new HttpError(400, "invalid_recipient", "recipient must include an email or a phone number.");
  const raw = input as Record<string, unknown>;
  const email = raw.email ? text(raw.email, 120) : "";
  const phone = raw.phone ? text(raw.phone, 20) : "";
  const name = raw.name ? text(raw.name, 80) : "Gift recipient";
  if (raw.email && !email) throw new HttpError(400, "invalid_recipient", "recipient.email is invalid.");
  if (raw.phone && !phone) throw new HttpError(400, "invalid_recipient", "recipient.phone is invalid.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "invalid_recipient", "recipient.email is invalid.");
  if (phone && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) throw new HttpError(400, "invalid_recipient", "recipient.phone is invalid.");
  if (!email && !phone) throw new HttpError(400, "invalid_recipient", "recipient must include an email or a phone number.");
  if (method === "EMAIL" && !email) throw new HttpError(400, "invalid_recipient", "EMAIL delivery requires recipient.email.");
  if (method === "PHONE" && !phone) throw new HttpError(400, "invalid_recipient", "PHONE delivery requires recipient.phone.");
  return {
    email: email || null,
    phone: phone || null,
    name: name || "Gift recipient",
    key: email ? `email:${email.toLowerCase()}` : `phone:${phone.replace(/\D/g, "")}`,
  };
}

function openDb(env: Env): DatabaseSync {
  const mode = readAppMode("GIFT_SEND_APP_MODE", env);
  const root = envValue("GIFT_SEND_DATA_DIR", env) || join(tmpdir(), "muse-gift-send");
  const file = join(root, mode, "giftsend.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      owner_key TEXT NOT NULL,
      status TEXT NOT NULL,
      recipient_email TEXT,
      recipient_phone TEXT,
      recipient_name TEXT NOT NULL,
      recipient_key TEXT NOT NULL,
      reward_id TEXT NOT NULL,
      reward_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      message TEXT,
      delivery_method TEXT NOT NULL,
      session_id TEXT UNIQUE,
      checkout_url TEXT,
      tremendous_order_id TEXT,
      tremendous_reward_id TEXT,
      delivery_link TEXT,
      delivery_state TEXT,
      redemption_state TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drafts_recipient ON drafts(recipient_key, created_at);
  `);
  const stored = db.prepare("SELECT value FROM settings WHERE key='mode'").get() as { value: string } | undefined;
  if (stored && stored.value !== mode) {
    db.close();
    throw new HttpError(500, "mode_mismatch", "Use a separate DATA_DIR for each GIFT_SEND_APP_MODE.");
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('mode', ?)").run(mode);
  return db;
}

function withDb<T>(env: Env, fn: (db: DatabaseSync) => T): T {
  const db = openDb(env);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function rowGift(row: DraftRow, env: Env): Gift {
  return {
    draft_id: row.id,
    gift_id: row.id,
    status: row.status,
    recipient: {
      name: row.recipient_name,
      ...(row.recipient_email ? { email: row.recipient_email } : {}),
      ...(row.recipient_phone ? { phone: row.recipient_phone } : {}),
    },
    reward_id: row.reward_id,
    reward_name: row.reward_name,
    amount_cents: row.amount_cents,
    message: row.message,
    delivery_method: row.delivery_method as Gift["delivery_method"],
    quote: buildQuote(row.amount_cents, env),
    checkout_url: row.checkout_url,
    delivery_state: row.delivery_state || "pending",
    redemption_state: row.redemption_state || "unredeemed",
    tremendous_order_id: row.tremendous_order_id,
    tremendous_reward_id: row.tremendous_reward_id,
    delivery_link: row.delivery_link,
    mode: "demo",
    ordered: Boolean(row.tremendous_order_id),
  };
}

async function serviceCall(env: Env, path: string, ownerKeyId: string, init: RequestInit = {}): Promise<unknown> {
  if (readAppMode("GIFT_SEND_APP_MODE", env) === "demo") {
    throw new HttpError(500, "demo_egress", "Demo mode cannot call the fulfillment service.");
  }
  assertGiftSendReady(env);
  const base = envValue("GIFT_SEND_SERVICE_URL", env).replace(/\/$/, "");
  if (!base) {
    throw new HttpError(
      503,
      "missing_credentials",
      "GIFT_SEND_SERVICE_URL is required when GIFT_SEND_APP_MODE is test or live. Refusing to stub.",
    );
  }
  const url = new URL(path.replace(/^\//, ""), `${base}/`);
  const host = url.hostname;
  if (
    host === "api.tremendous.com" ||
    host === "testflight.tremendous.com" ||
    host === "api.stripe.com" ||
    host.endsWith(".stripe.com")
  ) {
    throw new HttpError(500, "invalid_service_url", "GIFT_SEND_SERVICE_URL must be the GiftSend fulfillment service.");
  }
  const headers = new Headers(init.headers);
  headers.set("x-owner-key", ownerKeyId);
  if (init.body) headers.set("content-type", "application/json");
  const response = await providerRequest(url.toString(), { ...init, headers });
  const body = response.json as { error?: string; code?: string } | null;
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError(response.status, body?.code || "service_error", body?.error || `GiftSend service returned HTTP ${response.status}`);
  }
  return response.json;
}

export async function listRewardProducts(
  query: { country?: string; category?: string } = {},
  ownerKeyId = "gateway",
  env: Env = process.env,
): Promise<{ products: RewardProduct[] }> {
  if (readAppMode("GIFT_SEND_APP_MODE", env) !== "demo") {
    const params = new URLSearchParams();
    if (query.country) params.set("country", query.country);
    if (query.category) params.set("category", query.category);
    const suffix = params.size ? `?${params}` : "";
    return (await serviceCall(env, `/products${suffix}`, ownerKeyId)) as { products: RewardProduct[] };
  }
  return { products: listStubRewardProducts(query) };
}

export async function createGiftDraft(
  input: {
    recipient: unknown;
    reward_id: unknown;
    amount_cents: unknown;
    message?: unknown;
    delivery_method: unknown;
    ownerKeyId: string;
  },
  env: Env = process.env,
): Promise<Gift> {
  const method = String(input.delivery_method || "").trim().toUpperCase();
  if (!DELIVERY.has(method)) throw new HttpError(400, "invalid_delivery", "delivery_method must be EMAIL, PHONE, or LINK.");
  const recipient = recipientOf(input.recipient, method);
  const amount = Number(input.amount_cents);
  if (!Number.isInteger(amount) || amount < 1) throw new HttpError(400, "invalid_amount", "amount_cents must be a positive integer.");
  if (amount > MAX_PAYOUT_CENTS) {
    throw new HttpError(400, "amount_limit", `Amount exceeds the ${money(MAX_PAYOUT_CENTS)} maximum per payout.`);
  }
  const message = input.message == null || input.message === "" ? null : text(input.message, 500);
  if (input.message && !message) throw new HttpError(400, "invalid_message", "message is invalid.");
  if (readAppMode("GIFT_SEND_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, "/drafts", input.ownerKeyId, {
      method: "POST",
      body: JSON.stringify({
        recipient: input.recipient,
        reward_id: input.reward_id,
        amount_cents: amount,
        message,
        delivery_method: method,
      }),
    })) as Gift;
  }
  const product = catalogProduct(String(input.reward_id || ""));
  const rejected = rejection(product);
  if (rejected) throw new HttpError(rejected.status, rejected.code, rejected.message);
  if (amount < product!.min_cents || amount > product!.max_cents) {
    throw new HttpError(
      400,
      "amount_limit",
      `Amount is outside this reward's range (${money(product!.min_cents)}–${money(product!.max_cents)}).`,
    );
  }
  const quote = buildQuote(amount, env);
  const id = `gs_${crypto.randomUUID()}`;
  const ts = Date.now();
  return withDb(env, (db) => {
    const spent = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM drafts
         WHERE recipient_key=? AND status!='cancelled' AND created_at>=?`,
      )
      .get(recipient.key, ts - DAY_MS) as { total: number };
    if (Number(spent?.total || 0) + amount > MAX_RECIPIENT_DAY_CENTS) {
      throw new HttpError(
        400,
        "recipient_daily_limit",
        `Amount exceeds the ${money(MAX_RECIPIENT_DAY_CENTS)} maximum per recipient per day.`,
      );
    }
    db.prepare(
      `INSERT INTO drafts (
        id, owner_key, status, recipient_email, recipient_phone, recipient_name, recipient_key,
        reward_id, reward_name, amount_cents, fee_cents, total_cents, message, delivery_method,
        delivery_state, redemption_state, created_at
      ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unredeemed', ?)`,
    ).run(
      id,
      input.ownerKeyId,
      recipient.email,
      recipient.phone,
      recipient.name,
      recipient.key,
      product!.reward_id,
      product!.name,
      amount,
      quote.fee_cents,
      quote.total_cents,
      message,
      method,
      ts,
    );
    const row = db.prepare("SELECT * FROM drafts WHERE id=?").get(id) as DraftRow;
    return rowGift(row, env);
  });
}

export async function getGift(giftId: string, ownerKeyId: string, env: Env = process.env): Promise<Gift> {
  const id = safeId(giftId);
  if (readAppMode("GIFT_SEND_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, `/gifts/${id}`, ownerKeyId)) as Gift;
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row) throw new HttpError(404, "not_found", "Gift not found");
    return rowGift(row, env);
  });
}

export async function listGifts(ownerKeyId: string, env: Env = process.env): Promise<Gift[]> {
  if (readAppMode("GIFT_SEND_APP_MODE", env) !== "demo") {
    const body = (await serviceCall(env, "/drafts", ownerKeyId)) as { gifts: Gift[] };
    return body.gifts;
  }
  return withDb(env, (db) => {
    const rows = db.prepare("SELECT * FROM drafts WHERE owner_key=? ORDER BY created_at DESC").all(ownerKeyId) as DraftRow[];
    return rows.map((row) => rowGift(row, env));
  });
}

export async function sendGift(draftId: string, ownerKeyId: string, env: Env = process.env): Promise<Record<string, unknown>> {
  const id = safeId(draftId);
  if (readAppMode("GIFT_SEND_APP_MODE", env) !== "demo") {
    assertGiftSendReady(env);
    const reserved = (await serviceCall(env, `/drafts/${id}/reserve`, ownerKeyId, { method: "POST" })) as { quote: Quote };
    const catalog = (env.NEXT_PUBLIC_CATALOG_URL || "https://muse.telep.io").replace(/\/$/, "");
    let session;
    try {
      session = await createCheckoutSession({
        connectorSlug: "gift-send",
        jobId: id,
        amountCents: reserved.quote.total_cents,
        currency: "usd",
        successUrl: `${catalog}/connectors/gift-send#checkout-${id}`,
        cancelUrl: `${catalog}/connectors/gift-send`,
        description: `Gift card face value plus GiftSend service fee for ${id}`,
        metadata: {
          draft_id: id,
          face_cents: String(reserved.quote.face_cents),
          fee_cents: String(reserved.quote.fee_cents),
        },
      });
    } catch (error) {
      await serviceCall(env, `/drafts/${id}/release`, ownerKeyId, { method: "POST" }).catch(() => undefined);
      throw error;
    }
    await serviceCall(env, `/drafts/${id}/session`, ownerKeyId, {
      method: "POST",
      body: JSON.stringify({ session_id: session.id, checkout_url: session.url }),
    });
    return {
      draft_id: id,
      checkout_url: session.url,
      session_id: session.id,
      quote: reserved.quote,
      mode: readAppMode("GIFT_SEND_APP_MODE", env),
      ordered: false,
      note:
        session.mode === "live"
          ? "Stripe checkout is open. Tremendous sends the reward only after the shared billing webhook reports payment_status paid."
          : "Stub checkout: STRIPE_SECRET_KEY is not set. Tremendous was not called and no reward was sent.",
    };
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row) throw new HttpError(404, "not_found", "Gift not found");
    if (row.session_id) throw new HttpError(409, "checkout_exists", "A checkout session already exists for this draft.");
    const sessionId = `demo_cs_${id}`;
    const checkoutUrl = `demo://gift-send/checkout/${id}`;
    const updated = db
      .prepare(`UPDATE drafts SET status='checkout', session_id=?, checkout_url=? WHERE id=? AND session_id IS NULL`)
      .run(sessionId, checkoutUrl, id);
    if (!updated.changes) throw new HttpError(409, "checkout_exists", "A checkout session already exists for this draft.");
    return {
      draft_id: id,
      checkout_url: checkoutUrl,
      session_id: sessionId,
      quote: buildQuote(row.amount_cents, env),
      mode: "demo",
      ordered: false,
      note: "Demo checkout does not call Stripe or Tremendous and does not send a reward.",
    };
  });
}

export async function cancelGift(giftId: string, ownerKeyId: string, env: Env = process.env): Promise<Gift> {
  const id = safeId(giftId);
  if (readAppMode("GIFT_SEND_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, `/gifts/${id}/cancel`, ownerKeyId, { method: "POST" })) as Gift;
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row) throw new HttpError(404, "not_found", "Gift not found");
    if (row.status !== "cancelled") {
      db.prepare(`UPDATE drafts SET status='cancelled', delivery_state='cancelled' WHERE id=?`).run(id);
    }
    const next = db.prepare("SELECT * FROM drafts WHERE id=?").get(id) as DraftRow;
    return {
      ...rowGift(next, env),
      status: "cancelled",
      note: "Demo cancel. No Tremendous order existed, so Tremendous was not called.",
    } as Gift;
  });
}

/** Test helper. Production routes do not call this. */
export function resetGifts(env: Env = process.env): void {
  withDb(env, (db) => {
    db.exec("DELETE FROM drafts");
  });
}
