import { handleWebhook, jsonError, withCors } from "@telep/platform";

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature");
  try {
    const result = await handleWebhook(raw, signature);
    return withCors(request, Response.json(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return withCors(request, jsonError(400, "webhook_invalid", message));
  }
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}
