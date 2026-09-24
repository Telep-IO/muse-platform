import { HttpError, readAppMode, type Env, type FulfillResult, type PaidSession, type StripeWebhook } from "@telep/platform";

export type FulfillmentResult = {
  connector?: string;
  stub: boolean;
  paymentStatus?: string;
};

export type ForwardPlan = { action: "passthrough" } | { action: "unpaid" } | { action: "unavailable" } | { action: "forward"; url: string };

export function printMerchFulfillmentPlan(result: FulfillmentResult, env: Env = process.env): ForwardPlan {
  if (result.stub || result.connector !== "print-merch") return { action: "passthrough" };
  if (readAppMode("PRINT_MERCH_APP_MODE", env) === "demo") return { action: "passthrough" };
  if (result.paymentStatus !== "paid") return { action: "unpaid" };
  const base = (env.PRINT_MERCH_SERVICE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return { action: "unavailable" };
  return { action: "forward", url: `${base}/webhooks/stripe` };
}

/** Forwards the signed Stripe body so the PrintMerch service re-verifies it before any Printify call. */
export async function fulfillPrintMerchPayment(session: PaidSession, webhook: StripeWebhook, env: Env = process.env): Promise<FulfillResult | undefined> {
  const plan = printMerchFulfillmentPlan({ stub: false, connector: session.metadata.connector, paymentStatus: session.paymentStatus ?? undefined }, env);
  if (plan.action === "passthrough") return undefined;
  if (plan.action === "unpaid") return { fulfilled: false, reason: "unpaid" };
  if (plan.action === "unavailable") throw new HttpError(503, "missing_credentials", "PRINT_MERCH_SERVICE_URL is not set");
  const forwarded = await fetch(plan.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(webhook.signature ? { "stripe-signature": webhook.signature } : {}) },
    body: webhook.raw,
  });
  if (!forwarded.ok) throw new HttpError(502, "provider_error", "PrintMerch fulfillment did not accept the paid webhook");
  return { fulfilled: true };
}
