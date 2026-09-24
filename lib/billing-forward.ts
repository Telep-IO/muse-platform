import { readAppMode, type Env } from "@telep/platform";

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
