import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openStore } from "../src/store.js";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createProviders } from "../src/providers.js";
import { quoteCents, SANDBOX_BASE } from "../src/catalog.js";

const recipient = { email: "ada@example.com", name: "Ada" };
const draftBody = {
  recipient,
  reward_id: "OKMHM2X2OHYV",
  amount_cents: 5000,
  message: "Happy birthday",
  delivery_method: "EMAIL",
};

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () => new Promise((resolve) => server.close(resolve)),
    call(path, options) {
      return fetch(`${origin}${path}`, options);
    },
  };
}

async function tempConfig(t, overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "giftsend-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return {
    mode: "test",
    publicUrl: "http://127.0.0.1:3000",
    dataDir,
    databaseUrl: "",
    serviceFeeCents: 299,
    webhookSecret: "whsec_giftsend_test",
    tremendousWebhookSecret: "tremendous_test_secret",
    successUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/cancel",
    serviceToken: "",
    ...overrides,
  };
}

function fakeProviders() {
  let orders = 0;
  let checkouts = 0;
  let cancels = 0;
  const created = [];
  const catalog = {
    OKMHM2X2OHYV: { reward_id: "OKMHM2X2OHYV", name: "Amazon.com", brand: "Amazon.com", category: "merchant_card", min_cents: 100, max_cents: 200000, fee_cents: 0, countries: ["US"] },
    KV934TZ93NQM: { reward_id: "KV934TZ93NQM", name: "PayPal", brand: "PayPal", category: "paypal", min_cents: 100, max_cents: 200000, fee_cents: 0, countries: ["US"] },
    Q24BD9EZ332JT: { reward_id: "Q24BD9EZ332JT", name: "Virtual Visa", brand: "Virtual Visa", category: "visa_card", min_cents: 100, max_cents: 200000, fee_cents: 0, countries: ["US"] },
  };
  return {
    listProducts: async () => Object.values(catalog),
    getProduct: async (id) => {
      const product = catalog[id];
      if (!product) {
        const error = new Error("missing");
        error.status = 404;
        throw error;
      }
      return product;
    },
    checkout: async (draft) => {
      checkouts += 1;
      return { id: `cs_${draft.id}`, url: `https://checkout.stripe.com/c/pay/${draft.id}` };
    },
    createOrder: async (draft, claimId) => {
      orders += 1;
      created.push({ draft, claimId });
      return { orderId: "ord_1", rewardId: "rw_1", deliveryLink: "https://example.test/reward", deliveryStatus: "PENDING" };
    },
    cancelReward: async () => {
      cancels += 1;
      const error = new Error("already redeemed");
      error.status = 422;
      throw error;
    },
    counts: () => ({ orders, checkouts, cancels }),
    created: () => created,
    stripe: { webhooks: { constructEvent: () => { throw new Error("unused"); } } },
  };
}

function paidSession(draft, checkout, overrides = {}) {
  return {
    id: checkout.session_id,
    payment_status: "paid",
    livemode: false,
    payment_intent: `pi_${draft.draft_id}`,
    amount_total: checkout.quote.total_cents,
    metadata: {
      connector: "gift-send",
      draft_id: draft.draft_id,
      jobId: draft.draft_id,
      face_cents: String(draft.quote.face_cents),
      fee_cents: String(draft.quote.fee_cents),
    },
    ...overrides,
  };
}

test("quote math is face value plus the configured fee and a zero Tremendous fee", () => {
  assert.equal(quoteCents(5000, 299), 5299);
  assert.equal(quoteCents(200000, 299), 200299);
});

