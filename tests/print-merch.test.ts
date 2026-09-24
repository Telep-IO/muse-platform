import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import { HttpError, lookupKey } from "@telep/platform";
import { dispatchMcp, dispatchRest } from "../lib/gateway";
import { printMerchFulfillmentPlan } from "../lib/billing-forward";
import {
  ARTWORK_ATTESTATION,
  checkPrintMerch,
  handlePrintMerchMcp,
  handlePrintMerchRest,
  quoteCents,
  resetDrafts,
} from "@telep/print-merch";

const DEMO = "muse_sk_demo_localdev";
const originalFetch = globalThis.fetch;

before(() => {
  process.env.MUSE_API_KEYS = DEMO;
  process.env.NEXT_PUBLIC_CATALOG_URL = "http://localhost:3000";
});

const draftBody = {
  blueprint_id: 68,
  print_provider_id: 9,
  variant_id: 184,
  artwork_url: "https://cdn.example/art.png",
  quantity: 2,
  artwork_rights_attested: true,
  recipient: {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "+15555550100",
    country: "US",
    region: "OH",
    address1: "1 Main",
    city: "Cleveland",
    zip: "44113",
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.PRINT_MERCH_APP_MODE;
  delete process.env.PRINT_MERCH_MARKUP_BPS;
  resetDrafts();
});

test("quote cents applies the configured markup", () => {
  const quote = quoteCents(1000, 400, 2500);
  assert.equal(quote.markup_cents, 350);
  assert.equal(quote.total_cents, 1750);
});

test("demo mode never calls fetch, even when a Stripe key is present", async () => {
  process.env.PRINT_MERCH_APP_MODE = "demo";
  process.env.STRIPE_SECRET_KEY = "sk_test_present_but_not_used";
  globalThis.fetch = async () => {
    throw new Error("egress");
  };
  const headers = { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" };
  const check = await handlePrintMerchRest(new Request("http://localhost/v1/print-merch/check"), ["check"], lookupKey(DEMO));
  assert.equal(check.status, 200);
  const checked = (await check.json()) as { printify: string; mode: string };
  assert.equal(checked.mode, "demo");
  assert.equal(checked.printify, "skipped");

  const created = await handlePrintMerchRest(
    new Request("http://localhost/v1/print-merch/merch_orders", { method: "POST", headers, body: JSON.stringify(draftBody) }),
    ["merch_orders"],
    lookupKey(DEMO),
  );
  assert.equal(created.status, 201);
  const draft = (await created.json()) as {
    id: string;
    quote: { base_cents: number; shipping_cents: number; markup_cents: number; total_cents: number };
    artwork_attestation: string;
    mockup_urls: string[];
    status: string;
  };
  assert.equal(draft.quote.base_cents, 1032);
  assert.equal(draft.quote.shipping_cents, 650);
  assert.equal(draft.quote.markup_cents, 421);
  assert.equal(draft.quote.total_cents, 2103);
  assert.equal(draft.artwork_attestation, ARTWORK_ATTESTATION);
  assert.ok(draft.mockup_urls[0].includes("mockup.invalid"));
  assert.equal(draft.status, "draft");

  const checkout = await handlePrintMerchRest(
    new Request(`http://localhost/v1/print-merch/merch_orders/${draft.id}/checkout`, { method: "POST", headers }),
    ["merch_orders", draft.id, "checkout"],
    lookupKey(DEMO),
  );
  assert.equal(checkout.status, 200);
  const paid = (await checkout.json()) as { status: string; checkout_url: string; printify_order_id: string | null };
  assert.equal(paid.status, "checkout");
  assert.equal(paid.printify_order_id, null);
  assert.match(paid.checkout_url, /checkout=stub/);

  const again = await handlePrintMerchRest(
    new Request(`http://localhost/v1/print-merch/merch_orders/${draft.id}/checkout`, { method: "POST", headers }),
    ["merch_orders", draft.id, "checkout"],
    lookupKey(DEMO),
  );
  assert.equal(again.status, 409);

  const missingRights = await handlePrintMerchRest(
    new Request("http://localhost/v1/print-merch/merch_orders", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...draftBody, artwork_rights_attested: false }),
    }),
    ["merch_orders"],
    lookupKey(DEMO),
  );
  assert.equal(missingRights.status, 400);
});

