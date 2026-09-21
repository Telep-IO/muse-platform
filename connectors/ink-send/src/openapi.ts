import { emptySpec, type OpenApiDocument } from "@telep/platform";
import { CARDS, MAX_MESSAGE_CHARS } from "./letters";

const addressSchema = {
  type: "object",
  required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
  properties: {
    name: { type: "string" },
    address_line1: { type: "string" },
    address_city: { type: "string" },
    address_state: { type: "string" },
    address_zip: { type: "string" },
  },
};

export function inkSendOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "InkSend",
    version: "0.1.0",
    description:
      "Handwritten-style letter stub on the Telep Muse gateway. Letters are in-memory; provider fulfillment comes later. $3.99 per letter flat. Status 'sent' means accepted for mailing, not delivered.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "ink-send", description: "Send handwritten-style letters" }];
  spec.paths = {
    "/v1/ink-send": {
      get: {
        tags: ["ink-send"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/ink-send/openapi.json": {
      get: {
        tags: ["ink-send"],
        summary: "This OpenAPI document",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/ink-send/letters": {
      get: {
        tags: ["ink-send"],
        summary: "List letters",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["ink-send"],
        summary: "Create a letter draft (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message", "to"],
                properties: {
                  message: { type: "string", maxLength: MAX_MESSAGE_CHARS },
                  to: addressSchema,
                  card: { type: "string", enum: CARDS },
                  handwriting_style: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid request" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/ink-send/letters/{id}": {
      get: {
        tags: ["ink-send"],
        summary: "Get a letter",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/ink-send/letters/{id}/checkout": {
      post: {
        tags: ["ink-send"],
        summary: "Create a checkout session (stub)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" }, "409": { description: "Not a draft" } },
      },
    },
    "/v1/ink-send/letters/{id}/demo-event": {
      post: {
        tags: ["ink-send"],
        summary: "Demo-only state transition (paid, sent). Test only.",
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
                  event: { type: "string", enum: ["paid", "sent"] },
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
