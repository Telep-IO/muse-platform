import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readConfig } from "../src/config.js";
import { quoteCents } from "../src/orders.js";
import { assertManualApproval, createPrintify } from "../src/providers.js";
import { buildApp } from "../src/server.js";
import { openStore } from "../src/store.js";

const recipient = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "+15555550100",
  country: "US",
  region: "OH",
  address1: "1 Main",
  city: "Cleveland",
  zip: "44113",
};

function draftBody(quantity = 1) {
  return {
    blueprint_id: 68,
    print_provider_id: 9,
    variant_id: 184,
    artwork_url: "https://cdn.example/art.png",
    quantity,
    artwork_rights_attested: true,
    recipient,
  };
}

function testEnv(dir) {
  return {
    APP_MODE: "test",
    DATA_DIR: dir,
    SERVICE_PUBLIC_URL: "http://127.0.0.1:9",
    PRINTIFY_API_KEY: "pat_placeholder",
    PRINTIFY_SHOP_ID: "99",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    PRINTIFY_WEBHOOK_SECRET: "pfy_test_secret",
    MARKUP_BPS: "2500",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function listen(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function stop(server, store) {
  await new Promise((resolve) => server.close(resolve));
  await store.close();
}

test("quote math is base plus shipping plus configured markup", () => {
  const quote = quoteCents(1000, 400, 2500);
  assert.equal(quote.markup_cents, 350);
  assert.equal(quote.total_cents, 1750);
});

test("missing test and live credentials fail closed", () => {
  assert.throws(() => readConfig({ APP_MODE: "test" }), /PRINTIFY_API_KEY/);
  assert.throws(
    () =>
      readConfig({
        APP_MODE: "live",
        SERVICE_PUBLIC_URL: "https://print.example",
        PRINTIFY_API_KEY: "pat",
        PRINTIFY_SHOP_ID: "1",
        STRIPE_SECRET_KEY: "sk_live_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
        PRINTIFY_WEBHOOK_SECRET: "pfy",
      }),
    /DATABASE_URL/,
  );
  const demo = readConfig({ APP_MODE: "demo", DATA_DIR: mkdtempSync(join(tmpdir(), "pm-demo-cfg-")) });
  assert.equal(demo.mode, "demo");
  assert.equal(demo.printifyKey, "");
});

test("manual-approval preflight fails closed on auto approval and never posts", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${url}`);
    if (String(url).endsWith("/shops.json")) return jsonResponse([{ id: 99, title: "Telep", order_approval: "automatic" }]);
    return jsonResponse([{ id: 1, title: "Mug" }]);
  };
  const config = readConfig(testEnv(mkdtempSync(join(tmpdir(), "pm-approval-"))));
  await assert.rejects(() => buildApp(testEnv(config.dataDir), { fetchImpl }), /not manual/);
  assert.equal(calls.some((call) => call.startsWith("POST")), false);
  assert.equal(calls.length, 1);
});

test("manual-approval preflight reads the shop and catalog and does not post", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(`${init.method || "GET"} ${url}`);
    if (String(url).endsWith("/shops.json")) return jsonResponse([{ id: 99, title: "Telep", order_approval: "manual" }]);
    if (String(url).endsWith("/catalog/blueprints.json")) return jsonResponse([{ id: 68, title: "Mug" }]);
    throw new Error(`unexpected ${url}`);
  };
  const dir = mkdtempSync(join(tmpdir(), "pm-manual-"));
  const built = await buildApp(testEnv(dir), { fetchImpl });
  assert.deepEqual(calls, [
    "GET https://api.printify.com/v1/shops.json",
    "GET https://api.printify.com/v1/catalog/blueprints.json",
  ]);
  await built.store.close();
  assert.throws(() => assertManualApproval({ id: 99 }), /no order approval field/);
  const printify = createPrintify(readConfig(testEnv(dir)), fetchImpl);
  assert.equal(typeof printify.preflight, "function");
});

test("demo mode performs no HTTP", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target.startsWith("http://127.0.0.1:") || target.startsWith("http://localhost:")) return original(input, init);
    throw new Error(`egress ${target}`);
  };
  const dir = mkdtempSync(join(tmpdir(), "pm-demo-"));
  try {
    const built = await buildApp({ APP_MODE: "demo", DATA_DIR: dir, SERVICE_PUBLIC_URL: "http://127.0.0.1:9" });
    const { server, url } = await listen(built.app);
    const headers = { "content-type": "application/json", "x-owner-key-id": "key_demo" };
    const created = await fetch(`${url}/drafts`, { method: "POST", headers, body: JSON.stringify(draftBody()) });
    assert.equal(created.status, 201);
    const draft = await created.json();
    assert.equal(draft.quote.base_cents, 516);
    assert.equal(draft.quote.shipping_cents, 450);
    assert.equal(draft.quote.markup_cents, 242);
    assert.equal(draft.quote.total_cents, 1208);
    assert.ok(draft.mockup_urls[0].includes("mockup.invalid"));
    const checkout = await fetch(`${url}/drafts/${draft.id}/checkout`, { method: "POST", headers, body: "{}" });
    assert.equal(checkout.status, 200);
    const paid = await fetch(`${url}/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { payment_status: "paid", amount_total: draft.quote.total_cents, metadata: { draft_id: draft.id } } },
      }),
    });
    assert.equal(paid.status, 200);
    const body = await paid.json();
    assert.equal(body.demo, true);
    await stop(server, built.store);
  } finally {
    globalThis.fetch = original;
  }
});

