import { printMerchFulfillmentPlan } from "@/lib/billing-forward";
import { errorResponse, handleWebhook, HttpError, jsonError, withCors } from "@telep/platform";
import { fulfillGiftSendPayment } from "@telep/gift-send";
import { fulfillShipLabelPayment } from "@telep/ship-label";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  try {
    const result = await handleWebhook(raw, signature, async (session) => {
      const labeled = await fulfillShipLabelPayment(session);
      if (labeled) return labeled;
      const gifted = await fulfillGiftSendPayment(session);
      if (gifted) return gifted;
      if (session.metadata.connector !== "print-merch") return undefined;
      const plan = printMerchFulfillmentPlan({
        stub: false,
        connector: "print-merch",
        paymentStatus: session.paymentStatus ?? undefined,
      });
      if (plan.action === "passthrough") return undefined;
      if (plan.action === "unpaid") return { fulfilled: false, reason: "unpaid" };
      if (plan.action === "unavailable") {
        throw new HttpError(503, "missing_credentials", "PRINT_MERCH_SERVICE_URL is not set");
      }
      const forwarded = await fetch(plan.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(signature ? { "stripe-signature": signature } : {}),
        },
        body: raw,
      });
      if (!forwarded.ok) {
        throw new HttpError(502, "provider_error", "PrintMerch fulfillment did not accept the paid webhook");
      }
      return { fulfilled: true };
    });
    return withCors(request, Response.json(result));
  } catch (error) {
    if (error instanceof HttpError) return withCors(request, errorResponse(error));
    const message = error instanceof Error ? error.message : "Webhook failed";
    return withCors(request, jsonError(400, "webhook_invalid", message));
  }
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}
