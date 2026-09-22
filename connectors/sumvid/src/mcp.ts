import { createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpNoArgTool, type McpTool } from "@telep/platform";
import { checkSumvid, summarize, sumvidAccount } from "./provider";
import { getSummary, publicSummary } from "./summaries";

export const sumvidTools: McpTool[] = [
  mcpCheckTool(
    "Validate Sumvid API credentials with GET /v1/account. Does not summarize a video. Demo mode skips the provider. A 402 from Sumvid surfaces insufficient_credits and topUpUrl when the API sends one.",
    () => checkSumvid(),
  ),
  {
    name: "summarize_youtube",
    description:
      "Summarize a YouTube URL or 11-character video id. Demo mode hashes a stub from the video id. test/live mode calls POST {SUMVID_API_BASE_URL}/v1/summaries and can spend Sumvid credits.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["youtubeUrl"],
      properties: {
        youtubeUrl: { type: "string", description: "YouTube watch/share URL or 11-character video id" },
        language: { type: "string", description: "BCP-47 language hint (stub only)" },
      },
    },
    async handler(args, ctx) {
      return publicSummary(
        await summarize({ youtubeUrl: args.youtubeUrl, language: args.language, ownerKeyId: mcpAuth(ctx).keyId }),
      );
    },
  },
  mcpGetTool("get_summary", "Get a Sumvid stub summary created with this API key.", "Summary not found", (id, owner) => {
    const summary = getSummary(id, owner);
    return summary && publicSummary(summary);
  }),
  mcpNoArgTool("get_account", "Stub Sumvid account for this API key. No real usage is billed.", (owner) => sumvidAccount(owner)),
];

export const handleSumvidMcp = createMcpHandler({ name: "sumvid", version: "0.1.0", tools: sumvidTools });
