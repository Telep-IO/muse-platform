import type { DatabaseSync } from "node:sqlite";
import { withSqlite, createCheckoutSession, envValue, HttpError, providerRequest, readAppMode, type Env } from "@telep/platform";
import { assertShipLabelReady } from "./provider";

/** USPS only until a later phase explicitly expands scope. */
export const CARRIER_ALLOWLIST = ["USPS"] as const;
export const DEFAULT_SERVICE_FEE_CENTS = 199;
const DEMO_POSTAGE_CENTS = 550;

export type Address = {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country?: string;
};

export type Parcel = {
  weight_oz: number;
  length_in: number;
  width_in: number;
  height_in: number;
};

export type Rate = {
  id: string;
  carrier: "USPS";
  service: string;
  rate: string;
  currency: string;
  postage_cents: number;
};

export type Quote = {
  postage_cents: number;
  fee_cents: number;
  platform_fee_cents: number | null;
  total_cents: number;
  currency: "usd";
  note: string;
};

export type ShipmentDraft = {
  draft_id: string;
  status: string;
  rates: Rate[];
  quote: Quote;
  mode: string;
  purchased: false;
};

export type ShipmentLabel = {
  label_id: string;
  draft_id: string;
  label_url: string | null;
  tracking_code: string | null;
  status: string;
  carrier: "USPS";
  purchased: boolean;
  mode: string;
  note: string;
};

type DraftRow = {
  id: string;
  owner_key: string;
  status: string;
  rates: string;
  session_id: string | null;
  checkout_url: string | null;
  label_id: string | null;
  label_url: string | null;
  tracking_code: string | null;
  label_status: string | null;
  purchased: number;
};

export function restrictionMessage(carrier: string): string {
  const name = carrier.trim() || "That carrier";
  return (
    `${name} is not available. ShipLabel is USPS-only at launch. ` +
    "UPS is excluded because UPS DAP §4.2 does not permit marking up UPS rates to resell labels to another entity or End User, " +
    "and UPS DAP §4.5 requires a direct UPS agreement plus UPS written consent before a platform enrolls end users. " +
    "FedEx is excluded because FedEx by Default §3.2 does not permit selling, assigning, or transferring the benefit of pricing to any other party."
  );
}

export function assertCarrierAllowed(hint: unknown): "USPS" {
  if (hint == null || String(hint).trim() === "") return "USPS";
  const name = String(hint).trim().toUpperCase();
  if (!(CARRIER_ALLOWLIST as readonly string[]).includes(name)) {
    throw new HttpError(400, "carrier_not_allowed", restrictionMessage(name));
  }
  return "USPS";
}

export function serviceFeeCents(env: Env = process.env): number {
  const raw = (env.SHIP_LABEL_SERVICE_FEE_CENTS ?? "").trim();
  if (!raw) return DEFAULT_SERVICE_FEE_CENTS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new HttpError(500, "invalid_fee", "SHIP_LABEL_SERVICE_FEE_CENTS must be a non-negative integer number of cents.");
  }
  return n;
}

export function platformFeeCents(env: Env = process.env): number | null {
  const raw = (env.SHIP_LABEL_EASYPOST_PLATFORM_FEE_CENTS ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new HttpError(
      500,
      "invalid_fee",
      "SHIP_LABEL_EASYPOST_PLATFORM_FEE_CENTS must be a non-negative integer, or empty until the Forge Order Form sets it.",
    );
  }
  return n;
}

/** Customer total = postage + configured service fee. */
export function quoteCents(postageCents: number, feeCents: number = DEFAULT_SERVICE_FEE_CENTS): number {
  if (!Number.isInteger(postageCents) || postageCents < 0) {
    throw new HttpError(400, "invalid_postage", "postage_cents must be a non-negative integer.");
  }
  if (!Number.isInteger(feeCents) || feeCents < 0) {
    throw new HttpError(400, "invalid_fee", "fee_cents must be a non-negative integer.");
  }
  return postageCents + feeCents;
}

