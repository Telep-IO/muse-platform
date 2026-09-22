import { defineConnector, documentPages } from "@telep/platform";
import { createFax, demoEvent, getFax, listFaxes, publicFax } from "./faxes";
import { assertFaxReady, checkFax, faxDescriptor, faxRuntime, quoteFax } from "./provider";

const body = {
  type: "object",
  required: ["to", "document"],
  properties: {
    to: { type: "string", description: "Destination phone number in E.164 format (e.g. +15550100)" },
    document: documentPages(10),
    coverPage: { type: "boolean", description: "Include a reviewed cover page (counts as a billable page)" },
  },
};

const fax = defineConnector({
  slug: "fax-send",
  name: "FaxSend",
  status: "building",
  price: "$0.99 per transmitted page",
  limits: "PDF up to 10 pages, optional cover page (billable)",
  descriptor: faxDescriptor,
  gate: () => ({ mode: faxRuntime().mode, ready: () => assertFaxReady() }),
  check: { description: "Validate fax provider credentials. Does not transmit a fax. Demo mode skips the provider.", run: checkFax },
  quote: (request) => quoteFax(Number(new URL(request.url).searchParams.get("pages") ?? "1")),
  openapi: {
    description:
      "Fax transmission stub on the Telep Muse gateway. Faxes are in-memory; provider fulfillment comes later. $0.99 per transmitted page, up to 10 pages, optional cover page (billable).",
    tagDescription: "Transmit a fax to a phone number",
    self: true,
  },
  resource: {
    name: "faxes",
    missing: "Fax not found",
    list: listFaxes,
    get: getFax,
    present: publicFax,
    summaries: { list: "List faxes", create: "Create a fax draft (stub)", get: "Get a fax" },
    schema: body,
    invalid: true,
    checkout: { label: "Fax", noun: "fax" },
    demo: {
      summary: "Demo-only state transition (paid, sending, delivered, failed). Test only.",
      events: ["paid", "sending", "delivered", "failed"],
      run: (id, owner, event) => demoEvent(id, owner, event),
    },
    tool: {
      name: "create_fax",
      description:
        "Create a FaxSend draft for transmitting a fax to a phone number ($0.99 per transmitted page, up to 10 PDF pages, optional billable cover page). Returns a review URL. Does not transmit anything — the human must review the document, destination, page count, and price and pay. Gateway fulfillment is currently stubbed.",
    },
    getTool: { name: "get_fax", description: "Get a FaxSend fax you created on this API key (status: draft, paid, sending, delivered, failed)." },
    listTool: { name: "list_faxes", description: "List FaxSend faxes created with this API key." },
    create(body, ctx) {
      return createFax({
        to: body.to,
        document: body.document as { filename?: string; pages?: number } | undefined,
        coverPage: body.coverPage,
        ownerKeyId: ctx.keyId,
        catalogOrigin: ctx.catalogOrigin,
        live: ctx.live,
      });
    },
  },
});

export const handleFaxSendRest = fax.rest;
export const handleFaxSendMcp = fax.mcp;
export const faxSendOpenApi = fax.openapi;
export const faxSendTools = fax.tools;
