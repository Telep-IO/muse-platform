import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Multi-carrier package tracking for Muse.",
  category: "logistics",
  pricingBlurb: "See the ShipSignal product for current pricing.",
  repoUrl: "https://github.com/Telep-IO/shipsignal-muse",
  howMuseUsesIt:
    "Muse looks up a tracking number across carriers and reports where the package is, without you opening a carrier site.",
  examplePrompts: [
    "Where is package 1Z999AA10123456784?",
    "Has my USPS package been delivered yet?",
    "Watch this tracking number so it stays on my list.",
    "List the packages I’m tracking.",
  ],
  productNotes:
    "Gateway parcels are in-memory stubs. The timeline is hashed from the tracking number; no UPS, USPS, FedEx, or DHL API is called. Status ‘ready’ means the module is callable on api.muse.telep.io — not that Meta listed or endorsed it.",
  docs: {
    demoNote:
      "Demo gateway: parcels are stubs — timelines are hashed from the tracking number; no UPS, USPS, FedEx, or DHL API is called. Watch is an in-memory flag, not a carrier notification.",
    createEndpoint: "/v1/shipsignal/parcels",
    createExampleBody: '{"trackingNumber":"example"}',
  },
  legal: buildLegal({
    name: "ShipSignal",
    museFiling: "pending",
    whatItDoes: [
      "ShipSignal tracks packages across carriers: you give it a tracking number and it returns a delivery timeline.",
      "The Muse gateway endpoints are stubs: timelines are hashed from the tracking number in-memory, and no carrier API (UPS, USPS, FedEx, DHL, or any other) is called. Real tracking happens in the ShipSignal product, which is a separate service.",
    ],
    collects: [
      "Tracking numbers: the numbers you submit for tracking.",
      "Parcel timelines: the placeholder status events the gateway returns for a tracking number.",
      "Job metadata: timestamps, carrier guesses from number shape, watch flags, and your API key identifier.",
    ],
    handling: [
      "Gateway stub timelines go nowhere: they are generated in-memory from the tracking number and never sent to a carrier or any third party. No carrier API is wired to the gateway stubs today. Watch flags stay on the in-memory record; they do not subscribe you to carrier notifications. If you use the ShipSignal product, its own privacy notice governs that service.",
    ],
    service: [
      "ShipSignal is a multi-carrier package-tracking connector operated by Telep IO LLC. Through Muse, an agent can submit a tracking number, read its timeline, and set watch flags.",
      "The gateway endpoints are stubs: they return deterministic placeholder timelines derived from the tracking number. They do not query UPS, USPS, FedEx, DHL, or any carrier, and the data shown is not real tracking information. Real tracking happens in the ShipSignal product, a separate service with its own terms.",
    ],
    pricing: [
      "See the ShipSignal product for current pricing. No payment is collected through the gateway stubs.",
    ],
    acceptableUse: [
      "Submit only tracking numbers you have a legitimate reason to track. Do not use the service for surveillance, stalking, or any unlawful purpose.",
      "Agents may request timelines; stub timelines are placeholders and should be verified with the carrier before being acted on.",
    ],
    stub: [
      "Everything on the gateway today is a demo. Stub timelines are placeholders, not the real location or status of a package. Do not treat a gateway timeline as proof of where a parcel is or when it will arrive.",
    ],
    warranty: [
      "The service is provided as-is. Telep IO makes no guarantee about the accuracy, completeness, or availability of tracking data.",
    ],
  }),
};