export function buildQuote(postageCents: number, env: Env = process.env): Quote {
  const fee = serviceFeeCents(env);
  const platform = platformFeeCents(env);
  return {
    postage_cents: postageCents,
    fee_cents: fee,
    platform_fee_cents: platform,
    total_cents: quoteCents(postageCents, fee),
    currency: "usd",
    note:
      platform == null
        ? "Customer total is EasyPost USPS postage plus the configured service fee. The Forge per-label platform fee is not configured."
        : "Customer total is EasyPost USPS postage plus the configured service fee. The Forge platform fee is recorded separately and is not added again.",
  };
}

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);

function requireAddress(value: unknown, label: string): Address {
  if (!value || typeof value !== "object") throw new HttpError(400, "invalid_address", `${label} is required`);
  const a = value as Record<string, unknown>;
  const name = String(a.name ?? "").trim();
  const address_line1 = String(a.address_line1 ?? "").trim();
  const address_city = String(a.address_city ?? "").trim();
  const address_state = String(a.address_state ?? "").trim().toUpperCase();
  const address_zip = String(a.address_zip ?? "").trim();
  const country = String(a.address_country ?? "US").trim().toUpperCase();
  if (!name || !address_line1 || !address_city || !address_state || !address_zip) {
    throw new HttpError(400, "invalid_address", `${label} needs name, address_line1, address_city, address_state, address_zip`);
  }
  if (!STATES.has(address_state)) throw new HttpError(400, "invalid_address", `${label} needs a US state`);
  if (!/^\d{5}(-\d{4})?$/.test(address_zip)) throw new HttpError(400, "invalid_address", `${label} needs a US ZIP code`);
  if (country !== "US") throw new HttpError(400, "invalid_address", "ShipLabel ships within the United States only");
  return {
    name,
    address_line1,
    address_line2: a.address_line2 ? String(a.address_line2) : "",
    address_city,
    address_state,
    address_zip,
    address_country: "US",
  };
}

function requireParcel(value: unknown): Parcel {
  if (!value || typeof value !== "object") throw new HttpError(400, "invalid_parcel", "parcel is required");
  const p = value as Record<string, unknown>;
  const parcel = {
    weight_oz: Number(p.weight_oz),
    length_in: Number(p.length_in),
    width_in: Number(p.width_in),
    height_in: Number(p.height_in),
  };
  if (![parcel.weight_oz, parcel.length_in, parcel.width_in, parcel.height_in].every((n) => Number.isFinite(n) && n > 0 && n <= 2000)) {
    throw new HttpError(400, "invalid_parcel", "parcel needs positive weight_oz, length_in, width_in, and height_in");
  }
  return parcel;
}

function safeId(id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new HttpError(400, "invalid_id", "Invalid id");
  return id;
}

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      owner_key TEXT NOT NULL,
      status TEXT NOT NULL,
      rates TEXT NOT NULL,
      session_id TEXT UNIQUE,
      checkout_url TEXT,
      label_id TEXT UNIQUE,
      label_url TEXT,
      tracking_code TEXT,
      label_status TEXT,
      purchased INTEGER NOT NULL DEFAULT 0
    );
