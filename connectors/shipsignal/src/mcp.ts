import { createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, mcpNoArgTool, type McpTool } from "@telep/platform";
import { listParcels, publicParcel, setWatching } from "./parcels";
import { checkShip, refreshParcelResolved, shipAccount, trackParcel } from "./provider";

export const shipSignalTools: McpTool[] = [
  mcpCheckTool(
    "Validate the ShipSignal aggregator key. Does not register a tracking number. Demo mode skips the provider.",
    () => checkShip(),
  ),
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
      return publicParcel(
        await trackParcel({
          trackingNumber: args.trackingNumber,
          origin: args.origin,
          destination: args.destination,
          ownerKeyId: mcpAuth(ctx).keyId,
        }),
      );
    },
  },
  mcpListTool("list_parcels", "List ShipSignal stub parcels created with this API key.", "parcels", (owner) =>
    listParcels(owner).map(publicParcel),
  ),
  mcpGetTool(
    "refresh_parcel",
    "Refresh a parcel. Demo mode recomputes the hash timeline. test/live mode asks the configured provider again.",
    "Parcel not found",
    async (id, owner) => {
      const parcel = await refreshParcelResolved(id, owner);
      return parcel && publicParcel(parcel);
    },
  ),
  mcpGetTool("watch_parcel", "Mark a stub parcel as watched. No carrier webhooks are registered.", "Parcel not found", (id, owner) => {
    const parcel = setWatching(id, owner, true);
    return parcel && publicParcel(parcel);
  }),
  mcpGetTool("unwatch_parcel", "Stop watching a stub parcel.", "Parcel not found", (id, owner) => {
    const parcel = setWatching(id, owner, false);
    return parcel && publicParcel(parcel);
  }),
  mcpNoArgTool("get_account", "Stub ShipSignal account for this API key. No real usage is billed.", (owner) => shipAccount(owner)),
];

export const handleShipSignalMcp = createMcpHandler({ name: "shipsignal", version: "0.1.0", tools: shipSignalTools });
