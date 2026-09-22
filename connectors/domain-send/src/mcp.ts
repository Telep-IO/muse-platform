import { catalogOrigin, createMcpHandler, type McpTool } from "@telep/platform";
import { createDomain, getDomain, listDomains, publicDomain } from "./domains";
import { assertDomainReady, checkDomainCredentials, domainRuntime, resolveAvailability } from "./provider";

const tools: McpTool[] = [
  {
    name: "check_credentials",
    description: "Validate OpenSRS reseller credentials with a LOOKUP of example.com. Does not register a domain. Demo mode skips OpenSRS.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return checkDomainCredentials();
    },
  },
  {
    name: "check_domain",
    description: "Check whether a domain is available and its price. Read-only. Demo mode is a local stub. test/live mode calls OpenSRS LOOKUP.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["domain"],
      properties: {
        domain: { type: "string", description: "Domain to check, e.g. example.com" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const domain = String(args.domain ?? "").trim().toLowerCase();
      return { domain, ...(await resolveAvailability(args.domain)) };
    },
  },
  {
    name: "register_domain",
    description:
      "Prepare a DomainSend registration draft for a domain name (1-2 year term). Returns a review URL. Does not register anything — the human must review the domain, term, and price and pay.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["domain"],
      properties: {
        domain: { type: "string", description: "Domain to register, e.g. example.com" },
        years: { type: "integer", enum: [1, 2], default: 1, description: "Registration term in years" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const runtime = domainRuntime();
      if (runtime.mode !== "demo") assertDomainReady();
      return publicDomain(
        createDomain({
          domain: args.domain,
          years: args.years,
          live: runtime.mode !== "demo",
          ownerKeyId: ctx.auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  {
    name: "get_domain",
    description: "Get a DomainSend registration you created on this API key (status: draft, paid, active, failed).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const record = getDomain(String(args.id), ctx.auth.keyId);
      if (!record) throw new Error("Domain not found");
      return publicDomain(record);
    },
  },
  {
    name: "list_domains",
    description: "List DomainSend registrations created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { domains: listDomains(ctx.auth.keyId).map(publicDomain) };
    },
  },
];

export const handleDomainSendMcp = createMcpHandler({
  name: "domain-send",
  version: "0.1.0",
  tools,
});