`;

function withDb<T>(env: Env, fn: (db: DatabaseSync) => T): T {
  return withSqlite("ship-label", SCHEMA, env, fn);
}

function rowDraft(row: DraftRow, env: Env): ShipmentDraft {
  const rates = JSON.parse(row.rates) as Rate[];
  const postage = rates[0]?.postage_cents ?? DEMO_POSTAGE_CENTS;
  return {
    draft_id: row.id,
    status: row.status,
    rates,
    quote: buildQuote(postage, env),
    mode: "demo",
    purchased: false,
  };
}

function rowLabel(row: DraftRow): ShipmentLabel {
  return {
    label_id: row.label_id || "",
    draft_id: row.id,
    label_url: row.label_url,
    tracking_code: row.tracking_code,
    status: row.label_status || "stub",
    carrier: "USPS",
    purchased: Boolean(row.purchased),
    mode: "demo",
    note: "Demo stub. EasyPost was not called and no postage was purchased.",
  };
}

async function serviceCall(env: Env, path: string, ownerKeyId: string, init: RequestInit = {}): Promise<unknown> {
  if (readAppMode("SHIP_LABEL_APP_MODE", env) === "demo") {
    throw new HttpError(500, "demo_egress", "Demo mode cannot call the fulfillment service.");
  }
  const base = envValue("SHIP_LABEL_SERVICE_URL", env).replace(/\/$/, "");
  if (!base) {
    throw new HttpError(
      503,
      "missing_credentials",
      "SHIP_LABEL_SERVICE_URL is required when SHIP_LABEL_APP_MODE is test or live. Refusing to stub.",
    );
  }
  const url = new URL(path.replace(/^\//, ""), `${base}/`);
  if (url.hostname === "api.easypost.com" || url.hostname === "api.stripe.com" || url.hostname.endsWith(".stripe.com")) {
    throw new HttpError(500, "invalid_service_url", "SHIP_LABEL_SERVICE_URL must be the ShipLabel fulfillment service.");
  }
  const headers = new Headers(init.headers);
  headers.set("x-owner-key", ownerKeyId);
  if (init.body) headers.set("content-type", "application/json");
  const response = await providerRequest(url.toString(), { ...init, headers });
  const body = response.json as { error?: string; code?: string } | null;
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError(response.status, body?.code || "service_error", body?.error || `ShipLabel service returned HTTP ${response.status}`);
  }
  return response.json;
}

export async function createShipmentDraft(
  input: { from: unknown; to: unknown; parcel: unknown; carrier_hint?: unknown; ownerKeyId: string },
  env: Env = process.env,
): Promise<ShipmentDraft> {
  assertCarrierAllowed(input.carrier_hint);
  const from = requireAddress(input.from, "from");
  const to = requireAddress(input.to, "to");
  const parcel = requireParcel(input.parcel);
  if (readAppMode("SHIP_LABEL_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, "/drafts", input.ownerKeyId, {
      method: "POST",
      body: JSON.stringify({ from, to, parcel, carrier_hint: input.carrier_hint }),
    })) as ShipmentDraft;
  }
  const rates: Rate[] = [
    {
      id: "rate_demo_usps_priority",
      carrier: "USPS",
      service: "Priority",
      rate: "5.50",
      currency: "USD",
      postage_cents: DEMO_POSTAGE_CENTS,
    },
  ];
  const id = `sd_${crypto.randomUUID()}`;
  return withDb(env, (db) => {
    db.prepare("INSERT INTO drafts (id, owner_key, status, rates) VALUES (?, ?, 'draft', ?)").run(
      id,
      input.ownerKeyId,
      JSON.stringify(rates),
    );
    const row = db.prepare("SELECT * FROM drafts WHERE id=?").get(id) as DraftRow;
    return rowDraft(row, env);
  });
}

export async function getShipmentRates(draftId: string, ownerKeyId: string, env: Env = process.env): Promise<ShipmentDraft> {
  const id = safeId(draftId);
  if (readAppMode("SHIP_LABEL_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, `/drafts/${id}`, ownerKeyId)) as ShipmentDraft;
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row) throw new HttpError(404, "not_found", "Draft not found");
    return rowDraft(row, env);
  });
}

export async function listShipmentDrafts(ownerKeyId: string, env: Env = process.env): Promise<{ drafts: ShipmentDraft[] }> {
  if (readAppMode("SHIP_LABEL_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, "/drafts", ownerKeyId)) as { drafts: ShipmentDraft[] };
  }
  return withDb(env, (db) => {
    const rows = db.prepare("SELECT * FROM drafts WHERE owner_key=?").all(ownerKeyId) as DraftRow[];
    return { drafts: rows.map((row) => rowDraft(row, env)) };
  });
}

export async function buyShippingLabel(
  draftId: string,
  rateId: string,
  ownerKeyId: string,
  env: Env = process.env,
): Promise<Record<string, unknown>> {
  const id = safeId(draftId);
  if (!rateId) throw new HttpError(400, "invalid_rate", "rate_id is required");
  if (readAppMode("SHIP_LABEL_APP_MODE", env) !== "demo") {
    assertShipLabelReady(env);
    const reserved = (await serviceCall(env, `/drafts/${id}/reserve`, ownerKeyId, {
      method: "POST",
      body: JSON.stringify({ rate_id: rateId }),
    })) as { quote: Quote };
    const catalog = (env.NEXT_PUBLIC_CATALOG_URL || "https://muse.telep.io").replace(/\/$/, "");
    let session;
    try {
      session = await createCheckoutSession({
        connectorSlug: "ship-label",
        jobId: id,
        amountCents: reserved.quote.total_cents,
        currency: "usd",
        successUrl: `${catalog}/connectors/ship-label#checkout-${id}`,
        cancelUrl: `${catalog}/connectors/ship-label`,
        description: `USPS postage plus ShipLabel service fee for ${id}`,
        metadata: {
          draft_id: id,
          rate_id: rateId,
          postage_cents: String(reserved.quote.postage_cents),
          fee_cents: String(reserved.quote.fee_cents),
        },
      });
    } catch (error) {
      await serviceCall(env, `/drafts/${id}/release`, ownerKeyId, { method: "POST" }).catch(() => undefined);
      throw error;
    }
    try {
      await serviceCall(env, `/drafts/${id}/session`, ownerKeyId, {
        method: "POST",
        body: JSON.stringify({ session_id: session.id, checkout_url: session.url }),
      });
    } catch (error) {
      throw error;
    }
    return {
      draft_id: id,
      checkout_url: session.url,
      session_id: session.id,
      quote: reserved.quote,
      mode: readAppMode("SHIP_LABEL_APP_MODE", env),
      purchased: false,
      note:
        session.mode === "live"
          ? "Stripe checkout is open. EasyPost buy runs only after the shared billing webhook reports payment_status paid."
          : "Stub checkout: STRIPE_SECRET_KEY is not set. EasyPost was not called and no postage was purchased.",
    };
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row) throw new HttpError(404, "not_found", "Draft not found");
    if (row.session_id) throw new HttpError(409, "checkout_exists", "A checkout session already exists for this draft.");
    const rates = JSON.parse(row.rates) as Rate[];
    const rate = rates.find((item) => item.id === rateId);
    if (!rate || rate.carrier !== "USPS") throw new HttpError(400, "carrier_not_allowed", restrictionMessage(rate?.carrier || "That carrier"));
    const sessionId = `demo_cs_${id}`;
    const labelId = `lbl_${crypto.randomUUID()}`;
    const checkoutUrl = `demo://ship-label/checkout/${id}`;
    const updated = db.prepare(
      `UPDATE drafts SET status='checkout', session_id=?, checkout_url=?, label_id=?, label_status='stub', purchased=0
       WHERE id=? AND session_id IS NULL`,
    ).run(sessionId, checkoutUrl, labelId, id);
    if (!updated.changes) throw new HttpError(409, "checkout_exists", "A checkout session already exists for this draft.");
    return {
      draft_id: id,
      checkout_url: checkoutUrl,
      session_id: sessionId,
      label_id: labelId,
      quote: buildQuote(rate.postage_cents, env),
      mode: "demo",
      purchased: false,
      note: "Demo checkout does not call Stripe or EasyPost and does not buy postage.",
    };
  });
}

