import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "E-signature envelopes: upload a PDF, collect signatures.",
  category: "documents",
  pricingBlurb: "$2.99 per envelope (planned).",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/sign-send",
  howMuseUsesIt:
    "Muse prepares an envelope and signer list. You review the document and pay before any signature request goes out.",
  examplePrompts: [
    "Get this contract signed by Alex at alex@example.com.",
    "Prepare a signature envelope for this PDF and give me a review link.",
    "Has Alex signed the contract yet?",
    "Show me all my pending signature envelopes.",
  ],
  productNotes: "On the gateway as a stub: envelopes, review, and demo state transitions work; provider integration pending.",
  docs: {
    demoNote:
      "Demo gateway: envelopes are drafts only — nothing is sent to a provider. Planned provider: DocuSign (partner-program application in progress, not wired).",
    createEndpoint: "/v1/sign-send/envelopes",
    createExampleBody: '{"signers":[{"name":"example","email":"a@example.com"}]}',
  },
  legal: buildLegal({
    name: "SignSend",
    museFiling: "pending",
    whatItDoes: [
      "SignSend prepares e-signature envelopes for Muse users: the agent drafts an envelope (document metadata, signers, signing order), a human reviews and pays, and a fulfillment provider is planned to send the signature requests.",
      "The current gateway is a demo stub — no signature requests are sent to any provider yet.",
    ],
    collects: [
      "Document metadata you send us: file names and page counts (up to 5 pages per envelope). The stub does not store PDF bytes.",
      "Signer details you send us: names and email addresses of the 1–5 sequential signers you designate.",
      "Gateway metadata: your API key identifier, timestamps, envelope status.",
    ],
    handlingHeading: "Fulfillment provider",
    handling: [
      "Planned provider: DocuSign (eSignature API). Status: partner-program application in progress; the integration is not wired. When it is live, signer names, emails, and documents will be transmitted to DocuSign to send and process signature requests, subject to DocuSign’s own terms and privacy policy. Until then, nothing leaves the gateway stub.",
    ],
    retentionExtra:
      "Do not treat the stub as document storage. Once provider fulfillment is live, retention terms will be updated to describe durable storage, document copies held by the provider, and deletion on envelope completion.",
    service: [
      "SignSend is operated by Telep IO LLC and offered through the Telep Muse catalog (https://muse.telep.io) and API gateway (https://api.muse.telep.io).",
      "The current gateway is a demo stub: creating an envelope does not send signature requests, does not charge a card, and does not bind a fulfillment provider.",
    ],
    pricing: [
      "Planned pricing: $2.99 per envelope (1–5 sequential signers, up to 5 pages). Not yet collected. A shared Stripe Checkout helper exists on the gateway but stays in stub mode unless a Stripe secret is configured. Final pricing and any envelope overage terms will be published before live billing begins.",
    ],
    acceptableUse: [
      "Agents may draft envelopes; humans must review the exact document, signers, and order, and pay before anything is sent.",
      "No fraud, forgery, impersonation, or unlawful documents.",
      "Signers must be real people who have agreed to sign.",
    ],
    stub: [
      "The current gateway is a demo stub. Do not use it for documents that need legally binding signatures until provider fulfillment is live and announced. Envelope statuses (draft, paid, sent, signed) are internal demo transitions, not DocuSign events.",
    ],
    warranty: [
      "Software is provided as-is. Status badges are Telep’s internal states. Telep is not liable for documents that fail to collect signatures or for the legal validity of signatures collected through third-party providers.",
    ],
  }),
};
