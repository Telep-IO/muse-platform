import {
  assertProviderOk,
  basicAuthHeader,
  envValue,
  HttpError,
  providerRequest,
  readAppMode,
  requireCredentials,
  type Env,
} from "@telep/platform";
import { buildQuote, serviceFeeCents } from "./jobs";

const LIVE_NOTE =
  "Rate shopping does not buy postage. EasyPost buy runs only after Stripe reports payment_status paid.";

export function shipLabelRuntime(env: Env = process.env) {
  const mode = readAppMode("SHIP_LABEL_APP_MODE", env);
  return {
    mode,
    easypostKey: envValue("SHIP_LABEL_EASYPOST_API_KEY", env),
    orderFormReference: envValue("SHIP_LABEL_EASYPOST_ORDER_FORM_REFERENCE", env),
    stripeKey: envValue("STRIPE_SECRET_KEY", env),
    serviceUrl: envValue("SHIP_LABEL_SERVICE_URL", env),
    feeCents: serviceFeeCents(env),
  };
}

export function assertShipLabelReady(env: Env = process.env): void {
  const runtime = shipLabelRuntime(env);
  const checks = [{ name: "SHIP_LABEL_EASYPOST_API_KEY", value: runtime.easypostKey }];
  if (runtime.mode === "live") {
    checks.push({ name: "SHIP_LABEL_EASYPOST_ORDER_FORM_REFERENCE", value: runtime.orderFormReference });
  }
  requireCredentials(runtime.mode, "SHIP_LABEL_APP_MODE", checks);
  if (runtime.mode === "demo") return;
  if (runtime.mode === "test" && runtime.easypostKey.startsWith("EZAK")) {
    throw new HttpError(400, "invalid_credentials", "SHIP_LABEL_APP_MODE=test refuses an EasyPost production key prefix. Use a test key.");
  }
  if (runtime.mode === "live" && runtime.easypostKey.startsWith("EZTK")) {
    throw new HttpError(400, "invalid_credentials", "SHIP_LABEL_APP_MODE=live refuses an EasyPost test key prefix. Use the Forge production key.");
  }
}

export function quoteShipLabel(postageCents: number, env: Env = process.env) {
  return {
    ...buildQuote(postageCents, env),
    spend: "none" as const,
    carrier: "USPS" as const,
  };
}

export async function checkShipLabel(env: Env = process.env) {
  const runtime = shipLabelRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "ship-label",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      easypost: "skipped",
      stripe: runtime.stripeKey ? "present_not_called" : "not_set",
      spend: "none" as const,
      carriers: ["USPS"],
      quote: quoteShipLabel(550, env),
      note: "Demo mode does not call EasyPost or Stripe. Set SHIP_LABEL_APP_MODE=test with an EasyPost test key to verify auth.",
    };
  }
  assertShipLabelReady(env);
  // EasyPost documents GET /v2/carrier_accounts as production-key only.
  // Listing one page of shipments is read-only in both test and live and does not buy postage.
  const easypost = await providerRequest("https://api.easypost.com/v2/shipments?page_size=1", {
    headers: { Authorization: basicAuthHeader(runtime.easypostKey) },
  });
  assertProviderOk(easypost, "EasyPost");
  return {
    ok: true,
    connector: "ship-label",
    mode: runtime.mode,
    fulfillment: "easypost" as const,
    easypost: "ok",
    stripe: runtime.stripeKey ? "present_not_called" : "not_set",
    bought: false,
    spend: "none" as const,
    carriers: ["USPS"],
    pricing: {
      service_fee_cents: runtime.feeCents,
      formula: "postage_cents + service_fee_cents",
    },
    note: `${LIVE_NOTE} Credential check used GET /v2/shipments?page_size=1. Postage is read from the selected USPS rate when a draft is created.`,
  };
}

export function shipLabelDescriptor(env: Env = process.env) {
  const runtime = shipLabelRuntime(env);
  const ready = runtime.mode !== "demo" && Boolean(runtime.easypostKey);
  return {
    mode: runtime.mode,
    fulfillment: runtime.mode === "demo" ? "stub" : ready ? "easypost" : "missing_credentials",
    carriers: ["USPS"],
    service_fee_cents: runtime.feeCents,
    note:
      runtime.mode === "demo"
        ? "POST /v1/ship-label/shipments stores a demo draft. Demo mode does not call EasyPost or Stripe."
        : ready
          ? "EasyPost key is set. Drafts rate-shop USPS only. Buy waits for a paid Stripe webhook on the fulfillment service."
          : "SHIP_LABEL_APP_MODE is test or live but SHIP_LABEL_EASYPOST_API_KEY is empty.",
  };
}
