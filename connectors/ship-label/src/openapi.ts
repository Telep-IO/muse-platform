import { emptySpec, type OpenApiDocument } from "@telep/platform";

const addressSchema = {
  type: "object",
  required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
  properties: {
    name: { type: "string" },
    address_line1: { type: "string" },
    address_line2: { type: "string" },
    address_city: { type: "string" },
    address_state: { type: "string" },
    address_zip: { type: "string" },
    address_country: { type: "string", default: "US" },
  },
};

export function shipLabelOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "ShipLabel",
    version: "0.1.0",
    description:
      "USPS shipping labels on the Telep Muse gateway. A draft rate-shops USPS. Stripe checkout does not buy postage. EasyPost buy runs only after payment_status is paid. Demo mode does not call EasyPost or Stripe.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "ship-label", description: "Draft and buy a USPS label" }];
  spec.paths = {
    "/v1/ship-label": {
      get: { tags: ["ship-label"], summary: "Connector descriptor", responses: { "200": { description: "OK" } } },
    },
    "/v1/ship-label/check": {
      get: {
        tags: ["ship-label"],
        summary: "Read-only credential check",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/ship-label/quote": {
      get: {
        tags: ["ship-label"],
        summary: "Local quote: postage_cents plus the configured service fee",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "postage_cents", in: "query", schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/ship-label/shipments": {
      get: {
        tags: ["ship-label"],
        summary: "List drafts",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" } },
      },
      post: {
        tags: ["ship-label"],
        summary: "Create a USPS shipment draft",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["from", "to", "parcel"],
                properties: {
                  from: addressSchema,
                  to: addressSchema,
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
                  carrier_hint: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Carrier or address rejected" } },
      },
    },
    "/v1/ship-label/shipments/{id}": {
      get: {
        tags: ["ship-label"],
        summary: "Re-list rates for a draft",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/ship-label/shipments/{id}/checkout": {
      post: {
        tags: ["ship-label"],
        summary: "Create one Stripe checkout session. Does not buy postage.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "Checkout URL" }, "409": { description: "Session already exists" } },
      },
    },
    "/v1/ship-label/labels/{id}": {
      get: {
        tags: ["ship-label"],
        summary: "Get a label",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/ship-label/labels/{id}/void": {
      post: {
        tags: ["ship-label"],
        summary: "Void a label",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Void status" } },
      },
    },
  };
  return spec;
}