test("demo mode performs zero Tremendous or Stripe HTTP", async (t) => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return original(url, init);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  const config = await tempConfig(t, { mode: "demo" });
  const providers = createProviders(config);
  await assert.rejects(() => providers.createOrder({}, "clm"), /Demo mode does not call Tremendous/);
  await assert.rejects(() => providers.checkout({}), /Demo mode does not call Stripe/);
  await assert.rejects(() => providers.cancelReward("rw"), /Demo mode does not call Tremendous/);
  const db = await openStore(config);
  t.after(() => db.close());
  const { app } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const created = await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draftBody),
  });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(draft.quote.face_cents, 5000);
  assert.equal(draft.quote.fee_cents, 299);
  assert.equal(draft.quote.provider_fee_cents, 0);
  assert.equal(draft.quote.total_cents, 5299);
  assert.equal(draft.ordered, false);
  const products = await (await http.call("/products")).json();
  assert.equal(products.products.some((product) => product.reward_id === "KV934TZ93NQM"), false);
  assert.equal(products.products.some((product) => product.name === "Virtual Mastercard"), true);
  const checkout = await http.call(`/drafts/${draft.draft_id}/checkout`, { method: "POST" });
  assert.equal(checkout.status, 201);
  const repeat = await http.call(`/drafts/${draft.draft_id}/checkout`, { method: "POST" });
  assert.equal(repeat.status, 409);
  assert.equal(calls.some((url) => /tremendous|stripe/i.test(url)), false);
});

test("double paid webhook creates one Tremendous order", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { app, orders } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const draft = await (await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draftBody),
  })).json();
  assert.equal(draft.quote.total_cents, quoteCents(5000, 299));
  const checkout = await (await http.call(`/drafts/${draft.draft_id}/checkout`, { method: "POST" })).json();
  const session = paidSession(draft, checkout);
  const first = await orders.fulfillPaid(session);
  const second = await orders.fulfillPaid(session);
  assert.equal(first.fulfilled, true);
  assert.equal(second.duplicate, true);
  assert.equal(providers.counts().orders, 1);
  assert.equal(providers.counts().checkouts, 1);
  assert.equal(providers.created()[0].claimId, `clm_${draft.draft_id}`);
  assert.equal(providers.created()[0].draft.reward_id, "OKMHM2X2OHYV");
});

test("unpaid webhook does not create a Tremendous order", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  const draft = await orders.create(draftBody);
  const checkout = await orders.checkout(draft.draft_id);
  const result = await orders.fulfillPaid(paidSession(draft, checkout, { payment_status: "unpaid" }));
  const failed = await orders.fulfillPaid(paidSession(draft, checkout, { payment_status: "failed" }));
  assert.equal(result.fulfilled, false);
  assert.equal(result.reason, "unpaid");
  assert.equal(failed.fulfilled, false);
  assert.equal(failed.reason, "unpaid");
  assert.equal(providers.counts().orders, 0);
  const stored = await orders.read(draft.draft_id);
  assert.equal(stored.tremendous_order_id, null);
});

test("second checkout returns 409 and does not create another Stripe session", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  const draft = await orders.create(draftBody);
  await orders.checkout(draft.draft_id);
  await assert.rejects(() => orders.checkout(draft.draft_id), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "checkout_exists");
    return true;
  });
  assert.equal(providers.counts().checkouts, 1);
  assert.equal(providers.counts().orders, 0);
});

test("cash payout reward types are rejected", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  await assert.rejects(() => orders.create({ ...draftBody, reward_id: "KV934TZ93NQM" }), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.code, "cash_payout_disabled");
    assert.match(error.message, /Cash payouts are disabled/);
    return true;
  });
  assert.equal(providers.counts().orders, 0);
});

test("over-limit payout and recipient-day totals are rejected", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  await assert.rejects(() => orders.create({ ...draftBody, amount_cents: 200_001 }), (error) => {
    assert.equal(error.code, "amount_limit");
    assert.match(error.message, /\$2,000\.00 maximum per payout/);
    return true;
  });
  await orders.create({ ...draftBody, amount_cents: 600_000 > 200_000 ? 200_000 : 200_000 });
  await orders.create({ ...draftBody, recipient: { email: "ada@example.com" }, amount_cents: 200_000 });
  await orders.create({ ...draftBody, amount_cents: 200_000 });
  await orders.create({ ...draftBody, amount_cents: 200_000 });
  await orders.create({ ...draftBody, amount_cents: 200_000 });
  await assert.rejects(() => orders.create({ ...draftBody, amount_cents: 200_000 }), (error) => {
    assert.equal(error.code, "recipient_daily_limit");
    assert.match(error.message, /\$10,000\.00 maximum per recipient per day/);
    return true;
  });
  assert.equal(providers.counts().orders, 0);
});

