import { createMcpHandler, type McpTool } from "@telep/platform";
import { listParcels, publicParcel, setWatching } from "./parcels";
import { checkShip, refreshParcelResolved, shipAccount, trackParcel } from "./provider";

const tools: McpTool[] = [
  {
    name: "check_credentials",
    description:
      "Validate the ShipSignal aggregator key. Does not register a tracking number. Demo mode skips the provider.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return checkShip();
    },
  },
  {
    name: "track_package",
    description:
      "Track a package. Demo mode hashes a timeline and calls no carrier. test/live mode calls AfterShip, Shippo, or EasyPost. Shippo lookups are read-only. AfterShip may register the number and EasyPost may create a tracker. No postage is purchased.",
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
        await trackParcel({
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
      "Refresh a parcel. Demo mode recomputes the hash timeline. test/live mode asks the configured provider again.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const parcel = await refreshParcelResolved(String(args.id), ctx.auth.keyId);
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
      return shipAccount(ctx.auth.keyId);
    },
  },
];

export const handleShipSignalMcp = createMcpHandler({
  name: "shipsignal",
  version: "0.1.0",
  tools,
});
