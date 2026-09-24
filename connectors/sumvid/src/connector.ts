import { listing } from "./listing";
import { defineConnector } from "@telep/platform";
import { checkSumvid, summarize, sumvidAccount, sumvidDescriptor } from "./provider";
import { getSummary, listSummaries, publicSummary } from "./summaries";

const sumvid = defineConnector({
  slug: "sumvid",
  name: "Sumvid",
  status: "ready",
  listing,
  descriptor: sumvidDescriptor,
  check: {
    description:
      "Validate Sumvid API credentials with GET /v1/account. Does not summarize a video. Demo mode skips the provider. A 402 from Sumvid surfaces insufficient_credits and topUpUrl when the API sends one.",
    run: checkSumvid,
  },
  account: { run: sumvidAccount, description: "Stub Sumvid account for this API key. No real usage is billed." },
  indexTools: true,
  openapi: {
    description: "YouTube summarize stub on the Telep Muse gateway. Summaries are in-memory and hashed from the video id; no captions or paid summarizer are used.",
    tagDescription: "Summarize a YouTube video (stub)",
  },
  resource: {
    name: "summaries",
    missing: "Summary not found",
    list: listSummaries,
    get: getSummary,
    present: publicSummary,
    summaries: { list: "List summaries", create: "Create a YouTube summary (stub)", get: "Get a summary" },
    schema: { type: "object", required: ["youtubeUrl"], properties: { youtubeUrl: { type: "string" }, language: { type: "string" } } },
    tool: {
      name: "summarize_youtube",
      description:
        "Summarize a YouTube URL or 11-character video id. Demo mode hashes a stub from the video id. test/live mode calls POST {SUMVID_API_BASE_URL}/v1/summaries and can spend Sumvid credits.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["youtubeUrl"],
        properties: {
          youtubeUrl: { type: "string", description: "YouTube watch/share URL or 11-character video id" },
          language: { type: "string", description: "BCP-47 language hint (stub only)" },
        },
      },
    },
    getTool: { name: "get_summary", description: "Get a Sumvid stub summary created with this API key." },
    create: (body, ctx) => summarize({ youtubeUrl: body.youtubeUrl ?? body.url, language: body.language, ownerKeyId: ctx.keyId }),
  },
});

export const handleSumvidRest = sumvid.rest;
export const handleSumvidMcp = sumvid.mcp;
export const sumvidOpenApi = sumvid.openapi;
export const sumvidTools = sumvid.tools;

export default sumvid;
