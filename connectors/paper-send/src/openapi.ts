import { authedGet, connectorSpec, descriptorPath, listAndCreate } from "@telep/platform";

const addressSchema = {
  type: "object",
  required: ["name", "address_line1", "address_city", "address_state", "address_zip"],
  properties: {
    name: { type: "string" },
    address_line1: { type: "string" },
    address_line2: { type: "string" },
    address_city: { type: "string" },
    address_state: { type: "string" },
    address_zip: { type: "string" },
    address_country: { type: "string", default: "US" },
  },
};

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
          sender: addressSchema,
          recipient: addressSchema,
          document: { type: "object", properties: { filename: { type: "string" }, pages: { type: "integer", minimum: 1, maximum: 5 } } },
        },
      }),
      "/v1/paper-send/jobs/{id}": authedGet(tag, "Get a job", [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
    },
  );
}
