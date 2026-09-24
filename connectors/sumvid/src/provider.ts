import { HttpError, assertProviderOk, envValue, modeFulfillment, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { createSummary, getAccount, parseYoutubeInput, type Summary } from "./summaries";

function baseUrl(env: Env): string {
  return envValue("SUMVID_API_BASE_URL", env).replace(/\/$/, "");
}

export function sumvidRuntime(env: Env = process.env) {
  const mode = readAppMode("SUMVID_APP_MODE", env);
  return {
    mode,
    baseUrl: baseUrl(env),
    apiKey: envValue("SUMVID_API_KEY", env),
  };
}

function assertReady(env: Env): { mode: "test" | "live"; baseUrl: string; apiKey: string } {
  const runtime = sumvidRuntime(env);
  requireCredentials(runtime.mode, "SUMVID_APP_MODE", [
    { name: "SUMVID_API_BASE_URL", value: runtime.baseUrl },
    { name: "SUMVID_API_KEY", value: runtime.apiKey },
  ]);
  if (runtime.mode === "demo") {
    throw new HttpError(500, "internal_error", "assertReady called in demo mode");
  }
  return { mode: runtime.mode, baseUrl: runtime.baseUrl, apiKey: runtime.apiKey };
}

function insufficientCredits(status: number, json: unknown, fallbackBase: string): { message: string; topUpUrl?: string } | null {
  if (!json || typeof json !== "object") {
    return status === 402 ? { message: "Sumvid account has insufficient credits." } : null;
  }
  const body = json as Record<string, unknown>;
  const nested = body.error && typeof body.error === "object" ? (body.error as Record<string, unknown>) : body;
  const code = String(nested.code ?? body.code ?? "").toLowerCase().replace(/-/g, "_");
  const message = String(nested.message ?? body.message ?? "");
  const topUpUrl = String(
    nested.topUpUrl ?? nested.top_up_url ?? nested.topup_url ?? body.topUpUrl ?? body.top_up_url ?? body.billingUrl ?? body.billing_url ?? "",
  ).trim();
  if (status === 402 || code === "insufficient_credits") {
    return {
      message: message || "Sumvid account has insufficient credits.",
      topUpUrl: topUpUrl || undefined,
      ...(topUpUrl ? {} : { hint: `No top-up URL in the Sumvid body. Check ${fallbackBase}.` }),
    } as { message: string; topUpUrl?: string };
  }
  return null;
}

function throwIfCredits(status: number, json: unknown, fallbackBase: string): void {
  const credits = insufficientCredits(status, json, fallbackBase);
  if (!credits) return;
  const extras: Record<string, unknown> = {};
  if (credits.topUpUrl) extras.topUpUrl = credits.topUpUrl;
  throw new HttpError(402, "insufficient_credits", credits.message, Object.keys(extras).length ? extras : undefined);
}

function readSummaryPayload(json: unknown): { title: string; summary: string; bullets: string[] } {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body.result && typeof body.result === "object"
        ? (body.result as Record<string, unknown>)
        : body;
  const summary = String(data.summary ?? data.text ?? "").trim();
  const title = String(data.title ?? "Sumvid summary").trim() || "Sumvid summary";
  const rawBullets = data.bullets ?? data.bulletPoints ?? data.highlights;
  const bullets = Array.isArray(rawBullets) ? rawBullets.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
  if (!summary) throw new HttpError(502, "provider_error", "Sumvid response did not include summary text");
  return { title, summary, bullets };
}

export async function checkSumvid(env: Env = process.env) {
  const runtime = sumvidRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "sumvid",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      note: "Demo mode does not call Sumvid. Summaries are hashed from the video id.",
    };
  }
  const ready = assertReady(env);
  const account = await providerRequest(`${ready.baseUrl}/v1/account`, {
    headers: { Authorization: `Bearer ${ready.apiKey}`, Accept: "application/json" },
  });
  throwIfCredits(account.status, account.json, ready.baseUrl);
  if (account.status === 404) {
    return {
      ok: true,
      connector: "sumvid",
      mode: ready.mode,
      fulfillment: "live" as const,
      account: "not_found",
      spend: "none" as const,
      note: "GET /v1/account returned 404. POST /v1/summaries is still the summarize call. No summary was requested.",
    };
  }
  assertProviderOk(account, "Sumvid");
  return {
    ok: true,
    connector: "sumvid",
    mode: ready.mode,
    fulfillment: "live" as const,
    account: "ok",
    spend: "none" as const,
    note: "Sumvid GET /v1/account succeeded. This check does not summarize a video.",
  };
}

export async function summarize(input: {
  youtubeUrl: unknown;
  language?: unknown;
  ownerKeyId: string;
}, env: Env = process.env): Promise<Summary> {
  const runtime = sumvidRuntime(env);
  if (runtime.mode === "demo") return createSummary(input);
  const ready = assertReady(env);
  const parsed = parseYoutubeInput(input.youtubeUrl);
  const language = String(input.language ?? "en").trim() || "en";
  if (language.length > 16) throw new HttpError(400, "invalid_request", "language is too long");
  const response = await providerRequest(`${ready.baseUrl}/v1/summaries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ready.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ youtubeUrl: parsed.youtubeUrl, videoId: parsed.videoId, language }),
  });
  throwIfCredits(response.status, response.json, ready.baseUrl);
  assertProviderOk(response, "Sumvid");
  const payload = readSummaryPayload(response.json);
  const summary = createSummary({ ...input, youtubeUrl: parsed.youtubeUrl, language });
  summary.status = "ready";
  summary.fulfillment = "live";
  summary.title = payload.title;
  summary.summary = payload.summary;
  summary.bullets = payload.bullets.length ? payload.bullets : [payload.summary];
  summary.note = "Summary returned by the Sumvid API.";
  return summary;
}

export function sumvidAccount(ownerKeyId: string, env: Env = process.env) {
  const runtime = sumvidRuntime(env);
  if (runtime.mode === "demo") return getAccount(ownerKeyId);
  const base = getAccount(ownerKeyId);
  return {
    ...base,
    plan: runtime.mode,
    note: "Sumvid gateway account. Usage is whatever the Sumvid API reports on GET /v1/account.",
  };
}

export function sumvidDescriptor(env: Env = process.env) {
  const runtime = sumvidRuntime(env);
  return modeFulfillment(runtime.mode, runtime.mode !== "demo" && Boolean(runtime.baseUrl && runtime.apiKey), {
    demo: "Create a stub summary at POST /v1/sumvid/summaries. No captions are fetched and no paid summarizer is called.",
    ready: "POST /v1/sumvid/summaries calls the Sumvid API. GET /check only hits GET /v1/account.",
    missing: "SUMVID_APP_MODE is test or live but SUMVID_API_BASE_URL or SUMVID_API_KEY is empty.",
  });
}
