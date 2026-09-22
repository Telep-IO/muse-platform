import { catalogOrigin, draftRest } from "@telep/platform";
import { createEnvelope, demoEvent, getEnvelope, listEnvelopes, publicEnvelope } from "./envelopes";
import { signSendOpenApi } from "./openapi";
import { assertSignReady, checkSign, quoteSign, signDescriptor, signRuntime } from "./provider";

export const handleSignSendRest = draftRest({
  slug: "sign-send",
  index: () => ({
    slug: "sign-send",
    name: "SignSend",
    status: "building",
    price: "$2.99 per envelope",
    limits: "PDF up to 5 pages, 1-5 sequential signers",
    ...signDescriptor(),
    endpoints: {
      envelopes: "/v1/sign-send/envelopes",
      quote: "/v1/sign-send/quote",
      check: "/v1/sign-send/check",
      openapi: "/v1/sign-send/openapi.json",
      mcp: "/mcp/sign-send",
    },
  }),
  openApi: signSendOpenApi,
  check: checkSign,
  quote: () => quoteSign(),
  collection: {
    name: "envelopes",
    listKey: "envelopes",
    missing: "Envelope not found",
    list: listEnvelopes,
    get: getEnvelope,
    present: publicEnvelope,
    checkout: { label: "Envelope", noun: "envelope" },
    demoEvent: (id, owner, event, body) => demoEvent(id, owner, event, body.signerEmail ? String(body.signerEmail) : undefined),
    create(body, auth) {
      const runtime = signRuntime();
      if (runtime.mode !== "demo") assertSignReady();
      return createEnvelope({
        document: body.document as { filename?: string; pages?: number } | undefined,
        signers: body.signers,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
    },
  },
});
