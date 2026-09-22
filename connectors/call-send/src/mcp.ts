import { catalogOrigin, createMcpHandler, mcpAuth, mcpCheckTool, mcpGetTool, mcpListTool, type McpTool } from "@telep/platform";
import { MAX_SCRIPT_CHARS, createCall, getCall, listCalls, publicCall } from "./calls";
import { assertCallReady, callRuntime, checkCall } from "./provider";

export const callSendTools: McpTool[] = [
  mcpCheckTool("Validate the Twilio account SID and auth token. Does not place a call. Demo mode skips Twilio.", () => checkCall()),
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
      const auth = mcpAuth(ctx);
      const runtime = callRuntime();
      if (runtime.mode !== "demo") assertCallReady();
      return publicCall(
        createCall({
          to: String(args.to),
          script: String(args.script),
          voice: args.voice ? String(args.voice) : undefined,
          record: args.record === true,
          ownerKeyId: auth.keyId,
          catalogOrigin: catalogOrigin(),
          live: runtime.mode !== "demo",
        }),
      );
    },
  },
  mcpGetTool("get_call", "Get a CallSend call you created on this API key (status: draft, paid, queued, completed, failed).", "Call not found", (id, owner) => {
    const call = getCall(id, owner);
    return call && publicCall(call);
  }),
  mcpListTool("list_calls", "List CallSend calls created with this API key.", "calls", (owner) => listCalls(owner).map(publicCall)),
];

export const handleCallSendMcp = createMcpHandler({ name: "call-send", version: "0.1.0", tools: callSendTools });
