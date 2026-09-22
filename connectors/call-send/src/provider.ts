import { HttpError, assertProviderOk, basicAuthHeader, envValue, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { PRICE_CENTS } from "./calls";

const LIVE_NOTE =
  "Draft only. No call was placed. A human must review the verbatim script and pay before Twilio is asked to dial.";

export function callLiveNote(): string {
  return LIVE_NOTE;
}

export function callRuntime(env: Env = process.env) {
  const mode = readAppMode("CALL_SEND_APP_MODE", env);
  return {
    mode,
    provider: envValue("CALL_SEND_CALL_PROVIDER", env) || "twilio",
    accountSid: envValue("CALL_SEND_TWILIO_ACCOUNT_SID", env),
    authToken: envValue("CALL_SEND_TWILIO_AUTH_TOKEN", env),
    from: envValue("CALL_SEND_TWILIO_FROM_NUMBER", env),
  };
}

export function assertCallReady(env: Env = process.env): void {
  const runtime = callRuntime(env);
  requireCredentials(runtime.mode, "CALL_SEND_APP_MODE", [
    { name: "CALL_SEND_TWILIO_ACCOUNT_SID", value: runtime.accountSid },
    { name: "CALL_SEND_TWILIO_AUTH_TOKEN", value: runtime.authToken },
  ]);
}

export function quoteCall() {
  return {
    amountCents: PRICE_CENTS,
    currency: "usd" as const,
    spend: "none" as const,
    note: "Local retail quote. This call does not dial.",
  };
}

export async function checkCall(env: Env = process.env) {
  const runtime = callRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "call-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      quote: quoteCall(),
      note: "Demo mode does not call Twilio.",
    };
  }
  assertCallReady(env);
  if (runtime.provider !== "twilio") {
    throw new HttpError(400, "unsupported_provider", `CALL_SEND_CALL_PROVIDER "${runtime.provider}" is not wired. Use twilio.`);
  }
  if (!/^AC[0-9a-fA-F]{32}$/.test(runtime.accountSid)) {
    throw new HttpError(400, "invalid_credentials", "CALL_SEND_TWILIO_ACCOUNT_SID must look like an AC SID");
  }
  const response = await providerRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(runtime.accountSid)}.json`,
    { headers: { Authorization: basicAuthHeader(runtime.accountSid, runtime.authToken) } },
  );
  assertProviderOk(response, "Twilio");
  const status = String((response.json as { status?: string } | null)?.status ?? "");
  return {
    ok: true,
    connector: "call-send",
    mode: runtime.mode,
    provider: "twilio",
    accountStatus: status || "unknown",
    fromConfigured: Boolean(runtime.from),
    fulfillment: "live" as const,
    spend: "none" as const,
    quote: quoteCall(),
    note: "Twilio account fetch only. No call was placed.",
  };
}

export function callDescriptor(env: Env = process.env) {
  const runtime = callRuntime(env);
  const ready = runtime.mode !== "demo" && Boolean(runtime.accountSid && runtime.authToken);
  return {
    mode: runtime.mode,
    fulfillment: runtime.mode === "demo" ? "stub" : ready ? "live" : "missing_credentials",
    note:
      runtime.mode === "demo"
        ? "Create a call at POST /v1/call-send/calls. Voice provider fulfillment is not called in demo mode."
        : ready
          ? "POST /calls stores a draft and does not dial. GET /check fetches the Twilio account."
          : "CALL_SEND_APP_MODE is test or live but Twilio SID or auth token is empty.",
  };
}
