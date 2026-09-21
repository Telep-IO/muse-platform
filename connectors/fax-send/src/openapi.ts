import { emptySpec, type OpenApiDocument } from "@telep/platform";

export function faxSendOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "FaxSend",
    version: "0.1.0",
    description:
      "Fax transmission stub on the Telep Muse gateway. Faxes are in-memory; provider fulfillment comes later. $0.99 per transmitted page, up to 10 pages, optional cover page (billable).",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "fax-send", description: "Transmit a fax to a phone number" }];
  spec.paths = {
    "/v1/fax-send": {
      get: {
        tags: ["fax-send"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/fax-send/openapi.json": {
      get: {
        tags: ["fax-send"],
        summary: "This OpenAPI document",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/fax-send/faxes": {
      get: {
        tags: ["fax-send"],
        summary: "List faxes",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["fax-send"],
        summary: "Create a fax draft (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["to", "document"],
                properties: {
                  to: {
                    type: "string",
                    description: "Destination phone number in E.164 format (e.g. +15550100)",
                  },
                  document: {
                    type: "object",
                    properties: {
                      filename: { type: "string" },
                      pages: { type: "integer", minimum: 1, maximum: 10 },
                    },
                  },
                  coverPage: {
                    type: "boolean",
                    description: "Include a reviewed cover page (counts as a billable page)",
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid request" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/fax-send/faxes/{id}": {
      get: {
        tags: ["fax-send"],
        summary: "Get a fax",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/fax-send/faxes/{id}/checkout": {
      post: {
        tags: ["fax-send"],
        summary: "Create a checkout session (stub)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" }, "409": { description: "Not a draft" } },
      },
    },
    "/v1/fax-send/faxes/{id}/demo-event": {
      post: {
        tags: ["fax-send"],
        summary: "Demo-only state transition (paid, sending, delivered, failed). Test only.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["event"],
                properties: {
                  event: { type: "string", enum: ["paid", "sending", "delivered", "failed"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "400": { description: "Invalid transition" } },
      },
    },
  };
  return spec;
}
