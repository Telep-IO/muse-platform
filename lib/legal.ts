export interface LegalSection {
  heading: string;
  /** Paragraphs; items starting with "- " render as bullet list items. */
  body: string[];
}

export interface ConnectorLegal {
  privacy: LegalSection[];
  terms: LegalSection[];
}

export const LEGAL_UPDATED = "21 September 2026";
export const LEGAL_DISCLAIMER =
  "Plain-language product notice maintained by Telep IO — not legal advice.";

const KEYS_SECTION: LegalSection = {
  heading: "Keys",
  body: [
    "Bearer API keys authenticate agents. Treat them as secrets. Telep IO can revoke a key by removing it from the gateway configuration.",
  ],
};

type MuseFiling = "submitted" | "pending";

type LegalInput = {
  name: string;
  whatItDoes: string[];
  collects: string[];
  handlingHeading?: string;
  handling: string[];
  retentionExtra?: string;
  service: string[];
  extraTerms?: LegalSection[];
  pricing: string[];
  acceptableUse: string[];
  stub: string[];
  warranty: string[];
  museFiling: MuseFiling;
};

function bullets(items: string[]): string[] {
  return items.map((item) => (item.startsWith("- ") ? item : `- ${item}`));
}

function metaIndependence(name: string, filing: MuseFiling): LegalSection {
  if (filing === "submitted") {
    return {
      heading: "Meta independence",
      body: [
        `Telep’s catalog status for ${name} is “submitted”: Telep filed it for Meta Muse connector review. “Submitted” means Telep filed paperwork; it is not approved, featured, or partnered. Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on ${name}.`,
      ],
    };
  }
  return {
    heading: "Meta independence",
    body: [
      `Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on ${name}. This connector is prepared for Muse submission; filing is not approval.`,
    ],
  };
}

function retentionSection(extra?: string): LegalSection {
  return {
    heading: "Retention",
    body: [
      "Gateway state is in-memory and ephemeral: it disappears when the serverless instance recycles. There is no durable database on the gateway.",
      ...(extra ? [extra] : []),
    ],
  };
}

function buildLegal(input: LegalInput): ConnectorLegal {
  return {
    privacy: [
      { heading: `What ${input.name} does`, body: input.whatItDoes },
      {
        heading: "What we collect",
        body: bullets([
          ...input.collects,
          "Standard web logs (IP, user agent, request path) from the host/CDN.",
          "We do not sell personal information or run advertising pixels.",
        ]),
      },
      {
        heading: input.handlingHeading ?? "What we do with it",
        body: input.handling,
      },
      retentionSection(input.retentionExtra),
      KEYS_SECTION,
    ],
    terms: [
      { heading: "The service", body: input.service },
      ...(input.extraTerms ?? []),
      { heading: "Pricing", body: input.pricing },
      {
        heading: "Acceptable use",
        body: bullets(["No sharing of API keys.", ...input.acceptableUse]),
      },
      { heading: "Demo / stub status", body: input.stub },
      metaIndependence(input.name, input.museFiling),
      { heading: "No warranty", body: input.warranty },
    ],
  };
}

