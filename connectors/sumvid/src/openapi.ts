import { emptySpec, type OpenApiDocument } from "@telep/platform";

export function sumvidOpenApi(): OpenApiDocument {
  const spec = emptySpec({
    title: "Sumvid",
    version: "0.1.0",
    description:
      "YouTube summarize stub on the Telep Muse gateway. Summaries are in-memory and hashed from the video id; no captions or paid summarizer are used.",
    contact: { name: "Telep IO", email: "jon@telep.io", url: "https://telep.io" },
  });
  spec.tags = [{ name: "sumvid", description: "Summarize a YouTube video (stub)" }];
  spec.paths = {
    "/v1/sumvid": {
      get: {
        tags: ["sumvid"],
        summary: "Connector descriptor",
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/sumvid/account": {
      get: {
        tags: ["sumvid"],
        summary: "Stub account",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/sumvid/summaries": {
      get: {
        tags: ["sumvid"],
        summary: "List summaries",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Missing key" } },
      },
      post: {
        tags: ["sumvid"],
        summary: "Create a YouTube summary (stub)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["youtubeUrl"],
                properties: {
                  youtubeUrl: { type: "string" },
                  language: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "401": { description: "Missing key" } },
      },
    },
    "/v1/sumvid/summaries/{id}": {
      get: {
        tags: ["sumvid"],
        summary: "Get a summary",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
  };
  return spec;
}
