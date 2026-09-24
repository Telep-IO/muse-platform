import { resolve } from "node:path";
import { parseCents, DEFAULT_SERVICE_FEE_CENTS } from "./pricing.js";

export function readConfig(env = process.env) {
  const mode = env.APP_MODE || "demo";
  if (!["demo", "test", "live"].includes(mode)) throw new Error("APP_MODE must be demo, test, or live.");

  const publicUrl = new URL(env.SERVICE_PUBLIC_URL || "http://127.0.0.1:3000");
  if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) {
    throw new Error("SERVICE_PUBLIC_URL must be an origin.");
  }
  if (!["http:", "https:"].includes(publicUrl.protocol)) throw new Error("Invalid SERVICE_PUBLIC_URL protocol.");
  if (mode === "live" && publicUrl.protocol !== "https:") throw new Error("Live mode requires HTTPS.");

  const serviceFeeCents = parseCents(env.SERVICE_FEE_CENTS, "SERVICE_FEE_CENTS", { fallback: DEFAULT_SERVICE_FEE_CENTS });
  const platformFeeCents = parseCents(env.EASYPOST_PLATFORM_FEE_CENTS, "EASYPOST_PLATFORM_FEE_CENTS");

  if (mode !== "demo") {
    const prefix = mode === "live" ? "live" : "test";
    if (!env.EASYPOST_API_KEY?.trim()) throw new Error("Set EASYPOST_API_KEY. Refusing to boot with a silent stub.");
    if (mode === "test" && env.EASYPOST_API_KEY.startsWith("EZAK")) {
      throw new Error("APP_MODE=test refuses an EasyPost production key prefix. Use a test key.");
    }
    if (mode === "live" && env.EASYPOST_API_KEY.startsWith("EZTK")) {
      throw new Error("APP_MODE=live refuses an EasyPost test key prefix. Use the Forge production key.");
    }
    if (!env.STRIPE_SECRET_KEY?.startsWith(`sk_${prefix}_`)) throw new Error(`Expected a Stripe ${prefix} secret key.`);
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) throw new Error("Set STRIPE_WEBHOOK_SECRET.");
  }

  if (mode === "live") {
    if (!env.EASYPOST_ORDER_FORM_REFERENCE?.trim()) {
      throw new Error(
        "Live mode requires EASYPOST_ORDER_FORM_REFERENCE from the Forge Order Form. A self-serve Developer API key is not a live credential.",
      );
    }
    if (!env.DATABASE_URL?.trim()) throw new Error("Live mode requires DATABASE_URL (Postgres). SQLite is for local demo and test only.");
  }

  let databaseUrl = "";
  if (env.DATABASE_URL) {
    let url;
    try {
      url = new URL(env.DATABASE_URL);
    } catch {
      throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL.");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!local && url.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Remote DATABASE_URL requires sslmode=verify-full.");
    }
    databaseUrl = env.DATABASE_URL;
  }

  return {
    mode,
    publicUrl: publicUrl.origin,
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1",
    dataDir: resolve(env.DATA_DIR || "./data"),
    databaseUrl,
    easypostKey: env.EASYPOST_API_KEY?.trim() || "",
    stripeKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    orderFormReference: env.EASYPOST_ORDER_FORM_REFERENCE?.trim() || "",
    successUrl: env.STRIPE_SUCCESS_URL || `${publicUrl.origin}/checkout/success`,
    cancelUrl: env.STRIPE_CANCEL_URL || `${publicUrl.origin}/checkout/cancel`,
    serviceFeeCents,
    platformFeeCents,
    serviceToken: env.SERVICE_TOKEN?.trim() || "",
  };
}
