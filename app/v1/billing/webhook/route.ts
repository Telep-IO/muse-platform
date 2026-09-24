import { getModule } from "@/connectors";
import { errorResponse, handleWebhook, HttpError, jsonError, withCors } from "@telep/platform";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  try {
    // Each paid connector owns its fulfillment via defineConnector({ fulfill }).
    const result = await handleWebhook(raw, signature, async (session) =>
      getModule(session.metadata.connector ?? "")?.fulfill?.(session, { raw, signature }),
    );
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
