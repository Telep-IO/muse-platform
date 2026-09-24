import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HttpError, createCheckoutSession, envValue, readAppMode, type Env } from "@telep/platform";

function catalogOrigin(): string {
  return process.env.NEXT_PUBLIC_CATALOG_URL || "https://muse.telep.io";
}

/** Demo catalog fixture only. Live quotes never use these numbers. */
export const DEMO_UNIT_COST_CENTS = 516;
export const DEMO_FIRST_SHIPPING_CENTS = 450;
export const DEMO_ADDITIONAL_SHIPPING_CENTS = 200;
export const DEMO_BLUEPRINT_ID = 68;
export const DEMO_PROVIDER_ID = 9;
export const DEMO_VARIANT_ID = 184;

export const DEFAULT_MARKUP_BPS = 2500;

export const ARTWORK_ATTESTATION =
  "I own or am licensed for this artwork. Telep IO LLC is the merchant of record and is solely responsible to Printify for the design.";

export type Recipient = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  region?: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
};

export type Quote = {
  base_cents: number;
  shipping_cents: number;
  markup_cents: number;
  markup_bps: number;
  total_cents: number;
  currency: "usd";
};

export type MerchDraft = {
  id: string;
  owner_key_id: string;
  status: string;
  blueprint_id: number;
  print_provider_id: number;
  variant_id: number;
  quantity: number;
  artwork_url: string;
  artwork_attestation: string;
  recipient: Recipient;
  quote: Quote;
  mockup_urls: string[];
  printify_product_id?: string;
  checkout_session_id?: string;
  checkout_url?: string;
  printify_order_id?: string;
  printify_status?: string;
  tracking?: string;
  note: string;
};

export type MerchOrder = MerchDraft;

export function markupBps(env: Env = process.env): number {
  const raw = (env.PRINT_MERCH_MARKUP_BPS ?? "").trim();
  if (!raw) return DEFAULT_MARKUP_BPS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10000) {
    throw new HttpError(400, "invalid_request", "PRINT_MERCH_MARKUP_BPS must be an integer from 0 to 10000");
  }
  return n;
}

export function quoteCents(baseCents: number, shippingCents: number, bps = DEFAULT_MARKUP_BPS): Quote {
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new HttpError(400, "invalid_request", "base_cents must be a non-negative integer");
  }
  if (!Number.isInteger(shippingCents) || shippingCents < 0) {
    throw new HttpError(400, "invalid_request", "shipping_cents must be a non-negative integer");
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new HttpError(400, "invalid_request", "markup basis points must be an integer from 0 to 10000");
  }
  const markup_cents = Math.round(((baseCents + shippingCents) * bps) / 10000);
  return {
    base_cents: baseCents,
    shipping_cents: shippingCents,
    markup_cents,
    markup_bps: bps,
    total_cents: baseCents + shippingCents + markup_cents,
    currency: "usd",
  };
}

export function demoBaseAndShipping(quantity: number): { base_cents: number; shipping_cents: number } {
  return {
    base_cents: DEMO_UNIT_COST_CENTS * quantity,
    shipping_cents: DEMO_FIRST_SHIPPING_CENTS + DEMO_ADDITIONAL_SHIPPING_CENTS * (quantity - 1),
  };
}

const REVIEW_NOTE =
  "Review the mockups and the quote, then pay. Printify does not receive a production order until Stripe reports payment_status paid. Demo mode never contacts Printify.";

let db: DatabaseSync | null = null;
let dir: string | null = null;

function database(): DatabaseSync {
  if (db) return db;
  const configured = process.env.PRINT_MERCH_DATA_DIR?.trim();
  dir = configured || join(tmpdir(), `print-merch-${process.pid}-${randomUUID()}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(join(dir, "print-merch.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      owner_key_id TEXT NOT NULL,
      body TEXT NOT NULL
    );`);
  const stored = db.prepare("SELECT value FROM settings WHERE key='mode'").get() as { value: string } | undefined;
  if (stored && stored.value !== "demo") {
    db.close();
    db = null;
    throw new HttpError(500, "invalid_mode", "Use a separate DATA_DIR for each APP_MODE.");
  }
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('mode', ?)").run("demo");
  return db;
}

