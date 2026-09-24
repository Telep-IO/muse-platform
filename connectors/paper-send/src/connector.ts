import { defineConnector, documentPages, postalAddress } from "@telep/platform";
import { createJob, getJob, listJobs, publicJob } from "./jobs";
import { assertPaperReady, checkPaper, paperDescriptor, paperRuntime, quotePaper } from "./provider";

const paper = defineConnector({
  slug: "paper-send",
  name: "PaperSend",
  status: "submitted",
  descriptor: paperDescriptor,
  gate: () => ({ mode: paperRuntime().mode, ready: () => assertPaperReady() }),
  check: {
    description:
      "Validate PaperSend Lob (and Stripe, if set) credentials. Read-only: lists Lob addresses and does not create a letter. Demo mode skips the provider.",
    run: checkPaper,
  },
  quote: (request) => quotePaper(Number(new URL(request.url).searchParams.get("pages") ?? "1")),
  openapi: {
    description: "PDF → physical mail stub on the Telep Muse gateway. Jobs are in-memory; mail-provider fulfillment comes later.",
    tagDescription: "Print and mail a PDF",
  },
  resource: {
    name: "jobs",
    missing: "Job not found",
    list: listJobs,
    get: getJob,
    present: publicJob,
    summaries: { list: "List jobs", create: "Create a mail job (stub)", get: "Get a job" },
    schema: {
      type: "object",
      required: ["sender", "recipient"],
      properties: {
        sender: postalAddress({ line2: true, country: true }),
        recipient: postalAddress({ line2: true, country: true }),
        document: documentPages(5),
      },
    },
    tool: {
      name: "create_mail_job",
      description:
        "Create a PaperSend draft job to print and mail a PDF in the US. Returns a review URL. Does not mail anything — the human must review and pay. Demo mode stores a stub. test/live mode still does not call Lob to print.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["sender", "recipient"],
        properties: {
          sender: postalAddress({ line2: true }),
          recipient: postalAddress({ line2: true }),
          document: documentPages(5),
        },
      },
    },
    getTool: { name: "get_job", description: "Get a PaperSend job you created on this API key." },
    listTool: { name: "list_jobs", description: "List PaperSend jobs created with this API key." },
    create(body, ctx) {
      return createJob({
        sender: body.sender,
        recipient: body.recipient,
        document: body.document as { filename?: string; pages?: number } | undefined,
        ownerKeyId: ctx.keyId,
        catalogOrigin: ctx.catalogOrigin,
        live: ctx.live,
      });
    },
  },
});

export const handlePaperSendRest = paper.rest;
export const handlePaperSendMcp = paper.mcp;
export const paperSendOpenApi = paper.openapi;
export const paperSendTools = paper.tools;
