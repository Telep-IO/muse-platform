import { authedGet, connectorSpec, descriptorPath, listAndCreate, postalAddress } from "@telep/platform";

export function paperSendOpenApi() {
  const tag = "paper-send";
  return connectorSpec(
    {
      title: "PaperSend",
      description: "PDF → physical mail stub on the Telep Muse gateway. Jobs are in-memory; mail-provider fulfillment comes later.",
      tag,
      tagDescription: "Print and mail a PDF",
    },
    {
      "/v1/paper-send": descriptorPath(tag),
      "/v1/paper-send/jobs": listAndCreate(tag, "List jobs", "Create a mail job (stub)", {
        type: "object",
        required: ["sender", "recipient"],
        properties: {
          sender: postalAddress({ line2: true, country: true }),
          recipient: postalAddress({ line2: true, country: true }),
          document: { type: "object", properties: { filename: { type: "string" }, pages: { type: "integer", minimum: 1, maximum: 5 } } },
        },
      }),
      "/v1/paper-send/jobs/{id}": authedGet(tag, "Get a job", true),
    },
  );
}
