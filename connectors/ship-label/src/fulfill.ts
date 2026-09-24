import { HttpError, providerRequest, type Env, type FulfillResult, type PaidSession } from "@telep/platform";
import { shipLabelRuntime } from "./provider";

/**
 * Shared /v1/billing/webhook hook. EasyPost buy is delegated to the fulfillment
 * service, which claims the draft before purchasing. Other connectors return
 * undefined so their webhook acknowledgement stays unchanged.
 */
export async function fulfillShipLabelPayment(session: PaidSession, env: Env = process.env): Promise<FulfillResult | undefined> {
  if (session.metadata.connector !== "ship-label") return undefined;
  if (session.paymentStatus !== "paid") return { fulfilled: false, reason: "unpaid" };
  const runtime = shipLabelRuntime(env);
  if (runtime.mode === "demo") return { fulfilled: false, reason: "demo" };

  const draftId = session.metadata.draft_id || session.metadata.jobId;
  if (!draftId) return { fulfilled: false, reason: "missing_job", retry: true };
  if (!runtime.serviceUrl) return { fulfilled: false, reason: "SHIP_LABEL_SERVICE_URL is required", retry: true };

  const headers = new Headers({ "content-type": "application/json" });
  const token = (env.SHIP_LABEL_SERVICE_TOKEN ?? "").trim();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await providerRequest(`${runtime.serviceUrl.replace(/\/$/, "")}/drafts/${encodeURIComponent(draftId)}/fulfill`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: session.id,
      payment_status: "paid",
      livemode: session.livemode,
      payment_intent: session.eventId,
      amount_total: session.amountTotal ?? session.amountSubtotal,
      metadata: {
        draft_id: draftId,
        rate_id: session.metadata.rate_id,
        postage_cents: session.metadata.postage_cents,
        fee_cents: session.metadata.fee_cents,
      },
    }),
  });
  const body = (response.json ?? null) as {
    fulfilled?: boolean;
    duplicate?: boolean;
    reason?: string;
    error?: string;
    code?: string;
  } | null;
  if (response.status >= 500 || body?.reason === "in_flight") {
    return { fulfilled: false, reason: body?.reason || body?.error || "fulfillment_pending", retry: true };
  }
  if (response.status < 200 || response.status >= 300) {
    throw new HttpError(response.status, body?.code || "service_error", body?.error || `ShipLabel service returned HTTP ${response.status}`);
  }
  return { fulfilled: Boolean(body?.fulfilled), duplicate: body?.duplicate, reason: body?.reason };
}
