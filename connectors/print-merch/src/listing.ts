import { KEYS_SECTION, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Custom printed merchandise: design, mockups, and a live quote, then Printify after you pay.",
  category: "merchandise",
  pricingBlurb: "Live Printify base + shipping + 25% markup (configurable). Demo uses a labeled fixture and does not bill.",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/print-merch",
  howMuseUsesIt:
    "Muse picks a product, uploads artwork, and shows mockups with a live quote. You review the design and pay. The order goes to Printify only after that payment.",
  examplePrompts: [
    "Design a mug with this artwork, show me the mockup and the price, and wait for me to pay.",
    "What's the status of my merch order?",
    "Cancel my merch order if it is still on hold.",
  ],
  productNotes:
    "PrintMerch lets Muse design custom printed merchandise — pick a product, upload artwork, preview mockups, and get a live quote. You review the design and pay through Stripe; only then is your order sent to Printify for printing and white-label shipping. Demo mode is fully stubbed and never contacts Printify. You must own or be licensed for any artwork you upload. Status ‘submitted’ means Telep filed the connector for Meta review — it is not a Meta partnership, endorsement, or directory listing.",
  docs: {
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
  legal: {
    privacy: [
      {
        heading: "What PrintMerch does",
        body: [
          "PrintMerch lets Muse design custom printed merchandise: pick a product, upload artwork, preview mockups, and get a quote. You review the design and pay through Stripe. Only then is the order sent to Printify for printing and white-label shipping.",
          "Demo mode is a stub. It stores a draft locally and never contacts Printify or Stripe.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Product selection, artwork URL, mockup URLs, quantity, and the quoted price.",
          "- Recipient name, email, phone, and shipping address. In test and live mode those details are sent to Printify only after you pay.",
          "- Stripe checkout status. Full card numbers are not stored here.",
          "- Your API key identifier, timestamps, and standard web logs (IP, user agent, request path) from the host/CDN.",
          "- We do not sell personal information or run advertising pixels.",
        ],
      },
      {
        heading: "What we do with it",
        body: [
          "Demo drafts stay in a SQLite file on the gateway process. test and live drafts, checkout sessions, and fulfillment claims are stored in the PrintMerch fulfillment database for that mode. The gateway does not import the fulfillment app; it calls it over HTTP.",
          "After Stripe reports payment_status paid, Telep IO LLC submits the order to Printify. Telep is the merchant of record. Printify prints and ships the goods. Printify is not asked to email the recipient a shipping notice.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Payment-adjacent rows are durable: drafts, checkout sessions, and claims live in the fulfillment database, separated by APP_MODE. Demo gateway drafts live in SQLite, not an in-memory map. Do not upload artwork you are not allowed to print.",
        ],
      },
      KEYS_SECTION,
    ],
    terms: [
      {
        heading: "The service",
        body: [
          "PrintMerch is operated by Telep IO LLC. An agent can draft a product and mockups. A human reviews that design and pays. Production is submitted to Printify only after payment.",
          "Printify has no direct contractual relationship with you. Telep IO LLC is solely responsible to Printify for orders placed through this shop.",
        ],
      },
      {
        heading: "Artwork rights",
        body: [
          "You must attest that you own or are licensed for every design you upload. Checkout is refused unless artwork_rights_attested is true. Do not upload work you cannot legally print.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "The customer price is the live Printify base cost, plus the live shipping cost, plus a configured markup. The default markup is 25% of base plus shipping. Demo mode uses a labeled fixture and does not call Printify. Nothing is charged in demo mode.",
        ],
      },
      {
        heading: "Production, shipping, and cancellation",
        body: [
          "The Printify shop must use Manual order approval so new orders are not auto-sent after 24 hours. White-label shipping means Printify is not asked to notify the recipient. Production time varies by print provider.",
          "Cancellation is available only while Printify still shows the order as on-hold or payment-not-received.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No sharing of API keys.",
          "- No artwork you do not own or have a license to print, and no illegal or infringing designs.",
          "- Agents may create drafts. Humans must review the mockups and pay before anything is produced.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "Demo mode is a stub. Jobs are not sent to Printify, and a stub checkout does not collect a card. Do not treat a demo status as proof that an item was printed.",
        ],
      },
      {
        heading: "Meta independence",
        body: [
          "Telep’s catalog status for PrintMerch is “submitted”: Telep filed it for Meta Muse connector review. “Submitted” means Telep filed paperwork; it is not approved, featured, or partnered. Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on PrintMerch.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "The service is provided as-is. Production times and print quality depend on the print provider. API-created products skip Printify's standard quality check; review the mockups before you pay.",
        ],
      },
    ],
  },
};
