import { createHash } from "node:crypto";
import { HttpError, envValue, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { YEARLY_PRICE_CENTS, checkAvailability, type AvailabilityResult } from "./domains";

const LIVE_NOTE =
  "Draft only. This name was not registered. A human must review and pay before OpenSRS is asked to register.";

export function domainLiveNote(): string {
  return LIVE_NOTE;
}

export function domainRuntime(env: Env = process.env) {
  const mode = readAppMode("DOMAIN_SEND_APP_MODE", env);
  return {
    mode,
    apiKey: envValue("DOMAIN_SEND_RESELLER_API_KEY", env),
    username: envValue("DOMAIN_SEND_RESELLER_USERNAME", env),
  };
}

export function assertDomainReady(env: Env = process.env): void {
  const runtime = domainRuntime(env);
  requireCredentials(runtime.mode, "DOMAIN_SEND_APP_MODE", [
    { name: "DOMAIN_SEND_RESELLER_API_KEY", value: runtime.apiKey },
    { name: "DOMAIN_SEND_RESELLER_USERNAME", value: runtime.username },
  ]);
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "'") return "&apos;";
    return "&quot;";
  });
}

export function openSrsLookupXml(domain: string): string {
  return `<?xml version='1.0' encoding='UTF-8' standalone='no'?>
<!DOCTYPE OPS_envelope SYSTEM 'ops.dtd'>
<OPS_envelope>
<header><version>0.9</version></header>
<body><data_block><dt_assoc>
<item key="protocol">XCP</item>
<item key="action">LOOKUP</item>
<item key="object">DOMAIN</item>
<item key="attributes"><dt_assoc>
<item key="domain">${xmlEscape(domain)}</item>
</dt_assoc></item>
</dt_assoc></data_block></body>
</OPS_envelope>`;
}

export function openSrsSignature(xml: string, apiKey: string): string {
  const inner = createHash("md5").update(xml + apiKey).digest("hex");
  return createHash("md5").update(inner + apiKey).digest("hex");
}

export function parseOpenSrsLookup(xml: string): { code: string; status: string; text: string } {
  const code = /<item key="response_code">([^<]*)<\/item>/.exec(xml)?.[1]?.trim() ?? "";
  const status = /<item key="status">([^<]*)<\/item>/.exec(xml)?.[1]?.trim().toLowerCase() ?? "";
  const text = /<item key="response_text">([^<]*)<\/item>/.exec(xml)?.[1]?.trim() ?? "";
  return { code, status, text };
}

export async function resolveAvailability(value: unknown, env: Env = process.env): Promise<AvailabilityResult & { source: "stub" | "opensrs"; spend: "none" }> {
  const runtime = domainRuntime(env);
  if (runtime.mode === "demo") {
    return { ...checkAvailability(value), source: "stub", spend: "none" };
  }
  assertDomainReady(env);
  const local = checkAvailability(value);
  if (local.reason === "invalid-domain" || local.reason === "unsupported-tld") {
    return { ...local, source: "stub", spend: "none" };
  }
  const domain = String(value ?? "").trim().toLowerCase();
  const xml = openSrsLookupXml(domain);
  const host = runtime.mode === "live" ? "https://rr-n1-tor.opensrs.net:55443" : "https://horizon.opensrs.net:55443";
  const response = await providerRequest(host, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-Username": runtime.username,
      "X-Signature": openSrsSignature(xml, runtime.apiKey),
    },
    body: xml,
  });
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, "invalid_credentials", "OpenSRS rejected the reseller credentials");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError(502, "provider_error", `OpenSRS returned HTTP ${response.status}`);
  }
  const parsed = parseOpenSrsLookup(response.text);
  if (parsed.code && parsed.code !== "200") {
    throw new HttpError(401, "invalid_credentials", parsed.text || `OpenSRS response_code ${parsed.code}`);
  }
  const tld = domain.split(".").pop() ?? "";
  if (parsed.status === "available") {
    return { available: true, priceCents: YEARLY_PRICE_CENTS[tld], years: 1, source: "opensrs", spend: "none" };
  }
  if (parsed.status === "taken") {
    return { available: false, reason: "taken", source: "opensrs", spend: "none" };
  }
  throw new HttpError(502, "provider_error", "OpenSRS lookup did not return available or taken");
}

export async function checkDomainCredentials(env: Env = process.env) {
  const runtime = domainRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "domain-send",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      note: "Demo mode does not call OpenSRS. Availability for names starting with taken- is a local stub.",
    };
  }
  assertDomainReady(env);
  const result = await resolveAvailability("example.com", env);
  return {
    ok: true,
    connector: "domain-send",
    mode: runtime.mode,
    fulfillment: "live" as const,
    sampleDomain: "example.com",
    sample: result,
    spend: "none" as const,
    note: "OpenSRS LOOKUP of example.com only. Nothing was registered.",
  };
}

export function domainDescriptor(env: Env = process.env) {
  const runtime = domainRuntime(env);
  const ready = runtime.mode !== "demo" && Boolean(runtime.apiKey && runtime.username);
  return {
    mode: runtime.mode,
    fulfillment: runtime.mode === "demo" ? "stub" : ready ? "live" : "missing_credentials",
    note:
      runtime.mode === "demo"
        ? "Check availability at POST /v1/domain-send/domains/check, then register at POST /v1/domain-send/domains. Registrar fulfillment is not called in demo mode."
        : ready
          ? "POST /domains/check runs an OpenSRS LOOKUP. POST /domains stores a draft and does not register."
          : "DOMAIN_SEND_APP_MODE is test or live but reseller username or API key is empty.",
  };
}
