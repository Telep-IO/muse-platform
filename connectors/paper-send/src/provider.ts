import {
  HttpError,
  assertProviderOk,
  basicAuthHeader,
  envValue,
  modeFulfillment,
  providerRequest,
  readAppMode,
  requireCredentials,
  type Env,
} from "@telep/platform";
import { priceCents, type Job } from "./jobs";

export { assertPaperDatabase, paperDatabaseUrl } from "./db";

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
      note: "Demo mode does not call Lob or Stripe. Set PAPER_SEND_APP_MODE=test with a test_ Lob key to verify auth. Demo never transmits a letter.",
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
    note: "Lob auth succeeded via GET /v1/addresses (read-only). No letter was created. Lob sends only after a verified Stripe payment webhook. Stripe balance is read-only when a key is set.",
  };
}

export function paperDescriptor(env: Env = process.env) {
  const runtime = paperRuntime(env);
  return modeFulfillment(runtime.mode, runtime.mode !== "demo" && Boolean(runtime.lobKey), {
    demo: "Create a job at POST /v1/paper-send/jobs. Demo mode stores an in-memory stub and does not call Lob.",
    ready:
      "Lob key is set. POST /jobs stores a durable draft and does not mail. After Stripe confirms payment, the billing webhook asks Lob to send. GET /check verifies Lob auth and does not create a letter.",
    missing:
      "PAPER_SEND_APP_MODE is test or live but PAPER_SEND_LOB_API_KEY is empty. Drafts can still be stored. Fulfillment will not pretend a letter was sent.",
  }, "lob");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char] ?? char;
  });
}

function letterHtml(job: Job): string {
  const filename = escapeHtml(job.document.filename);
  const pages = String(job.document.pages);
  const id = escapeHtml(job.id);
  return `<html><body><p>PaperSend ${id}</p><p>Document: ${filename} (${pages} page(s)).</p><p>Paid on the Telep Muse gateway. This HTML letter is what Lob prints; the gateway does not store PDF bytes.</p></body></html>`;
}

export type LobLetter = { id: string; status?: string; expected_delivery_date?: string | null };

/** Create a Lob letter. Refuses demo mode and a key prefix that does not match the mode. */
export async function sendPaperLetter(job: Job, env: Env = process.env): Promise<LobLetter> {
  const runtime = paperRuntime(env);
  if (runtime.mode === "demo") {
    throw new HttpError(400, "demo_mode", "Demo mode does not call Lob");
  }
  assertPaperReady(env);
  const form = new URLSearchParams();
  const sides = { to: job.recipient, from: job.sender } as const;
  for (const [side, address] of Object.entries(sides)) {
    form.set(`${side}[name]`, address.name);
    form.set(`${side}[address_line1]`, address.address_line1);
    if (address.address_line2) form.set(`${side}[address_line2]`, address.address_line2);
    form.set(`${side}[address_city]`, address.address_city);
    form.set(`${side}[address_state]`, address.address_state);
    form.set(`${side}[address_zip]`, address.address_zip);
    form.set(`${side}[address_country]`, address.address_country || "US");
  }
  form.set("color", "false");
  form.set("double_sided", "false");
  form.set("address_placement", "insert_blank_page");
  form.set("mail_type", "usps_first_class");
  form.set("use_type", "operational");
  form.set("description", `PaperSend ${job.id}`);
  form.set("metadata[job_id]", job.id);
  form.set("file", letterHtml(job));

  const response = await providerRequest(
    "https://api.lob.com/v1/letters",
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(runtime.lobKey),
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `letter-${job.id}`,
      },
      body: form.toString(),
    },
    25000,
  );
  if (response.status >= 400 && response.status < 500) {
    throw new HttpError(400, "lob_rejected", `Lob rejected the letter (HTTP ${response.status})`);
  }
  assertProviderOk(response, "Lob");
  const json = response.json as { id?: string; status?: string; expected_delivery_date?: string | null } | null;
  if (!json?.id || !/^ltr_[A-Za-z0-9]+$/.test(json.id)) {
    throw new HttpError(502, "provider_error", "Lob returned an invalid response");
  }
  return { id: json.id, status: json.status, expected_delivery_date: json.expected_delivery_date ?? null };
}
