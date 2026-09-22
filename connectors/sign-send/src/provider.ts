import { HttpError, assertProviderOk, basicAuthHeader, envValue, modeFulfillment, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { PRICE_CENTS } from "./envelopes";

export function signRuntime(env: Env = process.env) {
  const mode = readAppMode("SIGN_SEND_APP_MODE", env);
  const provider = (envValue("SIGN_SEND_ESIGN_PROVIDER", env) || "hellosign").toLowerCase();
  return {
    mode,
    provider,
    apiKey: envValue("SIGN_SEND_ESIGN_API_KEY", env),
  };
}

export function assertSignReady(env: Env = process.env): void {
  const runtime = signRuntime(env);
  requireCredentials(runtime.mode, "SIGN_SEND_APP_MODE", [{ name: "SIGN_SEND_ESIGN_API_KEY", value: runtime.apiKey }]);
}

export function quoteSign() {
  return {
    amountCents: PRICE_CENTS,
    currency: "usd" as const,
    spend: "none" as const,
    note: "Local retail quote. This call does not send a signature request.",
  };
}

export async function checkSign(env: Env = process.env) {
  const runtime = signRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "sign-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      quote: quoteSign(),
      note: "Demo mode does not call an e-sign provider.",
    };
  }
  assertSignReady(env);
  const provider = runtime.provider;
  if (provider === "hellosign" || provider === "dropbox-sign" || provider === "dropboxsign") {
    const response = await providerRequest("https://api.hellosign.com/v3/account", {
      headers: { Authorization: basicAuthHeader(runtime.apiKey) },
    });
    assertProviderOk(response, "Dropbox Sign");
  } else if (provider === "boldsign") {
    const response = await providerRequest("https://api.boldsign.com/v1/user", {
      headers: { "X-API-KEY": runtime.apiKey, Accept: "application/json" },
    });
    assertProviderOk(response, "BoldSign");
  } else {
    throw new HttpError(
      400,
      "unsupported_provider",
      `SIGN_SEND_ESIGN_PROVIDER "${provider}" is not wired. Use hellosign or boldsign. DocuSign OAuth is not a single API key.`,
    );
  }
  return {
    ok: true,
    connector: "sign-send",
    mode: runtime.mode,
    provider,
    fulfillment: "live" as const,
    spend: "none" as const,
    quote: quoteSign(),
    note: "Credential check only. No envelope was sent for signature.",
  };
}

export function signDescriptor(env: Env = process.env) {
  const runtime = signRuntime(env);
  return modeFulfillment(runtime.mode, runtime.mode !== "demo" && Boolean(runtime.apiKey), {
    demo: "Create an envelope at POST /v1/sign-send/envelopes. E-signature provider fulfillment is not called in demo mode.",
    ready: "POST /envelopes stores a draft and does not send it. GET /check validates the e-sign key.",
    missing: "SIGN_SEND_APP_MODE is test or live but SIGN_SEND_ESIGN_API_KEY is empty.",
  });
}
