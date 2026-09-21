import { catalogOrigin, jsonError, withCors, type AuthResult } from "@telep/platform";
import { PRICE_PER_PAGE_CENTS, createFax, demoEvent, getFax, listFaxes, publicFax } from "./faxes";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleFaxSendRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "fax-send",
        name: "FaxSend",
        status: "building",
        fulfillment: "stub",
        price: `$${(PRICE_PER_PAGE_CENTS / 100).toFixed(2)} per transmitted page`,
        limits: "PDF up to 10 pages, optional cover page (billable)",
        note: "Create a fax at POST /v1/fax-send/faxes. Fax provider fulfillment is not wired on this gateway yet.",
        endpoints: {
          faxes: "/v1/fax-send/faxes",
          openapi: "/v1/fax-send/openapi.json",
          mcp: "/mcp/fax-send",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { faxSendOpenApi } = await import("./openapi");
    return withCors(request, Response.json(faxSendOpenApi()));
  }

  const needsAuth = (message = "Authorization: Bearer <key> is required") =>
    withCors(request, jsonError(401, "unauthorized", message));

  if (segments[0] === "faxes" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json({ faxes: listFaxes(auth.keyId).map(publicFax) }));
  }

  if (segments[0] === "faxes" && segments.length === 1 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const fax = createFax({
        to: body.to,
        document: body.document as { filename?: string; pages?: number } | undefined,
        coverPage: body.coverPage,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
      });
      return withCors(request, Response.json(publicFax(fax), { status: 201 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid fax";
      return withCors(request, jsonError(400, "invalid_request", message));
    }
  }

  if (segments[0] === "faxes" && segments.length === 2 && request.method === "GET") {
    if (!auth) return needsAuth();
    const fax = getFax(segments[1], auth.keyId);
    if (!fax) return withCors(request, jsonError(404, "not_found", "Fax not found"));
    return withCors(request, Response.json(publicFax(fax)));
  }

  if (segments[0] === "faxes" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
    if (!auth) return needsAuth();
    const fax = getFax(segments[1], auth.keyId);
    if (!fax) return withCors(request, jsonError(404, "not_found", "Fax not found"));
    if (fax.status !== "draft") {
      return withCors(request, jsonError(409, "conflict", `Fax is ${fax.status}, checkout only from draft`));
    }
    return withCors(
      request,
      Response.json({
        checkoutUrl: `${catalogOrigin()}/connectors/fax-send#checkout-${fax.id}`,
        amountCents: fax.amountCents,
        currency: fax.currency,
        note: "Stub checkout: no payment is collected on the gateway. In production this returns a Stripe Checkout session; the fax moves to paid only after the billing webhook confirms payment.",
      }),
    );
  }

  if (segments[0] === "faxes" && segments.length === 3 && segments[2] === "demo-event" && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const fax = demoEvent(segments[1], auth.keyId, String(body.event ?? ""));
      return withCors(request, Response.json(publicFax(fax)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid demo event";
      const code = message === "Fax not found" ? 404 : 400;
      return withCors(request, jsonError(code, code === 404 ? "not_found" : "invalid_request", message));
    }
  }

  return withCors(request, jsonError(404, "not_found", `Unknown fax-send path /${segments.join("/")}`));
}
