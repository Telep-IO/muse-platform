import { actionPost, authedGet, connectorSpec, descriptorPath, listAndCreate } from "@telep/platform";

const id = [{ name: "id", in: "path" as const, required: true, schema: { type: "string" } }];

export function shipSignalOpenApi() {
  const tag = "shipsignal";
  return connectorSpec(
    {
      title: "ShipSignal",
      description:
        "Multi-carrier package tracking stub on the Telep Muse gateway. Timelines are in-memory and hashed from the tracking number; no carrier API is called.",
      tag,
      tagDescription: "Track a package (stub)",
    },
    {
      "/v1/shipsignal": descriptorPath(tag),
      "/v1/shipsignal/account": authedGet(tag, "Stub account"),
      "/v1/shipsignal/parcels": listAndCreate(tag, "List parcels", "Track a package (stub)", {
        type: "object",
        required: ["trackingNumber"],
        properties: { trackingNumber: { type: "string" }, origin: { type: "string" }, destination: { type: "string" } },
      }),
      "/v1/shipsignal/parcels/{id}": authedGet(tag, "Get a parcel", id),
      "/v1/shipsignal/parcels/{id}/refresh": actionPost(tag, "Refresh stub timeline"),
      "/v1/shipsignal/parcels/{id}/watch": actionPost(tag, "Watch a stub parcel"),
      "/v1/shipsignal/parcels/{id}/unwatch": actionPost(tag, "Unwatch a stub parcel"),
    },
  );
}
