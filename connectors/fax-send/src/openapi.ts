import { authedGet, checkoutPath, connectorSpec, demoEventPath, descriptorPath, listAndCreate, openApiSelfPath } from "@telep/platform";

const id = [{ name: "id", in: "path" as const, required: true, schema: { type: "string" } }];

export function faxSendOpenApi() {
  const tag = "fax-send";
  return connectorSpec(
    {
      title: "FaxSend",
      description:
        "Fax transmission stub on the Telep Muse gateway. Faxes are in-memory; provider fulfillment comes later. $0.99 per transmitted page, up to 10 pages, optional cover page (billable).",
      tag,
      tagDescription: "Transmit a fax to a phone number",
    },
    {
      "/v1/fax-send": descriptorPath(tag),
      "/v1/fax-send/openapi.json": openApiSelfPath(tag),
      "/v1/fax-send/faxes": listAndCreate(
        tag,
        "List faxes",
        "Create a fax draft (stub)",
        {
          type: "object",
          required: ["to", "document"],
          properties: {
            to: { type: "string", description: "Destination phone number in E.164 format (e.g. +15550100)" },
            document: { type: "object", properties: { filename: { type: "string" }, pages: { type: "integer", minimum: 1, maximum: 10 } } },
            coverPage: { type: "boolean", description: "Include a reviewed cover page (counts as a billable page)" },
          },
        },
        true,
      ),
      "/v1/fax-send/faxes/{id}": authedGet(tag, "Get a fax", id),
      "/v1/fax-send/faxes/{id}/checkout": checkoutPath(tag),
      "/v1/fax-send/faxes/{id}/demo-event": demoEventPath(tag, "Demo-only state transition (paid, sending, delivered, failed). Test only.", [
        "paid",
        "sending",
        "delivered",
        "failed",
      ]),
    },
  );
}
