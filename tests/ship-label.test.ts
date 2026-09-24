import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { HttpError } from "@telep/platform";
import {
  buyShippingLabel,
  cancelLabel,
  checkShipLabel,
  createShipmentDraft,
  fulfillShipLabelPayment,
  getLabel,
  quoteCents,
  quoteShipLabel,
} from "@telep/ship-label";
import { dispatchStripeEvent, type PaidSession } from "@telep/platform";
import { dispatchMcp, dispatchRest } from "../lib/gateway";

const from = {
  name: "Ada Sender",
  address_line1: "185 Berry St",
  address_city: "San Francisco",
  address_state: "CA",
  address_zip: "94107",
};
const to = {
  name: "Grace Recipient",
  address_line1: "1 Telegraph Hill Blvd",
  address_city: "San Francisco",
  address_state: "CA",
  address_zip: "94133",
};
const parcel = { weight_oz: 16, length_in: 10, width_in: 6, height_in: 4 };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function demoEnv() {
  return {
    SHIP_LABEL_APP_MODE: "demo",
    SHIP_LABEL_DATA_DIR: mkdtempSync(join(tmpdir(), "ship-label-gw-")),
    SHIP_LABEL_SERVICE_FEE_CENTS: "199",
  };
}

test("demo mode drafts, checkout, and void make zero HTTP calls", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("demo egress");
  };
  const env = demoEnv();
  const draft = await createShipmentDraft({ from, to, parcel, ownerKeyId: "owner" }, env);
  assert.equal(draft.quote.postage_cents, 550);
  assert.equal(draft.quote.fee_cents, 199);
  assert.equal(draft.quote.total_cents, quoteCents(550, 199));
  assert.equal(draft.rates.every((rate) => rate.carrier === "USPS"), true);
  const checkout = await buyShippingLabel(draft.draft_id, draft.rates[0].id, "owner", env);
  await assert.rejects(() => buyShippingLabel(draft.draft_id, draft.rates[0].id, "owner", env), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  const label = await getLabel(String(checkout.label_id), "owner", env);
  assert.equal(label.purchased, false);
  assert.equal(label.status, "stub");
  const voided = await cancelLabel(label.label_id, "owner", env);
  assert.equal(voided.status, "voided");
  assert.equal(called, false);
});

test("quote total is postage plus the configured fee", () => {
  const quote = quoteShipLabel(737, { SHIP_LABEL_SERVICE_FEE_CENTS: "250" });
  assert.equal(quote.postage_cents, 737);
  assert.equal(quote.fee_cents, 250);
  assert.equal(quote.total_cents, 987);
  assert.equal(quoteCents(737), 936);
});

test("non-USPS carriers are rejected without HTTP", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("egress");
  };
  await assert.rejects(
    () => createShipmentDraft({ from, to, parcel, carrier_hint: "UPS", ownerKeyId: "owner" }, demoEnv()),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "carrier_not_allowed");
      assert.match(error.message, /UPS DAP §4\.2/);
      assert.match(error.message, /FedEx by Default §3\.2/);
      return true;
    },
  );
  assert.equal(called, false);
});

test("test mode without a service URL fails closed and does not call EasyPost", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("egress");
  };
  await assert.rejects(
    () =>
      createShipmentDraft(
        { from, to, parcel, ownerKeyId: "owner" },
        { SHIP_LABEL_APP_MODE: "test", SHIP_LABEL_EASYPOST_API_KEY: "EZTK_example" },
      ),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "missing_credentials");
      assert.match(error.message, /SHIP_LABEL_SERVICE_URL/);
      return true;
    },
  );
  assert.equal(called, false);
});

