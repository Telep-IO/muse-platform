import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import Stripe from "stripe";
import { openStore } from "../src/store.js";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createProviders } from "../src/providers.js";
import { dollarsToCents, quoteCents } from "../src/pricing.js";

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
  const dataDir = await mkdtemp(join(tmpdir(), "shiplabel-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return {
    mode: "test",
    publicUrl: "http://127.0.0.1:3000",
    dataDir,
    databaseUrl: "",
    serviceFeeCents: 199,
    platformFeeCents: null,
    webhookSecret: "whsec_shiplabel_test",
    successUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/cancel",
    serviceToken: "",
    ...overrides,
  };
}

function fakeProviders() {
  let buys = 0;
  let checkouts = 0;
  let voids = 0;
  let release = () => {};
  let gate = null;
  const providers = {
    createShipment: async () => ({
      id: "shp_test",
      rates: [
        { id: "rate_usps", carrier: "USPS", service: "Priority", rate: "7.37", currency: "USD" },
        { id: "rate_ups", carrier: "UPS", service: "Ground", rate: "9.10", currency: "USD" },
      ],
    }),
    buyShipment: async () => {
      buys += 1;
      if (gate) await gate;
      return {
        easypost_shipment_id: "shp_test",
        label_url: "https://labels.example/label.pdf",
        tracking_code: "9400111899223",
      };
    },
    voidShipment: async () => {
      voids += 1;
      return { refund_status: "submitted" };
    },
    checkout: async (draft) => {
      checkouts += 1;
      return { id: `cs_${draft.id}`, url: `https://checkout.stripe.com/c/pay/${draft.id}` };
    },
    holdBuy() {
      gate = new Promise((resolve) => {
        release = resolve;
      });
    },
    releaseBuy() {
      release();
      gate = null;
    },
    counts: () => ({ buys, checkouts, voids }),
    stripe: null,
  };
  return providers;
}

function paidSession(draftId, checkout, overrides = {}) {
  return {
    id: checkout.session_id,
    payment_status: "paid",
    livemode: false,
    payment_intent: `pi_${draftId}`,
    amount_total: checkout.quote.total_cents,
    metadata: {
      draft_id: draftId,
      rate_id: "rate_usps",
      postage_cents: String(checkout.quote.postage_cents),
      fee_cents: String(checkout.quote.fee_cents),
    },
    ...overrides,
  };
}

test("quote math is live postage plus the configured fee", () => {
  assert.equal(dollarsToCents("7.37"), 737);
  assert.equal(quoteCents(737, 199), 936);
  assert.equal(quoteCents(550, 250), 800);
});

test("demo mode performs zero EasyPost or Stripe HTTP", async (t) => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return original(url, init);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  const config = await tempConfig(t, { mode: "demo", serviceFeeCents: 199 });
  const providers = createProviders(config);
  await assert.rejects(() => providers.createShipment({}), /Demo mode does not call EasyPost/);
  await assert.rejects(() => providers.buyShipment("shp", "rate"), /Demo mode does not call EasyPost/);
  await assert.rejects(() => providers.checkout({}), /Demo mode does not call Stripe/);
  const db = await openStore(config);
  t.after(() => db.close());
  const { app } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const created = await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, parcel }),
  });
  assert.equal(created.status, 201);
  const draft = await created.json();
  assert.equal(draft.quote.postage_cents, 550);
  assert.equal(draft.quote.fee_cents, 199);
  assert.equal(draft.quote.total_cents, 749);
  assert.equal(draft.rates.every((rate) => rate.carrier === "USPS"), true);
  const checkout = await http.call(`/drafts/${draft.draft_id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate_id: draft.rates[0].id }),
  });
  assert.equal(checkout.status, 201);
  const session = await checkout.json();
  assert.equal(session.purchased, false);
  const label = await (await http.call(`/labels/${session.label_id}`)).json();
  assert.equal(label.purchased, false);
  assert.equal(label.status, "stub");
  const repeat = await http.call(`/drafts/${draft.draft_id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate_id: draft.rates[0].id }),
  });
  assert.equal(repeat.status, 409);
  assert.equal((await http.call(`/labels/${session.label_id}/void`, { method: "POST" })).status, 200);
  assert.equal(calls.some((url) => /easypost|stripe/i.test(url)), false);
});

