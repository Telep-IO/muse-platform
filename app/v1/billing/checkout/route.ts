import { authenticate, catalogOrigin, createCheckoutSession, jsonError, withCors } from "@telep/platform";

export async function POST(request: Request) {
  try {
    authenticate(request, { required: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return withCors(request, jsonError(401, "unauthorized", message));
  }

  let body: {
    connectorSlug?: string;
    jobId?: string;
    amountCents?: number;
    successUrl?: string;
    cancelUrl?: string;
    customerEmail?: string;
    description?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return withCors(request, jsonError(400, "invalid_json", "JSON body required"));
  }

  if (!body.connectorSlug || !body.jobId || !body.amountCents) {
    return withCors(
      request,
      jsonError(400, "invalid_request", "connectorSlug, jobId, and amountCents are required"),
    );
  }

  const catalog = catalogOrigin();
  const result = await createCheckoutSession({
    connectorSlug: body.connectorSlug,
    jobId: body.jobId,
    amountCents: body.amountCents,
    successUrl: body.successUrl || `${catalog}/docs`,
    cancelUrl: body.cancelUrl || `${catalog}/docs`,
    customerEmail: body.customerEmail,
    description: body.description,
  });

  return withCors(request, Response.json(result));
}

export async function OPTIONS(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}
