import { catalogOrigin, createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, type McpTool } from "@telep/platform";
import { createEnvelope, getEnvelope, listEnvelopes, publicEnvelope } from "./envelopes";
import { assertSignReady, checkSign, signRuntime } from "./provider";

export const signSendTools: McpTool[] = [
  mcpCheckTool("Validate the e-sign API key. Does not send an envelope. Demo mode skips the provider.", () => checkSign()),
  {
    name: "create_envelope",
    description:
      "Create a SignSend draft envelope for collecting e-signatures on a PDF (1-5 sequential signers). Returns a review URL. Does not send anything — the human must review the document, signer list, and $2.99 price and pay.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["signers"],
      properties: {
        signers: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "object", required: ["name", "email"], properties: { name: { type: "string" }, email: { type: "string" } } },
          description: "Signers in signing order",
        },
        document: {
          type: "object",
          properties: { filename: { type: "string" }, pages: { type: "integer", minimum: 1, maximum: 5 } },
        },
      },
    },
    async handler(args, ctx) {
      const auth = mcpAuth(ctx);
      const runtime = signRuntime();
      if (runtime.mode !== "demo") assertSignReady();
      return publicEnvelope(
        createEnvelope({
          document: args.document as { filename?: string; pages?: number } | undefined,
          signers: args.signers,
          ownerKeyId: auth.keyId,
          catalogOrigin: catalogOrigin(),
          live: runtime.mode !== "demo",
        }),
      );
    },
  },
  mcpGetTool(
    "get_envelope",
    "Get a SignSend envelope you created on this API key (status: draft, paid, sent, signed, declined).",
    "Envelope not found",
    (id, owner) => {
      const envelope = getEnvelope(id, owner);
      return envelope && publicEnvelope(envelope);
    },
  ),
  mcpListTool("list_envelopes", "List SignSend envelopes created with this API key.", "envelopes", (owner) =>
    listEnvelopes(owner).map(publicEnvelope),
  ),
];

export const handleSignSendMcp = createMcpHandler({ name: "sign-send", version: "0.1.0", tools: signSendTools });
