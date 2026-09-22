import { authedGet, checkoutPath, connectorSpec, demoEventPath, descriptorPath, listAndCreate, openApiSelfPath } from "@telep/platform";
import { MAX_SCRIPT_CHARS } from "./calls";

const id = [{ name: "id", in: "path" as const, required: true, schema: { type: "string" } }];

export function callSendOpenApi() {
  const tag = "call-send";
  return connectorSpec(
    {
      title: "CallSend",
      description:
        "Voice call stub on the Telep Muse gateway. Calls are in-memory; provider fulfillment comes later. $0.99 per call flat, verbatim human-reviewed TTS script up to ~5 minutes; not an autonomous conversation.",
      tag,
      tagDescription: "Place a voice call that reads a reviewed script",
    },
    {
      "/v1/call-send": descriptorPath(tag),
      "/v1/call-send/openapi.json": openApiSelfPath(tag),
      "/v1/call-send/calls": listAndCreate(
        tag,
        "List calls",
        "Create a call draft (stub)",
        {
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
        },
        true,
      ),
      "/v1/call-send/calls/{id}": authedGet(tag, "Get a call", id),
      "/v1/call-send/calls/{id}/checkout": checkoutPath(tag),
      "/v1/call-send/calls/{id}/demo-event": demoEventPath(
        tag,
        "Demo-only state transition (paid, queued, ringing, answered, completed, failed). Test only.",
        ["paid", "queued", "ringing", "answered", "completed", "failed"],
      ),
    },
  );
}
