import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { HttpError, dispatchStripeEvent, type PaidSession } from "@telep/platform";
import {
  cancelGift,
  checkGiftSend,
  createGiftDraft,
  fulfillGiftSendPayment,
  listRewardProducts,
  quoteCents,
  quoteGiftSend,
  sendGift,
} from "@telep/gift-send";
import { dispatchMcp, dispatchRest } from "../lib/gateway";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const draftInput = {
  recipient: { email: "ada@example.com", name: "Ada" },
  reward_id: "OKMHM2X2OHYV",
  amount_cents: 5000,
  message: "Happy birthday",
  delivery_method: "EMAIL" as const,
  ownerKeyId: "owner",
};

function demoEnv() {
  return {
    GIFT_SEND_APP_MODE: "demo",
    GIFT_SEND_DATA_DIR: mkdtempSync(join(tmpdir(), "gift-send-gw-")),
    GIFT_SEND_SERVICE_FEE_CENTS: "299",
  };
}

test("demo mode drafts, lists, checks out, and cancels with zero HTTP calls", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("demo egress");
  };
  const env = demoEnv();
  const checked = await checkGiftSend(env);
  assert.equal(checked.tremendous, "skipped");
  assert.equal(checked.spend, "none");
  const products = await listRewardProducts({}, "owner", env);
  assert.equal(products.products.some((product) => product.reward_id === "KV934TZ93NQM"), false);
  assert.equal(products.products.some((product) => product.name === "Virtual Mastercard"), true);
  assert.equal(products.products.every((product) => product.fee_cents === 0), true);
  const draft = await createGiftDraft(draftInput, env);
  assert.equal(draft.quote.face_cents, 5000);
  assert.equal(draft.quote.fee_cents, 299);
  assert.equal(draft.quote.provider_fee_cents, 0);
  assert.equal(draft.quote.total_cents, quoteCents(5000, 299));
  assert.equal(draft.ordered, false);
  const checkout = await sendGift(draft.draft_id, "owner", env);
  assert.equal(checkout.ordered, false);
  assert.match(String(checkout.checkout_url), /^demo:\/\/gift-send\/checkout\//);
  await assert.rejects(() => sendGift(draft.draft_id, "owner", env), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "checkout_exists");
    return true;
  });
  const cancelled = await cancelGift(draft.draft_id, "owner", env);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(called, false);
});

test("quote total is face value plus the configured fee", () => {
  const quote = quoteGiftSend(5000, { GIFT_SEND_SERVICE_FEE_CENTS: "299" });
  assert.equal(quote.face_cents, 5000);
  assert.equal(quote.fee_cents, 299);
  assert.equal(quote.provider_fee_cents, 0);
  assert.equal(quote.total_cents, 5299);
  assert.equal(quoteCents(200000, 299), 200299);
});

test("cash payouts and over-limit amounts are rejected without HTTP", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("egress");
  };
  const env = demoEnv();
  await assert.rejects(() => createGiftDraft({ ...draftInput, reward_id: "KV934TZ93NQM" }, env), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "cash_payout_disabled");
    assert.match(error.message, /Cash payouts are disabled/);
    return true;
  });
  await assert.rejects(() => createGiftDraft({ ...draftInput, amount_cents: 200_001 }, env), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "amount_limit");
    assert.match(error.message, /\$2,000\.00 maximum per payout/);
    return true;
  });
  for (let i = 0; i < 5; i += 1) {
    await createGiftDraft({ ...draftInput, amount_cents: 200_000 }, env);
  }
  await assert.rejects(() => createGiftDraft({ ...draftInput, amount_cents: 200_000 }, env), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "recipient_daily_limit");
    assert.match(error.message, /\$10,000\.00 maximum per recipient per day/);
    return true;
  });
  assert.equal(called, false);
});

test("test mode without credentials fails closed and does not call Tremendous", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("egress");
  };
  await assert.rejects(() => checkGiftSend({ GIFT_SEND_APP_MODE: "test" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.code, "missing_credentials");
    return true;
  });
  await assert.rejects(
    () => checkGiftSend({ GIFT_SEND_APP_MODE: "live", GIFT_SEND_API_KEY: "present" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "missing_credentials");
      assert.match(error.message, /GIFT_SEND_PLATFORM_CLIENT_REFERENCE/);
      return true;
    },
  );
  await assert.rejects(
    () => createGiftDraft(draftInput, { GIFT_SEND_APP_MODE: "test", GIFT_SEND_API_KEY: "sandbox" }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "missing_credentials");
      assert.match(error.message, /GIFT_SEND_SERVICE_URL/);
      return true;
    },
  );
  assert.equal(called, false);
});

