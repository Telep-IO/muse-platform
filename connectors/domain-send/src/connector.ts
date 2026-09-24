import { defineConnector, errorResponse, mcpAuth, readJson, unauthorized, withCors, type McpTool } from "@telep/platform";
import { createDomain, demoEvent, getDomain, listDomains, publicDomain } from "./domains";
import { assertDomainReady, checkDomainCredentials, domainDescriptor, domainRuntime, resolveAvailability } from "./provider";

const body = {
  type: "object",
  required: ["domain"],
  properties: {
    domain: { type: "string", description: "Domain to register, e.g. example.com" },
    years: { type: "integer", enum: [1, 2], default: 1, description: "Registration term in years" },
  },
};

async function availability(domain: unknown) {
  const name = String(domain ?? "").trim().toLowerCase();
  return { domain: name, ...(await resolveAvailability(domain)) };
}

const checkDomainTool: McpTool = {
  name: "check_domain",
  description: "Check whether a domain is available and its price. Read-only. Demo mode is a local stub. test/live mode calls OpenSRS LOOKUP.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["domain"],
    properties: { domain: { type: "string", description: "Domain to check, e.g. example.com" } },
  },
  async handler(args, ctx) {
    mcpAuth(ctx);
    return availability(args.domain);
  },
};

const domain = defineConnector({
  slug: "domain-send",
  name: "DomainSend",
  status: "planned",
  price: "from $13.99/yr (.org)",
  limits: "registration only in v1, no renewals; TLDs: com, net, org, io, dev, app, tools; 1-2 year terms",
  descriptor: domainDescriptor,
  gate: () => ({ mode: domainRuntime().mode, ready: () => assertDomainReady() }),
  check: {
    description: "Validate OpenSRS reseller credentials with a LOOKUP of example.com. Does not register a domain. Demo mode skips OpenSRS.",
    run: checkDomainCredentials,
  },
  openapi: {
    description:
      "Domain registration stub on the Telep Muse gateway. Registrations are in-memory; registrar fulfillment comes later. Registration only in v1 (no renewals), TLDs: com, net, org, io, dev, app, tools; 1-2 year terms. Prices from $13.99/yr (.org).",
    tagDescription: "Register domain names",
    self: true,
  },
  extraPosts: [
    {
      path: "/v1/domain-send/domains/check",
      summary: "Check domain availability and price",
      schema: { type: "object", required: ["domain"], properties: { domain: { type: "string", description: "Domain to check, e.g. example.com" } } },
    },
  ],
  beforeTools: [checkDomainTool],
  async match(request, segments, auth) {
    if (!(segments[0] === "domains" && segments[1] === "check" && segments.length === 2 && request.method === "POST")) return;
    if (!auth) return unauthorized(request);
    const input = await readJson(request);
    try {
      return withCors(request, Response.json(await availability(input.domain)));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  },
  resource: {
    name: "domains",
    missing: "Domain not found",
    list: listDomains,
    get: getDomain,
    present: publicDomain,
    summaries: { list: "List registrations", create: "Create a registration draft (stub)", get: "Get a registration" },
    schema: body,
    invalid: true,
    checkout: { label: "Domain", noun: "domain" },
    demo: {
      summary: "Demo-only state transition (paid, active, failed). Test only.",
      events: ["paid", "active", "failed"],
      run: (id, owner, event) => demoEvent(id, owner, event),
    },
    tool: {
      name: "register_domain",
      description:
        "Prepare a DomainSend registration draft for a domain name (1-2 year term). Returns a review URL. Does not register anything — the human must review the domain, term, and price and pay.",
    },
    getTool: { name: "get_domain", description: "Get a DomainSend registration you created on this API key (status: draft, paid, active, failed)." },
    listTool: { name: "list_domains", description: "List DomainSend registrations created with this API key." },
    create(input, ctx) {
      return createDomain({
        domain: input.domain,
        years: input.years,
        ownerKeyId: ctx.keyId,
        catalogOrigin: ctx.catalogOrigin,
        live: ctx.live,
      });
    },
  },
});

export const handleDomainSendRest = domain.rest;
export const handleDomainSendMcp = domain.mcp;
export const domainSendOpenApi = domain.openapi;
export const domainSendTools = domain.tools;
