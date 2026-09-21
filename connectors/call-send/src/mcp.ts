import { catalogOrigin, createMcpHandler, type McpTool } from "@telep/platform";
import { MAX_SCRIPT_CHARS, createCall, getCall, listCalls, publicCall } from "./calls";

const tools: McpTool[] = [
  {
    name: "create_call",
    description:
      "Create a CallSend draft call that plays a verbatim, human-reviewed TTS script ($0.99 per call, up to ~5 minutes). Returns a review URL. Does not place anything — the human must review the script, destination number, and price and pay. V1 is a read-aloud script, not an autonomous conversation. Gateway fulfillment is currently stubbed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["to", "script"],
      properties: {
        to: { type: "string", description: "Destination phone number, E.164 (starts with +)" },
        script: {
          type: "string",
          maxLength: MAX_SCRIPT_CHARS,
          description: "Verbatim script to be read aloud; reviewed by a human before anything is placed",
        },
        voice: { type: "string", description: "TTS voice (default alloy)" },
        record: { type: "boolean", description: "Record the call (default false)" },
      },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return publicCall(
        createCall({
          to: String(args.to),
          script: String(args.script),
          voice: args.voice ? String(args.voice) : undefined,
          record: args.record === true,
          ownerKeyId: ctx.auth.keyId,
          catalogOrigin: catalogOrigin(),
        }),
      );
    },
  },
  {
    name: "get_call",
    description: "Get a CallSend call you created on this API key (status: draft, paid, queued, completed, failed).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    async handler(args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      const call = getCall(String(args.id), ctx.auth.keyId);
      if (!call) throw new Error("Call not found");
      return publicCall(call);
    },
  },
  {
    name: "list_calls",
    description: "List CallSend calls created with this API key.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler(_args, ctx) {
      if (!ctx.auth) throw new Error("API key required");
      return { calls: listCalls(ctx.auth.keyId).map(publicCall) };
    },
  },
];

export const handleCallSendMcp = createMcpHandler({
  name: "call-send",
  version: "0.1.0",
  tools,
});
