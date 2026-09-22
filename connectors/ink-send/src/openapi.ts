import { authedGet, checkoutPath, connectorSpec, demoEventPath, descriptorPath, listAndCreate, openApiSelfPath } from "@telep/platform";
import { CARDS, MAX_MESSAGE_CHARS } from "./letters";

const id = [{ name: "id", in: "path" as const, required: true, schema: { type: "string" } }];
const addressSchema = {
  type: "object",
  required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
  properties: {
    name: { type: "string" },
    address_line1: { type: "string" },
    address_city: { type: "string" },
    address_state: { type: "string" },
    address_zip: { type: "string" },
  },
};

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
            to: addressSchema,
            card: { type: "string", enum: CARDS },
            handwriting_style: { type: "string" },
          },
        },
        true,
      ),
      "/v1/ink-send/letters/{id}": authedGet(tag, "Get a letter", id),
      "/v1/ink-send/letters/{id}/checkout": checkoutPath(tag),
      "/v1/ink-send/letters/{id}/demo-event": demoEventPath(tag, "Demo-only state transition (paid, sent). Test only.", ["paid", "sent"]),
    },
  );
}