export function resetDrafts(): void {
  if (db) {
    db.close();
    db = null;
  }
  if (!process.env.PRINT_MERCH_DATA_DIR?.trim() && dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
}

function parse(body: string): MerchOrder {
  return JSON.parse(body) as MerchOrder;
}

function save(order: MerchOrder): void {
  database()
    .prepare(
      `INSERT INTO drafts (id, owner_key_id, body) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET body=excluded.body, owner_key_id=excluded.owner_key_id`,
    )
    .run(order.id, order.owner_key_id, JSON.stringify(order));
}

export function publicOrder(order: MerchOrder) {
  return {
    id: order.id,
    order_id: order.id,
    draft_id: order.id,
    status: order.status,
    blueprint_id: order.blueprint_id,
    print_provider_id: order.print_provider_id,
    variant_id: order.variant_id,
    quantity: order.quantity,
    artwork_url: order.artwork_url,
    artwork_attestation: order.artwork_attestation,
    recipient: order.recipient,
    quote: order.quote,
    mockup_urls: order.mockup_urls,
    printify_product_id: order.printify_product_id ?? null,
    checkout_url: order.checkout_url ?? null,
    printify_order_id: order.printify_order_id ?? null,
    printify_status: order.printify_status ?? null,
    tracking: order.tracking ?? null,
    note: order.note,
  };
}

function text(value: unknown, name: string, max = 120): string {
  if (typeof value !== "string") throw new HttpError(400, "invalid_request", `${name} is required`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new HttpError(400, "invalid_request", `${name} must be 1–${max} characters without control characters`);
  }
  return trimmed;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, "invalid_request", `${name} must be an integer`);
  }
  return value;
}

export function parseRecipient(value: unknown): Recipient {
  if (!value || typeof value !== "object") throw new HttpError(400, "invalid_request", "recipient is required");
  const body = value as Record<string, unknown>;
  const country = text(body.country, "recipient.country", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "invalid_request", "recipient.country must be a 2-letter code");
  const region = body.region == null || body.region === "" ? undefined : text(body.region, "recipient.region", 64);
  if (country === "US" && !region) throw new HttpError(400, "invalid_request", "recipient.region is required for US addresses");
  const email = text(body.email, "recipient.email", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "invalid_request", "recipient.email is invalid");
  return {
    first_name: text(body.first_name, "recipient.first_name", 40),
    last_name: text(body.last_name, "recipient.last_name", 40),
    email,
    phone: text(body.phone, "recipient.phone", 32),
    country,
    ...(region ? { region } : {}),
    address1: text(body.address1, "recipient.address1", 80),
    ...(body.address2 == null || body.address2 === "" ? {} : { address2: text(body.address2, "recipient.address2", 80) }),
    city: text(body.city, "recipient.city", 64),
    zip: text(body.zip, "recipient.zip", 16),
  };
}

export function parseDraftInput(body: Record<string, unknown>) {
  if (body.artwork_rights_attested !== true) {
    throw new HttpError(
      400,
      "artwork_rights_required",
      `artwork_rights_attested must be true before a draft is stored. ${ARTWORK_ATTESTATION}`,
    );
  }
  const artwork_url = text(body.artwork_url, "artwork_url", 2000);
  let parsed: URL;
  try {
    parsed = new URL(artwork_url);
  } catch {
    throw new HttpError(400, "invalid_request", "artwork_url must be an https URL");
  }
  if (parsed.protocol !== "https:") throw new HttpError(400, "invalid_request", "artwork_url must be an https URL");
  const quantity = integer(body.quantity, "quantity");
  if (quantity < 1 || quantity > 50) throw new HttpError(400, "invalid_request", "quantity must be an integer from 1 to 50");
  return {
    blueprint_id: integer(body.blueprint_id, "blueprint_id"),
    print_provider_id: integer(body.print_provider_id, "print_provider_id"),
    variant_id: integer(body.variant_id, "variant_id"),
    artwork_url,
    quantity,
    recipient: parseRecipient(body.recipient),
  };
}