test("test mode credential check lists products and does not create an order", async () => {
  let url = "";
  let method = "";
  globalThis.fetch = async (input, init) => {
    url = String(input);
    method = init?.method ?? "GET";
    return new Response(JSON.stringify({ products: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await checkGiftSend({ GIFT_SEND_APP_MODE: "test", GIFT_SEND_API_KEY: "sandbox-key" });
  assert.equal(result.tremendous, "ok");
  assert.equal(result.ordered, false);
  assert.equal(method, "GET");
  assert.equal(url, "https://testflight.tremendous.com/api/v2/products?currency=USD");
  const live = await checkGiftSend({
    GIFT_SEND_APP_MODE: "live",
    GIFT_SEND_API_KEY: "live-key",
    GIFT_SEND_PLATFORM_CLIENT_REFERENCE: "platform-client-on-file",
  });
  assert.equal(live.mode, "live");
  assert.equal(url, "https://api.tremendous.com/api/v2/products?currency=USD");
  assert.equal(url.includes("/orders"), false);
});

test("shared billing webhook places an order only for a paid gift-send session", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ fulfilled: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const env = {
    GIFT_SEND_APP_MODE: "test",
    GIFT_SEND_API_KEY: "sandbox-key",
    GIFT_SEND_SERVICE_URL: "http://127.0.0.1:9",
  };
  const paid = {
    id: "cs_gift",
    eventId: "evt_gift",
    eventType: "checkout.session.completed",
    paymentStatus: "paid",
    livemode: false,
    metadata: {
      connector: "gift-send",
      jobId: "gs_remote",
      draft_id: "gs_remote",
      face_cents: "5000",
      fee_cents: "299",
    },
    amountSubtotal: 5299,
    amountTotal: 5299,
    currency: "usd",
  } satisfies PaidSession;
  const other = await fulfillGiftSendPayment({ ...paid, metadata: { connector: "ship-label", jobId: "sd_1" } }, env);
  assert.equal(other, undefined);
  const demo = await fulfillGiftSendPayment(paid, { ...env, GIFT_SEND_APP_MODE: "demo" });
  assert.equal(demo?.reason, "demo");
  const unpaid = await fulfillGiftSendPayment({ ...paid, paymentStatus: "unpaid" }, env);
  assert.equal(unpaid?.fulfilled, false);
  assert.equal(unpaid?.reason, "unpaid");
  const sent = await fulfillGiftSendPayment(paid, env);
  assert.equal(sent?.fulfilled, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/drafts\/gs_remote\/fulfill$/);
  assert.equal(calls[0].includes("tremendous.com"), false);
  const ignored = await dispatchStripeEvent(
    {
      id: "evt_other",
      type: "checkout.session.completed",
      data: { object: { id: "cs_other", payment_status: "paid", metadata: { connector: "paper-send", jobId: "ps_1" } } },
    },
    (session) => fulfillGiftSendPayment(session, env),
  );
  assert.equal(ignored.fulfilled, undefined);
  assert.equal(calls.length, 1);
});

test("gateway routes do not import the fulfillment service", () => {
  const roots = ["connectors/gift-send", "lib", "app", "packages"];
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
  assert.equal(/from\s+["'][^"']*services\/gift-send/.test(blob), false);
  assert.equal(/require\(\s*["'][^"']*services\/gift-send/.test(blob), false);
});

test("gift-send REST and MCP are wired for demo", async () => {
  const previousMode = process.env.GIFT_SEND_APP_MODE;
  const previousDir = process.env.GIFT_SEND_DATA_DIR;
  const previousKeys = process.env.MUSE_API_KEYS;
  process.env.GIFT_SEND_APP_MODE = "demo";
  process.env.GIFT_SEND_DATA_DIR = mkdtempSync(join(tmpdir(), "gift-send-rest-"));
  process.env.MUSE_API_KEYS = "muse_sk_demo_localdev";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("demo egress");
  };
  try {
    const headers = { Authorization: "Bearer muse_sk_demo_localdev", "Content-Type": "application/json" };
    const created = await dispatchRest(
      new Request("http://localhost/v1/gift-send/gifts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient: draftInput.recipient,
          reward_id: draftInput.reward_id,
          amount_cents: draftInput.amount_cents,
          message: draftInput.message,
          delivery_method: draftInput.delivery_method,
        }),
      }),
      "gift-send",
      ["gifts"],
    );
    assert.equal(created.status, 201);
    const listed = await dispatchMcp(
      new Request("http://localhost/mcp/gift-send", {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      "gift-send",
    );
    const body = await listed.json();
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    for (const name of [
      "list_reward_products",
      "create_gift_draft",
      "send_gift",
      "get_gift_status",
      "cancel_gift",
      "list_gifts",
      "check_credentials",
    ]) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(called, false);
  } finally {
    if (previousMode === undefined) delete process.env.GIFT_SEND_APP_MODE;
    else process.env.GIFT_SEND_APP_MODE = previousMode;
    if (previousDir === undefined) delete process.env.GIFT_SEND_DATA_DIR;
    else process.env.GIFT_SEND_DATA_DIR = previousDir;
    if (previousKeys === undefined) delete process.env.MUSE_API_KEYS;
    else process.env.MUSE_API_KEYS = previousKeys;
  }
});
