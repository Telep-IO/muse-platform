import { catalogOrigin, createMcpHandler, type McpTool } from "@telep/platform";
import { createJob, getJob, listJobs, publicJob } from "./jobs";

const tools: McpTool[] = [
  {
    name: "create_mail_job",
    description:
      "Create a PaperSend draft job to print and mail a PDF in the US. Returns a review URL. Does not mail anything — the human must review and pay. Gateway fulfillment is currently stubbed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["sender", "recipient"],
      properties: {
        sender: {
          type: "object",
          required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
          properties: {
            name: { type: "string" },
            address_line1: { type: "string" },
            address_line2: { type: "string" },
            address_city: { type: "string" },
            address_state: { type: "string" },
            address_zip: { type: "string" },
          },
        },
        recipient: {
          type: "object",
          required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
          properties: {
            name: { type: "string" },
            address_line1: { type: "string" },
            address_line2: { type: "string" },
            address_city: { type: "string" },
            address_state: { type: "string" },
            address_zip: { type: "string" },
          },
        },
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
      if (!ctx.auth) throw new Error("API key required");
      return publicJob(
        createJob({
          sender: args.sender,
          recipient: args.recipient,
          document: args.document as { filename?: string; pages?: number } | undefined,
          ownerKeyId: ctx.auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  {
    name: "get_job",
    description: "Get a PaperSend job you created on this API key.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const job = getJob(String(args.id), ctx.auth.keyId);
      if (!job) throw new Error("Job not found");
      return publicJob(job);
    },
  },
  {
    name: "list_jobs",
    description: "List PaperSend jobs created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { jobs: listJobs(ctx.auth.keyId).map(publicJob) };
    },
  },
];

export const handlePaperSendMcp = createMcpHandler({
  name: "paper-send",
  version: "0.1.0",
  tools,
});
