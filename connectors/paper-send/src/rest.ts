import { catalogOrigin, draftRest } from "@telep/platform";
import { createJob, getJob, listJobs, publicJob } from "./jobs";
import { paperSendOpenApi } from "./openapi";
import { assertPaperReady, checkPaper, paperDescriptor, paperRuntime, quotePaper } from "./provider";

export const handlePaperSendRest = draftRest({
  slug: "paper-send",
  index: () => ({
    slug: "paper-send",
    name: "PaperSend",
    status: "submitted",
    ...paperDescriptor(),
    endpoints: {
      jobs: "/v1/paper-send/jobs",
      quote: "/v1/paper-send/quote",
      check: "/v1/paper-send/check",
      openapi: "/v1/paper-send/openapi.json",
      mcp: "/mcp/paper-send",
    },
  }),
  openApi: paperSendOpenApi,
  check: checkPaper,
  quote: (request) => quotePaper(Number(new URL(request.url).searchParams.get("pages") ?? "1")),
  collection: {
    name: "jobs",
    listKey: "jobs",
    missing: "Job not found",
    list: listJobs,
    get: getJob,
    present: publicJob,
    create(body, auth) {
      const runtime = paperRuntime();
      if (runtime.mode !== "demo") assertPaperReady();
      return createJob({
        sender: body.sender,
        recipient: body.recipient,
        document: body.document as { filename?: string; pages?: number } | undefined,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
    },
  },
});
