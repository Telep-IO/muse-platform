import { catalogOrigin, draftRest } from "@telep/platform";
import { createCall, demoEvent, getCall, listCalls, publicCall } from "./calls";
import { callSendOpenApi } from "./openapi";
import { assertCallReady, callDescriptor, callRuntime, checkCall, quoteCall } from "./provider";

export const handleCallSendRest = draftRest({
  slug: "call-send",
  index: () => ({
    slug: "call-send",
    name: "CallSend",
    status: "planned",
    price: "$0.99 per call",
    limits: "verbatim TTS script, up to ~5 minutes",
    ...callDescriptor(),
    endpoints: {
      calls: "/v1/call-send/calls",
      quote: "/v1/call-send/quote",
      check: "/v1/call-send/check",
      openapi: "/v1/call-send/openapi.json",
      mcp: "/mcp/call-send",
    },
  }),
  openApi: callSendOpenApi,
  check: checkCall,
  quote: () => quoteCall(),
  collection: {
    name: "calls",
    listKey: "calls",
    missing: "Call not found",
    list: listCalls,
    get: getCall,
    present: publicCall,
    checkout: { label: "Call", noun: "call" },
    demoEvent: (id, owner, event) => demoEvent(id, owner, event),
    create(body, auth) {
      const runtime = callRuntime();
      if (runtime.mode !== "demo") assertCallReady();
      return createCall({
        to: String(body.to ?? ""),
        script: String(body.script ?? ""),
        voice: body.voice ? String(body.voice) : undefined,
        record: body.record === true,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
    },
  },
});
