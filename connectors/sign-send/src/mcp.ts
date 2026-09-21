import { catalogOrigin, createMcpHandler, type McpTool } from "@telep/platform";
import { createEnvelope, getEnvelope, listEnvelopes, publicEnvelope } from "./envelopes";

const signerSchema = {
  type: "object",
  required: ["name", "email"],
  properties: {
    name: { type: "string" },
    email: { type: "string" },
  },
};

const tools: McpTool[] = [
  {
    name: "create_envelope",
    description:
      "Create a SignSend draft envelope for collecting e-signatures on a PDF (1-5 sequential signers). Returns a review URL. Does not send anything — the human must review the document, signer list, and $2.99 price and pay. Gateway fulfillment is currently stubbed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["signers"],
      properties: {
        signers: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: signerSchema,
          description: "Signers in signing order",
        },
        document: {
          type: "object",
          properties: {
            filename: { type: "string" },
            pages: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return publicEnvelope(
        createEnvelope({
          document: args.document as { filename?: string; pages?: number } | undefined,
          signers: args.signers,
          ownerKeyId: ctx.auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  {
    name: "get_envelope",
    description: "Get a SignSend envelope you created on this API key (status: draft, paid, sent, signed, declined).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const envelope = getEnvelope(String(args.id), ctx.auth.keyId);
      if (!envelope) throw new Error("Envelope not found");
      return publicEnvelope(envelope);
    },
  },
  {
    name: "list_envelopes",
    description: "List SignSend envelopes created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { envelopes: listEnvelopes(ctx.auth.keyId).map(publicEnvelope) };
    },
  },
];

export const handleSignSendMcp = createMcpHandler({
  name: "sign-send",
  version: "0.1.0",
  tools,
});
