import { emptySpec, type OpenApiDocument } from "@telep/platform";

export function domainSendOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "DomainSend",
    version: "0.1.0",
    description:
      "Domain registration stub on the Telep Muse gateway. Registrations are in-memory; registrar fulfillment comes later. Registration only in v1 (no renewals), TLDs: com, net, org, io, dev, app, tools; 1-2 year terms. Prices from $13.99/yr (.org).",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "domain-send", description: "Register domain names" }];
  spec.paths = {
    "/v1/domain-send": {
      get: {
        tags: ["domain-send"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/domain-send/openapi.json": {
      get: {
        tags: ["domain-send"],
        summary: "This OpenAPI document",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/domain-send/domains/check": {
      post: {
        tags: ["domain-send"],
        summary: "Check domain availability and price",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain"],
                properties: {
                  domain: { type: "string", description: "Domain to check, e.g. example.com" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/domain-send/domains": {
      get: {
        tags: ["domain-send"],
        summary: "List registrations",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["domain-send"],
        summary: "Create a registration draft (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain"],
                properties: {
                  domain: { type: "string", description: "Domain to register, e.g. example.com" },
                  years: { type: "integer", enum: [1, 2], default: 1, description: "Registration term in years" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid request" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/domain-send/domains/{id}": {
      get: {
        tags: ["domain-send"],
        summary: "Get a registration",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/domain-send/domains/{id}/checkout": {
      post: {
        tags: ["domain-send"],
        summary: "Create a checkout session (stub)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" }, "409": { description: "Not a draft" } },
      },
    },
    "/v1/domain-send/domains/{id}/demo-event": {
      post: {
        tags: ["domain-send"],
        summary: "Demo-only state transition (paid, active, failed). Test only.",
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
                  event: { type: "string", enum: ["paid", "active", "failed"] },
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
