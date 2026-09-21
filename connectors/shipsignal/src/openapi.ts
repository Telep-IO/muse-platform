import { emptySpec, type OpenApiDocument } from "@telep/platform";

export function shipSignalOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "ShipSignal",
    version: "0.1.0",
    description:
      "Multi-carrier package tracking stub on the Telep Muse gateway. Timelines are in-memory and hashed from the tracking number; no carrier API is called.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "shipsignal", description: "Track a package (stub)" }];
  spec.paths = {
    "/v1/shipsignal": {
      get: {
        tags: ["shipsignal"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/shipsignal/account": {
      get: {
        tags: ["shipsignal"],
        summary: "Stub account",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/shipsignal/parcels": {
      get: {
        tags: ["shipsignal"],
        summary: "List parcels",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["shipsignal"],
        summary: "Track a package (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["trackingNumber"],
                properties: {
                  trackingNumber: { type: "string" },
                  origin: { type: "string" },
                  destination: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/shipsignal/parcels/{id}": {
      get: {
        tags: ["shipsignal"],
        summary: "Get a parcel",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/shipsignal/parcels/{id}/refresh": {
      post: {
        tags: ["shipsignal"],
        summary: "Refresh stub timeline",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/shipsignal/parcels/{id}/watch": {
      post: {
        tags: ["shipsignal"],
        summary: "Watch a stub parcel",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/shipsignal/parcels/{id}/unwatch": {
      post: {
        tags: ["shipsignal"],
        summary: "Unwatch a stub parcel",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
  };
  return spec;
}
