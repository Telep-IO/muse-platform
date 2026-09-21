import { emptySpec, type OpenApiDocument } from "@telep/platform";
import { MAX_SCRIPT_CHARS } from "./calls";

export function callSendOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "CallSend",
    version: "0.1.0",
    description:
      "Voice call stub on the Telep Muse gateway. Calls are in-memory; provider fulfillment comes later. $0.99 per call flat, verbatim human-reviewed TTS script up to ~5 minutes; not an autonomous conversation.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "call-send", description: "Place a voice call that reads a reviewed script" }];
  spec.paths = {
    "/v1/call-send": {
      get: {
        tags: ["call-send"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/call-send/openapi.json": {
      get: {
        tags: ["call-send"],
        summary: "This OpenAPI document",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/call-send/calls": {
      get: {
        tags: ["call-send"],
        summary: "List calls",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["call-send"],
        summary: "Create a call draft (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["to", "script"],
                properties: {
                  to: { type: "string", description: "Destination phone number, E.164 (starts with +)" },
                  script: {
                    type: "string",
                    maxLength: MAX_SCRIPT_CHARS,
                    description: "Verbatim script to be read aloud; reviewed by a human before anything is placed",
                  },
                  voice: { type: "string", description: "TTS voice (default alloy)" },
                  record: { type: "boolean", description: "Record the call (default false)" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid request" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/call-send/calls/{id}": {
      get: {
        tags: ["call-send"],
        summary: "Get a call",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/call-send/calls/{id}/checkout": {
      post: {
        tags: ["call-send"],
        summary: "Create a checkout session (stub)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" }, "409": { description: "Not a draft" } },
      },
    },
    "/v1/call-send/calls/{id}/demo-event": {
      post: {
        tags: ["call-send"],
        summary: "Demo-only state transition (paid, queued, ringing, answered, completed, failed). Test only.",
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
                  event: { type: "string", enum: ["paid", "queued", "ringing", "answered", "completed", "failed"] },
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
