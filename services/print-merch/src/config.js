import { resolve } from "node:path";

export function readConfig(env = process.env) {
  const mode = env.APP_MODE || "demo";
  if (!["demo", "test", "live"].includes(mode)) throw new Error("APP_MODE must be demo, test, or live.");
  const publicUrl = new URL(env.SERVICE_PUBLIC_URL || "http://localhost:3000");
  if (publicUrl.username || publicUrl.password) throw new Error("SERVICE_PUBLIC_URL must not include credentials.");
  if (!["http:", "https:"].includes(publicUrl.protocol)) throw new Error("Invalid SERVICE_PUBLIC_URL protocol.");
  if (mode === "live" && publicUrl.protocol !== "https:") throw new Error("Live mode requires HTTPS SERVICE_PUBLIC_URL.");

  if (mode !== "demo") {
    const prefix = mode === "live" ? "live" : "test";
    if (!env.PRINTIFY_API_KEY?.trim()) throw new Error("test/live requires PRINTIFY_API_KEY.");
    if (!env.PRINTIFY_SHOP_ID?.trim()) throw new Error("test/live requires PRINTIFY_SHOP_ID.");
    if (!env.STRIPE_SECRET_KEY?.startsWith(`sk_${prefix}_`)) throw new Error(`Expected a Stripe ${prefix} secret key.`);
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) throw new Error("Set STRIPE_WEBHOOK_SECRET.");
    if (!env.PRINTIFY_WEBHOOK_SECRET?.trim()) throw new Error("test/live requires PRINTIFY_WEBHOOK_SECRET.");
  }
  if (mode === "live" && !env.DATABASE_URL?.trim()) throw new Error("Live mode requires DATABASE_URL.");
  if (mode === "live" && !env.SERVICE_TOKEN?.trim()) throw new Error("Live mode requires SERVICE_TOKEN.");

  let databaseUrl = env.DATABASE_URL?.trim() || "";
  if (databaseUrl) {
    let url;
    try {
      url = new URL(databaseUrl);
    } catch {
      throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL.");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!local && url.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Remote DATABASE_URL requires sslmode=verify-full.");
    }
  }

  const markup = markupBps(env.MARKUP_BPS);
  return {
    mode,
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1",
    dataDir: resolve(env.DATA_DIR || "./data"),
    databaseUrl,
    publicUrl: publicUrl.origin,
    printifyKey: env.PRINTIFY_API_KEY?.trim() || "",
    shopId: env.PRINTIFY_SHOP_ID?.trim() || "",
    stripeKey: env.STRIPE_SECRET_KEY?.trim() || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || "",
    printifyWebhookSecret: env.PRINTIFY_WEBHOOK_SECRET?.trim() || "",
    serviceToken: env.SERVICE_TOKEN?.trim() || "",
    successUrl: env.STRIPE_SUCCESS_URL?.trim() || publicUrl.origin,
    cancelUrl: env.STRIPE_CANCEL_URL?.trim() || publicUrl.origin,
    markupBps: markup,
  };
}

export function markupBps(raw) {
  if (raw == null || String(raw).trim() === "") return 2500;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10000) throw new Error("MARKUP_BPS must be an integer from 0 to 10000.");
  return n;
}
