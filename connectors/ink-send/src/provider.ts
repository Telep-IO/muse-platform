import { HttpError, assertProviderOk, envValue, modeFulfillment, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { PRICE_CENTS } from "./letters";

export function inkRuntime(env: Env = process.env) {
  const mode = readAppMode("INK_SEND_APP_MODE", env);
  return {
    mode,
    provider: (envValue("INK_SEND_INK_PROVIDER", env) || "handwrytten").toLowerCase(),
    apiKey: envValue("INK_SEND_INK_API_KEY", env),
  };
}

export function assertInkReady(env: Env = process.env): void {
  const runtime = inkRuntime(env);
  requireCredentials(runtime.mode, "INK_SEND_APP_MODE", [
    { name: "INK_SEND_INK_PROVIDER", value: runtime.provider },
    { name: "INK_SEND_INK_API_KEY", value: runtime.apiKey },
  ]);
}

export function quoteInk() {
  return {
    amountCents: PRICE_CENTS,
    currency: "usd" as const,
    spend: "none" as const,
    note: "Local retail quote. This call does not place a handwriting order.",
  };
}

export async function checkInk(env: Env = process.env) {
  const runtime = inkRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "ink-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      quote: quoteInk(),
      note: "Demo mode does not call a handwriting provider.",
    };
  }
  assertInkReady(env);
  if (runtime.provider !== "handwrytten") {
    throw new HttpError(400, "unsupported_provider", `INK_SEND_INK_PROVIDER "${runtime.provider}" is not wired. Use handwrytten.`);
  }
  const response = await providerRequest("https://api.handwrytten.com/v2/auth/getUser", {
    headers: { Authorization: runtime.apiKey, Accept: "application/json" },
  });
  assertProviderOk(response, "Handwrytten");
  return {
    ok: true,
    connector: "ink-send",
    mode: runtime.mode,
    provider: "handwrytten",
    fulfillment: "live" as const,
    spend: "none" as const,
    quote: quoteInk(),
    note: "Handwrytten getUser only. No card was ordered or mailed.",
  };
}

export function inkDescriptor(env: Env = process.env) {
  const runtime = inkRuntime(env);
  return modeFulfillment(runtime.mode, runtime.mode !== "demo" && Boolean(runtime.apiKey), {
    demo: "Create a letter at POST /v1/ink-send/letters. Handwritten-mail fulfillment is not called in demo mode.",
    ready: "POST /letters stores a draft and does not order a card. GET /check calls Handwrytten getUser.",
    missing: "INK_SEND_APP_MODE is test or live but INK_SEND_INK_API_KEY is empty.",
  });
}
