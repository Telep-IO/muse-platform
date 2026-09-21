import { catalogOrigin, createMcpHandler, type McpTool } from "@telep/platform";
import { CARDS, createLetter, getLetter, listLetters, publicLetter } from "./letters";

const addressSchema = {
  type: "object",
  required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
  properties: {
    name: { type: "string" },
    address_line1: { type: "string" },
    address_city: { type: "string" },
    address_state: { type: "string" },
    address_zip: { type: "string" },
  },
};

const tools: McpTool[] = [
  {
    name: "create_letter",
    description:
      "Create an InkSend draft letter — a handwritten-style note mailed via a handwritten-mail provider. Does not mail anything: the human must review the exact message, recipient address, card choice, and $3.99 price and pay before mailing. Status 'sent' means accepted for mailing, not delivered (First Class is untracked). Gateway fulfillment is currently stubbed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["message", "to"],
      properties: {
        message: { type: "string", description: "Letter text, max 5000 characters" },
        to: { ...addressSchema, description: "Recipient name and postal address" },
        card: { type: "string", enum: CARDS, default: "plain" },
        handwriting_style: { type: "string", default: "casual" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return publicLetter(
        createLetter({
          message: args.message,
          to: args.to,
          card: args.card,
          handwriting_style: args.handwriting_style,
          ownerKeyId: ctx.auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  {
    name: "get_letter",
    description: "Get an InkSend letter you created on this API key (status: draft, paid, sent).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const letter = getLetter(String(args.id), ctx.auth.keyId);
      if (!letter) throw new Error("Letter not found");
      return publicLetter(letter);
    },
  },
  {
    name: "list_letters",
    description: "List InkSend letters created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { letters: listLetters(ctx.auth.keyId).map(publicLetter) };
    },
  },
];

export const handleInkSendMcp = createMcpHandler({
  name: "ink-send",
  version: "0.1.0",
  tools,
});
