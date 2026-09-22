import { catalogOrigin, createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, postalAddress, type McpTool } from "@telep/platform";
import { createJob, getJob, listJobs, publicJob } from "./jobs";
import { assertPaperReady, checkPaper, paperRuntime } from "./provider";

export const paperSendTools: McpTool[] = [
  mcpCheckTool(
    "Validate PaperSend Lob (and Stripe, if set) credentials. Read-only: lists Lob addresses and does not create a letter. Demo mode skips the provider.",
    () => checkPaper(),
  ),
  {
    name: "create_mail_job",
    description:
      "Create a PaperSend draft job to print and mail a PDF in the US. Returns a review URL. Does not mail anything — the human must review and pay. Demo mode stores a stub. test/live mode still does not call Lob to print.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sender", "recipient"],
      properties: {
        sender: postalAddress({ line2: true }),
        recipient: postalAddress({ line2: true }),
        document: {
          type: "object",
          properties: {
            filename: { type: "string" },
            pages: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
      },
    },
    async handler(args, ctx) {
      const auth = mcpAuth(ctx);
      const runtime = paperRuntime();
      if (runtime.mode !== "demo") assertPaperReady();
      return publicJob(
        createJob({
          sender: args.sender,
          recipient: args.recipient,
          document: args.document as { filename?: string; pages?: number } | undefined,
          ownerKeyId: auth.keyId,
          catalogOrigin: catalogOrigin(),
          live: runtime.mode !== "demo",
        }),
      );
    },
  },
  mcpGetTool("get_job", "Get a PaperSend job you created on this API key.", "Job not found", (id, owner) => {
    const job = getJob(id, owner);
    return job && publicJob(job);
  }),
  mcpListTool("list_jobs", "List PaperSend jobs created with this API key.", "jobs", (owner) => listJobs(owner).map(publicJob)),
];

export const handlePaperSendMcp = createMcpHandler({
  name: "paper-send",
  version: "0.1.0",
  tools: paperSendTools,
});
