import { catalogOrigin, draftRest, errorResponse, readJson, unauthorized, withCors } from "@telep/platform";
import { createDomain, demoEvent, getDomain, listDomains, publicDomain } from "./domains";
import { domainSendOpenApi } from "./openapi";
import { assertDomainReady, checkDomainCredentials, domainDescriptor, domainRuntime, resolveAvailability } from "./provider";

export const handleDomainSendRest = draftRest({
  slug: "domain-send",
  index: () => ({
    slug: "domain-send",
    name: "DomainSend",
    status: "planned",
    price: "from $13.99/yr (.org)",
    limits: "registration only in v1, no renewals; TLDs: com, net, org, io, dev, app, tools; 1-2 year terms",
    ...domainDescriptor(),
    endpoints: {
      domains: "/v1/domain-send/domains",
      check: "/v1/domain-send/check",
      openapi: "/v1/domain-send/openapi.json",
      mcp: "/mcp/domain-send",
    },
  }),
  openApi: domainSendOpenApi,
  check: checkDomainCredentials,
  async match(request, segments, auth) {
    if (!(segments[0] === "domains" && segments[1] === "check" && segments.length === 2 && request.method === "POST")) return;
    if (!auth) return unauthorized(request);
    const body = await readJson(request);
    const domain = String(body.domain ?? "").trim().toLowerCase();
    try {
      return withCors(request, Response.json({ domain, ...(await resolveAvailability(body.domain)) }));
    } catch (error) {
      return withCors(request, errorResponse(error));
    }
  },
  collection: {
    name: "domains",
    listKey: "domains",
    missing: "Domain not found",
    list: listDomains,
    get: getDomain,
    present: publicDomain,
    checkout: { label: "Domain", noun: "domain" },
    demoEvent: (id, owner, event) => demoEvent(id, owner, event),
    create(body, auth) {
      const runtime = domainRuntime();
      if (runtime.mode !== "demo") assertDomainReady();
      return createDomain({
        domain: body.domain,
        years: body.years,
        ownerKeyId: auth.keyId,
        catalogOrigin: catalogOrigin(),
        live: runtime.mode !== "demo",
      });
    },
  },
});
