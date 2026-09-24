import { authenticate, emptySpec, isWriteMethod, jsonError, mergeOpenApi, publicApiUrl, rateLimit, rateLimitHeaders, withCors } from "@telep/platform";
import { connectorCount, listConnectors } from "@telep/registry";
import { connectorModules, getModule } from "@/connectors";

function restAuthRequired(method: string, path: string[]): boolean {
  if (isWriteMethod(method)) return true;
  const first = path.filter(Boolean)[0];
  if (!first || first === "openapi.json") return false;
  return true;
}

export function platformOpenApi() {
  const spec = emptySpec({
    title: "Telep Muse Gateway",
    version: "0.1.0",
    description: "Shared edge for Telep Muse connectors. Not a Meta product. Independent connectors built by Telep IO.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.servers = [{ url: publicApiUrl(""), description: "Muse gateway" }];
  spec.paths = {
    "/health": { get: { summary: "Health", responses: { "200": { description: "OK" } } } },
    "/v1": { get: { summary: "Connector index", responses: { "200": { description: "OK" } } } },
    "/v1/billing/checkout": {
      post: {
        summary: "Create a Stripe Checkout session (stub unless STRIPE_SECRET_KEY is set)",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/billing/webhook": {
      post: {
        summary:
          "Stripe webhook. ShipLabel buys postage and GiftSend places a Tremendous order only after payment_status paid. Other connectors are acknowledged.",
        responses: { "200": { description: "OK" } },
      },
    },
  };
  spec.tags = [{ name: "platform", description: "Gateway" }];
  return mergeOpenApi(spec, connectorModules.map((mod) => mod.openapi()));
}

export function healthPayload() {
  return { ok: true as const, service: "muse-platform", connectors: connectorCount() };
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
    })),
  };
}

export async function dispatchRest(request: Request, slug: string, path: string[]): Promise<Response> {
  const mod = getModule(slug);
  if (!mod) return withCors(request, jsonError(404, "not_found", `Unknown connector: ${slug}`));

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = rateLimit(`rest:${ip}:${slug}`);
  if (!limited.ok) return withCors(request, jsonError(429, "rate_limited", "Slow down", rateLimitHeaders(limited)));

  let auth = null;
  try {
    auth = authenticate(request, { required: restAuthRequired(request.method, path) });
  } catch (error) {
    if (error instanceof Error) return withCors(request, jsonError(401, "unauthorized", error.message));
  }
  return mod.rest(request, path, auth);
}

export async function dispatchMcp(request: Request, slug: string): Promise<Response> {
  const mod = getModule(slug);
  if (!mod) return withCors(request, jsonError(404, "not_found", `Unknown connector: ${slug}`));
  return mod.mcp(request);
}
