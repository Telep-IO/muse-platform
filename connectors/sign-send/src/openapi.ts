import { emptySpec, type OpenApiDocument } from "@telep/platform";

const signerSchema = {
  type: "object",
  required: ["name", "email"],
  properties: {
    name: { type: "string" },
    email: { type: "string" },
  },
};

export function signSendOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "SignSend",
    version: "0.1.0",
    description:
      "E-signature envelope stub on the Telep Muse gateway. Envelopes are in-memory; provider fulfillment comes later. $2.99 per envelope, up to 5 pages and 5 sequential signers.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "sign-send", description: "Collect e-signatures on a PDF" }];
  spec.paths = {
    "/v1/sign-send": {
      get: {
        tags: ["sign-send"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/sign-send/openapi.json": {
      get: {
        tags: ["sign-send"],
        summary: "This OpenAPI document",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/sign-send/envelopes": {
      get: {
        tags: ["sign-send"],
        summary: "List envelopes",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["sign-send"],
        summary: "Create a signature envelope (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["signers"],
                properties: {
                  signers: {
                    type: "array",
                    minItems: 1,
                    maxItems: 5,
                    items: signerSchema,
                    description: "Signers in signing order",
                  },
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
        responses: { "201": { description: "Created" }, "400": { description: "Invalid request" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/sign-send/envelopes/{id}": {
      get: {
        tags: ["sign-send"],
        summary: "Get an envelope",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/sign-send/envelopes/{id}/checkout": {
      post: {
        tags: ["sign-send"],
        summary: "Create a checkout session (stub)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" }, "409": { description: "Not a draft" } },
      },
    },
    "/v1/sign-send/envelopes/{id}/demo-event": {
      post: {
        tags: ["sign-send"],
        summary: "Demo-only state transition (paid, sent, signed, declined). Test only.",
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
                  event: { type: "string", enum: ["paid", "sent", "signed", "declined"] },
                  signerEmail: { type: "string" },
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
