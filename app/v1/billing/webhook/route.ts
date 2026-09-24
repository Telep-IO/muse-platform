import { errorResponse, handleWebhook, HttpError, jsonError, withCors } from "@telep/platform";
import { fulfillShipLabelPayment } from "@telep/ship-label";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  try {
    const result = await handleWebhook(raw, signature, (session) => fulfillShipLabelPayment(session));
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