function modeOf(env: Env): "demo" | "test" | "live" {
  return readAppMode("PRINT_MERCH_APP_MODE", env);
}

async function callService(env: Env, path: string, ownerKeyId: string, init: RequestInit = {}): Promise<unknown> {
  if (modeOf(env) === "demo") {
    throw new HttpError(500, "invalid_mode", "Demo mode does not call the fulfillment service");
  }
  const base = envValue("PRINT_MERCH_SERVICE_URL", env).replace(/\/$/, "");
  if (!base) throw new HttpError(503, "missing_credentials", "PRINT_MERCH_SERVICE_URL is not set");
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  headers.set("x-owner-key-id", ownerKeyId);
  const token = envValue("PRINT_MERCH_SERVICE_TOKEN", env);
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new HttpError(502, "provider_unreachable", "PrintMerch fulfillment service request failed");
  }
  const textBody = await response.text();
  let json: { error?: { code?: string; message?: string } } | null = null;
  if (textBody) {
    try {
      json = JSON.parse(textBody) as { error?: { code?: string; message?: string } };
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    throw new HttpError(
      response.status,
      json?.error?.code || "provider_error",
      json?.error?.message || `Fulfillment service returned HTTP ${response.status}`,
    );
  }
  return json;
}

export async function createMerchDraft(body: Record<string, unknown>, ownerKeyId: string, env: Env = process.env): Promise<MerchOrder> {
  const input = parseDraftInput(body);
  if (modeOf(env) !== "demo") {
    const created = (await callService(env, "/drafts", ownerKeyId, {
      method: "POST",
      body: JSON.stringify({ ...input, artwork_rights_attested: true }),
    })) as MerchOrder;
    return created;
  }
  const costs = demoBaseAndShipping(input.quantity);
  const id = `pm_${randomUUID()}`;
  const order: MerchOrder = {
    id,
    owner_key_id: ownerKeyId,
    status: "draft",
    ...input,
    artwork_attestation: ARTWORK_ATTESTATION,
    quote: quoteCents(costs.base_cents, costs.shipping_cents, markupBps(env)),
    mockup_urls: [`https://mockup.invalid/print-merch/${id}.png`],
    note: `${REVIEW_NOTE} Prices are a labeled demo fixture (blueprint ${DEMO_BLUEPRINT_ID}), not a live Printify catalog price.`,
  };
  save(order);
  return order;
}

export async function listMerchOrders(ownerKeyId: string, env: Env = process.env): Promise<MerchOrder[]> {
  if (modeOf(env) !== "demo") {
    const json = (await callService(env, "/orders", ownerKeyId)) as { orders: MerchOrder[] };
    return json.orders;
  }
  const rows = database().prepare("SELECT body FROM drafts WHERE owner_key_id=? ORDER BY id").all(ownerKeyId) as { body: string }[];
  return rows.map((row) => parse(row.body));
}

export async function getMerchOrder(id: string, ownerKeyId: string, env: Env = process.env): Promise<MerchOrder | undefined> {
  if (modeOf(env) !== "demo") {
    try {
      return (await callService(env, `/orders/${encodeURIComponent(id)}`, ownerKeyId)) as MerchOrder;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return undefined;
      throw error;
    }
  }
  const row = database().prepare("SELECT body FROM drafts WHERE id=? AND owner_key_id=?").get(id, ownerKeyId) as
    | { body: string }
    | undefined;
  return row ? parse(row.body) : undefined;
}

function stubCheckoutUrl(id: string): string {
  const page = `${catalogOrigin()}/connectors/print-merch#checkout-${id}`;
  return `${page}?checkout=stub&job=${encodeURIComponent(id)}`;
}

