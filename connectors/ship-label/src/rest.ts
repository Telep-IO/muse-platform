import { errorResponse, jsonError, withCors, type AuthResult } from "@telep/platform";
import { buyShippingLabel, cancelLabel, createShipmentDraft, getLabel, getShipmentRates, listShipmentDrafts } from "./jobs";
import { assertShipLabelReady, checkShipLabel, quoteShipLabel, shipLabelDescriptor, shipLabelRuntime } from "./provider";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleShipLabelRest(request: Request, path: string[], auth: AuthResult | null): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "ship-label",
        name: "ShipLabel",
        status: "submitted",
        ...shipLabelDescriptor(),
        endpoints: {
          shipments: "/v1/ship-label/shipments",
          quote: "/v1/ship-label/quote",
          check: "/v1/ship-label/check",
          openapi: "/v1/ship-label/openapi.json",
          mcp: "/mcp/ship-label",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { shipLabelOpenApi } = await import("./openapi");
    return withCors(request, Response.json(shipLabelOpenApi()));
  }

  if (segments[0] === "check" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    try {
      return withCors(request, Response.json(await checkShipLabel()));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (segments[0] === "quote" && segments.length === 1 && request.method === "GET") {
    if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));
    const postage = Number(new URL(request.url).searchParams.get("postage_cents") ?? "0");
    try {
      return withCors(request, Response.json(quoteShipLabel(postage)));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  }

  if (!auth) return withCors(request, jsonError(401, "unauthorized", "Authorization: Bearer <key> is required"));

  try {
    const runtime = shipLabelRuntime();
    if (runtime.mode !== "demo" && segments[0] !== "quote") assertShipLabelReady();

    if (segments[0] === "shipments" && segments.length === 1 && request.method === "GET") {
      return withCors(request, Response.json(await listShipmentDrafts(auth.keyId)));
    }

    if (segments[0] === "shipments" && segments.length === 1 && request.method === "POST") {
      const body = await readJson(request);
      const draft = await createShipmentDraft({
        from: body.from,
        to: body.to,
        parcel: body.parcel,
        carrier_hint: body.carrier_hint,
        ownerKeyId: auth.keyId,
      });
      return withCors(request, Response.json(draft, { status: 201 }));
    }

    if (segments[0] === "shipments" && segments.length === 2 && request.method === "GET") {
      return withCors(request, Response.json(await getShipmentRates(segments[1], auth.keyId)));
    }

    if (segments[0] === "shipments" && segments[2] === "checkout" && segments.length === 3 && request.method === "POST") {
      const body = await readJson(request);
      const result = await buyShippingLabel(segments[1], String(body.rate_id ?? ""), auth.keyId);
      return withCors(request, Response.json(result, { status: 201 }));
    }

    if (segments[0] === "labels" && segments.length === 2 && request.method === "GET") {
      return withCors(request, Response.json(await getLabel(segments[1], auth.keyId)));
    }

    if (segments[0] === "labels" && segments[2] === "void" && segments.length === 3 && request.method === "POST") {
      return withCors(request, Response.json(await cancelLabel(segments[1], auth.keyId)));
    }
  } catch (error) {
    return withCors(request, errorResponse(error));
  }

  return withCors(request, jsonError(404, "not_found", `Unknown ship-label path /${segments.join("/")}`));
}