test("one checkout per draft, one Printify order per paid webhook, unpaid and bad signatures do nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pm-paid-"));
  const env = testEnv(dir);
  const config = readConfig(env);
  const store = await openStore(config);
  const posts = [];
  const printify = {
    async preflight() {},
    async createProduct() {
      return { productId: "prod_1", baseCents: 1000, shippingCents: 400, mockupUrls: ["https://images.example/mug.png"] };
    },
    async submitOrder(input) {
      const claim = await store.prepare("SELECT status FROM claims WHERE id=?").get(input.externalId);
      assert.equal(claim.status, "submitting");
      posts.push({ op: "order", external_id: input.externalId });
      return { id: "pfy_1", status: "on-hold", external_id: input.externalId };
    },
    async sendToProduction(id) {
      posts.push({ op: "send", id });
      return { id, status: "sending-to-production", external_id: posts.find((item) => item.op === "order").external_id };
    },
    async findByExternalId() {
      return null;
    },
    async getOrder() {
      return { id: "pfy_1", status: "on-hold" };
    },
    async cancelOrder() {
      throw new Error("cancel should not run");
    },
  };
  const stripe = {
    sessions: [],
    async create(draft) {
      const session = { id: `cs_${this.sessions.length + 1}`, url: `https://checkout.stripe.test/${draft.id}` };
      this.sessions.push(session);
      return session;
    },
    async constructEvent(raw) {
      return JSON.parse(raw);
    },
  };
  const built = await buildApp(env, { config, store, printify, stripe, skipPreflight: true });
  const { server, url } = await listen(built.app);
  try {
  const headers = { "content-type": "application/json", "x-owner-key-id": "key_test" };

  const created = await fetch(`${url}/drafts`, { method: "POST", headers, body: JSON.stringify(draftBody(2)) });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(draft.quote.base_cents, 1000);
  assert.equal(draft.quote.shipping_cents, 400);
  assert.equal(draft.quote.markup_cents, 350);
  assert.equal(draft.quote.total_cents, 1750);

  const first = await fetch(`${url}/drafts/${draft.id}/checkout`, { method: "POST", headers, body: "{}" });
  assert.equal(first.status, 200);
  const second = await fetch(`${url}/drafts/${draft.id}/checkout`, { method: "POST", headers, body: "{}" });
  assert.equal(second.status, 409);
  assert.equal(stripe.sessions.length, 1);
  assert.equal(posts.length, 0);

  const unpaid = await fetch(`${url}/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { payment_status: "unpaid", amount_total: draft.quote.total_cents, metadata: { draft_id: draft.id, connector: "print-merch" } } },
    }),
  });
  assert.equal((await unpaid.json()).fulfilled, false);
  const failed = await fetch(`${url}/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "checkout.session.async_payment_failed", data: { object: { payment_status: "unpaid", metadata: { draft_id: draft.id } } } }),
  });
  assert.equal((await failed.json()).reason, "ignored_event");
  assert.equal(posts.length, 0);
  assert.equal((await store.prepare("SELECT count(*) AS count FROM claims").get()).count, 0);

  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        amount_total: draft.quote.total_cents,
        metadata: { draft_id: draft.id, connector: "print-merch", base_cents: "2000", shipping_cents: "400", markup_cents: "600" },
      },
    },
  };
  const paid = await fetch(`${url}/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
  const paidBody = await paid.json();
  assert.equal(paid.status, 200, JSON.stringify(paidBody));
  assert.equal(paidBody.fulfilled, true);
  const again = await fetch(`${url}/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
  const duplicate = await again.json();
  assert.equal(duplicate.duplicate, true);
  assert.equal(posts.filter((item) => item.op === "order").length, 1);
  assert.equal(posts.filter((item) => item.op === "send").length, 1);
  assert.match(posts[0].external_id, /^clm_/);

  const bad = await fetch(`${url}/webhooks/printify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pfy-signature": "sha256=deadbeef" },
    body: JSON.stringify({ type: "order:updated" }),
  });
  assert.equal(bad.status, 401);
  assert.equal(posts.filter((item) => item.op === "order").length, 1);

  } finally {
    await stop(server, store);
  }
});
