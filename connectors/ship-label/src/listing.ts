import { type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Draft a USPS shipping label, review the rate, and pay postage plus a service fee.",
  category: "logistics",
  pricingBlurb: "USPS postage at the EasyPost rate plus a $1.99 service fee. USPS only.",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/ship-label",
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
  docs: {
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
  legal: {
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
