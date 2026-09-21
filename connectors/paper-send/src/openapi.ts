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

export function paperSendOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "PaperSend",
    version: "0.1.0",
    description:
      "PDF → physical mail stub on the Telep Muse gateway. Jobs are in-memory; mail-provider fulfillment comes later.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "paper-send", description: "Print and mail a PDF" }];
  spec.paths = {
    "/v1/paper-send": {
      get: {
        tags: ["paper-send"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/paper-send/jobs": {
      get: {
        tags: ["paper-send"],
        summary: "List jobs",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["paper-send"],
        summary: "Create a mail job (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sender", "recipient"],
                properties: {
                  sender: addressSchema,
                  recipient: addressSchema,
                  document: {
                    type: "object",
                    properties: {
                      filename: { type: "string" },
                      pages: { type: "integer", minimum: 1, maximum: 5 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/paper-send/jobs/{id}": {
      get: {
        tags: ["paper-send"],
        summary: "Get a job",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
  };
  return spec;
}