test("test mode credential check lists shipments and does not buy", async () => {
  let url = "";
  let method = "";
  globalThis.fetch = async (input, init) => {
    url = String(input);
    method = init?.method ?? "GET";
    return new Response(JSON.stringify({ shipments: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await checkShipLabel({ SHIP_LABEL_APP_MODE: "test", SHIP_LABEL_EASYPOST_API_KEY: "EZTK_example" });
  assert.equal(result.easypost, "ok");
  assert.equal(result.bought, false);
  assert.equal(method, "GET");
  assert.match(url, /https:\/\/api\.easypost\.com\/v2\/shipments\?page_size=1/);
  assert.equal(url.includes("/buy"), false);
  await assert.rejects(
    () =>
      checkShipLabel({
        SHIP_LABEL_APP_MODE: "live",
        SHIP_LABEL_EASYPOST_API_KEY: "EZTK_example",
        SHIP_LABEL_EASYPOST_ORDER_FORM_REFERENCE: "forge-order-form",
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "invalid_credentials");
      return true;
    },
  );
});

test("test mode draft is proxied to the fulfillment service, not EasyPost", async () => {
  let url = "";
  globalThis.fetch = async (input) => {
    url = String(input);
    return new Response(
      JSON.stringify({
        draft_id: "sd_remote",
        status: "draft",
        rates: [{ id: "rate_usps", carrier: "USPS", service: "Priority", rate: "7.37", currency: "USD", postage_cents: 737 }],
        quote: { postage_cents: 737, fee_cents: 199, platform_fee_cents: null, total_cents: 936, currency: "usd", note: "runtime" },
        mode: "test",
        purchased: false,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };
  const draft = await createShipmentDraft(
    { from, to, parcel, ownerKeyId: "owner" },
    {
      SHIP_LABEL_APP_MODE: "test",
      SHIP_LABEL_EASYPOST_API_KEY: "EZTK_example",
      SHIP_LABEL_SERVICE_URL: "http://127.0.0.1:9",
    },
  );
  assert.equal(draft.draft_id, "sd_remote");
  assert.equal(draft.quote.total_cents, 936);
  assert.match(url, /^http:\/\/127\.0\.0\.1:9\/drafts$/);
  assert.equal(url.includes("easypost.com"), false);
});

test("shared billing webhook buys only a paid ship-label session and ignores other connectors", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ fulfilled: true, duplicate: calls.length > 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const env = {
    SHIP_LABEL_APP_MODE: "test",
    SHIP_LABEL_EASYPOST_API_KEY: "EZTK_example",
    SHIP_LABEL_SERVICE_URL: "http://127.0.0.1:9",
  };
  const paid = {
    id: "cs_shared",
    eventId: "evt_1",
    eventType: "checkout.session.completed",
    paymentStatus: "paid",
    livemode: false,
    metadata: { connector: "ship-label", jobId: "sd_remote", draft_id: "sd_remote", rate_id: "rate_usps", postage_cents: "737", fee_cents: "199" },
    amountSubtotal: 936,
    amountTotal: 936,
    currency: "usd",
  } satisfies PaidSession;
  const other = await fulfillShipLabelPayment({ ...paid, metadata: { connector: "paper-send", jobId: "ps_1" } }, env);
  assert.equal(other, undefined);
  const demo = await fulfillShipLabelPayment(paid, { ...env, SHIP_LABEL_APP_MODE: "demo" });
  assert.equal(demo?.reason, "demo");
  const unpaid = await fulfillShipLabelPayment({ ...paid, paymentStatus: "unpaid" }, env);
  assert.equal(unpaid?.fulfilled, false);
  assert.equal(unpaid?.reason, "unpaid");
  const bought = await fulfillShipLabelPayment(paid, env);
  assert.equal(bought?.fulfilled, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/drafts\/sd_remote\/fulfill$/);
  const ignored = await dispatchStripeEvent(
    {
      id: "evt_paper",
      type: "checkout.session.completed",
      data: { object: { id: "cs_paper", payment_status: "paid", metadata: { connector: "paper-send", jobId: "ps_1" } } },
    },
    (session) => fulfillShipLabelPayment(session, env),
  );
  assert.equal(ignored.fulfilled, undefined);
  assert.equal(calls.length, 1);
});

test("gateway routes do not import the fulfillment service", () => {
  const roots = ["connectors/ship-label", "lib", "app", "packages"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(path);
      } else if (/\.(ts|tsx|js)$/.test(entry.name)) files.push(path);
    }
  };
  for (const root of roots) walk(root);
  const blob = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(/from\s+["'][^"']*services\/ship-label/.test(blob), false);
  assert.equal(/require\(\s*["'][^"']*services\/ship-label/.test(blob), false);
});

test("ship-label REST and MCP are wired for demo", async () => {
  const previousMode = process.env.SHIP_LABEL_APP_MODE;
  const previousDir = process.env.SHIP_LABEL_DATA_DIR;
  const previousKeys = process.env.MUSE_API_KEYS;
  process.env.SHIP_LABEL_APP_MODE = "demo";
  process.env.SHIP_LABEL_DATA_DIR = mkdtempSync(join(tmpdir(), "ship-label-rest-"));
  process.env.MUSE_API_KEYS = "muse_sk_demo_localdev";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("demo egress");
  };
  try {
    const headers = { Authorization: "Bearer muse_sk_demo_localdev", "Content-Type": "application/json" };
    const created = await dispatchRest(
      new Request("http://localhost/v1/ship-label/shipments", {
        method: "POST",
        headers,
        body: JSON.stringify({ from, to, parcel }),
      }),
      "ship-label",
      ["shipments"],
    );
    assert.equal(created.status, 201);
    const listed = await dispatchMcp(
      new Request("http://localhost/mcp/ship-label", {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      "ship-label",
    );
    const body = await listed.json();
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    for (const name of ["create_shipment_draft", "get_shipment_rates", "buy_shipping_label", "get_label", "cancel_label"]) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(called, false);
  } finally {
    if (previousMode === undefined) delete process.env.SHIP_LABEL_APP_MODE;
    else process.env.SHIP_LABEL_APP_MODE = previousMode;
    if (previousDir === undefined) delete process.env.SHIP_LABEL_DATA_DIR;
    else process.env.SHIP_LABEL_DATA_DIR = previousDir;
    if (previousKeys === undefined) delete process.env.MUSE_API_KEYS;
    else process.env.MUSE_API_KEYS = previousKeys;
  }
});
