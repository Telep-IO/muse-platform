import { authenticate, emptySpec, isWriteMethod, jsonError, mergeOpenApi, publicApiUrl, rateLimit, rateLimitHeaders, withCors } from "@telep/platform";
import { connectorCount, getConnector, listConnectors } from "@telep/registry";
import { handlePaperSendMcp, handlePaperSendRest, paperSendOpenApi } from "@telep/paper-send";
import { handleSignSendMcp, handleSignSendRest, signSendOpenApi } from "@telep/sign-send";
import { handleFaxSendMcp, handleFaxSendRest, faxSendOpenApi } from "@telep/fax-send";
import { handleCallSendMcp, handleCallSendRest, callSendOpenApi } from "@telep/call-send";
import { handleInkSendMcp, handleInkSendRest, inkSendOpenApi } from "@telep/ink-send";
import { handleDomainSendMcp, handleDomainSendRest, domainSendOpenApi } from "@telep/domain-send";

export function platformOpenApi() {
  const spec = emptySpec({
    title: "Telep Muse Gateway",
    version: "0.1.0",
    description:
      "Shared edge for Telep Muse connectors. Not a Meta product. Independent connectors built by Telep IO.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.servers = [{ url: publicApiUrl(""), description: "Muse gateway" }];
  spec.paths = {
    "/health": {
      get: { summary: "Health", responses: { "200": { description: "OK" } } },
    },
    "/v1": {
      get: { summary: "Connector index", responses: { "200": { description: "OK" } } },
    },
    "/v1/billing/checkout": {
      post: {
        summary: "Create a Stripe Checkout session (stub unless STRIPE_SECRET_KEY is set)",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/billing/webhook": {
      post: { summary: "Stripe webhook stub", responses: { "200": { description: "OK" } } },
    },
  };
  spec.tags = [{ name: "platform", description: "Gateway" }];
  return mergeOpenApi(spec, [
    paperSendOpenApi(),
    signSendOpenApi(),
    faxSendOpenApi(),
    callSendOpenApi(),
    inkSendOpenApi(),
    domainSendOpenApi(),
  ]);
}

export function healthPayload() {
  return {
    ok: true as const,
    service: "muse-platform",
    connectors: connectorCount(),
  };
}

export function v1Index() {
  return {
    service: "muse-platform",
    contact: "jon@telep.io",
    auth: "Authorization: Bearer muse_sk_{demo|test|live}_{token}",
    openapi: "/v1/openapi.json",
    connectors: listConnectors().map((connector) => ({
      slug: connector.slug,
      name: connector.name,
      status: connector.status,
      apiBasePath: connector.apiBasePath,
      mcpPath: connector.mcpPath,
      openapi: `${connector.apiBasePath}/openapi.json`,
      gatewayImplemented: connector.gatewayImplemented,
    })),
  };
}

export async function dispatchRest(request: Request, slug: string, path: string[]): Promise<Response> {
  const connector = getConnector(slug);
  if (!connector) {
    return withCors(request, jsonError(404, "not_found", `Unknown connector: ${slug}`));
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = rateLimit(`rest:${ip}:${slug}`);
  if (!limited.ok) {
    return withCors(request, jsonError(429, "rate_limited", "Slow down", rateLimitHeaders(limited)));
  }

  let auth = null;
  try {
    const jobsRead = path[0] === "jobs";
    auth = authenticate(request, { required: isWriteMethod(request.method) || jobsRead });
  } catch (error) {
    if (error instanceof Error) {
      return withCors(request, jsonError(401, "unauthorized", error.message));
    }
  }

  if (slug === "paper-send") {
    return handlePaperSendRest(request, path, auth);
  }

  if (slug === "sign-send") {
    return handleSignSendRest(request, path, auth);
  }

  if (slug === "fax-send") {
    return handleFaxSendRest(request, path, auth);
  }

  if (slug === "call-send") {
    return handleCallSendRest(request, path, auth);
  }

  if (slug === "ink-send") {
    return handleInkSendRest(request, path, auth);
  }

  if (slug === "domain-send") {
    return handleDomainSendRest(request, path, auth);
  }

  if (path[0] === "openapi.json") {
    const spec = emptySpec({
      title: connector.name,
      version: "0.0.0",
      description: `${connector.oneLiner} Not yet implemented on this gateway.`,
    });
    return withCors(request, Response.json(spec));
  }

  return withCors(
    request,
    jsonError(
      501,
      "not_implemented",
      `${connector.name} is listed in the catalog but is not served on this gateway yet.${connector.repoUrl ? ` See ${connector.repoUrl}` : ""}`,
    ),
  );
}

export async function dispatchMcp(request: Request, slug: string): Promise<Response> {
  const connector = getConnector(slug);
  if (!connector) {
    return withCors(request, jsonError(404, "not_found", `Unknown connector: ${slug}`));
  }
  if (slug === "paper-send") {
    return handlePaperSendMcp(request);
  }
  if (slug === "sign-send") {
    return handleSignSendMcp(request);
  }
  if (slug === "fax-send") {
    return handleFaxSendMcp(request);
  }
  if (slug === "call-send") {
    return handleCallSendMcp(request);
  }
  if (slug === "ink-send") {
    return handleInkSendMcp(request);
  }
  if (slug === "domain-send") {
    return handleDomainSendMcp(request);
  }
  return withCors(
    request,
    jsonError(501, "not_implemented", `${connector.name} MCP is not on this gateway yet.`),
  );
}
