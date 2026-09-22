import { defineConnector } from "@telep/platform";
import { MAX_SCRIPT_CHARS, createCall, demoEvent, getCall, listCalls, publicCall } from "./calls";
import { assertCallReady, callDescriptor, callRuntime, checkCall, quoteCall } from "./provider";

const body = {
  type: "object",
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
};

const call = defineConnector({
  slug: "call-send",
  name: "CallSend",
  status: "planned",
  price: "$0.99 per call",
  limits: "verbatim TTS script, up to ~5 minutes",
  descriptor: callDescriptor,
  gate: () => ({ mode: callRuntime().mode, ready: () => assertCallReady() }),
  check: { description: "Validate the Twilio account SID and auth token. Does not place a call. Demo mode skips Twilio.", run: checkCall },
  quote: () => quoteCall(),
  openapi: {
    description:
      "Voice call stub on the Telep Muse gateway. Calls are in-memory; provider fulfillment comes later. $0.99 per call flat, verbatim human-reviewed TTS script up to ~5 minutes; not an autonomous conversation.",
    tagDescription: "Place a voice call that reads a reviewed script",
    self: true,
  },
  resource: {
    name: "calls",
    missing: "Call not found",
    list: listCalls,
    get: getCall,
    present: publicCall,
    summaries: { list: "List calls", create: "Create a call draft (stub)", get: "Get a call" },
    schema: body,
    invalid: true,
    checkout: { label: "Call", noun: "call" },
    demo: {
      summary: "Demo-only state transition (paid, queued, ringing, answered, completed, failed). Test only.",
      events: ["paid", "queued", "ringing", "answered", "completed", "failed"],
      run: (id, owner, event) => demoEvent(id, owner, event),
    },
    tool: {
      name: "create_call",
      description:
        "Create a CallSend draft call that plays a verbatim, human-reviewed TTS script ($0.99 per call, up to ~5 minutes). Returns a review URL. Does not place anything — the human must review the script, destination number, and price and pay. V1 is a read-aloud script, not an autonomous conversation. Gateway fulfillment is currently stubbed.",
    },
    getTool: { name: "get_call", description: "Get a CallSend call you created on this API key (status: draft, paid, queued, completed, failed)." },
    listTool: { name: "list_calls", description: "List CallSend calls created with this API key." },
    create(input, ctx) {
      return createCall({
        to: String(input.to ?? ""),
        script: String(input.script ?? ""),
        voice: input.voice ? String(input.voice) : undefined,
        record: input.record === true,
        ownerKeyId: ctx.keyId,
        catalogOrigin: ctx.catalogOrigin,
        live: ctx.live,
      });
    },
  },
});

export const handleCallSendRest = call.rest;
export const handleCallSendMcp = call.mcp;
export const callSendOpenApi = call.openapi;
export const callSendTools = call.tools;
