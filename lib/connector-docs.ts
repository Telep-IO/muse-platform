import type { McpTool } from "@telep/platform";
import { shipLabelTools } from "@telep/ship-label";
import { paperSendTools } from "@telep/paper-send";
import { sumvidTools } from "@telep/sumvid";
import { shipSignalTools } from "@telep/shipsignal";
import { signSendTools } from "@telep/sign-send";
import { faxSendTools } from "@telep/fax-send";
import { callSendTools } from "@telep/call-send";
import { inkSendTools } from "@telep/ink-send";
import { domainSendTools } from "@telep/domain-send";

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
  demoNote: string;
  createEndpoint: string;
  createExampleBody: string;
  /** Replaces the generic stub-billing sentence when the connector charges after payment. */
  billingNote?: string;
  extraSections?: ConnectorDocsSection[];
  tools: ConnectorToolDoc[];
}

const NOTES: Record<string, { demoNote: string; createEndpoint: string; createExampleBody: string; billingNote?: string; extraSections?: ConnectorDocsSection[] }> = {
  "ship-label": {
    demoNote:
      "Demo mode returns stub USPS rates and a stub label. It does not call EasyPost or Stripe, and a stub label is not postage. Test and live rate-shop USPS through EasyPost before payment (that does not buy postage). EasyPost buys the label only after the shared billing webhook reports payment_status paid.",
    createEndpoint: "/v1/ship-label/shipments",
    createExampleBody:
      '{"from":{"name":"Ada Sender","address_line1":"185 Berry St","address_city":"San Francisco","address_state":"CA","address_zip":"94107"},"to":{"name":"Grace Recipient","address_line1":"1 Telegraph Hill Blvd","address_city":"San Francisco","address_state":"CA","address_zip":"94133"},"parcel":{"weight_oz":16,"length_in":10,"width_in":6,"height_in":4}}',
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
          "test: EasyPost test key and Stripe test key. The shared /v1/billing/webhook buys only when payment_status is paid.",
          "live: Forge production credentials. Live mode does not boot on the fulfillment service until EASYPOST_ORDER_FORM_REFERENCE is set. A self-serve Developer Plan key is not live-ready. Forge enrollment with EasyPost sales is still required.",
        ],
      },
      {
        heading: "Pricing",
        paragraphs: [
          "total = postage from the selected EasyPost USPS rate, read at runtime, plus the configured service fee. The default fee is $1.99. The Forge per-label platform fee is a separate config value from the Order Form and is not hardcoded.",
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
  },
  "paper-send": {
    demoNote:
      "Demo gateway: creating a job does not print, mail, or charge anything. Jobs are created with status “stubbed”. The live print-and-mail app lives in services/paper-send in this repository; provider fulfillment is not wired into this gateway.",
    createEndpoint: "/v1/paper-send/jobs",
    createExampleBody:
      '{"sender":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"},"recipient":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"}}',
  },
  sumvid: {
    demoNote: "Demo gateway: summaries are stub summaries hashed from the video URL — no captions are fetched and no paid summarizer is called.",
    createEndpoint: "/v1/sumvid/summaries",
    createExampleBody: '{"youtubeUrl":"example"}',
  },
  shipsignal: {
    demoNote:
      "Demo gateway: parcels are stubs — timelines are hashed from the tracking number; no UPS, USPS, FedEx, or DHL API is called. Watch is an in-memory flag, not a carrier notification.",
    createEndpoint: "/v1/shipsignal/parcels",
    createExampleBody: '{"trackingNumber":"example"}',
  },
  "sign-send": {
    demoNote:
      "Demo gateway: envelopes are drafts only — nothing is sent to a provider. Planned provider: DocuSign (partner-program application in progress, not wired).",
    createEndpoint: "/v1/sign-send/envelopes",
    createExampleBody: '{"signers":[{"name":"example","email":"a@example.com"}]}',
  },
  "fax-send": {
    demoNote: "Demo gateway: fax jobs are drafts only — nothing transmits. Planned provider: Sinch Fax API v3 (not wired).",
    createEndpoint: "/v1/fax-send/faxes",
    createExampleBody: '{"to":"+15555550100","document":{"pages":1}}',
  },
  "call-send": {
    demoNote:
      "Demo gateway: calls are drafts only — nothing is placed. Planned trust model: the agent drafts a verbatim TTS script; a human reviews the exact script and pays $0.99 before any call is placed. Provider: Twilio (number provisioning in progress; API not wired).",
    createEndpoint: "/v1/call-send/calls",
    createExampleBody: '{"to":"+15555550100","script":"example"}',
  },
  "ink-send": {
    demoNote: "Demo gateway: letters are drafts only — nothing is mailed. Planned provider: Handwrytten (not wired; resale terms unconfirmed).",
    createEndpoint: "/v1/ink-send/letters",
    createExampleBody:
      '{"message":"example","to":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"}}',
  },
  "domain-send": {
    demoNote:
      "Demo gateway: availability checks are simulated and registrations are drafts only — no real registrations. WHOIS privacy is planned (the stub sets whoisPrivacy: true on drafts; no registrar privacy is applied). Planned provider: OpenSRS / Tucows reseller track (not wired).",
    createEndpoint: "/v1/domain-send/domains",
    createExampleBody: '{"domain":"example.com"}',
  },
};

const TOOLS: Record<string, McpTool[]> = {
  "ship-label": shipLabelTools,
  "paper-send": paperSendTools,
  sumvid: sumvidTools,
  shipsignal: shipSignalTools,
  "sign-send": signSendTools,
  "fax-send": faxSendTools,
  "call-send": callSendTools,
  "ink-send": inkSendTools,
  "domain-send": domainSendTools,
};

function toolParams(schema: Record<string, unknown>): ConnectorToolParamDoc[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return Object.entries(properties as Record<string, Record<string, unknown>>).map(([name, prop]) => ({
    name,
    type: String(prop.type ?? "object"),
    required: required.has(name),
    description: typeof prop.description === "string" ? prop.description : "",
  }));
}

export function getConnectorDocs(slug: string): ConnectorDocs | undefined {
  const notes = NOTES[slug];
  const tools = TOOLS[slug];
  if (!notes || !tools) return undefined;
  return {
    ...notes,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      params: toolParams(tool.inputSchema),
    })),
  };
}