test("double paid webhook buys postage once", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const stripe = new Stripe("sk_test_dummy");
  providers.stripe = stripe;
  const db = await openStore(config);
  t.after(() => db.close());
  const { app, orders } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const draft = await (await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, parcel }),
  })).json();
  assert.equal(draft.quote.postage_cents, 737);
  assert.equal(draft.quote.total_cents, quoteCents(737, 199));
  assert.equal(draft.rates.some((rate) => rate.carrier === "UPS"), false);
  const checkout = await (await http.call(`/drafts/${draft.draft_id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate_id: "rate_usps" }),
  })).json();
  const payload = JSON.stringify({
    id: "evt_paid",
    type: "checkout.session.completed",
    data: { object: paidSession(draft.draft_id, checkout) },
  });
  const headers = {
    "Content-Type": "application/json",
    "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret }),
  };
  const first = await http.call("/webhooks/stripe", { method: "POST", headers, body: payload });
  const second = await http.call("/webhooks/stripe", { method: "POST", headers, body: payload });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(providers.counts().buys, 1);
  const body = await second.json();
  assert.equal(body.duplicate, true);
  assert.equal(body.label.tracking_code, "9400111899223");
  const again = await orders.fulfillPaid(paidSession(draft.draft_id, checkout));
  assert.equal(again.duplicate, true);
  assert.equal(providers.counts().buys, 1);
});

test("in-flight paid webhook does not start a second buy", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  providers.holdBuy();
  const db = await openStore(config);
  t.after(() => db.close());
  const { orders } = await createApp(config, db, providers);
  const draft = await orders.create({ from, to, parcel });
  const checkout = await orders.checkout(draft.draft_id, "rate_usps");
  const session = paidSession(draft.draft_id, checkout);
  const first = orders.fulfillPaid(session);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const second = await orders.fulfillPaid(session);
  assert.equal(second.reason, "in_flight");
  assert.equal(providers.counts().buys, 1);
  providers.releaseBuy();
  const done = await first;
  assert.equal(done.fulfilled, true);
  assert.equal(providers.counts().buys, 1);
});

test("unpaid webhook does not buy postage", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const stripe = new Stripe("sk_test_dummy");
  providers.stripe = stripe;
  const db = await openStore(config);
  t.after(() => db.close());
  const { app } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const draft = await (await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, parcel }),
  })).json();
  const checkout = await (await http.call(`/drafts/${draft.draft_id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate_id: "rate_usps" }),
  })).json();
  for (const payment_status of ["unpaid", "no_payment_required"]) {
    const payload = JSON.stringify({
      id: `evt_${payment_status}`,
      type: "checkout.session.completed",
      data: { object: paidSession(draft.draft_id, checkout, { payment_status, payment_intent: null }) },
    });
    const response = await http.call("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret }),
      },
      body: payload,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).fulfilled, false);
  }
  const failed = JSON.stringify({ id: "evt_failed", type: "checkout.session.async_payment_failed", data: { object: {} } });
  assert.equal(
    (
      await http.call("/webhooks/stripe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: failed, secret: config.webhookSecret }),
        },
        body: failed,
      })
    ).status,
    200,
  );
  assert.equal(providers.counts().buys, 0);
  assert.equal(providers.counts().checkouts, 1);
});

test("second checkout for one draft is 409 and does not create another Stripe session", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { app } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const draft = await (await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, parcel }),
  })).json();
  const first = await http.call(`/drafts/${draft.draft_id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate_id: "rate_usps" }),
  });
  assert.equal(first.status, 201);
  const second = await http.call(`/drafts/${draft.draft_id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate_id: "rate_usps" }),
  });
  assert.equal(second.status, 409);
  assert.match(await second.text(), /already exists/);
  assert.equal(providers.counts().checkouts, 1);
  assert.equal(providers.counts().buys, 0);
});

test("non-USPS carrier requests are rejected and name the restriction", async (t) => {
  const config = await tempConfig(t);
  const providers = fakeProviders();
  const db = await openStore(config);
  t.after(() => db.close());
  const { app } = await createApp(config, db, providers);
  const http = await listen(app);
  t.after(() => http.close());
  const response = await http.call("/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, parcel, carrier_hint: "UPS" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /UPS DAP §4\.2/);
  assert.match(body.error, /FedEx by Default §3\.2/);
  assert.equal(providers.counts().buys, 0);
  assert.equal(providers.counts().checkouts, 0);
});

test("test and live refuse to boot when credentials are missing", () => {
  assert.throws(() => readConfig({ APP_MODE: "test", SERVICE_PUBLIC_URL: "http://127.0.0.1:3000" }), /EASYPOST_API_KEY/);
  assert.throws(
    () =>
      readConfig({
        APP_MODE: "live",
        SERVICE_PUBLIC_URL: "https://labels.example",
        EASYPOST_API_KEY: "EZAK_example",
        STRIPE_SECRET_KEY: "sk_live_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
      }),
    /EASYPOST_ORDER_FORM_REFERENCE/,
  );
  assert.throws(
    () =>
      readConfig({
        APP_MODE: "test",
        SERVICE_PUBLIC_URL: "http://127.0.0.1:3000",
        EASYPOST_API_KEY: "EZAK_production_prefix",
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
      }),
    /production key/,
  );
  const live = readConfig({
    APP_MODE: "live",
    SERVICE_PUBLIC_URL: "https://labels.example",
    EASYPOST_API_KEY: "forge_production_example",
    EASYPOST_ORDER_FORM_REFERENCE: "forge-order-form",
    STRIPE_SECRET_KEY: "sk_live_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    DATABASE_URL: "postgres://shiplabel:shiplabel@127.0.0.1:5432/shiplabel",
    SERVICE_FEE_CENTS: "199",
  });
  assert.equal(live.mode, "live");
  assert.equal(live.serviceFeeCents, 199);
  assert.equal(live.platformFeeCents, null);
});

test("a database refuses to open when the stored mode differs", async (t) => {
  const config = await tempConfig(t, { mode: "demo" });
  const demo = await openStore(config);
  await demo.close();
  await assert.rejects(() => openStore({ ...config, mode: "test" }), /separate DATA_DIR/);
});
