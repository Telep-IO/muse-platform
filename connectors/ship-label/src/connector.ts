import { listing } from "./listing";
import {
  defineConnector,
  errorResponse,
  HttpError,
  mcpAuth,
  postalAddress,
  readJson,
  unauthorized,
  withCors,
  type McpTool,
} from "@telep/platform";
import { fulfillShipLabelPayment } from "./fulfill";
import {
  buyShippingLabel,
  cancelLabel,
  createShipmentDraft,
  getLabel,
  getShipmentRates,
  listShipmentDrafts,
} from "./jobs";
import { assertShipLabelReady, checkShipLabel, quoteShipLabel, shipLabelDescriptor, shipLabelRuntime } from "./provider";

const parcel = {
  type: "object",
  required: ["weight_oz", "length_in", "width_in", "height_in"],
  properties: {
    weight_oz: { type: "number" },
    length_in: { type: "number" },
    width_in: { type: "number" },
    height_in: { type: "number" },
  },
};

const address = postalAddress({ line2: true, country: true });

function readyForLive(): void {
  if (shipLabelRuntime().mode !== "demo") assertShipLabelReady();
}

const extraTools: McpTool[] = [
  {
    name: "get_shipment_rates",
    description: "Re-list USPS rates for a shipment draft. Does not buy postage.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["draft_id"],
      properties: { draft_id: { type: "string" } },
    },
    async handler(args, ctx) {
      return getShipmentRates(String(args.draft_id), mcpAuth(ctx).keyId);
    },
  },
  {
    name: "buy_shipping_label",
    description:
      "Open one Stripe checkout for a draft and a USPS rate. Does not buy postage. A second checkout for the same draft returns 409. EasyPost buy runs only after the shared billing webhook reports payment_status paid.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["draft_id", "rate_id"],
      properties: {
        draft_id: { type: "string" },
        rate_id: { type: "string", description: "A USPS rate id from the draft" },
      },
    },
    async handler(args, ctx) {
      readyForLive();
      return buyShippingLabel(String(args.draft_id), String(args.rate_id ?? ""), mcpAuth(ctx).keyId);
    },
  },
  {
    name: "get_label",
    description: "Return label_url, tracking_code, and status for a label.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["label_id"],
      properties: { label_id: { type: "string" } },
    },
    async handler(args, ctx) {
      return getLabel(String(args.label_id), mcpAuth(ctx).keyId);
    },
  },
  {
    name: "cancel_label",
    description: "Void a label through EasyPost in test or live mode. Demo mode does not call EasyPost.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["label_id"],
      properties: { label_id: { type: "string" } },
    },
    async handler(args, ctx) {
      readyForLive();
      return cancelLabel(String(args.label_id), mcpAuth(ctx).keyId);
    },
  },
];

const shipLabel = defineConnector({
  slug: "ship-label",
  name: "ShipLabel",
  status: "submitted",
  listing,
  fulfill: (session) => fulfillShipLabelPayment(session),
  descriptor: shipLabelDescriptor,
  gate: () => ({ mode: shipLabelRuntime().mode, ready: () => assertShipLabelReady() }),
  check: {
    description:
      "Validate ShipLabel EasyPost credentials with a read-only shipment list. Does not buy postage. Demo mode skips EasyPost and Stripe.",
    run: checkShipLabel,
  },
  quote: (request) => quoteShipLabel(Number(new URL(request.url).searchParams.get("postage_cents") ?? "0")),
  beforeTools: extraTools,
  openapi: {
    description:
      "USPS shipping labels through EasyPost Forge. The agent drafts a label. The human pays postage plus a service fee. EasyPost buys only after the shared billing webhook reports payment_status paid.",
    tagDescription: "Draft and buy a USPS shipping label",
    self: true,
  },
  match: async (request, segments, auth) => {
    const send = async (run: () => Promise<unknown>, status = 200) => {
      if (!auth) return unauthorized(request);
      try {
        return withCors(request, Response.json(await run(), { status }));
      } catch (error) {
        return withCors(request, errorResponse(error));
      }
    };
    if (segments[0] === "shipments" && segments.length === 3 && segments[2] === "checkout" && request.method === "POST") {
      const body = await readJson(request);
      return send(() => buyShippingLabel(segments[1], String(body.rate_id ?? ""), auth!.keyId), 201);
    }
    if (segments[0] === "labels" && segments.length === 2 && request.method === "GET") {
      return send(() => getLabel(segments[1], auth!.keyId));
    }
    if (segments[0] === "labels" && segments.length === 3 && segments[2] === "void" && request.method === "POST") {
      return send(() => cancelLabel(segments[1], auth!.keyId));
    }
    return undefined;
  },
  resource: {
    name: "shipments",
    missing: "Draft not found",
    list: (owner) => listShipmentDrafts(owner).then((result) => result.drafts),
    async get(id, owner) {
      try {
        return await getShipmentRates(id, owner);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return undefined;
        throw error;
      }
    },
    present: (draft) => draft,
    summaries: {
      list: "List shipment drafts",
      create: "Draft a USPS shipment (does not buy postage)",
      get: "Get USPS rates for a draft",
    },
    schema: {
      type: "object",
      required: ["from", "to", "parcel"],
      properties: {
        from: address,
        to: address,
        parcel,
        carrier_hint: { type: "string", description: "Optional. Only USPS is accepted." },
      },
    },
    checkout: { label: "Shipment", noun: "label" },
    tool: {
      name: "create_shipment_draft",
      description:
        "Draft a USPS shipping label from sender, recipient, and parcel details. Returns USPS rates and a quote (postage plus service fee). Rate shopping does not buy postage. Demo mode returns a stub rate and does not call EasyPost.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "parcel"],
        properties: {
          from: address,
          to: address,
          parcel,
          carrier_hint: { type: "string", description: "Optional. Only USPS is accepted." },
        },
      },
    },
    listTool: { name: "list_shipments", description: "List shipment drafts created with this API key." },
    create(body, ctx) {
      return createShipmentDraft({
        from: body.from,
        to: body.to,
        parcel: body.parcel,
        carrier_hint: body.carrier_hint,
        ownerKeyId: ctx.keyId,
      });
    },
  },
});

export const handleShipLabelRest = shipLabel.rest;
export const handleShipLabelMcp = shipLabel.mcp;
export const shipLabelOpenApi = shipLabel.openapi;
export const shipLabelTools = shipLabel.tools;
export { fulfillShipLabelPayment };

export default shipLabel;
