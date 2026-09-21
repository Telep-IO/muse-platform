import { catalogOrigin, createMcpHandler, type McpTool } from "@telep/platform";
import { createFax, getFax, listFaxes, publicFax } from "./faxes";

const tools: McpTool[] = [
  {
    name: "create_fax",
    description:
      "Create a FaxSend draft for transmitting a fax to a phone number ($0.99 per transmitted page, up to 10 PDF pages, optional billable cover page). Returns a review URL. Does not transmit anything — the human must review the document, destination, page count, and price and pay. Gateway fulfillment is currently stubbed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["to", "document"],
      properties: {
        to: {
          type: "string",
          description: "Destination phone number in E.164 format (e.g. +15550100)",
        },
        document: {
          type: "object",
          properties: {
            filename: { type: "string" },
            pages: { type: "integer", minimum: 1, maximum: 10 },
          },
        },
        coverPage: {
          type: "boolean",
          description: "Include a reviewed cover page (counts as a billable page)",
        },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return publicFax(
        createFax({
          to: args.to,
          document: args.document as { filename?: string; pages?: number } | undefined,
          coverPage: args.coverPage,
          ownerKeyId: ctx.auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  {
    name: "get_fax",
    description: "Get a FaxSend fax you created on this API key (status: draft, paid, sending, delivered, failed).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const fax = getFax(String(args.id), ctx.auth.keyId);
      if (!fax) throw new Error("Fax not found");
      return publicFax(fax);
    },
  },
  {
    name: "list_faxes",
    description: "List FaxSend faxes created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { faxes: listFaxes(ctx.auth.keyId).map(publicFax) };
    },
  },
];

export const handleFaxSendMcp = createMcpHandler({
  name: "fax-send",
  version: "0.1.0",
  tools,
});
