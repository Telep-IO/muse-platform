import { createMcpHandler, type McpTool } from "@telep/platform";
import {
  createParcel,
  getAccount,
  getParcel,
  listParcels,
  publicParcel,
  refreshParcel,
  setWatching,
} from "./parcels";

const tools: McpTool[] = [
  {
    name: "track_package",
    description:
      "Create a ShipSignal stub parcel from a tracking number. The timeline is hashed from the number — no UPS, USPS, FedEx, or DHL API is called.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["trackingNumber"],
      properties: {
        trackingNumber: { type: "string" },
        origin: { type: "string" },
        destination: { type: "string" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return publicParcel(
        createParcel({
          trackingNumber: args.trackingNumber,
          origin: args.origin,
          destination: args.destination,
          ownerKeyId: ctx.auth.keyId,
        }),
      );
    },
  },
  {
    name: "list_parcels",
    description: "List ShipSignal stub parcels created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { parcels: listParcels(ctx.auth.keyId).map(publicParcel) };
    },
  },
  {
    name: "refresh_parcel",
    description:
      "Recompute the stub timeline from the tracking-number hash. Does not contact a carrier.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const parcel = refreshParcel(String(args.id), ctx.auth.keyId);
      if (!parcel) throw new Error("Parcel not found");
      return publicParcel(parcel);
    },
  },
  {
    name: "watch_parcel",
    description: "Mark a stub parcel as watched. No carrier webhooks are registered.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const parcel = setWatching(String(args.id), ctx.auth.keyId, true);
      if (!parcel) throw new Error("Parcel not found");
      return publicParcel(parcel);
    },
  },
  {
    name: "unwatch_parcel",
    description: "Stop watching a stub parcel.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const parcel = setWatching(String(args.id), ctx.auth.keyId, false);
      if (!parcel) throw new Error("Parcel not found");
      return publicParcel(parcel);
    },
  },
  {
    name: "get_account",
    description: "Stub ShipSignal account for this API key. No real usage is billed.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return getAccount(ctx.auth.keyId);
    },
  },
];

export const handleShipSignalMcp = createMcpHandler({
  name: "shipsignal",
  version: "0.1.0",
  tools,
});
