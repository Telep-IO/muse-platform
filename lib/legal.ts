export interface LegalSection {
  heading: string;
  /** Paragraphs; items starting with "- " render as bullet list items. */
  body: string[];
}

export interface ConnectorLegal {
  privacy: LegalSection[];
  terms: LegalSection[];
}

/**
 * Per-connector privacy policies and terms of service.
 * Rendered at /connectors/{slug}/privacy and /connectors/{slug}/terms.
 * Plain-language product notices maintained by Telep IO.
 */
export const connectorLegal: Record<string, ConnectorLegal> = {
  "paper-send": {
    privacy: [
      {
        heading: "What PaperSend does",
        body: [
          "PaperSend turns a PDF into a physical letter: printed, put in an envelope, and mailed First Class in the US.",
          "The Muse gateway job endpoints are stubs: creating a job does not mail anything, charge anyone, or call a print provider. Live printing and mailing are handled by the separate PaperSend application, not the gateway.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- The PDF you submit (or its metadata, depending on the endpoint you use).",
          "- Sender and recipient addresses: name, street address, city, state, ZIP — everything needed to address a letter.",
          "- Job metadata: timestamps, page count, status transitions, and your API key identifier.",
          "- Standard web logs (IP, user agent, request path) from the host/CDN.",
        ],
      },
      {
        heading: "What we do with it",
        body: [
          "Gateway stub jobs go nowhere: they are stored in-memory on the gateway and never forwarded to a print or mail provider. No provider is wired to the gateway stubs today. If you use the separate PaperSend application, its own privacy notice governs how documents and addresses are handled there — the gateway and the app are different services.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Gateway job state is in-memory and ephemeral: it disappears when the serverless instance recycles. There is no durable job database on the gateway. Do not submit live customer documents or addresses to the gateway stubs until a durable store and a provider contract exist.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Bearer <redacted> keys authenticate agents. Treat them as secrets. Telep IO can revoke a key by removing it from the gateway configuration.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "PaperSend is a PDF-to-physical-mail connector operated by Telep IO LLC. Through Muse, an agent can draft a mail job and read its status. The gateway endpoints are stubs: creating a job does not print a letter, mail a letter, charge a card, or bind a mail provider. Actual fulfillment happens in the separate PaperSend application, which is a different service with its own terms.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "Planned pricing is $4.99 for the first page, $0.25 for each additional page, US letter, 1–5 pages. Prices are planned, not yet charged through the gateway. Live pricing is confirmed at the point of payment in the PaperSend application.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No unsolicited bulk mail, fraud, harassment, or illegal content.",
          "- No sharing of API keys.",
          "- Agents may create drafts; humans must review the exact document, recipient, and price, and pay, before anything mails. The agent cannot and does not authorize mailing on its own.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "Everything on the gateway today is a demo: statuses like draft, paid, and sent on the gateway do not mean a letter was mailed. Do not rely on gateway job status as proof of mailing. Mailed means confirmed by the PaperSend application or the mail provider — nothing else.",
        ],
      },
      {
        heading: "Meta independence",
        body: [
          "PaperSend has been submitted to Meta for Muse connector review. “Submitted” means Telep IO filed the paperwork; it is not approved, featured, or partnered. Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on PaperSend.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "The service is provided as-is. Telep IO makes no guarantee that a gateway job will result in a mailed letter, or that any status shown is current.",
        ],
      },
    ],
  },

  sumvid: {
    privacy: [
      {
        heading: "What Sumvid does",
        body: [
          "Sumvid summarizes videos: you give it a video URL (typically YouTube) and it returns an AI-generated summary.",
          "The Muse gateway endpoints are stubs: summaries are hashed from the URL in-memory, no captions are fetched, and no paid AI API is called. Real summarization happens in the Sumvid product at sumvid.app, which is a separate service.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Video URLs: the links you submit for summarization.",
          "- Generated summaries: the text the gateway returns for a URL.",
          "- Job metadata: timestamps, status, and your API key identifier.",
          "- Standard web logs (IP, user agent, request path) from the host/CDN.",
        ],
      },
      {
        heading: "What we do with it",
        body: [
          "Gateway stub summaries go nowhere: they are generated in-memory from the URL and never sent to YouTube, to an AI provider, or to any third party. No video-fetching or AI provider is wired to the gateway stubs today. If you use sumvid.app, its own privacy notice governs that service.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Gateway state is in-memory and ephemeral: it disappears when the serverless instance recycles. There is no durable database of URLs or summaries on the gateway.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Bearer <redacted> keys authenticate agents. Treat them as secrets. Telep IO can revoke a key by removing it from the gateway configuration.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "Sumvid is a video-summarization connector operated by Telep IO LLC. Through Muse, an agent can request a summary of a video URL and read it back. The gateway endpoints are stubs: they return deterministic placeholder summaries derived from the URL. They do not fetch video content, captions, or transcripts, and they do not call an AI service. Real summarization happens in the Sumvid product at sumvid.app, a separate service with its own terms.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "See the Sumvid product for current pricing. No payment is collected through the gateway stubs.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No sharing of API keys.",
          "- Submit only URLs you have the right to have summarized. Do not use the service to circumvent access controls, paywalls, or copyright protections.",
          "- Agents may request summaries; summaries are informational only and should be verified against the source video before being acted on.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "Everything on the gateway today is a demo. Stub summaries are placeholders, not real summaries of the video's content. Do not treat a gateway summary as an accurate account of what a video says.",
        ],
      },
      {
        heading: "Meta independence",
        body: [
          "Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on Sumvid.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "The service is provided as-is. Telep IO makes no guarantee about the accuracy, completeness, or availability of summaries.",
        ],
      },
    ],
  },

  shipsignal: {
    privacy: [
      {
        heading: "What ShipSignal does",
        body: [
          "ShipSignal tracks packages across carriers: you give it a tracking number and it returns a delivery timeline.",
          "The Muse gateway endpoints are stubs: timelines are hashed from the tracking number in-memory, and no carrier API (UPS, USPS, FedEx, DHL, or any other) is called. Real tracking happens in the ShipSignal product, which is a separate service.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Tracking numbers: the numbers you submit for tracking.",
          "- Parcel timelines: the status events the gateway returns for a tracking number.",
          "- Job metadata: timestamps, carrier guesses, watch flags, and your API key identifier.",
          "- Standard web logs (IP, user agent, request path) from the host/CDN.",
        ],
      },
      {
        heading: "What we do with it",
        body: [
          "Gateway stub timelines go nowhere: they are generated in-memory from the tracking number and never sent to a carrier or any third party. No carrier API is wired to the gateway stubs today. If you use the ShipSignal product, its own privacy notice governs that service.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Gateway state is in-memory and ephemeral: it disappears when the serverless instance recycles. There is no durable database of tracking numbers or timelines on the gateway.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Bearer <redacted> keys authenticate agents. Treat them as secrets. Telep IO can revoke a key by removing it from the gateway configuration.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "ShipSignal is a multi-carrier package-tracking connector operated by Telep IO LLC. Through Muse, an agent can submit a tracking number, read its timeline, and set watch flags. The gateway endpoints are stubs: they return deterministic placeholder timelines derived from the tracking number. They do not query UPS, USPS, FedEx, DHL, or any carrier, and the data shown is not real tracking information. Real tracking happens in the ShipSignal product, a separate service with its own terms.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "See the ShipSignal product for current pricing. No payment is collected through the gateway stubs.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No sharing of API keys.",
          "- Submit only tracking numbers you have a legitimate reason to track. Do not use the service for surveillance, stalking, or any unlawful purpose.",
          "- Agents may request timelines; timelines are informational only and should be verified with the carrier before being acted on.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "Everything on the gateway today is a demo. Stub timelines are placeholders, not the real location or status of a package. Do not treat a gateway timeline as proof of where a parcel is or when it will arrive.",
        ],
      },
      {
        heading: "Meta independence",
        body: [
          "Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on ShipSignal.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "The service is provided as-is. Telep IO makes no guarantee about the accuracy, completeness, or availability of tracking data.",
        ],
      },
    ],
  },

  "sign-send": {
    privacy: [
      {
        heading: "What SignSend does",
        body: [
          "SignSend prepares e-signature envelopes for Muse users: the agent drafts an envelope (document, signers, signing order), a human reviews and pays, and a fulfillment provider sends the signature requests.",
          "The current gateway is a demo stub — no signature requests are sent to any provider yet.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Document metadata you send us: file names, page counts (up to 5 pages per envelope), signer order.",
          "- Signer details you send us: names and email addresses of the 1–5 signers you designate.",
          "- Document contents: the PDF you intend to be signed, stored in the ephemeral job store while the envelope is open.",
          "- Gateway metadata: your API key identifier, request path, timestamps, envelope status. Standard web logs (IP, user agent) from the host/CDN.",
          "- We do not collect marketing data, sell personal information, or run advertising pixels.",
        ],
      },
      {
        heading: "Fulfillment provider",
        body: [
          "Planned provider: DocuSign (eSignature API). Status: Telep IO has applied to the DocuSign Partner Program; the integration is not wired yet. When it is live, signer names, emails, and documents will be transmitted to DocuSign to send and process signature requests, subject to DocuSign's own terms and privacy policy. Until then, nothing leaves the gateway stub.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "The current job store is in-memory and ephemeral — envelope drafts and uploaded documents are lost when the serverless function recycles. Do not treat the stub as document storage. Once provider fulfillment is live, retention terms will be updated to describe durable storage, document copies held by the provider, and deletion on envelope completion.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Agents authenticate with Bearer <redacted> API keys. Treat keys as secrets; never share them. Telep operators revoke keys by removing them from the gateway key list.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "SignSend is operated by Telep IO LLC and offered through the Telep Muse catalog (https://muse.telep.io) and API gateway (https://api.muse.telep.io). It is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on this connector.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "The current gateway is a demo stub: creating an envelope does not send signature requests, does not charge a card, and does not bind a fulfillment provider. Do not use it for documents that need legally binding signatures until provider fulfillment is live and announced.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "Planned pricing: $2.99 per envelope (1–5 sequential signers, up to 5 pages). Not yet collected. Final pricing, payment method (Stripe), and any envelope overage terms will be published before live billing begins.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- Agents may draft envelopes; humans must review the exact document, signers, and order, and pay before anything is sent.",
          "- No fraud, forgery, impersonation, or unlawful documents.",
          "- No sharing of API keys.",
          "- Signers must be real people who have agreed to sign.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "Software is provided as-is. Status badges are Telep's internal states. “Submitted” means Telep filed the connector for Meta review, not that Muse users can see it. Telep is not liable for documents that fail to collect signatures or for the legal validity of signatures collected through third-party providers.",
        ],
      },
    ],
  },

  "fax-send": {
    privacy: [
      {
        heading: "What FaxSend does",
        body: [
          "FaxSend prepares outbound fax jobs for Muse users: the agent drafts a fax (document, destination number, optional cover page), a human reviews and pays, and a fulfillment provider transmits it.",
          "The current gateway is a demo stub — no faxes are transmitted yet.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Document metadata you send us: file names, page counts (up to 10 document pages plus an optional billable cover page).",
          "- Destination fax number you designate.",
          "- Document contents: the PDF to be faxed, stored in the ephemeral job store while the job is open.",
          "- Gateway metadata: your API key identifier, request path, timestamps, job status. Standard web logs (IP, user agent) from the host/CDN.",
          "- We do not collect marketing data, sell personal information, or run advertising pixels.",
        ],
      },
      {
        heading: "Fulfillment provider",
        body: [
          "Planned provider: Sinch Fax API v3 (formerly Phaxio). Status: not wired yet. When live, the document and destination number will be transmitted to Sinch to place the fax call, subject to Sinch's own terms and privacy policy. Until then, nothing leaves the gateway stub.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "The current job store is in-memory and ephemeral — fax drafts and uploaded documents are lost when the serverless function recycles. Do not treat the stub as document storage. Once provider fulfillment is live, retention terms will be updated to describe transmission records, provider-side copies, and deletion policy.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Agents authenticate with Bearer <redacted> API keys. Treat keys as secrets; never share them. Telep operators revoke keys by removing them from the gateway key list.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "FaxSend is operated by Telep IO LLC and offered through the Telep Muse catalog (https://muse.telep.io) and API gateway (https://api.muse.telep.io). It is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on this connector.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "The current gateway is a demo stub: creating a fax job does not transmit a fax, does not charge a card, and does not bind a fulfillment provider. Do not rely on it to deliver time-sensitive or legally required documents.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "Planned pricing: $0.99 per transmitted page; an optional cover page counts as a billable page. Not yet collected. Final pricing, payment method (Stripe), and overage terms will be published before live billing begins.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- Agents may draft faxes; humans must review the exact document and destination number, and pay before anything is transmitted.",
          "- No unsolicited bulk faxing (junk fax), fraud, or unlawful content.",
          "- No sharing of API keys.",
          "- The destination number must belong to a recipient who expects the fax or a context where faxing is lawful.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "Software is provided as-is. Telep does not guarantee delivery time, transmission success, or legibility at the receiving machine. Status badges are Telep's internal states. “Submitted” means Telep filed the connector for Meta review, not that Muse users can see it.",
        ],
      },
    ],
  },

  "call-send": {
    privacy: [
      {
        heading: "What CallSend does",
        body: [
          "CallSend places phone calls that read a human-approved, verbatim text-to-speech script — it is a scripted notification call, not an autonomous conversation.",
          "The agent drafts the exact script; a human reviews every word and pays before any call is placed.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Destination phone number you designate for the call.",
          "- The exact script you approve — the words the call will speak.",
          "- Call records: call status (queued, completed, failed), duration, timestamps.",
          "- Gateway metadata: your API key identifier, request path. Standard web logs (IP, user agent) from the host/CDN.",
          "- We do not record call audio. We do not collect marketing data, sell personal information, or run advertising pixels.",
        ],
      },
      {
        heading: "Fulfillment provider",
        body: [
          "Provider: Twilio (Voice API). Status: account provisioned with a 216 (Cleveland) local voice number. SHAKEN/STIR attestation and CNAM (“Telep IO LLC”) caller-ID setup are still in progress, and API wiring is not yet live — until announced live, no calls are placed. When live, the destination number and script are transmitted to Twilio to place the call, subject to Twilio's own terms and privacy policy.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "The current job store is in-memory and ephemeral — call drafts and scripts are lost when the serverless function recycles. Once provider fulfillment is live, retention terms will be updated to describe durable call records (status, duration, timestamps — never audio) and deletion policy.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Agents authenticate with Bearer <redacted> API keys. Treat keys as secrets; never share them. Telep operators revoke keys by removing them from the gateway key list.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "CallSend is operated by Telep IO LLC and offered through the Telep Muse catalog (https://muse.telep.io) and API gateway (https://api.muse.telep.io). It is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on this connector.",
        ],
      },
      {
        heading: "How calls work (trust rule)",
        body: [
          "The agent drafts; the human decides. Every call requires: (1) a human reviewing the exact verbatim script, (2) a human confirming the destination number, (3) payment before the call is placed. CallSend never initiates calls autonomously, never improvises or extends the script, and never calls numbers that were not explicitly approved for that call. Calls originate from a 216 (Cleveland) local number with SHAKEN/STIR attestation and “Telep IO LLC” caller ID (deliverability setup in progress).",
        ],
      },
      {
        heading: "Wiring status",
        body: [
          "Twilio provisioning is complete; API wiring is in progress. Until live status is announced, no calls are placed.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "Planned pricing: $0.99 per call. Not yet collected. Final pricing, payment method (Stripe), and any duration or retry terms will be published before live billing begins.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No unsolicited bulk calling, robocall campaigns, telemarketing, or calls to people who have not consented to be called.",
          "- No fraud, impersonation, phishing, or unlawful content in scripts.",
          "- No sharing of API keys.",
          "- The caller must have a lawful basis for each call (e.g., the recipient requested the notification).",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "Software is provided as-is. Telep does not guarantee call completion, answer rates, or TTS pronunciation. Status badges are Telep's internal states. “Submitted” means Telep filed the connector for Meta review, not that Muse users can see it. Telep is not liable for the content of human-approved scripts.",
        ],
      },
    ],
  },

  "ink-send": {
    privacy: [
      {
        heading: "What InkSend does",
        body: [
          "InkSend is a Telep IO LLC connector on the Telep Muse gateway. It drafts robot-handwritten letters and cards to be printed and mailed.",
          "The current gateway is a demo stub — it does not mail anything.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- The letter payload you send: message text, card style choice, and sender and recipient postal addresses.",
          "- Gateway basics: your API key identifier, request path, and timestamps. Standard web logs (IP, user agent, path) from the host/CDN.",
          "- No marketing pixels. No sale of personal information.",
        ],
      },
      {
        heading: "What we do with it — fulfillment provider",
        body: [
          "Nothing is forwarded anywhere today. The fulfillment provider (Handwrytten is the planned provider) is not wired up, and the partner/resale terms are not yet confirmed. Because the gateway is a stub, do not submit live customer letters or addresses until a real provider contract and durable storage exist.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "The letter store is in-memory and ephemeral. Letters and addresses disappear when the service restarts or redeploys. There is no backup and no durable archive.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Bearer <redacted> keys authenticate agents. Treat them as secrets. Telep operators can revoke keys by removing them from the gateway configuration.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "InkSend is provided by Telep IO LLC through the Telep Muse gateway. It is independent of Meta. Listing InkSend here is not a claim that Meta approved, featured, or partnered on it.",
          "InkSend drafts handwritten-style letters and cards. The flow is: an agent drafts a letter, a human reviews the exact message, recipient address, card choice, and price, the human pays, and only then is the letter accepted for mailing. Status “sent” means the letter was accepted for mailing — it does not mean delivered (First Class mail is untracked).",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "$3.99 per letter (planned). No charge is collected by the current stub.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- Agents may create drafts. Humans must review and pay before anything is mailed. No exceptions.",
          "- No harassment, threats, fraud, impersonation, or illegal content in letter text.",
          "- No unsolicited bulk mail campaigns.",
          "- No sharing of API keys.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "The current gateway is a demo stub. Creating a letter does not print, mail, or charge for anything. Provider fulfillment is not connected. Do not rely on InkSend for time-sensitive or legally significant mail until a production launch is announced.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "Software is provided as-is. Status values are Telep's internal states, not provider confirmations.",
        ],
      },
    ],
  },

  "domain-send": {
    privacy: [
      {
        heading: "What DomainSend does",
        body: [
          "DomainSend is a Telep IO LLC connector on the Telep Muse gateway. It checks domain availability and drafts domain registrations.",
          "The current gateway is a demo stub — no domains are actually registered.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- The domain names you query or draft for registration.",
          "- If you draft a registration: registrant contact details (name, organization, email, postal address, phone) as required for registration. WHOIS privacy is included in the plan, so this contact data is intended to be shielded from public WHOIS — but note the stub warning below.",
          "- Gateway basics: your API key identifier, request path, and timestamps. Standard web logs (IP, user agent, path) from the host/CDN.",
          "- No marketing pixels. No sale of personal information.",
        ],
      },
      {
        heading: "What we do with it — fulfillment provider",
        body: [
          "Nothing is forwarded anywhere today. The registrar (OpenSRS reseller track is the planned provider) is not wired up, and no reseller agreement is in place. Because the gateway is a stub, do not submit real registrant contact data until a live registrar integration and durable storage exist.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "The domain store is in-memory and ephemeral. Drafts, queries, and contact data disappear when the service restarts or redeploys. There is no backup and no durable archive.",
        ],
      },
      {
        heading: "Keys",
        body: [
          "Bearer <redacted> keys authenticate agents. Treat them as secrets. Telep operators can revoke keys by removing them from the gateway configuration.",
        ],
      },
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "DomainSend is provided by Telep IO LLC through the Telep Muse gateway. It is independent of Meta. Listing DomainSend here is not a claim that Meta approved, featured, or partnered on it.",
          "DomainSend checks whether a domain name is available and drafts registrations for 1–2 year terms on supported TLDs (.com, .net, .org, .io, .dev, .app, .tools). The flow is: an agent drafts a registration, a human reviews the exact domain, term, registrant details, and price, the human pays, and only then is the registration submitted to the registrar. WHOIS privacy is included.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "$14.99/year for .com (planned). Other TLDs are priced per the current price list; 1–2 year terms only. No charge is collected by the current stub.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- Agents may create drafts. Humans must review and pay before any registration is submitted. No exceptions.",
          "- No bad-faith registrations: no cybersquatting, typosquatting, or registering domains to impersonate, defraud, or infringe trademarks.",
          "- No bulk speculative domain warehousing through this connector.",
          "- No sharing of API keys.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "The current gateway is a demo stub. Availability results are simulated and no domains are registered, transferred, or renewed. Do not rely on DomainSend to secure a domain name until a production launch is announced — a name shown “available” here may not be available in reality.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "Software is provided as-is. Availability checks and statuses are Telep's internal stub states, not registrar confirmations.",
        ],
      },
    ],
  },
};
