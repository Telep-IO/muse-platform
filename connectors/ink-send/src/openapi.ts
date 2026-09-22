import { authedGet, checkoutPath, connectorSpec, demoEventPath, descriptorPath, listAndCreate, openApiSelfPath, postalAddress } from "@telep/platform";
import { CARDS, MAX_MESSAGE_CHARS } from "./letters";

export function inkSendOpenApi() {
  const tag = "ink-send";
  return connectorSpec(
    {
      title: "InkSend",
      description:
        "Handwritten-style letter stub on the Telep Muse gateway. Letters are in-memory; provider fulfillment comes later. $3.99 per letter flat. Status 'sent' means accepted for mailing, not delivered.",
      tag,
      tagDescription: "Send handwritten-style letters",
    },
    {
      "/v1/ink-send": descriptorPath(tag),
      "/v1/ink-send/openapi.json": openApiSelfPath(tag),
      "/v1/ink-send/letters": listAndCreate(
        tag,
        "List letters",
        "Create a letter draft (stub)",
        {
          type: "object",
          required: ["message", "to"],
          properties: {
            message: { type: "string", maxLength: MAX_MESSAGE_CHARS },
            to: postalAddress(),
            card: { type: "string", enum: CARDS },
            handwriting_style: { type: "string" },
          },
        },
        true,
      ),
      "/v1/ink-send/letters/{id}": authedGet(tag, "Get a letter", true),
      "/v1/ink-send/letters/{id}/checkout": checkoutPath(tag),
      "/v1/ink-send/letters/{id}/demo-event": demoEventPath(tag, "Demo-only state transition (paid, sent). Test only.", ["paid", "sent"]),
    },
  );
}
