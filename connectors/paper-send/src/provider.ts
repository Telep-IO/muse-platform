import { HttpError, assertProviderOk, basicAuthHeader, envValue, modeFulfillment, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { priceCents } from "./jobs";

export function paperRuntime(env: Env = process.env) {
  const mode = readAppMode("PAPER_SEND_APP_MODE", env);
  return {
    mode,
    lobKey: envValue("PAPER_SEND_LOB_API_KEY", env),
    stripeKey: envValue("STRIPE_SECRET_KEY", env),
    serviceUrl: envValue("PAPER_SEND_SERVICE_URL", env),
  };
}

export function assertPaperReady(env: Env = process.env): void {
  const runtime = paperRuntime(env);
  requireCredentials(runtime.mode, "PAPER_SEND_APP_MODE", [{ name: "PAPER_SEND_LOB_API_KEY", value: runtime.lobKey }]);
  if (runtime.mode === "demo") return;
  const prefix = runtime.mode === "live" ? "live_" : "test_";
  if (!runtime.lobKey.startsWith(prefix)) {
    throw new HttpError(
      400,
      "invalid_credentials",
      `PAPER_SEND_LOB_API_KEY must start with ${prefix} when PAPER_SEND_APP_MODE is ${runtime.mode}`,
    );
  }
}

export function quotePaper(pages: number) {
  const n = Math.max(1, Math.min(5, Math.floor(pages) || 1));
  return {
    pages: n,
    amountCents: priceCents(n),
    currency: "usd" as const,
    spend: "none" as const,
    note: "Local retail quote. This call does not create a Lob letter.",
  };
}

export async function checkPaper(env: Env = process.env) {
  const runtime = paperRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "paper-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      lob: "skipped",
      stripe: runtime.stripeKey ? "present_not_called" : "not_set",
      spend: "none" as const,
      quote: quotePaper(1),
      note: "Demo mode does not call Lob or Stripe. Set PAPER_SEND_APP_MODE=test with a test_ Lob key to verify auth.",
    };
  }
  assertPaperReady(env);
  const lob = await providerRequest("https://api.lob.com/v1/addresses?limit=1", {
    headers: { Authorization: basicAuthHeader(runtime.lobKey) },
  });
  assertProviderOk(lob, "Lob");

  let stripe: "ok" | "not_set" = "not_set";
  if (runtime.stripeKey) {
    const balance = await providerRequest("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${runtime.stripeKey}` },
    });
    assertProviderOk(balance, "Stripe");
    stripe = "ok";
  }

  return {
    ok: true,
    connector: "paper-send",
    mode: runtime.mode,
    fulfillment: "lob" as const,
    lob: "ok",
    stripe,
    mailed: false,
    spend: "none" as const,
    quote: quotePaper(1),
    note: "Lob auth succeeded via GET /v1/addresses (read-only). No letter was created. Stripe balance is read-only when a key is set.",
  };
}

export function paperDescriptor(env: Env = process.env) {
  const runtime = paperRuntime(env);
  return modeFulfillment(runtime.mode, runtime.mode !== "demo" && Boolean(runtime.lobKey), {
    demo: "Create a job at POST /v1/paper-send/jobs. Demo mode does not call Lob.",
    ready: "Lob key is set. POST /jobs stores a draft and does not mail. GET /check verifies Lob auth.",
    missing: "PAPER_SEND_APP_MODE is test or live but PAPER_SEND_LOB_API_KEY is empty.",
  }, "lob");
}
