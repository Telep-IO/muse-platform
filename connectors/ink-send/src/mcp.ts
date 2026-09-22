import { catalogOrigin, createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, postalAddress, type McpTool } from "@telep/platform";
import { CARDS, createLetter, getLetter, listLetters, publicLetter } from "./letters";
import { assertInkReady, checkInk, inkRuntime } from "./provider";

export const inkSendTools: McpTool[] = [
  mcpCheckTool("Validate the Handwrytten API key via getUser. Does not order a card. Demo mode skips the provider.", () => checkInk()),
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
        to: { ...postalAddress(), description: "Recipient name and postal address" },
        card: { type: "string", enum: CARDS, default: "plain" },
        handwriting_style: { type: "string", default: "casual" },
      },
    },
    async handler(args, ctx) {
      const auth = mcpAuth(ctx);
      const runtime = inkRuntime();
      if (runtime.mode !== "demo") assertInkReady();
      return publicLetter(
        createLetter({
          message: args.message,
          to: args.to,
          card: args.card,
          handwriting_style: args.handwriting_style,
          ownerKeyId: auth.keyId,
          live: runtime.mode !== "demo",
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  mcpGetTool("get_letter", "Get an InkSend letter you created on this API key (status: draft, paid, sent).", "Letter not found", (id, owner) => {
    const letter = getLetter(id, owner);
    return letter && publicLetter(letter);
  }),
  mcpListTool("list_letters", "List InkSend letters created with this API key.", "letters", (owner) => listLetters(owner).map(publicLetter)),
];

export const handleInkSendMcp = createMcpHandler({ name: "ink-send", version: "0.1.0", tools: inkSendTools });
