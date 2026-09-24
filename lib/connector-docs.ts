/**
 * Per-connector API & MCP documentation content.
 * Rendered at /connectors/{slug}/docs. Tool list matches the live
 * gateway tools/list output; REST shapes match the OpenAPI documents.
 * Generated 2026-09-22 from the production gateway — keep in sync
 * with the connector packages when tools change.
 */

export interface ConnectorToolParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ConnectorToolDoc {
  name: string;
  description: string;
  params: ConnectorToolParamDoc[];
}

export interface ConnectorDocsSection {
  heading: string;
  paragraphs: string[];
}

export interface ConnectorDocs {
  /** Honest stub disclosure shown at the top of the docs page. */
  demoNote: string;
  /** e.g. "/jobs" — appended to the connector's apiBasePath. */
  createEndpoint: string;
  /** Pretty-printed JSON example body for the create endpoint. */
  createExampleBody: string;
  /** Replaces the generic stub-billing sentence when the connector charges after payment. */
  billingNote?: string;
  extraSections?: ConnectorDocsSection[];
  tools: ConnectorToolDoc[];
}

const DOCS: Record<string, ConnectorDocs> = {
  "ship-label": {
    demoNote:
      "Demo mode returns stub USPS rates and a stub label. It does not call EasyPost or Stripe, and a stub label is not postage. Test and live rate-shop USPS through EasyPost before payment (that does not buy postage). EasyPost buys the label only after Stripe reports payment_status paid.",
    createEndpoint: "/v1/ship-label/shipments",
    createExampleBody:
      "{\n  \"from\": {\n    \"name\": \"Ada Sender\",\n    \"address_line1\": \"185 Berry St\",\n    \"address_city\": \"San Francisco\",\n    \"address_state\": \"CA\",\n    \"address_zip\": \"94107\"\n  },\n  \"to\": {\n    \"name\": \"Grace Recipient\",\n    \"address_line1\": \"1 Telegraph Hill Blvd\",\n    \"address_city\": \"San Francisco\",\n    \"address_state\": \"CA\",\n    \"address_zip\": \"94133\"\n  },\n  \"parcel\": {\n    \"weight_oz\": 16,\n    \"length_in\": 10,\n    \"width_in\": 6,\n    \"height_in\": 4\n  }\n}",
    billingNote:
      "Customer total = EasyPost USPS postage for the selected rate + a $1.99 service fee (SERVICE_FEE_CENTS, default 199). Postage is a pass-through. Demo mode does not bill.",
    extraSections: [
      {
        heading: "What ShipLabel does",
        paragraphs: [
          "ShipLabel lets Muse draft a USPS shipping label from sender, recipient, and parcel details. You review the carrier rate, pay postage plus a service fee through Stripe, and EasyPost purchases and issues the label with tracking.",
          "Tools: create_shipment_draft, get_shipment_rates, buy_shipping_label, get_label, cancel_label, list_shipments, and check_credentials. buy_shipping_label opens checkout. It does not buy postage.",
        ],
      },
      {
        heading: "Modes",
        paragraphs: [
          "demo: offline stubs. Zero HTTP to EasyPost, its sandbox, or Stripe.",
          "test: EasyPost test key and Stripe test key. Buy runs only on a paid webhook.",
          "live: Forge production credentials. Live mode does not boot on the fulfillment service until EASYPOST_ORDER_FORM_REFERENCE is set. A self-serve Developer Plan key is not live-ready. Forge enrollment with EasyPost sales is still required.",
        ],
      },
      {
        heading: "Pricing",
        paragraphs: [
          "total = postage from the selected EasyPost USPS rate, read at runtime, plus the configured service fee. The default fee is $1.99. The Forge per-label platform fee is a separate config value from the Order Form and is not hardcoded. FlexRate, if any, is applied by Forge before the rate we see. This connector does not add a second markup on top of postage.",
        ],
      },
      {
        heading: "USPS only",
        paragraphs: [
          "CARRIER_ALLOWLIST is USPS at both the gateway and the fulfillment service. UPS is excluded because UPS DAP §4.2 does not permit marking up UPS rates to resell labels to another entity or End User, and UPS DAP §4.5 requires a direct UPS agreement plus UPS written consent before a platform enrolls end users. FedEx is excluded because FedEx by Default §3.2 does not permit selling, assigning, or transferring the benefit of pricing to any other party.",
        ],
      },
      {
        heading: "Void and refunds",
        paragraphs: [
          "cancel_label asks EasyPost to refund the shipment. USPS decides whether unused postage comes back. A label that has already been scanned is generally not voidable. The ShipLabel service fee is not refunded once the label has been purchased. Demo cancels do not contact EasyPost.",
        ],
      },
      {
        heading: "EasyPost",
        paragraphs: [
          "Labels are purchased through EasyPost (Forge for live resale). ShipLabel is not EasyPost and not USPS. Tracking codes are the carrier codes EasyPost returns. EasyPost API reference: https://docs.easypost.com. Forge overview: https://support.easypost.com/hc/en-us/articles/34176670288013-Introduction-to-Forge.",
        ],
      },
    ],
    tools: [
      {
        name: "create_shipment_draft",
        description:
          "Draft a USPS label. Returns rates and a quote. Does not buy postage. Demo mode does not call EasyPost.",
        params: [
          { name: "from", type: "object", required: true, description: "Sender postal address" },
          { name: "to", type: "object", required: true, description: "Recipient postal address" },
          { name: "parcel", type: "object", required: true, description: "weight_oz, length_in, width_in, height_in" },
          { name: "carrier_hint", type: "string", required: false, description: "Optional. Only USPS is accepted." },
        ],
      },
      {
        name: "get_shipment_rates",
        description: "Re-list USPS rates for a draft. Does not buy postage.",
        params: [{ name: "draft_id", type: "string", required: true, description: "" }],
      },
      {
        name: "buy_shipping_label",
        description: "Create one Stripe checkout for a draft and rate. Does not buy postage. Repeat calls return 409.",
        params: [
          { name: "draft_id", type: "string", required: true, description: "" },
          { name: "rate_id", type: "string", required: true, description: "A USPS rate id from the draft" },
        ],
      },
      {
        name: "get_label",
        description: "Return label_url, tracking_code, and status.",
        params: [{ name: "label_id", type: "string", required: true, description: "" }],
      },
      {
        name: "cancel_label",
        description: "Void a label through EasyPost in test/live. Demo mode does not call EasyPost.",
        params: [{ name: "label_id", type: "string", required: true, description: "" }],
      },
      {
        name: "list_shipments",
        description: "List drafts created with this API key.",
        params: [],
      },
      {
        name: "check_credentials",
        description: "Read-only EasyPost auth check. Does not buy postage. Demo mode skips the provider.",
        params: [],
      },
    ],
  },
  "paper-send": {
    demoNote: "Demo gateway: creating a job does not print, mail, or charge anything. Jobs are created with status “stubbed”. The live print-and-mail app lives in services/paper-send in this repository; provider fulfillment is not wired into this gateway.",
    createEndpoint: "/v1/paper-send/jobs",
    createExampleBody: "{\n  \"sender\": {\n    \"name\": \"example\",\n    \"address_line1\": \"example\",\n    \"address_line2\": \"example\",\n    \"address_city\": \"example\",\n    \"address_state\": \"example\",\n    \"address_zip\": \"example\"\n  },\n  \"recipient\": {\n    \"name\": \"example\",\n    \"address_line1\": \"example\",\n    \"address_line2\": \"example\",\n    \"address_city\": \"example\",\n    \"address_state\": \"example\",\n    \"address_zip\": \"example\"\n  },\n  \"document\": {\n    \"filename\": \"example\",\n    \"pages\": 1\n  }\n}",
    tools: [
    {
      name: "create_mail_job",
      description: "Create a PaperSend draft job to print and mail a PDF in the US. Returns a review URL. Does not mail anything — the human must review and pay. Gateway fulfillment is currently stubbed.",
      params: [
      { name: "sender", type: "object", required: true, description: "" },
      { name: "recipient", type: "object", required: true, description: "" },
      { name: "document", type: "object", required: false, description: "" }
      ],
    },
    {
      name: "get_job",
      description: "Get a PaperSend job you created on this API key.",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "list_jobs",
      description: "List PaperSend jobs created with this API key.",
      params: [

      ],
    }
    ],
  },
  "sumvid": {
    demoNote: "Demo gateway: summaries are stub summaries hashed from the video URL — no captions are fetched and no paid summarizer is called.",
    createEndpoint: "/v1/sumvid/summaries",
    createExampleBody: "{\n  \"youtubeUrl\": \"example\",\n  \"language\": \"example\"\n}",
    tools: [
    {
      name: "summarize_youtube",
      description: "Create a Sumvid stub summary from a YouTube URL or 11-character video id. Does not fetch captions or call a paid summarizer — the text is hashed from the video id so agents can wire the connector.",
      params: [
      { name: "youtubeUrl", type: "string", required: true, description: "YouTube watch/share URL or 11-character video id" },
      { name: "language", type: "string", required: false, description: "BCP-47 language hint (stub only)" }
      ],
    },
    {
      name: "get_summary",
      description: "Get a Sumvid stub summary created with this API key.",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "get_account",
      description: "Stub Sumvid account for this API key. No real usage is billed.",
      params: [

      ],
    }
    ],
  },
  "shipsignal": {
    demoNote: "Demo gateway: parcels are stubs — timelines are hashed from the tracking number; no UPS, USPS, FedEx, or DHL API is called. Watch is an in-memory flag, not a carrier notification.",
    createEndpoint: "/v1/shipsignal/parcels",
    createExampleBody: "{\n  \"trackingNumber\": \"example\",\n  \"origin\": \"example\",\n  \"destination\": \"example\"\n}",
    tools: [
    {
      name: "track_package",
      description: "Create a ShipSignal stub parcel from a tracking number. The timeline is hashed from the number — no UPS, USPS, FedEx, or DHL API is called.",
      params: [
      { name: "trackingNumber", type: "string", required: true, description: "" },
      { name: "origin", type: "string", required: false, description: "" },
      { name: "destination", type: "string", required: false, description: "" }
      ],
    },
    {
      name: "list_parcels",
      description: "List ShipSignal stub parcels created with this API key.",
      params: [

      ],
    },
    {
      name: "refresh_parcel",
      description: "Recompute the stub timeline from the tracking-number hash. Does not contact a carrier.",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "watch_parcel",
      description: "Mark a stub parcel as watched. No carrier webhooks are registered.",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "unwatch_parcel",
      description: "Stop watching a stub parcel.",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "get_account",
      description: "Stub ShipSignal account for this API key. No real usage is billed.",
      params: [

      ],
    }
    ],
  },
  "sign-send": {
    demoNote: "Demo gateway: envelopes are drafts only — nothing is sent to a provider. Planned provider: DocuSign (partner-program application in progress, not wired).",
    createEndpoint: "/v1/sign-send/envelopes",
    createExampleBody: "{\n  \"signers\": [\n    {\n      \"name\": \"...\",\n      \"email\": \"...\"\n    }\n  ],\n  \"document\": {\n    \"filename\": \"example\",\n    \"pages\": 1\n  }\n}",
    tools: [
    {
      name: "create_envelope",
      description: "Create a SignSend draft envelope for collecting e-signatures on a PDF (1-5 sequential signers). Returns a review URL. Does not send anything — the human must review the document, signer list, and $2.99 price and pay. Gateway fulfillment is currently stubbed.",
      params: [
      { name: "signers", type: "array", required: true, description: "Signers in signing order" },
      { name: "document", type: "object", required: false, description: "" }
      ],
    },
    {
      name: "get_envelope",
      description: "Get a SignSend envelope you created on this API key (status: draft, paid, sent, signed, declined).",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "list_envelopes",
      description: "List SignSend envelopes created with this API key.",
      params: [

      ],
    }
    ],
  },
  "fax-send": {
    demoNote: "Demo gateway: fax jobs are drafts only — nothing transmits. Planned provider: Sinch Fax API v3 (not wired).",
    createEndpoint: "/v1/fax-send/faxes",
    createExampleBody: "{\n  \"to\": \"example\",\n  \"document\": {\n    \"filename\": \"example\",\n    \"pages\": 1\n  },\n  \"coverPage\": true\n}",
    tools: [
    {
      name: "create_fax",
      description: "Create a FaxSend draft for transmitting a fax to a phone number ($0.99 per transmitted page, up to 10 PDF pages, optional billable cover page). Returns a review URL. Does not transmit anything — the human must review the document, destination, page count, and price and pay. Gateway fulfillment is currently stubbed.",
      params: [
      { name: "to", type: "string", required: true, description: "Destination phone number in E.164 format (e.g. +15550100)" },
      { name: "document", type: "object", required: true, description: "" },
      { name: "coverPage", type: "boolean", required: false, description: "Include a reviewed cover page (counts as a billable page)" }
      ],
    },
    {
      name: "get_fax",
      description: "Get a FaxSend fax you created on this API key (status: draft, paid, sending, delivered, failed).",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "list_faxes",
      description: "List FaxSend faxes created with this API key.",
      params: [

      ],
    }
    ],
  },
  "call-send": {
    demoNote: "Demo gateway: calls are drafts only — nothing is placed. Planned trust model: the agent drafts a verbatim TTS script; a human reviews the exact script and pays $0.99 before any call is placed. Provider: Twilio (number provisioning in progress; API not wired).",
    createEndpoint: "/v1/call-send/calls",
    createExampleBody: "{\n  \"to\": \"example\",\n  \"script\": \"example\",\n  \"voice\": \"example\",\n  \"record\": true\n}",
    tools: [
    {
      name: "create_call",
      description: "Create a CallSend draft call that plays a verbatim, human-reviewed TTS script ($0.99 per call, up to ~5 minutes). Returns a review URL. Does not place anything — the human must review the script, destination number, and price and pay. V1 is a read-aloud script, not an autonomous conversation. Gateway fulfillment is currently stubbed.",
      params: [
      { name: "to", type: "string", required: true, description: "Destination phone number, E.164 (starts with +)" },
      { name: "script", type: "string", required: true, description: "Verbatim script to be read aloud; reviewed by a human before anything is placed" },
      { name: "voice", type: "string", required: false, description: "TTS voice (default alloy)" },
      { name: "record", type: "boolean", required: false, description: "Record the call (default false)" }
      ],
    },
    {
      name: "get_call",
      description: "Get a CallSend call you created on this API key (status: draft, paid, queued, completed, failed).",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "list_calls",
      description: "List CallSend calls created with this API key.",
      params: [

      ],
    }
    ],
  },
  "ink-send": {
    demoNote: "Demo gateway: letters are drafts only — nothing is mailed. Planned provider: Handwrytten (not wired; resale terms unconfirmed).",
    createEndpoint: "/v1/ink-send/letters",
    createExampleBody: "{\n  \"message\": \"example\",\n  \"to\": {\n    \"name\": \"example\",\n    \"address_line1\": \"example\",\n    \"address_city\": \"example\",\n    \"address_state\": \"example\",\n    \"address_zip\": \"example\"\n  },\n  \"card\": \"plain\",\n  \"handwriting_style\": \"example\"\n}",
    tools: [
    {
      name: "create_letter",
      description: "Create an InkSend draft letter — a handwritten-style note mailed via a handwritten-mail provider. Does not mail anything: the human must review the exact message, recipient address, card choice, and $3.99 price and pay before mailing. Status 'sent' means accepted for mailing, not delivered (First Class is untracked). Gateway fulfillment is currently stubbed.",
      params: [
      { name: "message", type: "string", required: true, description: "Letter text, max 5000 characters" },
      { name: "to", type: "object", required: true, description: "Recipient name and postal address" },
      { name: "card", type: "string", required: false, description: "" },
      { name: "handwriting_style", type: "string", required: false, description: "" }
      ],
    },
    {
      name: "get_letter",
      description: "Get an InkSend letter you created on this API key (status: draft, paid, sent).",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "list_letters",
      description: "List InkSend letters created with this API key.",
      params: [

      ],
    }
    ],
  },
  "domain-send": {
    demoNote: "Demo gateway: availability checks are simulated and registrations are drafts only — no real registrations. WHOIS privacy is planned (the stub sets whoisPrivacy: true on drafts; no registrar privacy is applied). Planned provider: OpenSRS / Tucows reseller track (not wired).",
    createEndpoint: "/v1/domain-send/domains",
    createExampleBody: "{\n  \"domain\": \"example\",\n  \"years\": 1\n}",
    tools: [
    {
      name: "check_domain",
      description: "Check whether a domain is available and its price. Read-only.",
      params: [
      { name: "domain", type: "string", required: true, description: "Domain to check, e.g. example.com" }
      ],
    },
    {
      name: "register_domain",
      description: "Prepare a DomainSend registration draft for a domain name (1-2 year term, WHOIS privacy planned). Returns a review URL. Does not register anything — the human must review the domain, term, and price and pay. Gateway fulfillment is currently stubbed.",
      params: [
      { name: "domain", type: "string", required: true, description: "Domain to register, e.g. example.com" },
      { name: "years", type: "integer", required: false, description: "Registration term in years" }
      ],
    },
    {
      name: "get_domain",
      description: "Get a DomainSend registration you created on this API key (status: draft, paid, active, failed).",
      params: [
      { name: "id", type: "string", required: true, description: "" }
      ],
    },
    {
      name: "list_domains",
      description: "List DomainSend registrations created with this API key.",
      params: [

      ],
    }
    ],
  },
};

export function getConnectorDocs(slug: string): ConnectorDocs | undefined {
  return DOCS[slug];
}
