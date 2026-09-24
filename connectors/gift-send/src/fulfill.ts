import { HttpError, providerRequest, type Env, type FulfillResult, type PaidSession } from "@telep/platform";
import { giftSendRuntime } from "./provider";

/**
 * Shared /v1/billing/webhook hook. The Tremendous order is delegated to the
 * fulfillment service, which claims the draft before POST /orders. Other
 * connectors return undefined.
 */
export async function fulfillGiftSendPayment(session: PaidSession, env: Env = process.env): Promise<FulfillResult | undefined> {
  if (session.metadata.connector !== "gift-send") return undefined;
  if (session.paymentStatus !== "paid") return { fulfilled: false, reason: "unpaid" };
  const runtime = giftSendRuntime(env);
  if (runtime.mode === "demo") return { fulfilled: false, reason: "demo" };

  const draftId = session.metadata.draft_id || session.metadata.jobId;
  if (!draftId) return { fulfilled: false, reason: "missing_job", retry: true };
  if (!runtime.serviceUrl) return { fulfilled: false, reason: "GIFT_SEND_SERVICE_URL is required", retry: true };

  const headers = new Headers({ "content-type": "application/json" });
  const token = (env.GIFT_SEND_SERVICE_TOKEN ?? "").trim();
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
        connector: "gift-send",
        draft_id: draftId,
        face_cents: session.metadata.face_cents,
        fee_cents: session.metadata.fee_cents,
        reward_id: session.metadata.reward_id,
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
    throw new HttpError(response.status, body?.code || "service_error", body?.error || `GiftSend service returned HTTP ${response.status}`);
  }
  return { fulfilled: Boolean(body?.fulfilled), duplicate: body?.duplicate, reason: body?.reason };
}
