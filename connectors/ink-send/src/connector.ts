import { defineConnector, postalAddress } from "@telep/platform";
import { CARDS, MAX_MESSAGE_CHARS, createLetter, demoEvent, getLetter, listLetters, publicLetter } from "./letters";
import { assertInkReady, checkInk, inkDescriptor, inkRuntime, quoteInk } from "./provider";

const ink = defineConnector({
  slug: "ink-send",
  name: "InkSend",
  status: "planned",
  price: "$3.99 per letter",
  limits: "cards: plain, thank-you, condolence, holiday",
  descriptor: inkDescriptor,
  gate: () => ({ mode: inkRuntime().mode, ready: () => assertInkReady() }),
  check: { description: "Validate the Handwrytten API key via getUser. Does not order a card. Demo mode skips the provider.", run: checkInk },
  quote: () => quoteInk(),
  openapi: {
    description:
      "Handwritten-style letter stub on the Telep Muse gateway. Letters are in-memory; provider fulfillment comes later. $3.99 per letter flat. Status 'sent' means accepted for mailing, not delivered.",
    tagDescription: "Send handwritten-style letters",
    self: true,
  },
  resource: {
    name: "letters",
    missing: "Letter not found",
    list: listLetters,
    get: getLetter,
    present: publicLetter,
    summaries: { list: "List letters", create: "Create a letter draft (stub)", get: "Get a letter" },
    schema: {
      type: "object",
      required: ["message", "to"],
      properties: {
        message: { type: "string", maxLength: MAX_MESSAGE_CHARS },
        to: postalAddress(),
        card: { type: "string", enum: CARDS },
        handwriting_style: { type: "string" },
      },
    },
    invalid: true,
    checkout: { label: "Letter", noun: "letter" },
    demo: {
      summary: "Demo-only state transition (paid, sent). Test only.",
      events: ["paid", "sent"],
      run: (id, owner, event) => demoEvent(id, owner, event),
    },
    tool: {
      name: "create_letter",
      description:
        "Create an InkSend draft letter — a handwritten-style note mailed via a handwritten-mail provider. Does not mail anything: the human must review the exact message, recipient address, card choice, and $3.99 price and pay before mailing. Status 'sent' means accepted for mailing, not delivered (First Class is untracked). Gateway fulfillment is currently stubbed.",
      schema: {
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
    },
    getTool: { name: "get_letter", description: "Get an InkSend letter you created on this API key (status: draft, paid, sent)." },
    listTool: { name: "list_letters", description: "List InkSend letters created with this API key." },
    create(body, ctx) {
      return createLetter({
        message: body.message,
        to: body.to,
        card: body.card,
        handwriting_style: body.handwriting_style,
        ownerKeyId: ctx.keyId,
        live: ctx.live,
        catalogOrigin: ctx.catalogOrigin,
      });
    },
  },
});

export const handleInkSendRest = ink.rest;
export const handleInkSendMcp = ink.mcp;
export const inkSendOpenApi = ink.openapi;
export const inkSendTools = ink.tools;
