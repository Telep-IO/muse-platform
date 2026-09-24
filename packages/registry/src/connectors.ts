import type { Connector } from "./types";

/**
 * Source of truth for the catalog site and gateway routing.
 * Accurate as of 2026-09-20. Do not list BarkMarks or CallCatch as catalog heroes.
 */
export const connectors: Connector[] = [
  {
    slug: "paper-send",
    name: "PaperSend",
    oneLiner: "PDF → physical mail. Print, envelope, and First Class postage in the US.",
    status: "submitted",
    category: "physical-mail",
    pricingBlurb: "$4.99 first page, $0.25 each additional page. US letter, 1–5 pages.",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/paper-send",
    docsPath: "/docs#paper-send",
    apiBasePath: "/v1/paper-send",
    mcpPath: "/mcp/paper-send",
    privacyPath: "/connectors/paper-send/privacy",
    termsPath: "/connectors/paper-send/terms",
    howMuseUsesIt:
      "Muse drafts a letter from a PDF and addresses, then hands you a private review link. You check the rendered pages, confirm, and pay. The agent never skips review or holds a print-provider key.",
    examplePrompts: [
      "Mail this PDF to 1600 Pennsylvania Avenue NW, Washington DC 20500 from my home address.",
      "Prepare a one-page letter to my landlord and give me a review link before anything is printed.",
      "What’s the price to mail a 3-page US Letter PDF?",
      "Show me all my recent mail jobs.",
    ],
    productNotes:
      "First Telep connector submitted to Meta’s Muse Connector Platform. Gateway jobs are stubs until the mail provider is wired here; live print still lives in the PaperSend app. Status ‘submitted’ means Telep filed the connector for Meta review — it is not a Meta partnership, endorsement, or directory listing.",
    gatewayImplemented: true,
  },
  {
    slug: "ship-label",
    name: "ShipLabel",
    oneLiner: "Draft a USPS shipping label, review the rate, and pay postage plus a service fee.",
    status: "submitted",
    category: "logistics",
    pricingBlurb: "USPS postage at the EasyPost rate plus a $1.99 service fee. USPS only.",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/ship-label",
    docsPath: "/connectors/ship-label/docs",
    apiBasePath: "/v1/ship-label",
    mcpPath: "/mcp/ship-label",
    privacyPath: "/connectors/ship-label/privacy",
    termsPath: "/connectors/ship-label/terms",
    howMuseUsesIt:
      "Muse drafts a USPS label from the sender, recipient, and parcel. You review the carrier rate and pay postage plus a service fee. EasyPost buys the label only after that payment. The agent never buys postage on its own.",
    examplePrompts: [
      "Draft a USPS label from my shop to this customer. The box is 2 pounds, 10 by 6 by 4 inches. Show me the rate before anyone pays.",
      "What would this USPS shipment cost, including the service fee?",
      "Open checkout for the Priority rate on that draft. Do not buy the label yourself.",
      "Has the label been issued, and what is the tracking code?",
    ],
    productNotes:
      "Catalog status uses the same pre-listing value as PaperSend (submitted). That badge is not Meta approval, and this change does not file the connector. Demo mode returns stub rates and labels and does not call EasyPost or Stripe. Live labels require Forge enrollment with EasyPost sales; a Developer Plan key is not accepted as live-ready. USPS only — UPS and FedEx are excluded because their programs prohibit third-party resale markups.",
    gatewayImplemented: true,
  },
  {
    slug: "gift-send",
    name: "GiftSend",
    oneLiner: "Draft a digital gift card or prepaid reward, review it, and pay face value plus a service fee.",
    status: "submitted",
    category: "rewards",
    pricingBlurb: "Face value pass-through plus a $2.99 service fee. Gift cards, Visa/Mastercard prepaid, and charity only.",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/gift-send",
    docsPath: "/connectors/gift-send/docs",
    apiBasePath: "/v1/gift-send",
    mcpPath: "/mcp/gift-send",
    privacyPath: "/connectors/gift-send/privacy",
    termsPath: "/connectors/gift-send/terms",
    howMuseUsesIt:
      "Muse drafts a digital gift card or prepaid reward: recipient, amount, brand, and a short message. You review the draft and pay the face value plus a service fee. Tremendous delivers it by email, text, or link only after that payment. The agent never sends the reward on its own.",
    examplePrompts: [
      "Draft a $50 Amazon gift card to ada@example.com with a birthday note. Show me the total before anyone pays.",
      "What prepaid Visa options can I send in the US, and what is the service fee?",
      "Open checkout for that gift draft. Do not send the reward yourself.",
      "Was the reward delivered, and can I still cancel it?",
    ],
    productNotes:
      "Catalog status uses the same pre-listing value as PaperSend (submitted). That badge is not Meta approval, and this change does not file the connector. Demo mode is a stub and does not call Tremendous or Stripe. Live rewards require Tremendous Platform Client registration with Sales; a self-serve API key is not accepted as live-ready. Cash payouts (Venmo, PayPal, ACH, bank) are disabled.",
    gatewayImplemented: true,
  },
  {
    slug: "sumvid",
    name: "Sumvid",
    oneLiner: "Summarize YouTube and other videos for Muse.",
    status: "ready",
    category: "media",
    pricingBlurb: "See the Sumvid product for current pricing.",
    repoUrl: "https://github.com/Telep-IO/sumvid-muse",
    docsPath: "/docs#sumvid",
    apiBasePath: "/v1/sumvid",
    mcpPath: "/mcp/sumvid",
    privacyPath: "/connectors/sumvid/privacy",
    termsPath: "/connectors/sumvid/terms",
    howMuseUsesIt:
      "When you ask Muse to catch you up on a video, it can call Sumvid for a concise summary instead of watching the whole thing in-session.",
    examplePrompts: [
      "Summarize this YouTube video and pull out the three action items.",
      "What’s the thesis of this talk, in six sentences?",
      "Give me the key takeaways from this video.",
    ],
    productNotes:
      "Gateway summaries are in-memory stubs hashed from the YouTube URL. No captions are fetched and no paid summarization API is called. Status ‘ready’ means the module is callable on api.muse.telep.io — not that Meta listed or endorsed it.",
    gatewayImplemented: true,
  },
  {
    slug: "shipsignal",
    name: "ShipSignal",
    oneLiner: "Multi-carrier package tracking for Muse.",
    status: "ready",
    category: "logistics",
    pricingBlurb: "See the ShipSignal product for current pricing.",
    repoUrl: "https://github.com/Telep-IO/shipsignal-muse",
    docsPath: "/docs#shipsignal",
    apiBasePath: "/v1/shipsignal",
    mcpPath: "/mcp/shipsignal",
    privacyPath: "/connectors/shipsignal/privacy",
    termsPath: "/connectors/shipsignal/terms",
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
    gatewayImplemented: true,
  },
  {
    slug: "sign-send",
    name: "SignSend",
    oneLiner: "E-signature envelopes: upload a PDF, collect signatures.",
    status: "building",
    category: "documents",
    pricingBlurb: "$2.99 per envelope (planned).",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/sign-send",
    docsPath: "/docs",
    apiBasePath: "/v1/sign-send",
    mcpPath: "/mcp/sign-send",
    privacyPath: "/connectors/sign-send/privacy",
    termsPath: "/connectors/sign-send/terms",
    howMuseUsesIt:
      "Muse prepares an envelope and signer list. You review the document and pay before any signature request goes out.",
    examplePrompts: [
      "Get this contract signed by Alex at alex@example.com.",
      "Prepare a signature envelope for this PDF and give me a review link.",
      "Has Alex signed the contract yet?",
      "Show me all my pending signature envelopes.",
    ],
    productNotes: "On the gateway as a stub: envelopes, review, and demo state transitions work; provider integration pending.",
    gatewayImplemented: true,
  },
  {
    slug: "fax-send",
    name: "FaxSend",
    oneLiner: "Send faxes from a PDF, with an optional cover page.",
    status: "building",
    category: "communications",
    pricingBlurb: "$0.99 per page (planned).",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/fax-send",
    docsPath: "/docs",
    apiBasePath: "/v1/fax-send",
    mcpPath: "/mcp/fax-send",
    privacyPath: "/connectors/fax-send/privacy",
    termsPath: "/connectors/fax-send/terms",
    howMuseUsesIt:
      "Muse prepares the fax and destination number. You review the pages and pay before anything is transmitted.",
    examplePrompts: [
      "Fax this PDF to +1-216-555-0100 with a cover sheet that says ‘for records’.",
      "Did my fax to the doctor’s office go through?",
      "Show me my recent faxes.",
    ],
    productNotes: "On the gateway as a stub: faxes, review, and demo state transitions work; provider integration pending.",
    gatewayImplemented: true,
  },
  {
    slug: "call-send",
    name: "CallSend",
    oneLiner: "Agent-drafted phone calls with a human-approved verbatim script.",
    status: "planned",
    category: "communications",
    pricingBlurb: "$0.99 per call (planned).",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/call-send",
    docsPath: "/docs",
    apiBasePath: "/v1/call-send",
    mcpPath: "/mcp/call-send",
    privacyPath: "/connectors/call-send/privacy",
    termsPath: "/connectors/call-send/terms",
    howMuseUsesIt:
      "Muse drafts a short script. You read it, edit if needed, and pay before the call is placed.",
    examplePrompts: [
      "Call the pharmacy and read this message verbatim: my prescription should be ready today. Here’s the exact script.",
      "Did my call to the pharmacy complete?",
      "Show me my recent calls.",
    ],
    productNotes: "On the gateway as a stub: calls, review, and demo state transitions work; provider integration pending. Verbatim TTS script only.",
    gatewayImplemented: true,
  },
  {
    slug: "ink-send",
    name: "InkSend",
    oneLiner: "Robot-handwritten letters and cards, mailed for you.",
    status: "planned",
    category: "physical-mail",
    pricingBlurb: "$3.99 per letter (planned).",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/ink-send",
    docsPath: "/docs",
    apiBasePath: "/v1/ink-send",
    mcpPath: "/mcp/ink-send",
    privacyPath: "/connectors/ink-send/privacy",
    termsPath: "/connectors/ink-send/terms",
    howMuseUsesIt:
      "Muse drafts the note. You approve the handwriting preview and address, then pay, before the robot writes and mails it.",
    examplePrompts: [
      "Write a thank-you note to my aunt and mail it in handwriting, not a printed letter.",
      "Has my letter to Aunt Mary been mailed yet?",
      "Show me my recent letters.",
    ],
    productNotes: "On the gateway as a stub: letters, review, and demo state transitions work; provider integration pending.",
    gatewayImplemented: true,
  },
  {
    slug: "domain-send",
    name: "DomainSend",
    oneLiner: "Register a domain name (WHOIS privacy planned).",
    status: "planned",
    category: "identity",
    pricingBlurb: "$14.99 / year for .com (planned).",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/domain-send",
    docsPath: "/docs",
    apiBasePath: "/v1/domain-send",
    mcpPath: "/mcp/domain-send",
    privacyPath: "/connectors/domain-send/privacy",
    termsPath: "/connectors/domain-send/terms",
    howMuseUsesIt:
      "Muse checks availability and prepares a registration. You confirm the name, contacts, and price before anything is purchased.",
    examplePrompts: [
      "Is studio-telep.com available? If so, prepare a registration for me to approve.",
      "Check if telep.tools is available.",
      "Show me the details on my studio-telep.com registration draft.",
    ],
    productNotes: "On the gateway as a stub: availability checks, registration drafts, and demo state transitions work; provider integration pending.",
    gatewayImplemented: true,
  },
  {
    slug: "print-merch",
    name: "PrintMerch",
    oneLiner: "Custom printed merchandise: design, mockups, and a live quote, then Printify after you pay.",
    status: "submitted",
    category: "merchandise",
    pricingBlurb: "Live Printify base + shipping + 25% markup (configurable). Demo uses a labeled fixture and does not bill.",
    repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/print-merch",
    docsPath: "/connectors/print-merch/docs",
    apiBasePath: "/v1/print-merch",
    mcpPath: "/mcp/print-merch",
    privacyPath: "/connectors/print-merch/privacy",
    termsPath: "/connectors/print-merch/terms",
    howMuseUsesIt:
      "Muse picks a product, uploads artwork, and shows mockups with a live quote. You review the design and pay. The order goes to Printify only after that payment.",
    examplePrompts: [
      "Design a mug with this artwork, show me the mockup and the price, and wait for me to pay.",
      "What's the status of my merch order?",
      "Cancel my merch order if it is still on hold.",
    ],
    productNotes:
      "PrintMerch lets Muse design custom printed merchandise — pick a product, upload artwork, preview mockups, and get a live quote. You review the design and pay through Stripe; only then is your order sent to Printify for printing and white-label shipping. Demo mode is fully stubbed and never contacts Printify. You must own or be licensed for any artwork you upload. Status ‘submitted’ means Telep filed the connector for Meta review — it is not a Meta partnership, endorsement, or directory listing.",
    gatewayImplemented: true,
  },
];

const STATUS_ORDER: Record<Connector["status"], number> = {
  ready: 0,
  submitted: 1,
  building: 2,
  planned: 3,
};

export function listConnectors(): Connector[] {
  return [...connectors].sort((a, b) => {
    const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (status !== 0) return status;
    return a.name.localeCompare(b.name);
  });
}

export function getConnector(slug: string): Connector | undefined {
  return connectors.find((connector) => connector.slug === slug);
}

export function filterConnectors(opts: {
  status?: Connector["status"] | "all";
  category?: Connector["category"] | "all";
}): Connector[] {
  return listConnectors().filter((connector) => {
    if (opts.status && opts.status !== "all" && connector.status !== opts.status) {
      return false;
    }
    if (opts.category && opts.category !== "all" && connector.category !== opts.category) {
      return false;
    }
    return true;
  });
}

export function connectorCount(): number {
  return connectors.length;
}
