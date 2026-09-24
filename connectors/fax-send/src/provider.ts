import { HttpError, assertProviderOk, basicAuthHeader, envValue, modeFulfillment, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { PRICE_PER_PAGE_CENTS } from "./faxes";

export function faxRuntime(env: Env = process.env) {
  const mode = readAppMode("FAX_SEND_APP_MODE", env);
  return {
    mode,
    provider: envValue("FAX_SEND_FAX_PROVIDER", env).toLowerCase(),
    apiKey: envValue("FAX_SEND_FAX_API_KEY", env),
    apiSecret: envValue("FAX_SEND_FAX_API_SECRET", env),
  };
}

export function assertFaxReady(env: Env = process.env): void {
  const runtime = faxRuntime(env);
  requireCredentials(runtime.mode, "FAX_SEND_APP_MODE", [
    { name: "FAX_SEND_FAX_PROVIDER", value: runtime.provider },
    { name: "FAX_SEND_FAX_API_KEY", value: runtime.apiKey },
  ]);
}

export function quoteFax(pages: number) {
  const n = Math.max(1, Math.min(10, Math.floor(pages) || 1));
  return {
    pages: n,
    amountCents: n * PRICE_PER_PAGE_CENTS,
    currency: "usd" as const,
    spend: "none" as const,
    note: "Local retail quote. This call does not transmit a fax.",
  };
}

export async function checkFax(env: Env = process.env) {
  const runtime = faxRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "fax-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      quote: quoteFax(1),
      note: "Demo mode does not call a fax provider.",
    };
  }
  assertFaxReady(env);
  const provider = runtime.provider;
  if (provider === "phaxio" || provider === "sinch") {
    if (!runtime.apiSecret) {
      throw new HttpError(503, "missing_credentials", "FAX_SEND_FAX_API_SECRET is required for phaxio/sinch basic auth");
    }
    const url = provider === "sinch"
      ? "https://fax.api.sinch.com/v3/projects"
      : "https://api.phaxio.com/v2.1/account/status";
    const response = await providerRequest(url, {
      headers: { Authorization: basicAuthHeader(runtime.apiKey, runtime.apiSecret) },
    });
    assertProviderOk(response, provider === "sinch" ? "Sinch Fax" : "Phaxio");
  } else if (provider === "telnyx") {
    const response = await providerRequest("https://api.telnyx.com/v2/balance", {
      headers: { Authorization: `Bearer ${runtime.apiKey}`, Accept: "application/json" },
    });
    assertProviderOk(response, "Telnyx");
  } else {
    throw new HttpError(400, "unsupported_provider", `FAX_SEND_FAX_PROVIDER "${provider}" is not wired. Use phaxio, sinch, or telnyx.`);
  }
  return {
    ok: true,
    connector: "fax-send",
    mode: runtime.mode,
    provider,
    fulfillment: "live" as const,
    spend: "none" as const,
    quote: quoteFax(1),
    note: "Credential check only. No fax was transmitted.",
  };
}

export function faxDescriptor(env: Env = process.env) {
  const runtime = faxRuntime(env);
  return modeFulfillment(runtime.mode, runtime.mode !== "demo" && Boolean(runtime.provider && runtime.apiKey), {
    demo: "Create a fax at POST /v1/fax-send/faxes. Fax provider fulfillment is not called in demo mode.",
    ready: "POST /faxes stores a draft and does not transmit. GET /check validates provider auth.",
    missing: "FAX_SEND_APP_MODE is test or live but FAX_SEND_FAX_PROVIDER or FAX_SEND_FAX_API_KEY is empty.",
  });
}
