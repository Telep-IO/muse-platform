import { catalogOrigin, jsonError, withCors, type AuthResult } from "@telep/platform";
import { checkAvailability, createDomain, demoEvent, getDomain, listDomains, publicDomain } from "./domains";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleDomainSendRest(
  request: Request,
  path: string[],
  auth: AuthResult | null,
): Promise<Response> {
  const segments = path.filter(Boolean);

  if (segments.length === 0) {
    return withCors(
      request,
      Response.json({
        slug: "domain-send",
        name: "DomainSend",
        status: "planned",
        fulfillment: "stub",
        price: "from $13.99/yr (.org)",
        limits: "registration only in v1, no renewals; TLDs: com, net, org, io, dev, app, tools; 1-2 year terms",
        note: "Check availability at POST /v1/domain-send/domains/check, then register at POST /v1/domain-send/domains. Registrar fulfillment is not wired on this gateway yet.",
        endpoints: {
          domains: "/v1/domain-send/domains",
          openapi: "/v1/domain-send/openapi.json",
          mcp: "/mcp/domain-send",
        },
      }),
    );
  }

  if (segments[0] === "openapi.json") {
    const { domainSendOpenApi } = await import("./openapi");
    return withCors(request, Response.json(domainSendOpenApi()));
  }

  const needsAuth = (message = "Authorization: Bearer <key> is required") =>
    withCors(request, jsonError(401, "unauthorized", message));

  if (segments[0] === "domains" && segments[1] === "check" && segments.length === 2 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    const domain = String(body.domain ?? "").trim().toLowerCase();
    const result = checkAvailability(body.domain);
    return withCors(request, Response.json({ domain, ...result }));
  }

  if (segments[0] === "domains" && segments.length === 1 && request.method === "GET") {
    if (!auth) return needsAuth();
    return withCors(request, Response.json({ domains: listDomains(auth.keyId).map(publicDomain) }));
  }

  if (segments[0] === "domains" && segments.length === 1 && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const record = createDomain({
        domain: body.domain,
        years: body.years,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
      });
      return withCors(request, Response.json(publicDomain(record), { status: 201 }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid domain";
      return withCors(request, jsonError(400, "invalid_request", message));
    }
  }

  if (segments[0] === "domains" && segments.length === 2 && request.method === "GET") {
    if (!auth) return needsAuth();
    const record = getDomain(segments[1], auth.keyId);
    if (!record) return withCors(request, jsonError(404, "not_found", "Domain not found"));
    return withCors(request, Response.json(publicDomain(record)));
  }

  if (segments[0] === "domains" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
    if (!auth) return needsAuth();
    const record = getDomain(segments[1], auth.keyId);
    if (!record) return withCors(request, jsonError(404, "not_found", "Domain not found"));
    if (record.status !== "draft") {
      return withCors(request, jsonError(409, "conflict", `Domain is ${record.status}, checkout only from draft`));
    }
    return withCors(
      request,
      Response.json({
        checkoutUrl: `${catalogOrigin()}/connectors/domain-send#checkout-${record.id}`,
        amountCents: record.amountCents,
        currency: record.currency,
        note: "Stub checkout: no payment is collected on the gateway. In production this returns a Stripe Checkout session; the domain moves to paid only after the billing webhook confirms payment.",
      }),
    );
  }

  if (segments[0] === "domains" && segments.length === 3 && segments[2] === "demo-event" && request.method === "POST") {
    if (!auth) return needsAuth();
    const body = await readJson(request);
    try {
      const record = demoEvent(segments[1], auth.keyId, String(body.event ?? ""));
      return withCors(request, Response.json(publicDomain(record)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid demo event";
      const code = message === "Domain not found" ? 404 : 400;
      return withCors(request, jsonError(code, code === 404 ? "not_found" : "invalid_request", message));
    }
  }

  return withCors(request, jsonError(404, "not_found", `Unknown domain-send path /${segments.join("/")}`));
}
