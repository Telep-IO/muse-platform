import { defineConnector, documentPages } from "@telep/platform";
import { createEnvelope, demoEvent, getEnvelope, listEnvelopes, publicEnvelope } from "./envelopes";
import { assertSignReady, checkSign, quoteSign, signDescriptor, signRuntime } from "./provider";

const body = {
  type: "object",
  required: ["signers"],
  properties: {
    signers: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "object", required: ["name", "email"], properties: { name: { type: "string" }, email: { type: "string" } } },
      description: "Signers in signing order",
    },
    document: documentPages(5),
  },
};

const sign = defineConnector({
  slug: "sign-send",
  name: "SignSend",
  status: "building",
  price: "$2.99 per envelope",
  limits: "PDF up to 5 pages, 1-5 sequential signers",
  descriptor: signDescriptor,
  gate: () => ({ mode: signRuntime().mode, ready: () => assertSignReady() }),
  check: { description: "Validate the e-sign API key. Does not send an envelope. Demo mode skips the provider.", run: checkSign },
  quote: () => quoteSign(),
  openapi: {
    description:
      "E-signature envelope stub on the Telep Muse gateway. Envelopes are in-memory; provider fulfillment comes later. $2.99 per envelope, up to 5 pages and 5 sequential signers.",
    tagDescription: "Collect e-signatures on a PDF",
    self: true,
  },
  resource: {
    name: "envelopes",
    missing: "Envelope not found",
    list: listEnvelopes,
    get: getEnvelope,
    present: publicEnvelope,
    summaries: { list: "List envelopes", create: "Create a signature envelope (stub)", get: "Get an envelope" },
    schema: body,
    invalid: true,
    checkout: { label: "Envelope", noun: "envelope" },
    demo: {
      summary: "Demo-only state transition (paid, sent, signed, declined). Test only.",
      events: ["paid", "sent", "signed", "declined"],
      extra: { signerEmail: { type: "string" } },
      run: (id, owner, event, input) => demoEvent(id, owner, event, input.signerEmail ? String(input.signerEmail) : undefined),
    },
    tool: {
      name: "create_envelope",
      description:
        "Create a SignSend draft envelope for collecting e-signatures on a PDF (1-5 sequential signers). Returns a review URL. Does not send anything — the human must review the document, signer list, and $2.99 price and pay.",
    },
    getTool: { name: "get_envelope", description: "Get a SignSend envelope you created on this API key (status: draft, paid, sent, signed, declined)." },
    listTool: { name: "list_envelopes", description: "List SignSend envelopes created with this API key." },
    create(input, ctx) {
      return createEnvelope({
        document: input.document as { filename?: string; pages?: number } | undefined,
        signers: input.signers,
        ownerKeyId: ctx.keyId,
        catalogOrigin: ctx.catalogOrigin,
        live: ctx.live,
      });
    },
  },
});

export const handleSignSendRest = sign.rest;
export const handleSignSendMcp = sign.mcp;
export const signSendOpenApi = sign.openapi;
export const signSendTools = sign.tools;
