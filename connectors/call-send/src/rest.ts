import { catalogOrigin, errorResponse, jsonError, withCors, type AuthResult } from "@telep/platform";
import { createCall, demoEvent, getCall, listCalls, publicCall } from "./calls";
import { assertCallReady, callDescriptor, callRuntime, checkCall, quoteCall } from "./provider";

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
        price: "$0.99 per call",
        limits: "verbatim TTS script, up to ~5 minutes",
        ...callDescriptor(),
        endpoints: {
          calls: "/v1/call-send/calls",
          quote: "/v1/call-send/quote",
          check: "/v1/call-send/check",
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

  if (segments[0] === "check" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    try {
      return withCors(request, Response.json(await checkCall()));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "quote" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json(quoteCall()));
  }

  if (segments[0] === "calls" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json({ calls: listCalls(auth.keyId).map(publicCall) }));
  }

  if (segments[0] === "calls" && segments.length === 1 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const runtime = callRuntime();
      if (runtime.mode !== "demo") assertCallReady();
      const call = createCall({
        to: String(body.to ?? ""),
        script: String(body.script ?? ""),
        voice: body.voice ? String(body.voice) : undefined,
        record: body.record === true,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
      return withCors(request, Response.json(publicCall(call), { status: 201 }));
    } catch (error) {
      return withCors(request, errorResponse(error));
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
