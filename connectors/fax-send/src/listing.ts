import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Send faxes from a PDF, with an optional cover page.",
  category: "communications",
  pricingBlurb: "$0.99 per page (planned).",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/fax-send",
  howMuseUsesIt:
    "Muse prepares the fax and destination number. You review the pages and pay before anything is transmitted.",
  examplePrompts: [
    "Fax this PDF to +1-216-555-0100 with a cover sheet that says ‘for records’.",
    "Did my fax to the doctor’s office go through?",
    "Show me my recent faxes.",
  ],
  productNotes: "On the gateway as a stub: faxes, review, and demo state transitions work; provider integration pending.",
  docs: {
    demoNote: "Demo gateway: fax jobs are drafts only — nothing transmits. Planned provider: Sinch Fax API v3 (not wired).",
    createEndpoint: "/v1/fax-send/faxes",
    createExampleBody: '{"to":"+15555550100","document":{"pages":1}}',
  },
  legal: buildLegal({
    name: "FaxSend",
    museFiling: "pending",
    whatItDoes: [
      "FaxSend prepares outbound fax jobs for Muse users: the agent drafts a fax (document metadata, destination number, optional cover page), a human reviews and pays, and a fulfillment provider is planned to transmit it.",
      "The current gateway is a demo stub — no faxes are transmitted yet.",
    ],
    collects: [
      "Document metadata you send us: file names and page counts (up to 10 document pages plus an optional billable cover page). The stub does not store PDF bytes.",
      "Destination fax number you designate.",
      "Gateway metadata: your API key identifier, timestamps, job status.",
    ],
    handlingHeading: "Fulfillment provider",
    handling: [
      "Planned provider: Sinch Fax API v3 (formerly Phaxio). Status: not wired yet. When live, the document and destination number will be transmitted to Sinch to place the fax call, subject to Sinch’s own terms and privacy policy. Until then, nothing leaves the gateway stub.",
    ],
    retentionExtra:
      "Do not treat the stub as document storage. Once provider fulfillment is live, retention terms will be updated to describe transmission records, provider-side copies, and deletion policy.",
    service: [
      "FaxSend is operated by Telep IO LLC and offered through the Telep Muse catalog (https://muse.telep.io) and API gateway (https://api.muse.telep.io).",
      "The current gateway is a demo stub: creating a fax job does not transmit a fax, does not charge a card, and does not bind a fulfillment provider.",
    ],
    pricing: [
      "Planned pricing: $0.99 per transmitted page; an optional cover page counts as a billable page. Not yet collected. A shared Stripe Checkout helper exists on the gateway but stays in stub mode unless a Stripe secret is configured. Final pricing and overage terms will be published before live billing begins.",
    ],
    acceptableUse: [
      "Agents may draft faxes; humans must review the exact document and destination number, and pay before anything is transmitted.",
      "No unsolicited bulk faxing (junk fax), fraud, or unlawful content.",
      "The destination number must belong to a recipient who expects the fax or a context where faxing is lawful.",
    ],
    stub: [
      "The current gateway is a demo stub. Do not rely on it to deliver time-sensitive or legally required documents. Statuses (draft, paid, sending, delivered) are internal demo transitions, not carrier confirmations.",
    ],
    warranty: [
      "Software is provided as-is. Telep does not guarantee delivery time, transmission success, or legibility at the receiving machine. Status badges are Telep’s internal states.",
    ],
  }),
};
