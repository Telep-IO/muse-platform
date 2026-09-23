import { defineConnector, documentPages, postalAddress } from "@telep/platform";
import { attachCheckout, createJob, getJob, listJobs, publicJob } from "./jobs";
import { assertPaperDatabase, checkPaper, paperDescriptor, paperRuntime, quotePaper } from "./provider";

const paper = defineConnector({
  slug: "paper-send",
  name: "PaperSend",
  status: "submitted",
  descriptor: paperDescriptor,
  gate: () => ({ mode: paperRuntime().mode, ready: () => assertPaperDatabase() }),
  check: {
    description:
      "Validate PaperSend Lob (and Stripe, if set) credentials. Read-only: lists Lob addresses and does not create a letter. Demo mode skips the provider.",
    run: checkPaper,
  },
  quote: (request) => quotePaper(Number(new URL(request.url).searchParams.get("pages") ?? "1")),
  openapi: {
    description:
      "PDF → physical mail on the Telep Muse gateway. Demo mode is an in-memory stub and does not call Lob. test/live stores a durable draft; Lob sends only after the Stripe billing webhook confirms payment.",
    tagDescription: "Print and mail a PDF",
  },
  resource: {
    name: "jobs",
    missing: "Job not found",
    list: listJobs,
    get: getJob,
    present: publicJob,
    summaries: { list: "List jobs", create: "Create a mail job", get: "Get a job" },
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
        "Create a PaperSend draft job to print and mail a letter in the US. Returns a review URL. Does not mail anything until a human pays. Demo mode stores an in-memory stub and never calls Lob. In test or live, Lob sends only after the Stripe webhook confirms payment.",
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
    checkout: { label: "Job", noun: "job" },
    onCheckout: (id, owner, session) => attachCheckout(id, owner, session),
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
