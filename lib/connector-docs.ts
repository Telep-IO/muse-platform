import type { McpTool } from "@telep/platform";
import { giftSendTools } from "@telep/gift-send";
import { shipLabelTools } from "@telep/ship-label";
import { paperSendTools } from "@telep/paper-send";
import { sumvidTools } from "@telep/sumvid";
import { shipSignalTools } from "@telep/shipsignal";
import { signSendTools } from "@telep/sign-send";
import { faxSendTools } from "@telep/fax-send";
import { callSendTools } from "@telep/call-send";
import { inkSendTools } from "@telep/ink-send";
import { domainSendTools } from "@telep/domain-send";
import { printMerchTools } from "@telep/print-merch";

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
  disclosures?: string[];
  tools: ConnectorToolDoc[];
}

const NOTES: Record<string, Omit<ConnectorDocs, "tools">> = {
  "gift-send": {
    demoNote:
      "Demo mode returns a stub catalog and a stub checkout URL. It does not call Tremendous (including the free sandbox) or Stripe, and a stub draft is not a sent reward. Test mode uses the Tremendous sandbox. Tremendous sends the reward only after the shared billing webhook reports payment_status paid.",
    createEndpoint: "/v1/gift-send/gifts",
    createExampleBody:
      '{"recipient":{"email":"ada@example.com","name":"Ada"},"reward_id":"OKMHM2X2OHYV","amount_cents":5000,"message":"Happy birthday","delivery_method":"EMAIL"}',
    billingNote:
      "Customer total = reward face value + a $2.99 service fee (SERVICE_FEE_CENTS, default 299). Face value is a pass-through. Tremendous's fee on gift cards, Visa/Mastercard prepaid, and charity is $0. Demo mode does not bill.",
    extraSections: [
      {
        heading: "What GiftSend does",
        paragraphs: [
          "GiftSend lets Muse draft a digital gift card or prepaid reward. You choose the recipient, amount, brand, and message, review it, and pay the face value plus a service fee through Stripe. Tremendous delivers the reward by email, text, or link.",
          "Tools: list_reward_products, create_gift_draft, send_gift, get_gift_status, cancel_gift, list_gifts, and check_credentials. send_gift opens checkout. It does not create a Tremendous order.",
        ],
      },
      {
        heading: "Modes",
        paragraphs: [
          "demo: offline stubs. Zero HTTP to Tremendous, its sandbox, or Stripe.",
          "test: Tremendous sandbox at https://testflight.tremendous.com/api/v2 (free, fake balance) and a Stripe test key. The shared /v1/billing/webhook places an order only when payment_status is paid.",
          "live: production API at https://api.tremendous.com/api/v2. The fulfillment service does not boot until TREMENDOUS_PLATFORM_CLIENT_REFERENCE is set. A self-serve API key is not live-ready. Platform Client registration with Tremendous Sales is still required. This page does not claim that registration is finished.",
        ],
      },
      {
        heading: "Pricing",
        paragraphs: [
          "total = face value from the Tremendous catalog, read at draft time, plus the configured service fee. The default fee is $2.99. Gift cards, Visa/Mastercard prepaid, and charity have a $0 Tremendous fee, so a $50 card costs $50.00 at Tremendous. The balance that pays rewards is prefunded by bank ACH. GiftSend never auto-funds that balance by credit card.",
        ],
      },
      {
        heading: "Gift cards only",
        paragraphs: [
          "Launch scope is digital gift cards, Visa/Mastercard prepaid (Tremendous category visa_card), and charity. Venmo, PayPal, ACH, and bank payouts are disabled because those are cash transmission. Enabling them needs a separate counsel review. Limits: $2,000 per payout and $10,000 per recipient per day.",
        ],
      },
      {
        heading: "Cancellation",
        paragraphs: [
          "cancel_gift asks Tremendous to cancel the reward. A redeemed reward fails with HTTP 422, and GiftSend returns that refusal. The Tremendous API documents cancellation for non-expired rewards with a delivery failure. Rewards send when payment succeeds. The create-order field deliver_at can schedule a date within the next year (time-of-day is ignored); GiftSend v1 does not expose scheduling.",
        ],
      },
      {
        heading: "Tremendous",
        paragraphs: [
          "Rewards are delivered by Tremendous on the Platform Client track. GiftSend is not Tremendous. The Tremendous Corporate Client Service Agreement (https://www.tremendous.com/terms/) is incorporated into the GiftSend terms. Platform Client Terms: https://www.tremendous.com/platform-client-terms/. API introduction: https://developers.tremendous.com/docs/introduction. The reference overview URL returned 404; production and sandbox hosts were confirmed from the OpenAPI servers list.",
        ],
      },
    ],
  },
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
  "print-merch": {
    demoNote:
      "Demo mode is fully stubbed and never contacts Printify. test/live reads live Printify costs, shows mockups for review, and sends the order to production only after Stripe reports payment_status paid. You must own or be licensed for any artwork you upload.",
    createEndpoint: "/v1/print-merch/merch_orders",
    createExampleBody:
      '{"blueprint_id":68,"print_provider_id":9,"variant_id":184,"artwork_url":"https://example.com/art.png","quantity":1,"artwork_rights_attested":true,"recipient":{"first_name":"Ada","last_name":"Lovelace","email":"ada@example.com","phone":"+15555550100","country":"US","region":"OH","address1":"1 Main","city":"Cleveland","zip":"44113"}}',
    billingNote:
      "Demo mode does not bill. test and live charge the quoted total through Stripe, and only a paid webhook submits the order to Printify.",
    disclosures: [
      "Pricing formula: customer total = live Printify base cost + live shipping cost + configured markup. The default markup is 25% (2500 basis points) of base plus shipping. Prices are read per order and are not hardcoded. Printify Premium is optional and is not required for this formula.",
      "Production timing: the Printify shop must use Manual order approval. Shops otherwise auto-send new orders to production after 24 hours. test/live refuses to boot unless the shop reports manual approval. send_to_production runs only after Stripe payment_status is paid.",
      "White-label shipping: Printify is not asked to email the recipient a shipping notification. Telep IO LLC is the merchant of record. Production time varies by print provider.",
      "Cancellation: Printify accepts a cancel only while the order is on-hold or payment-not-received.",
      "Artwork-rights attestation: you must set artwork_rights_attested to true before a draft can be checked out. You need to own or be licensed for every uploaded design. API-created products skip Printify's standard quality check, so review the mockups before paying.",
      "Printify attribution: printing and shipping are provided by Printify under its API terms. Charging for the application is allowed (API Terms §E.4). Reselling access to the Printify API is not. Printify has no direct contract with connector users (API Terms §H.2).",
    ],
  },
};

const TOOLS: Record<string, McpTool[]> = {
  "gift-send": giftSendTools,
  "ship-label": shipLabelTools,
  "paper-send": paperSendTools,
  sumvid: sumvidTools,
  shipsignal: shipSignalTools,
  "sign-send": signSendTools,
  "fax-send": faxSendTools,
  "call-send": callSendTools,
  "ink-send": inkSendTools,
  "domain-send": domainSendTools,
  "print-merch": printMerchTools,
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
    billingNote: notes.billingNote,
    disclosures: notes.disclosures,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      params: toolParams(tool.inputSchema),
    })),
  };
}
