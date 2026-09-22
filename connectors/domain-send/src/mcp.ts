import { catalogOrigin, createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, type McpTool } from "@telep/platform";
import { createDomain, getDomain, listDomains, publicDomain } from "./domains";
import { assertDomainReady, checkDomainCredentials, domainRuntime, resolveAvailability } from "./provider";

export const domainSendTools: McpTool[] = [
  mcpCheckTool(
    "Validate OpenSRS reseller credentials with a LOOKUP of example.com. Does not register a domain. Demo mode skips OpenSRS.",
    () => checkDomainCredentials(),
  ),
  {
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
      const auth = mcpAuth(ctx);
      const runtime = domainRuntime();
      if (runtime.mode !== "demo") assertDomainReady();
      return publicDomain(
        createDomain({
          domain: args.domain,
          years: args.years,
          live: runtime.mode !== "demo",
          ownerKeyId: auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  mcpGetTool(
    "get_domain",
    "Get a DomainSend registration you created on this API key (status: draft, paid, active, failed).",
    "Domain not found",
    (id, owner) => {
      const record = getDomain(id, owner);
      return record && publicDomain(record);
    },
  ),
  mcpListTool("list_domains", "List DomainSend registrations created with this API key.", "domains", (owner) =>
    listDomains(owner).map(publicDomain),
  ),
];

export const handleDomainSendMcp = createMcpHandler({ name: "domain-send", version: "0.1.0", tools: domainSendTools });
