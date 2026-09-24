import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Register a domain name (WHOIS privacy planned).",
  category: "identity",
  pricingBlurb: "$14.99 / year for .com (planned).",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/domain-send",
  howMuseUsesIt:
    "Muse checks availability and prepares a registration. You confirm the name, contacts, and price before anything is purchased.",
  examplePrompts: [
    "Is studio-telep.com available? If so, prepare a registration for me to approve.",
    "Check if telep.tools is available.",
    "Show me the details on my studio-telep.com registration draft.",
  ],
  productNotes: "On the gateway as a stub: availability checks, registration drafts, and demo state transitions work; provider integration pending.",
  docs: {
    demoNote:
      "Demo gateway: availability checks are simulated and registrations are drafts only — no real registrations. WHOIS privacy is planned (the stub sets whoisPrivacy: true on drafts; no registrar privacy is applied). Planned provider: OpenSRS / Tucows reseller track (not wired).",
    createEndpoint: "/v1/domain-send/domains",
    createExampleBody: '{"domain":"example.com"}',
  },
  legal: buildLegal({
    name: "DomainSend",
    museFiling: "pending",
    whatItDoes: [
      "DomainSend is a Telep IO LLC connector on the Telep Muse gateway. It checks domain availability and drafts domain registrations.",
      "The current gateway is a demo stub — no domains are actually registered. Availability results are simulated (names starting with “taken-” are treated as taken; other supported names are shown available).",
    ],
    collects: [
      "The domain names you query or draft for registration, the term (1 or 2 years), and a WHOIS-privacy flag that is always true on drafts.",
      "The current stub does not collect registrant contact details (name, organization, email, postal address, or phone). Planned live registrations will require registrar contact data.",
      "Gateway basics: your API key identifier and timestamps.",
    ],
    handlingHeading: "What we do with it — fulfillment provider",
    handling: [
      "Nothing is forwarded anywhere today. The registrar (OpenSRS / Tucows reseller track is the planned provider) is not wired up, and no reseller agreement is in place. Because the gateway is a stub, do not submit real registrant contact data until a live registrar integration and durable storage exist. WHOIS privacy is planned for live registrations; the stub’s `whoisPrivacy: true` flag does not hide anything in a public WHOIS database.",
    ],
    service: [
      "DomainSend is provided by Telep IO LLC through the Telep Muse gateway. The current gateway is a demo stub: availability checks are simulated and no domains are registered, transferred, or renewed.",
      "Planned live semantics: an agent drafts a registration for 1–2 year terms on supported TLDs (.com, .net, .org, .io, .dev, .app, .tools), a human reviews the exact domain, term, registrant details, and price, the human pays, and only then would the registration be submitted to the registrar. WHOIS privacy is planned to be included; it is not applied on the stub.",
    ],
    pricing: [
      "$14.99/year for .com (planned). Other planned list prices on the stub: .net $14.99, .org $13.99, .io $39.99, .dev $14.99, .app $19.99, .tools $29.99; 1–2 year terms only. No charge is collected by the current stub. A shared Stripe Checkout helper exists on the gateway but stays in stub mode unless a Stripe secret is configured.",
    ],
    acceptableUse: [
      "Agents may create drafts. Humans must review and pay before any registration is submitted. No exceptions.",
      "No bad-faith registrations: no cybersquatting, typosquatting, or registering domains to impersonate, defraud, or infringe trademarks.",
      "No bulk speculative domain warehousing through this connector.",
    ],
    stub: [
      "The current gateway is a demo stub. Do not rely on DomainSend to secure a domain name until a production launch is announced — a name shown “available” here may not be available in reality. Status “active” on the stub is an internal demo transition, not a registrar confirmation.",
    ],
    warranty: [
      "Software is provided as-is. Availability checks and statuses are Telep’s internal stub states, not registrar confirmations.",
    ],
  }),
};
