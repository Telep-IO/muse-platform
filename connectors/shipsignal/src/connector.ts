import { defineConnector } from "@telep/platform";
import { getParcel, listParcels, publicParcel, setWatching } from "./parcels";
import { checkShip, refreshParcelResolved, shipAccount, shipDescriptor, trackParcel } from "./provider";

const body = {
  type: "object",
  required: ["trackingNumber"],
  properties: { trackingNumber: { type: "string" }, origin: { type: "string" }, destination: { type: "string" } },
};

const ship = defineConnector({
  slug: "shipsignal",
  name: "ShipSignal",
  status: "ready",
  descriptor: shipDescriptor,
  check: {
    description: "Validate the ShipSignal aggregator key. Does not register a tracking number. Demo mode skips the provider.",
    run: checkShip,
  },
  account: { run: shipAccount, description: "Stub ShipSignal account for this API key. No real usage is billed." },
  indexTools: true,
  openapi: {
    description:
      "Multi-carrier package tracking stub on the Telep Muse gateway. Timelines are in-memory and hashed from the tracking number; no carrier API is called.",
    tagDescription: "Track a package (stub)",
  },
  resource: {
    name: "parcels",
    missing: "Parcel not found",
    list: listParcels,
    get: getParcel,
    present: publicParcel,
    summaries: { list: "List parcels", create: "Track a package (stub)", get: "Get a parcel" },
    schema: body,
    tool: {
      name: "track_package",
      description:
        "Track a package. Demo mode hashes a timeline and calls no carrier. test/live mode calls AfterShip, Shippo, or EasyPost. Shippo lookups are read-only. AfterShip may register the number and EasyPost may create a tracker. No postage is purchased.",
    },
    listTool: { name: "list_parcels", description: "List ShipSignal stub parcels created with this API key." },
    actions: [
      {
        rest: "refresh",
        summary: "Refresh stub timeline",
        tool: {
          name: "refresh_parcel",
          description: "Refresh a parcel. Demo mode recomputes the hash timeline. test/live mode asks the configured provider again.",
        },
        run: refreshParcelResolved,
      },
      {
        rest: "watch",
        summary: "Watch a stub parcel",
        tool: { name: "watch_parcel", description: "Mark a stub parcel as watched. No carrier webhooks are registered." },
        run: (id, owner) => setWatching(id, owner, true),
      },
      {
        rest: "unwatch",
        summary: "Unwatch a stub parcel",
        tool: { name: "unwatch_parcel", description: "Stop watching a stub parcel." },
        run: (id, owner) => setWatching(id, owner, false),
      },
    ],
    create: (input, ctx) =>
      trackParcel({
        trackingNumber: input.trackingNumber ?? input.tracking_number,
        origin: input.origin,
        destination: input.destination,
        ownerKeyId: ctx.keyId,
      }),
  },
});

export const handleShipSignalRest = ship.rest;
export const handleShipSignalMcp = ship.mcp;
export const shipSignalOpenApi = ship.openapi;
export const shipSignalTools = ship.tools;
