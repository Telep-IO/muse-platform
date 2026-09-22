import { draftRest } from "@telep/platform";
import { shipSignalOpenApi } from "./openapi";
import { getParcel, listParcels, publicParcel, setWatching } from "./parcels";
import { checkShip, refreshParcelResolved, shipAccount, shipDescriptor, trackParcel } from "./provider";

export const handleShipSignalRest = draftRest({
  slug: "shipsignal",
  index: () => ({
    slug: "shipsignal",
    name: "ShipSignal",
    status: "ready",
    ...shipDescriptor(),
    endpoints: {
      parcels: "/v1/shipsignal/parcels",
      account: "/v1/shipsignal/account",
      check: "/v1/shipsignal/check",
      openapi: "/v1/shipsignal/openapi.json",
      mcp: "/mcp/shipsignal",
    },
    mcpTools: ["track_package", "list_parcels", "refresh_parcel", "watch_parcel", "unwatch_parcel", "get_account"],
  }),
  openApi: shipSignalOpenApi,
  check: checkShip,
  reads: { account: (auth) => shipAccount(auth.keyId) },
  collection: {
    name: "parcels",
    listKey: "parcels",
    missing: "Parcel not found",
    list: listParcels,
    get: getParcel,
    present: publicParcel,
    create: (body, auth) =>
      trackParcel({
        trackingNumber: body.trackingNumber ?? body.tracking_number,
        origin: body.origin,
        destination: body.destination,
        ownerKeyId: auth.keyId,
      }),
    actions: {
      refresh: (id, auth) => refreshParcelResolved(id, auth.keyId),
      watch: (id, auth) => setWatching(id, auth.keyId, true),
      unwatch: (id, auth) => setWatching(id, auth.keyId, false),
    },
  },
});
