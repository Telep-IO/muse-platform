import { assertProviderOk, envValue, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { buildQuote, serviceFeeCents } from "./jobs";

const SANDBOX_BASE = "https://testflight.tremendous.com/api/v2";
const PRODUCTION_BASE = "https://api.tremendous.com/api/v2";

const LIVE_NOTE =
  "Listing products does not send a reward. Tremendous creates an order only after Stripe reports payment_status paid.";

export function giftSendRuntime(env: Env = process.env) {
  const mode = readAppMode("GIFT_SEND_APP_MODE", env);
  return {
    mode,
    apiKey: envValue("GIFT_SEND_API_KEY", env),
    platformClientReference: envValue("GIFT_SEND_PLATFORM_CLIENT_REFERENCE", env),
    stripeKey: envValue("STRIPE_SECRET_KEY", env),
    serviceUrl: envValue("GIFT_SEND_SERVICE_URL", env),
    feeCents: serviceFeeCents(env),
    base: mode === "live" ? PRODUCTION_BASE : mode === "test" ? SANDBOX_BASE : null,
  };
}

export function assertGiftSendReady(env: Env = process.env): void {
  const runtime = giftSendRuntime(env);
  const checks = [{ name: "GIFT_SEND_API_KEY", value: runtime.apiKey }];
  if (runtime.mode === "live") {
    checks.push({ name: "GIFT_SEND_PLATFORM_CLIENT_REFERENCE", value: runtime.platformClientReference });
  }
  requireCredentials(runtime.mode, "GIFT_SEND_APP_MODE", checks);
}

export function quoteGiftSend(faceCents: number, env: Env = process.env) {
  return {
    ...buildQuote(faceCents, env),
    spend: "none" as const,
    provider_fee_note: "Tremendous fee is $0 for gift cards, Visa/Mastercard prepaid, and charity.",
  };
}

export async function checkGiftSend(env: Env = process.env) {
  const runtime = giftSendRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "gift-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      tremendous: "skipped",
      stripe: runtime.stripeKey ? "present_not_called" : "not_set",
      ordered: false,
      spend: "none" as const,
      scope: ["merchant_card", "visa_card", "charity"],
      quote: quoteGiftSend(5000, env),
      note: "Demo mode does not call Tremendous or Stripe. Set GIFT_SEND_APP_MODE=test with a sandbox key to verify auth.",
    };
  }
  assertGiftSendReady(env);
  const tremendous = await providerRequest(`${runtime.base}/products?currency=USD`, {
    headers: { Authorization: `Bearer ${runtime.apiKey}`, Accept: "application/json" },
  });
  assertProviderOk(tremendous, "Tremendous");
  return {
    ok: true,
    connector: "gift-send",
    mode: runtime.mode,
    fulfillment: "tremendous" as const,
    tremendous: "ok",
    stripe: runtime.stripeKey ? "present_not_called" : "not_set",
    ordered: false,
    spend: "none" as const,
    scope: ["merchant_card", "visa_card", "charity"],
    pricing: {
      service_fee_cents: runtime.feeCents,
      provider_fee_cents: 0,
      formula: "face_cents + service_fee_cents",
    },
    note: `${LIVE_NOTE} Credential check used GET /products?currency=USD on ${runtime.base}. It does not create an order.`,
  };
}

export function giftSendDescriptor(env: Env = process.env) {
  const runtime = giftSendRuntime(env);
  const ready = runtime.mode !== "demo" && Boolean(runtime.apiKey) && (runtime.mode !== "live" || Boolean(runtime.platformClientReference));
  return {
    mode: runtime.mode,
    fulfillment: runtime.mode === "demo" ? "stub" : ready ? "tremendous" : "missing_credentials",
    scope: ["merchant_card", "visa_card", "charity"],
    service_fee_cents: runtime.feeCents,
    provider_fee_cents: 0,
    note:
      runtime.mode === "demo"
        ? "POST /v1/gift-send/gifts stores a demo draft. Demo mode does not call Tremendous or Stripe."
        : ready
          ? "Tremendous key is set. Drafts do not create orders. Delivery waits for a paid Stripe webhook on the fulfillment service."
          : "GIFT_SEND_APP_MODE is test or live but a required credential is empty. Live also needs GIFT_SEND_PLATFORM_CLIENT_REFERENCE.",
  };
}