export const connectorLegal: Record<string, ConnectorLegal> = {
  "paper-send": buildLegal({
    name: "PaperSend",
    museFiling: "submitted",
    whatItDoes: [
      "PaperSend turns a PDF into a physical letter: printed, put in an envelope, and mailed First Class in the US.",
      "The Muse gateway job endpoints are stubs: creating a job does not mail anything, charge anyone, or call a print provider. Live printing and mailing are handled by the separate PaperSend application, not the gateway.",
    ],
    collects: [
      "Document metadata you send us: filename and page count (1–5 pages). The gateway stub does not store PDF bytes.",
      "Sender and recipient addresses: name, street address, city, state, ZIP — everything needed to address a letter.",
      "Job metadata: timestamps, status, quoted price, and your API key identifier.",
    ],
    handling: [
      "Gateway stub jobs go nowhere: they are stored in-memory on the gateway and never forwarded to a print or mail provider. No provider is wired to the gateway stubs today. If you use the separate PaperSend application, its own privacy notice governs how documents and addresses are handled there — the gateway and the app are different services.",
    ],
    retentionExtra:
      "Do not submit live customer documents or addresses to the gateway stubs until a durable store and a provider contract exist.",
    service: [
      "PaperSend is a PDF-to-physical-mail connector operated by Telep IO LLC. Through Muse, an agent can draft a mail job and read its status.",
      "The gateway endpoints are stubs: creating a job does not print a letter, mail a letter, charge a card, or bind a mail provider. Actual fulfillment happens in the separate PaperSend application, which is a different service with its own terms.",
    ],
    pricing: [
      "Planned pricing is $4.99 for the first page, $0.25 for each additional page, US letter, 1–5 pages. Prices are planned, not yet charged through the gateway. Live pricing is confirmed at the point of payment in the PaperSend application.",
    ],
    acceptableUse: [
      "No unsolicited bulk mail, fraud, harassment, or illegal content.",
      "Agents may create drafts; humans must review the exact document, recipient, and price, and pay, before anything mails. The agent cannot and does not authorize mailing on its own.",
    ],
    stub: [
      "Everything on the gateway today is a demo. Gateway jobs are created with status “stubbed” (the type also allows draft/queued). Those labels do not mean a letter was mailed. Do not rely on gateway job status as proof of mailing. Mailed means confirmed by the PaperSend application or the mail provider — nothing else.",
    ],
    warranty: [
      "The service is provided as-is. Telep IO makes no guarantee that a gateway job will result in a mailed letter, or that any status shown is current.",
    ],
  }),

  sumvid: buildLegal({
    name: "Sumvid",
    museFiling: "pending",
    whatItDoes: [
      "Sumvid summarizes videos: you give it a video URL (typically YouTube) and it returns an AI-generated summary.",
      "The Muse gateway endpoints are stubs: summaries are hashed from the URL in-memory, no captions are fetched, and no paid AI API is called. Real summarization happens in the Sumvid product, which is a separate service.",
    ],
    collects: [
      "Video URLs: the links you submit for summarization.",
      "Generated stub summaries: the placeholder text the gateway returns for a URL.",
      "Job metadata: timestamps, status, and your API key identifier.",
    ],
    handling: [
      "Gateway stub summaries go nowhere: they are generated in-memory from the URL and never sent to YouTube, to an AI provider, or to any third party. No video-fetching or AI provider is wired to the gateway stubs today. If you use the Sumvid product, its own privacy notice governs that service.",
    ],
    service: [
      "Sumvid is a video-summarization connector operated by Telep IO LLC. Through Muse, an agent can request a summary of a video URL and read it back.",
      "The gateway endpoints are stubs: they return deterministic placeholder summaries derived from the URL. They do not fetch video content, captions, or transcripts, and they do not call an AI service. Real summarization happens in the Sumvid product, a separate service with its own terms.",
    ],
    pricing: [
      "See the Sumvid product for current pricing. No payment is collected through the gateway stubs.",
    ],
    acceptableUse: [
      "Submit only URLs you have the right to have summarized. Do not use the service to circumvent access controls, paywalls, or copyright protections.",
      "Agents may request summaries; stub summaries are placeholders and should never be treated as an account of what a video says.",
    ],
    stub: [
      "Everything on the gateway today is a demo. Stub summaries are placeholders, not real summaries of the video’s content. Do not treat a gateway summary as an accurate account of what a video says.",
    ],
    warranty: [
      "The service is provided as-is. Telep IO makes no guarantee about the accuracy, completeness, or availability of summaries.",
    ],
  }),

  shipsignal: buildLegal({
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

  "sign-send": buildLegal({
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

  "fax-send": buildLegal({
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

  "call-send": buildLegal({
    name: "CallSend",
    museFiling: "pending",
    whatItDoes: [
      "CallSend is a planned scripted-call connector: it is meant to place phone calls that read a human-approved, verbatim text-to-speech script — a notification call, not an autonomous conversation.",
      "The current gateway is a demo stub. No calls are placed. The agent may draft the exact script; a human is required to review every word and pay before any live call would be placed.",
    ],
    collects: [
      "Destination phone number you designate for the call.",
      "The exact script you approve — the words a live call would speak.",
      "Call job fields: status (draft, paid, queued, completed, failed), timestamps, voice label, and an unused `record` boolean. The stub does not store call duration and does not capture audio.",
      "Gateway metadata: your API key identifier.",
    ],
    handlingHeading: "Fulfillment provider",
    handling: [
      "Planned provider: Twilio (Voice API). Operator-reported status: a Twilio account is provisioned with a 216 (Cleveland) local voice number. The exact number is not published here. SHAKEN/STIR attestation, CNAM (“Telep IO LLC”) caller ID, and API wiring are in progress — not live. Until announced live, no calls are placed. When live, the destination number and script would be transmitted to Twilio to place the call, subject to Twilio’s own terms and privacy policy.",
    ],
    retentionExtra:
      "Once provider fulfillment is live, retention terms will be updated to describe durable call records (status, timestamps — never audio) and deletion policy.",
    service: [
      "CallSend is operated by Telep IO LLC and offered through the Telep Muse catalog (https://muse.telep.io) and API gateway (https://api.muse.telep.io).",
      "The current gateway is a demo stub: creating a call job does not place a call, does not charge a card, and does not bind Twilio.",
    ],
    extraTerms: [
      {
        heading: "How calls are planned to work (trust rule)",
        body: [
          "The agent drafts; the human decides. A live call would require: (1) a human reviewing the exact verbatim script, (2) a human confirming the destination number, (3) payment before the call is placed. CallSend is not an autonomous conversation agent: it would not improvise or extend the script, and it would not call numbers that were not explicitly approved for that call.",
        ],
      },
      {
        heading: "Wiring status",
        body: [
          "Twilio account provisioning is reported in progress with a 216 Cleveland local number. SHAKEN/STIR attestation, CNAM caller ID, and API wiring are not complete. Until live status is announced, no calls are placed and no deliverability claims apply.",
        ],
      },
    ],
    pricing: [
      "Planned pricing: $0.99 per call. Not yet collected. A shared Stripe Checkout helper exists on the gateway but stays in stub mode unless a Stripe secret is configured. Final pricing and any duration or retry terms will be published before live billing begins.",
    ],
    acceptableUse: [
      "No unsolicited bulk calling, robocall campaigns, telemarketing, or calls to people who have not consented to be called.",
      "No fraud, impersonation, phishing, or unlawful content in scripts.",
      "The caller must have a lawful basis for each call (e.g., the recipient requested the notification).",
    ],
    stub: [
      "The current gateway is a demo stub. Statuses such as queued or completed are internal demo transitions, not evidence that a phone rang. Do not rely on CallSend for time-sensitive notifications until a production launch is announced.",
    ],
    warranty: [
      "Software is provided as-is. Telep does not guarantee call completion, answer rates, or TTS pronunciation. Status badges are Telep’s internal states. Telep is not liable for the content of human-approved scripts.",
    ],
  }),

  "ink-send": buildLegal({
    name: "InkSend",
    museFiling: "pending",
    whatItDoes: [
      "InkSend is a Telep IO LLC connector on the Telep Muse gateway. It drafts robot-handwritten letters and cards to be printed and mailed.",
      "The current gateway is a demo stub — it does not mail anything.",
    ],
    collects: [
      "The letter payload you send: message text, card style choice (plain, thank-you, condolence, holiday), and the recipient postal address. The stub does not collect a sender address.",
      "Gateway basics: your API key identifier and timestamps.",
    ],
    handlingHeading: "What we do with it — fulfillment provider",
    handling: [
      "Nothing is forwarded anywhere today. The fulfillment provider (Handwrytten is the planned provider) is not wired up, and the partner/resale terms are not yet confirmed. Because the gateway is a stub, do not submit live customer letters or addresses until a real provider contract and durable storage exist.",
    ],
    service: [
      "InkSend is provided by Telep IO LLC through the Telep Muse gateway. The current gateway is a demo stub: creating a letter does not print, mail, or charge for anything.",
      "Planned live semantics: an agent drafts a letter, a human reviews the exact message, recipient address, card choice, and price, the human pays, and only then would the letter be accepted for mailing. Status “sent” on the stub means the demo transition ran — it does not mean accepted for mailing, and it does not mean delivered (First Class mail is untracked).",
    ],
    pricing: [
      "$3.99 per letter (planned). No charge is collected by the current stub. A shared Stripe Checkout helper exists on the gateway but stays in stub mode unless a Stripe secret is configured.",
    ],
    acceptableUse: [
      "Agents may create drafts. Humans must review and pay before anything is mailed. No exceptions.",
      "No harassment, threats, fraud, impersonation, or illegal content in letter text.",
      "No unsolicited bulk mail campaigns.",
    ],
    stub: [
      "The current gateway is a demo stub. Provider fulfillment is not connected. Do not rely on InkSend for time-sensitive or legally significant mail until a production launch is announced.",
    ],
    warranty: [
      "Software is provided as-is. Status values are Telep’s internal states, not provider confirmations.",
    ],
  }),

  "domain-send": buildLegal({
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

  "ship-label": {
    privacy: [
      {
        heading: "What ShipLabel does",
        body: [
          "ShipLabel drafts a USPS shipping label from a sender address, a recipient address, and parcel weight and dimensions. A person reviews the USPS rate and pays postage plus a service fee through Stripe. EasyPost then purchases the label and returns tracking.",
          "Demo mode returns stub rates and a stub label. Demo mode does not contact EasyPost or Stripe.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Sender and recipient names and US postal addresses, plus parcel weight and dimensions.",
          "- The selected USPS rate, postage amount, service fee, Stripe payment reference, EasyPost shipment id, label URL, and tracking code after a paid purchase.",
          "- Standard web logs (IP, user agent, request path) from the host/CDN.",
          "- We do not sell personal information or run advertising pixels. We do not receive full card numbers.",
        ],
      },
      {
        heading: "What we do with it",
        body: [
          "In test and live mode, addresses and parcel details are sent to EasyPost to rate-shop USPS before payment. That call does not buy postage. After Stripe reports payment_status paid, EasyPost receives the buy request. UPS and FedEx are not requested.",
          "Demo mode keeps the draft in the connector's local store and does not send it to EasyPost or Stripe. The fulfillment service, when used, stores drafts and claims in its own database (SQLite locally, Postgres in production), separate from the gateway's in-memory stubs for other connectors.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Paid drafts are kept so a retry cannot buy a second label and so the label URL and tracking code can be read back. Contact jon@telep.io about access or deletion. Deletion cannot recall a label EasyPost has already bought.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Bearer API keys authenticate agents. Treat them as secrets. Telep IO can revoke a key by removing it from the gateway configuration.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "ShipLabel is a USPS label connector operated by Telep IO LLC. An agent may draft a shipment. A human reviews the rate and pays. EasyPost buys postage only after that payment.",
        ],
      },
      {
        heading: "USPS only",
        body: [
          "Launch scope is USPS. UPS is excluded because UPS DAP §4.2 does not permit marking up UPS rates to resell labels, and UPS DAP §4.5 requires a direct UPS agreement plus UPS written consent for platform enrollment. FedEx is excluded because FedEx by Default §3.2 does not permit selling, assigning, or transferring the benefit of pricing to any other party.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "The customer total is the EasyPost USPS postage for the selected rate plus a service fee. The default service fee is $1.99. Postage is a pass-through of the rate EasyPost returns at checkout. The Forge per-label platform fee comes from the Forge Order Form and is not guessed. Live mode is not available until that Order Form is in place.",
        ],
      },
      {
        heading: "Void and refunds",
        body: [
          "Cancel submits an EasyPost refund request. USPS decides whether unused postage is refunded. A scanned label is generally not voidable. The ShipLabel service fee is not refunded once a label has been purchased. Demo voids do not contact EasyPost.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No sharing of API keys.",
          "- No prohibited goods, fraud, or shipments you are not allowed to send.",
          "- Agents may draft and read status. Humans review the rate and pay before postage is purchased.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "Demo mode is a stub: rates and labels are placeholders. A stub label is not postage and not carrier tracking. Do not treat demo status as proof that USPS accepted a package.",
        ],
      },
      {
        heading: "Meta independence",
        body: [
          "Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on ShipLabel. This connector is prepared for Muse submission; filing is not approval.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "The service is provided as-is. Telep IO does not guarantee carrier acceptance, delivery time, or a refund of postage.",
        ],
      },
    ],
  },
};

export function getConnectorLegal(slug: string): ConnectorLegal | undefined {
  return connectorLegal[slug];
}
