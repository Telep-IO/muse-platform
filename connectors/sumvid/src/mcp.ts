import { createMcpHandler, type McpTool } from "@telep/platform";
import { createSummary, getAccount, getSummary, publicSummary } from "./summaries";

const tools: McpTool[] = [
  {
    name: "summarize_youtube",
    description:
      "Create a Sumvid stub summary from a YouTube URL or 11-character video id. Does not fetch captions or call a paid summarizer — the text is hashed from the video id so agents can wire the connector.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["youtubeUrl"],
      properties: {
        youtubeUrl: {
          type: "string",
          description: "YouTube watch/share URL or 11-character video id",
        },
        language: { type: "string", description: "BCP-47 language hint (stub only)" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return publicSummary(
        createSummary({
          youtubeUrl: args.youtubeUrl,
          language: args.language,
          ownerKeyId: ctx.auth.keyId,
        }),
      );
    },
  },
  {
    name: "get_summary",
    description: "Get a Sumvid stub summary created with this API key.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const summary = getSummary(String(args.id), ctx.auth.keyId);
      if (!summary) throw new Error("Summary not found");
      return publicSummary(summary);
    },
  },
  {
    name: "get_account",
    description: "Stub Sumvid account for this API key. No real usage is billed.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return getAccount(ctx.auth.keyId);
    },
  },
];

export const handleSumvidMcp = createMcpHandler({
  name: "sumvid",
  version: "0.1.0",
  tools,
});