test("a Tremendous webhook with a bad HMAC signature is rejected", async (t) => {
  const config = await tempConfig(t, { mode: "demo" });
  const providers = createProviders(config);
  const db = await openStore(config);
  t.after(() => db.close());
  const { app, orders } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const draft = await orders.create(draftBody);
  const body = JSON.stringify({ event: "REWARDS.DELIVERY.SUCCEEDED", uuid: "evt_bad", payload: { resource: { id: "rw", type: "rewards" } } });
  const bad = await http.call("/webhooks/tremendous", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Tremendous-Webhook-Signature": "sha256=deadbeef" },
    body,
  });
  assert.equal(bad.status, 401);
  const goodSig = createHmac("sha256", config.tremendousWebhookSecret).update(body).digest("hex");
  const good = await http.call("/webhooks/tremendous", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Tremendous-Webhook-Signature": `sha256=${goodSig}` },
    body,
  });
  assert.equal(good.status, 200);
  const stored = await orders.read(draft.draft_id);
  assert.equal(stored.status, "draft");
  assert.equal(stored.tremendous_order_id, null);
});

test("test and live modes fail closed without credentials", () => {
  assert.throws(() => readConfig({ APP_MODE: "test" }), /TREMENDOUS_API_KEY/);
  assert.throws(() => readConfig({ APP_MODE: "live", TREMENDOUS_API_KEY: "live-key", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x", TREMENDOUS_WEBHOOK_SECRET: "wh" }), /PLATFORM_CLIENT_REFERENCE/);
  assert.throws(() => readConfig({ APP_MODE: "test", TREMENDOUS_API_KEY: "sandbox", STRIPE_SECRET_KEY: "sk_test_x" }), /STRIPE_WEBHOOK_SECRET/);
});

test("Tremendous orders use the sandbox host, balance funding, and the claim id", async (t) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null, method: init?.method });
    if (String(url).endsWith("/products/OKMHM2X2OHYV")) {
      return new Response(JSON.stringify({ product: { id: "OKMHM2X2OHYV", name: "Amazon.com", category: "merchant_card", skus: [{ min: 1, max: 2000 }], countries: [{ abbr: "US" }] } }), { status: 200 });
    }
    if (String(url).endsWith("/orders")) {
      return new Response(JSON.stringify({ order: { id: "ord_live_test", rewards: [{ id: "rw_9", delivery: { status: "PENDING", link: null } }] } }), { status: 200 });
    }
    return new Response("nope", { status: 500 });
  };
  const config = await tempConfig(t);
  const providers = createProviders(config, { fetch: fetchImpl, stripe: { checkout: { sessions: { create: async () => ({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }) } } } });
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  const draft = await orders.create(draftBody);
  assert.equal(calls.some((call) => String(call.url).includes("/orders")), false);
  const checkout = await orders.checkout(draft.draft_id);
  assert.equal(calls.some((call) => String(call.url).includes("/orders")), false);
  await orders.fulfillPaid(paidSession(draft, checkout));
  const orderCall = calls.find((call) => String(call.url).endsWith("/orders"));
  assert.equal(orderCall.url, `${SANDBOX_BASE}/orders`);
  assert.equal(orderCall.body.payment.funding_source_id, "BALANCE");
  assert.equal(orderCall.body.external_id, `clm_${draft.draft_id}`);
  assert.equal(orderCall.body.reward.deliver_at, undefined);
  assert.equal(calls.some((call) => /topup|funding_source/i.test(call.url)), false);
});

test("cancel returns 422 when Tremendous says the reward was already redeemed", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  const draft = await orders.create(draftBody);
  const checkout = await orders.checkout(draft.draft_id);
  await orders.fulfillPaid(paidSession(draft, checkout));
  await assert.rejects(() => orders.cancel(draft.draft_id), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, "already_redeemed");
    assert.match(error.message, /already redeemed/);
    return true;
  });
  assert.equal(providers.counts().orders, 1);
  assert.equal(providers.counts().cancels, 1);
});
