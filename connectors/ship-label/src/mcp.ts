import { createMcpHandler, type McpTool } from "@telep/platform";
import { buyShippingLabel, cancelLabel, createShipmentDraft, getLabel, getShipmentRates, listShipmentDrafts } from "./jobs";
import { assertShipLabelReady, checkShipLabel, shipLabelRuntime } from "./provider";

const postalAddress = {
  type: "object",
  required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
  properties: {
    name: { type: "string" },
    address_line1: { type: "string" },
    address_line2: { type: "string" },
    address_city: { type: "string" },
    address_state: { type: "string" },
    address_zip: { type: "string" },
  },
};

const tools: McpTool[] = [
  {
    name: "check_credentials",
    description:
      "Validate ShipLabel EasyPost credentials with a read-only shipment list. Does not buy postage. Demo mode skips EasyPost and Stripe.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return checkShipLabel();
    },
  },
  {
    name: "create_shipment_draft",
    description:
      "Draft a USPS shipping label from sender, recipient, and parcel details. Returns USPS rates and a quote (postage plus service fee). Rate shopping does not buy postage. Demo mode returns a stub rate and does not call EasyPost.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["from", "to", "parcel"],
      properties: {
        from: postalAddress,
        to: postalAddress,
        parcel: {
          type: "object",
          required: ["weight_oz", "length_in", "width_in", "height_in"],
          properties: {
            weight_oz: { type: "number" },
            length_in: { type: "number" },
            width_in: { type: "number" },
            height_in: { type: "number" },
          },
        },
        carrier_hint: { type: "string", description: "Optional. Only USPS is accepted." },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const runtime = shipLabelRuntime();
      if (runtime.mode !== "demo") assertShipLabelReady();
      return createShipmentDraft({
        from: args.from,
        to: args.to,
        parcel: args.parcel,
        carrier_hint: args.carrier_hint,
        ownerKeyId: ctx.auth.keyId,
      });
    },
  },
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
      if (!ctx.auth) throw new Error("API key required");
      return getShipmentRates(String(args.draft_id), ctx.auth.keyId);
    },
  },
  {
    name: "buy_shipping_label",
    description:
      "Open one Stripe checkout for a draft and rate. Does not buy postage. A second call for the same draft returns 409. EasyPost buy waits for a paid webhook. Demo mode records a stub checkout and does not call Stripe.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["draft_id", "rate_id"],
      properties: {
        draft_id: { type: "string" },
        rate_id: { type: "string" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const runtime = shipLabelRuntime();
      if (runtime.mode !== "demo") assertShipLabelReady();
      return buyShippingLabel(String(args.draft_id), String(args.rate_id), ctx.auth.keyId);
    },
  },
  {
    name: "get_label",
    description: "Get a shipping label: label URL, tracking code, and status. Demo labels are stubs and were not purchased.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["label_id"],
      properties: { label_id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return getLabel(String(args.label_id), ctx.auth.keyId);
    },
  },
  {
    name: "cancel_label",
    description:
      "Void a label. Test and live submit an EasyPost refund; USPS decides unused-postage refunds. Demo mode does not call EasyPost.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["label_id"],
      properties: { label_id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const runtime = shipLabelRuntime();
      if (runtime.mode !== "demo") assertShipLabelReady();
      return cancelLabel(String(args.label_id), ctx.auth.keyId);
    },
  },
  {
    name: "list_shipments",
    description: "List ShipLabel drafts created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return listShipmentDrafts(ctx.auth.keyId);
    },
  },
];

export const handleShipLabelMcp = createMcpHandler({
  name: "ship-label",
  version: "0.1.0",
  tools,
});
