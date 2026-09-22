import { catalogOrigin, createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, type McpTool } from "@telep/platform";
import { createFax, getFax, listFaxes, publicFax } from "./faxes";
import { assertFaxReady, checkFax, faxRuntime } from "./provider";

export const faxSendTools: McpTool[] = [
  mcpCheckTool("Validate fax provider credentials. Does not transmit a fax. Demo mode skips the provider.", () => checkFax()),
  {
    name: "create_fax",
    description:
      "Create a FaxSend draft for transmitting a fax to a phone number ($0.99 per transmitted page, up to 10 PDF pages, optional billable cover page). Returns a review URL. Does not transmit anything — the human must review the document, destination, page count, and price and pay. Gateway fulfillment is currently stubbed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["to", "document"],
      properties: {
        to: { type: "string", description: "Destination phone number in E.164 format (e.g. +15550100)" },
        document: {
          type: "object",
          properties: {
            filename: { type: "string" },
            pages: { type: "integer", minimum: 1, maximum: 10 },
          },
        },
        coverPage: { type: "boolean", description: "Include a reviewed cover page (counts as a billable page)" },
      },
    },
    async handler(args, ctx) {
      const auth = mcpAuth(ctx);
      const runtime = faxRuntime();
      if (runtime.mode !== "demo") assertFaxReady();
      return publicFax(
        createFax({
          to: args.to,
          document: args.document as { filename?: string; pages?: number } | undefined,
          coverPage: args.coverPage,
          ownerKeyId: auth.keyId,
          catalogOrigin: catalogOrigin(),
          live: runtime.mode !== "demo",
        }),
      );
    },
  },
  mcpGetTool("get_fax", "Get a FaxSend fax you created on this API key (status: draft, paid, sending, delivered, failed).", "Fax not found", (id, owner) => {
    const fax = getFax(id, owner);
    return fax && publicFax(fax);
  }),
  mcpListTool("list_faxes", "List FaxSend faxes created with this API key.", "faxes", (owner) => listFaxes(owner).map(publicFax)),
];

export const handleFaxSendMcp = createMcpHandler({ name: "fax-send", version: "0.1.0", tools: faxSendTools });
