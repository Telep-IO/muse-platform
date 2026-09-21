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
    repoUrl: "https://github.com/Telep-IO/paper-send",
    docsPath: "/docs#paper-send",
    apiBasePath: "/v1/paper-send",
    mcpPath: "/mcp/paper-send",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse drafts a letter from a PDF and addresses, then hands you a private review link. You check the rendered pages, confirm, and pay. The agent never skips review or holds a print-provider key.",
    examplePrompts: [
      "Mail this PDF to 1600 Pennsylvania Avenue NW, Washington DC 20500 from my home address.",
      "Prepare a one-page letter to my landlord and give me a review link before anything is printed.",
      "What’s the price to mail a 3-page US Letter PDF?",
    ],
    productNotes:
      "First Telep connector submitted to Meta’s Muse Connector Platform. Gateway jobs are stubs until the mail provider is wired here; live print still lives in the PaperSend app. Status ‘submitted’ means Telep filed the connector for Meta review — it is not a Meta partnership, endorsement, or directory listing.",
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
    docsPath: "/docs",
    apiBasePath: "/v1/sumvid",
    mcpPath: "/mcp/sumvid",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "When you ask Muse to catch you up on a video, it can call Sumvid for a concise summary instead of watching the whole thing in-session.",
    examplePrompts: [
      "Summarize this YouTube video and pull out the three action items.",
      "What’s the thesis of this talk, in six sentences?",
    ],
    gatewayImplemented: false,
  },
  {
    slug: "shipsignal",
    name: "ShipSignal",
    oneLiner: "Multi-carrier package tracking for Muse.",
    status: "ready",
    category: "logistics",
    pricingBlurb: "See the ShipSignal product for current pricing.",
    repoUrl: "https://github.com/Telep-IO/shipsignal-muse",
    docsPath: "/docs",
    apiBasePath: "/v1/shipsignal",
    mcpPath: "/mcp/shipsignal",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse looks up a tracking number across carriers and reports where the package is, without you opening a carrier site.",
    examplePrompts: [
      "Where is package 1Z999AA10123456784?",
      "Has my USPS package been delivered yet?",
    ],
    gatewayImplemented: false,
  },
  {
    slug: "sign-send",
    name: "SignSend",
    oneLiner: "E-signature envelopes: upload a PDF, collect signatures.",
    status: "building",
    category: "documents",
    pricingBlurb: "$2.99 per envelope (planned).",
    repoUrl: "https://github.com/Telep-IO/sign-send",
    docsPath: "/docs",
    apiBasePath: "/v1/sign-send",
    mcpPath: "/mcp/sign-send",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse prepares an envelope and signer list. You review the document and pay before any signature request goes out.",
    examplePrompts: [
      "Get this contract signed by Alex at alex@example.com.",
      "Prepare a signature envelope for this PDF and give me a review link.",
    ],
    productNotes: "Scaffold. Provider integration pending. Not live on the gateway yet.",
    gatewayImplemented: false,
  },
  {
    slug: "fax-send",
    name: "FaxSend",
    oneLiner: "Send faxes from a PDF, with an optional cover page.",
    status: "building",
    category: "communications",
    pricingBlurb: "$0.99 per page (planned).",
    repoUrl: "https://github.com/Telep-IO/fax-send",
    docsPath: "/docs",
    apiBasePath: "/v1/fax-send",
    mcpPath: "/mcp/fax-send",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse prepares the fax and destination number. You review the pages and pay before anything is transmitted.",
    examplePrompts: [
      "Fax this PDF to +1-216-555-0100 with a cover sheet that says ‘for records’.",
    ],
    productNotes: "Scaffold. Provider integration pending. Not live on the gateway yet.",
    gatewayImplemented: false,
  },
  {
    slug: "call-send",
    name: "CallSend",
    oneLiner: "Agent-drafted phone calls with a human-approved verbatim script.",
    status: "planned",
    category: "communications",
    pricingBlurb: "$0.99 per call (planned).",
    repoUrl: "https://github.com/Telep-IO/call-send",
    docsPath: "/docs",
    apiBasePath: "/v1/call-send",
    mcpPath: "/mcp/call-send",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse drafts a short script. You read it, edit if needed, and pay before the call is placed.",
    examplePrompts: [
      "Call the pharmacy and ask if my prescription is ready. Here’s the script I want read verbatim.",
    ],
    productNotes: "Planned Muse connector. Scaffold only.",
    gatewayImplemented: false,
  },
  {
    slug: "ink-send",
    name: "InkSend",
    oneLiner: "Robot-handwritten letters and cards, mailed for you.",
    status: "planned",
    category: "physical-mail",
    pricingBlurb: "$3.99 per letter (planned).",
    repoUrl: "https://github.com/Telep-IO/ink-send",
    docsPath: "/docs",
    apiBasePath: "/v1/ink-send",
    mcpPath: "/mcp/ink-send",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse drafts the note. You approve the handwriting preview and address, then pay, before the robot writes and mails it.",
    examplePrompts: [
      "Write a thank-you note to my aunt and mail it in handwriting, not a printed letter.",
    ],
    productNotes: "Planned Muse connector. Scaffold only.",
    gatewayImplemented: false,
  },
  {
    slug: "domain-send",
    name: "DomainSend",
    oneLiner: "Register a domain name (WHOIS privacy included).",
    status: "planned",
    category: "identity",
    pricingBlurb: "$14.99 / year for .com (planned).",
    repoUrl: "https://github.com/Telep-IO/domain-send",
    docsPath: "/docs",
    apiBasePath: "/v1/domain-send",
    mcpPath: "/mcp/domain-send",
    privacyPath: "/privacy",
    termsPath: "/terms",
    howMuseUsesIt:
      "Muse checks availability and prepares a registration. You confirm the name, contacts, and price before anything is purchased.",
    examplePrompts: [
      "Is studio-telep.com available? If so, prepare a registration for me to approve.",
    ],
    productNotes: "Planned Muse connector. Scaffold only.",
    gatewayImplemented: false,
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
