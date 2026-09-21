import { catalogOrigin, jsonError, withCors, type AuthResult } from "@telep/platform";
import { PRICE_CENTS, createEnvelope, demoEvent, getEnvelope, listEnvelopes, publicEnvelope } from "./envelopes";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleSignSendRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "sign-send",
        name: "SignSend",
        status: "building",
        fulfillment: "stub",
        price: `$${(PRICE_CENTS / 100).toFixed(2)} per envelope`,
        limits: "PDF up to 5 pages, 1-5 sequential signers",
        note: "Create an envelope at POST /v1/sign-send/envelopes. E-signature provider fulfillment is not wired on this gateway yet.",
        endpoints: {
          envelopes: "/v1/sign-send/envelopes",
          openapi: "/v1/sign-send/openapi.json",
          mcp: "/mcp/sign-send",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { signSendOpenApi } = await import("./openapi");
    return withCors(request, Response.json(signSendOpenApi()));
  }

  const needsAuth = (message = "Authorization: Bearer <key> is required") =>
    withCors(request, jsonError(401, "unauthorized", message));

  if (segments[0] === "envelopes" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json({ envelopes: listEnvelopes(auth.keyId).map(publicEnvelope) }));
  }

  if (segments[0] === "envelopes" && segments.length === 1 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const envelope = createEnvelope({
        document: body.document as { filename?: string; pages?: number } | undefined,
        signers: body.signers,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
      });
      return withCors(request, Response.json(publicEnvelope(envelope), { status: 201 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid envelope";
      return withCors(request, jsonError(400, "invalid_request", message));
    }
  }

  if (segments[0] === "envelopes" && segments.length === 2 && request.method === "GET") {
    if (!auth) return needsAuth();
    const envelope = getEnvelope(segments[1], auth.keyId);
    if (!envelope) return withCors(request, jsonError(404, "not_found", "Envelope not found"));
    return withCors(request, Response.json(publicEnvelope(envelope)));
  }

  if (segments[0] === "envelopes" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
    if (!auth) return needsAuth();
    const envelope = getEnvelope(segments[1], auth.keyId);
    if (!envelope) return withCors(request, jsonError(404, "not_found", "Envelope not found"));
    if (envelope.status !== "draft") {
      return withCors(request, jsonError(409, "conflict", `Envelope is ${envelope.status}, checkout only from draft`));
    }
    return withCors(
      request,
      Response.json({
        checkoutUrl: `${catalogOrigin()}/connectors/sign-send#checkout-${envelope.id}`,
        amountCents: envelope.amountCents,
        currency: envelope.currency,
        note: "Stub checkout: no payment is collected on the gateway. In production this returns a Stripe Checkout session; the envelope moves to paid only after the billing webhook confirms payment.",
      }),
    );
  }

  if (segments[0] === "envelopes" && segments.length === 3 && segments[2] === "demo-event" && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const envelope = demoEvent(
        segments[1],
        auth.keyId,
        String(body.event ?? ""),
        body.signerEmail ? String(body.signerEmail) : undefined,
      );
      return withCors(request, Response.json(publicEnvelope(envelope)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid demo event";
      const code = message === "Envelope not found" ? 404 : 400;
      return withCors(request, jsonError(code, code === 404 ? "not_found" : "invalid_request", message));
    }
  }

  return withCors(request, jsonError(404, "not_found", `Unknown sign-send path /${segments.join("/")}`));
}
