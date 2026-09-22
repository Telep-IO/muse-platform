import { createMcpHandler, type McpTool } from "@telep/platform";
import { getSummary, publicSummary } from "./summaries";
import { checkSumvid, summarize, sumvidAccount } from "./provider";

const tools: McpTool[] = [
  {
    name: "check_credentials",
    description:
      "Validate Sumvid API credentials with GET /v1/account. Does not summarize a video. Demo mode skips the provider. A 402 from Sumvid surfaces insufficient_credits and topUpUrl when the API sends one.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return checkSumvid();
    },
  },
  {
    name: "summarize_youtube",
    description:
      "Summarize a YouTube URL or 11-character video id. Demo mode hashes a stub from the video id. test/live mode calls POST {SUMVID_API_BASE_URL}/v1/summaries and can spend Sumvid credits.",
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
        await summarize({
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
      return sumvidAccount(ctx.auth.keyId);
    },
  },
];

export const handleSumvidMcp = createMcpHandler({
  name: "sumvid",
  version: "0.1.0",
  tools,
});
