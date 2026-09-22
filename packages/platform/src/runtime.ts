import { HttpError } from "./errors";

export type AppMode = "demo" | "test" | "live";
export type Env = Record<string, string | undefined>;

export function readAppMode(name: string, env: Env = process.env): AppMode {
  const raw = (env[name] ?? "").trim().toLowerCase();
  if (!raw || raw === "demo") return "demo";
  if (raw === "test" || raw === "live") return raw;
  throw new HttpError(500, "invalid_mode", `${name} must be demo, test, or live`);
}

export function envValue(name: string, env: Env = process.env): string {
  return (env[name] ?? "").trim();
}

export function requireCredentials(mode: AppMode, modeName: string, checks: { name: string; value: string }[]): void {
  if (mode === "demo") return;
  const missing = checks.filter((check) => !check.value).map((check) => check.name);
  if (missing.length) {
    throw new HttpError(
      503,
      "missing_credentials",
      `${modeName} is ${mode} but missing ${missing.join(", ")}. Leave the mode unset or set it to demo to stay on the stub.`,
    );
  }
}

export function basicAuthHeader(user: string, password = ""): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

export async function providerRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<{ status: number; json: unknown; text: string }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new HttpError(504, "provider_unreachable", "Provider request timed out");
    }
    throw new HttpError(502, "provider_unreachable", "Provider request failed");
  }
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text: text.slice(0, 20000) };
}

export function modeFulfillment(
  mode: AppMode,
  ready: boolean,
  notes: { demo: string; ready: string; missing: string },
  liveName = "live",
) {
  return {
    mode,
    fulfillment: mode === "demo" ? "stub" : ready ? liveName : "missing_credentials",
    note: mode === "demo" ? notes.demo : ready ? notes.ready : notes.missing,
  };
}

export function assertProviderOk(response: { status: number }, provider: string): void {
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, "invalid_credentials", `${provider} rejected the credentials`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError(502, "provider_error", `${provider} returned HTTP ${response.status}`);
  }
}