export async function getLabel(labelId: string, ownerKeyId: string, env: Env = process.env): Promise<ShipmentLabel> {
  const id = safeId(labelId);
  if (readAppMode("SHIP_LABEL_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, `/labels/${id}`, ownerKeyId)) as ShipmentLabel;
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE label_id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row?.label_id) throw new HttpError(404, "not_found", "Label not found");
    return rowLabel(row);
  });
}

export async function cancelLabel(labelId: string, ownerKeyId: string, env: Env = process.env): Promise<ShipmentLabel> {
  const id = safeId(labelId);
  if (readAppMode("SHIP_LABEL_APP_MODE", env) !== "demo") {
    return (await serviceCall(env, `/labels/${id}/void`, ownerKeyId, { method: "POST" })) as ShipmentLabel;
  }
  return withDb(env, (db) => {
    const row = db.prepare("SELECT * FROM drafts WHERE label_id=? AND owner_key=?").get(id, ownerKeyId) as DraftRow | undefined;
    if (!row?.label_id) throw new HttpError(404, "not_found", "Label not found");
    db.prepare("UPDATE drafts SET label_status='voided' WHERE id=?").run(row.id);
    const next = db.prepare("SELECT * FROM drafts WHERE id=?").get(row.id) as DraftRow;
    return { ...rowLabel(next), status: "voided", note: "Demo void. No postage was purchased, so EasyPost was not called." };
  });
}

/** Test helper. Production routes do not call this. */
export function resetShipments(env: Env = process.env): void {
  withDb(env, (db) => {
    db.exec("DELETE FROM drafts");
  });
}
