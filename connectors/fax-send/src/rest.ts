import { catalogOrigin, draftRest } from "@telep/platform";
import { createFax, demoEvent, getFax, listFaxes, publicFax } from "./faxes";
import { faxSendOpenApi } from "./openapi";
import { assertFaxReady, checkFax, faxDescriptor, faxRuntime, quoteFax } from "./provider";

export const handleFaxSendRest = draftRest({
  slug: "fax-send",
  index: () => ({
    slug: "fax-send",
    name: "FaxSend",
    status: "building",
    price: "$0.99 per transmitted page",
    limits: "PDF up to 10 pages, optional cover page (billable)",
    ...faxDescriptor(),
    endpoints: {
      faxes: "/v1/fax-send/faxes",
      quote: "/v1/fax-send/quote",
      check: "/v1/fax-send/check",
      openapi: "/v1/fax-send/openapi.json",
      mcp: "/mcp/fax-send",
    },
  }),
  openApi: faxSendOpenApi,
  check: checkFax,
  quote: (request) => quoteFax(Number(new URL(request.url).searchParams.get("pages") ?? "1")),
  collection: {
    name: "faxes",
    listKey: "faxes",
    missing: "Fax not found",
    list: listFaxes,
    get: getFax,
    present: publicFax,
    checkout: { label: "Fax", noun: "fax" },
    demoEvent: (id, owner, event) => demoEvent(id, owner, event),
    create(body, auth) {
      const runtime = faxRuntime();
      if (runtime.mode !== "demo") assertFaxReady();
      return createFax({
        to: body.to,
        document: body.document as { filename?: string; pages?: number } | undefined,
        coverPage: body.coverPage,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
    },
  },
});
