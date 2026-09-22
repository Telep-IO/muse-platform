import { authedGet, checkoutPath, connectorSpec, demoEventPath, descriptorPath, listAndCreate, openApiSelfPath } from "@telep/platform";

export function signSendOpenApi() {
  const tag = "sign-send";
  return connectorSpec(
    {
      title: "SignSend",
      description:
        "E-signature envelope stub on the Telep Muse gateway. Envelopes are in-memory; provider fulfillment comes later. $2.99 per envelope, up to 5 pages and 5 sequential signers.",
      tag,
      tagDescription: "Collect e-signatures on a PDF",
    },
    {
      "/v1/sign-send": descriptorPath(tag),
      "/v1/sign-send/openapi.json": openApiSelfPath(tag),
      "/v1/sign-send/envelopes": listAndCreate(
        tag,
        "List envelopes",
        "Create a signature envelope (stub)",
        {
          type: "object",
          required: ["signers"],
          properties: {
            signers: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: { type: "object", required: ["name", "email"], properties: { name: { type: "string" }, email: { type: "string" } } },
              description: "Signers in signing order",
            },
            document: { type: "object", properties: { filename: { type: "string" }, pages: { type: "integer", minimum: 1, maximum: 5 } } },
          },
        },
        true,
      ),
      "/v1/sign-send/envelopes/{id}": authedGet(tag, "Get an envelope", true),
      "/v1/sign-send/envelopes/{id}/checkout": checkoutPath(tag),
      "/v1/sign-send/envelopes/{id}/demo-event": demoEventPath(
        tag,
        "Demo-only state transition (paid, sent, signed, declined). Test only.",
        ["paid", "sent", "signed", "declined"],
        { signerEmail: { type: "string" } },
      ),
    },
  );
}