export async function placeMerchOrder(id: string, ownerKeyId: string, env: Env = process.env): Promise<MerchOrder> {
  if (modeOf(env) !== "demo") {
    const reserved = (await callService(env, `/drafts/${encodeURIComponent(id)}/checkout`, ownerKeyId, {
      method: "POST",
      body: JSON.stringify({ phase: "reserve" }),
    })) as MerchOrder;
    const quote = reserved.quote;
    try {
      const session = await createCheckoutSession({
        connectorSlug: "print-merch",
        jobId: id,
        amountCents: quote.total_cents,
        currency: "usd",
        successUrl: envValue("STRIPE_SUCCESS_URL", env) || `${catalogOrigin()}/connectors/print-merch`,
        cancelUrl: envValue("STRIPE_CANCEL_URL", env) || `${catalogOrigin()}/connectors/print-merch`,
        description: `PrintMerch ${id}`,
        metadata: {
          draft_id: id,
          base_cents: String(quote.base_cents),
          shipping_cents: String(quote.shipping_cents),
          markup_cents: String(quote.markup_cents),
        },
      });
      return (await callService(env, `/drafts/${encodeURIComponent(id)}/checkout`, ownerKeyId, {
        method: "POST",
        body: JSON.stringify({ phase: "commit", session_id: session.id, checkout_url: session.url }),
      })) as MerchOrder;
    } catch (error) {
      await callService(env, `/drafts/${encodeURIComponent(id)}/checkout`, ownerKeyId, {
        method: "POST",
        body: JSON.stringify({ phase: "release" }),
      }).catch(() => undefined);
      throw error;
    }
  }
  const order = await getMerchOrder(id, ownerKeyId, env);
  if (!order) throw new HttpError(404, "not_found", "Order not found");
  if (order.checkout_session_id) {
    throw new HttpError(409, "conflict", "A checkout session already exists for this draft");
  }
  if (order.status !== "draft") {
    throw new HttpError(409, "conflict", `Order is ${order.status}; checkout only from draft`);
  }
  order.checkout_session_id = `stub_cs_${order.id}`;
  order.checkout_url = stubCheckoutUrl(order.id);
  order.status = "checkout";
  order.note =
    "Stub checkout: no Stripe session was created and Printify was not contacted. In test/live, paying this checkout is what allows a production submission.";
  save(order);
  return order;
}

const CANCELABLE = new Set(["on-hold", "payment-not-received"]);

export async function cancelMerchOrder(id: string, ownerKeyId: string, env: Env = process.env): Promise<MerchOrder> {
  if (modeOf(env) !== "demo") {
    return (await callService(env, `/orders/${encodeURIComponent(id)}/cancel`, ownerKeyId, { method: "POST" })) as MerchOrder;
  }
  const order = await getMerchOrder(id, ownerKeyId, env);
  if (!order) throw new HttpError(404, "not_found", "Order not found");
  if (order.printify_order_id && order.printify_status && !CANCELABLE.has(order.printify_status)) {
    throw new HttpError(
      409,
      "not_cancelable",
      "Printify only cancels orders that are still on-hold or payment-not-received. This order is already past that point.",
    );
  }
  order.status = "canceled";
  order.note = order.printify_order_id
    ? "Cancellation requested while the Printify order was still on hold."
    : "Canceled locally. No Printify order existed, so nothing was sent to production.";
  save(order);
  return order;
}

export async function createMockup(body: Record<string, unknown>, ownerKeyId: string, env: Env = process.env) {
  const artwork_url = text(body.artwork_url, "artwork_url", 2000);
  if (!artwork_url.startsWith("https://")) throw new HttpError(400, "invalid_request", "artwork_url must be an https URL");
  const blueprint_id = integer(body.blueprint_id, "blueprint_id");
  const print_provider_id = integer(body.print_provider_id, "print_provider_id");
  const variant_id = integer(body.variant_id, "variant_id");
  if (modeOf(env) !== "demo") {
    return callService(env, "/mockups", ownerKeyId, {
      method: "POST",
      body: JSON.stringify({ blueprint_id, print_provider_id, variant_id, artwork_url }),
    });
  }
  return {
    blueprint_id,
    print_provider_id,
    variant_id,
    mockup_urls: [`https://mockup.invalid/print-merch/${blueprint_id}-${variant_id}.png`],
    note: "Demo mockup. Printify was not contacted. API-created products skip Printify's standard quality check; a human still reviews mockups before payment.",
  };
}
