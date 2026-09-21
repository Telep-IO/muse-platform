import { catalogOrigin, jsonError, withCors, type AuthResult } from "@telep/platform";
import { PRICE_CENTS, createCall, demoEvent, getCall, listCalls, publicCall } from "./calls";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleCallSendRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "call-send",
        name: "CallSend",
        status: "planned",
        fulfillment: "stub",
        price: `$${(PRICE_CENTS / 100).toFixed(2)} per call`,
        limits: "verbatim TTS script, up to ~5 minutes",
        note: "Create a call at POST /v1/call-send/calls. Voice provider fulfillment is not wired on this gateway yet.",
        endpoints: {
          calls: "/v1/call-send/calls",
          openapi: "/v1/call-send/openapi.json",
          mcp: "/mcp/call-send",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { callSendOpenApi } = await import("./openapi");
    return withCors(request, Response.json(callSendOpenApi()));
  }

  const needsAuth = (message = "Authorization: Bearer <key> is required") =>
    withCors(request, jsonError(401, "unauthorized", message));

  if (segments[0] === "calls" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json({ calls: listCalls(auth.keyId).map(publicCall) }));
  }

  if (segments[0] === "calls" && segments.length === 1 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const call = createCall({
        to: String(body.to ?? ""),
        script: String(body.script ?? ""),
        voice: body.voice ? String(body.voice) : undefined,
        record: body.record === true,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
      });
      return withCors(request, Response.json(publicCall(call), { status: 201 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid call";
      return withCors(request, jsonError(400, "invalid_request", message));
    }
  }

  if (segments[0] === "calls" && segments.length === 2 && request.method === "GET") {
    if (!auth) return needsAuth();
    const call = getCall(segments[1], auth.keyId);
    if (!call) return withCors(request, jsonError(404, "not_found", "Call not found"));
    return withCors(request, Response.json(publicCall(call)));
  }

  if (segments[0] === "calls" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
    if (!auth) return needsAuth();
    const call = getCall(segments[1], auth.keyId);
    if (!call) return withCors(request, jsonError(404, "not_found", "Call not found"));
    if (call.status !== "draft") {
      return withCors(request, jsonError(409, "conflict", `Call is ${call.status}, checkout only from draft`));
    }
    return withCors(
      request,
      Response.json({
        checkoutUrl: `${catalogOrigin()}/connectors/call-send#checkout-${call.id}`,
        amountCents: call.amountCents,
        currency: call.currency,
        note: "Stub checkout: no payment is collected on the gateway. In production this returns a Stripe Checkout session; the call moves to paid only after the billing webhook confirms payment.",
      }),
    );
  }

  if (segments[0] === "calls" && segments.length === 3 && segments[2] === "demo-event" && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const call = demoEvent(segments[1], auth.keyId, String(body.event ?? ""));
      return withCors(request, Response.json(publicCall(call)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid demo event";
      const code = message === "Call not found" ? 404 : 400;
      return withCors(request, jsonError(code, code === 404 ? "not_found" : "invalid_request", message));
    }
  }

  return withCors(request, jsonError(404, "not_found", `Unknown call-send path /${segments.join("/")}`));
}