test("test mode without credentials fails closed and does not call fetch", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  await assert.rejects(() => checkPrintMerch({ PRINT_MERCH_APP_MODE: "test" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  assert.equal(called, false);
});

test("auto approval fails the read-only check before any write", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method || "GET"} ${url}`);
    if (url.endsWith("/shops.json")) {
      return new Response(JSON.stringify([{ id: 99, order_approval: "automatic" }]), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  await assert.rejects(
    () =>
      checkPrintMerch({
        PRINT_MERCH_APP_MODE: "test",
        PRINT_MERCH_PRINTIFY_API_KEY: "pat_placeholder",
        PRINT_MERCH_SHOP_ID: "99",
        PRINT_MERCH_SERVICE_URL: "http://127.0.0.1:9",
      }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "approval_not_manual");
      return true;
    },
  );
  assert.deepEqual(calls, ["GET https://api.printify.com/v1/shops.json"]);
});

test("dispatch serves print-merch REST and MCP", async () => {
  process.env.PRINT_MERCH_APP_MODE = "demo";
  const listed = await dispatchMcp(
    new Request("http://localhost/mcp/print-merch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    "print-merch",
  );
  const names = ((await listed.json()) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
  for (const name of [
    "list_print_products",
    "get_print_product",
    "create_mockup",
    "create_merch_draft",
    "place_merch_order",
    "get_merch_order_status",
    "cancel_merch_order",
  ]) {
    assert.ok(names.includes(name), name);
  }

  const created = await dispatchRest(
    new Request("http://localhost/v1/print-merch/merch_orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" },
      body: JSON.stringify(draftBody),
    }),
    "print-merch",
    ["merch_orders"],
  );
  assert.equal(created.status, 201);

  const mcp = await handlePrintMerchMcp(
    new Request("http://localhost/mcp/print-merch", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEMO}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_print_products", arguments: { blueprint: 68 } } }),
    }),
  );
  const text = ((await mcp.json()) as { result: { content: { text: string }[] } }).result.content[0].text;
  assert.match(text, /demo fixture/);
});

test("billing forward plan leaves other connectors alone and fails closed when unpaid", () => {
  assert.deepEqual(printMerchFulfillmentPlan({ stub: true, connector: "print-merch", paymentStatus: "paid" }, {}), { action: "passthrough" });
  assert.deepEqual(printMerchFulfillmentPlan({ stub: false, connector: "paper-send", paymentStatus: "paid" }, {}), { action: "passthrough" });
  assert.deepEqual(
    printMerchFulfillmentPlan({ stub: false, connector: "print-merch", paymentStatus: "paid" }, { PRINT_MERCH_APP_MODE: "demo" }),
    { action: "passthrough" },
  );
  assert.deepEqual(
    printMerchFulfillmentPlan({ stub: false, connector: "print-merch", paymentStatus: "unpaid" }, { PRINT_MERCH_APP_MODE: "test" }),
    { action: "unpaid" },
  );
  assert.deepEqual(
    printMerchFulfillmentPlan({ stub: false, connector: "print-merch", paymentStatus: "paid" }, { PRINT_MERCH_APP_MODE: "test" }),
    { action: "unavailable" },
  );
  assert.deepEqual(
    printMerchFulfillmentPlan(
      { stub: false, connector: "print-merch", paymentStatus: "paid" },
      { PRINT_MERCH_APP_MODE: "test", PRINT_MERCH_SERVICE_URL: "https://print.example" },
    ),
    { action: "forward", url: "https://print.example/webhooks/stripe" },
  );
});
