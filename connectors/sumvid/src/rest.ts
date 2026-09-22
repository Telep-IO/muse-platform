import { draftRest } from "@telep/platform";
import { sumvidOpenApi } from "./openapi";
import { checkSumvid, summarize, sumvidAccount, sumvidDescriptor } from "./provider";
import { getSummary, listSummaries, publicSummary } from "./summaries";

export const handleSumvidRest = draftRest({
  slug: "sumvid",
  index: () => ({
    slug: "sumvid",
    name: "Sumvid",
    status: "ready",
    ...sumvidDescriptor(),
    endpoints: {
      summaries: "/v1/sumvid/summaries",
      account: "/v1/sumvid/account",
      check: "/v1/sumvid/check",
      openapi: "/v1/sumvid/openapi.json",
      mcp: "/mcp/sumvid",
    },
    mcpTools: ["summarize_youtube", "get_summary", "get_account"],
  }),
  openApi: sumvidOpenApi,
  check: checkSumvid,
  reads: { account: (auth) => sumvidAccount(auth.keyId) },
  collection: {
    name: "summaries",
    listKey: "summaries",
    missing: "Summary not found",
    list: listSummaries,
    get: getSummary,
    present: publicSummary,
    create: (body, auth) => summarize({ youtubeUrl: body.youtubeUrl ?? body.url, language: body.language, ownerKeyId: auth.keyId }),
  },
});
