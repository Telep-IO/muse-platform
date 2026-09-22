import { authedGet, authedPost, checkoutPath, connectorSpec, demoEventPath, descriptorPath, listAndCreate, openApiSelfPath } from "@telep/platform";

export function domainSendOpenApi() {
  const tag = "domain-send";
  return connectorSpec(
    {
      title: "DomainSend",
      description:
        "Domain registration stub on the Telep Muse gateway. Registrations are in-memory; registrar fulfillment comes later. Registration only in v1 (no renewals), TLDs: com, net, org, io, dev, app, tools; 1-2 year terms. Prices from $13.99/yr (.org).",
      tag,
      tagDescription: "Register domain names",
    },
    {
      "/v1/domain-send": descriptorPath(tag),
      "/v1/domain-send/openapi.json": openApiSelfPath(tag),
      "/v1/domain-send/domains/check": authedPost(
        tag,
        "Check domain availability and price",
        { type: "object", required: ["domain"], properties: { domain: { type: "string", description: "Domain to check, e.g. example.com" } } },
        { "200": { description: "OK" }, "401": { description: "Missing key" } },
      ),
      "/v1/domain-send/domains": listAndCreate(
        tag,
        "List registrations",
        "Create a registration draft (stub)",
        {
          type: "object",
          required: ["domain"],
          properties: {
            domain: { type: "string", description: "Domain to register, e.g. example.com" },
            years: { type: "integer", enum: [1, 2], default: 1, description: "Registration term in years" },
          },
        },
        true,
      ),
      "/v1/domain-send/domains/{id}": authedGet(tag, "Get a registration", true),
      "/v1/domain-send/domains/{id}/checkout": checkoutPath(tag),
      "/v1/domain-send/domains/{id}/demo-event": demoEventPath(tag, "Demo-only state transition (paid, active, failed). Test only.", [
        "paid",
        "active",
        "failed",
      ]),
    },
  );
}
