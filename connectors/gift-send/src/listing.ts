import { type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Draft a digital gift card or prepaid reward, review it, and pay face value plus a service fee.",
  category: "rewards",
  pricingBlurb: "Face value pass-through plus a $2.99 service fee. Gift cards, Visa/Mastercard prepaid, and charity only.",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/gift-send",
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
  docs: {
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
  legal: {
    privacy: [
      {
        heading: "What GiftSend does",
        body: [
          "GiftSend drafts a digital gift card, Visa or Mastercard prepaid reward, or charity reward. A person reviews the recipient, amount, and message, then pays the face value plus a service fee through Stripe. Tremendous delivers the reward by email, text, or link.",
          "Demo mode is a stub. It does not contact Tremendous or Stripe, including Tremendous's free sandbox.",
        ],
      },
      {
        heading: "What we collect",
        body: [
          "- Recipient name, email, and/or phone number, the reward, amount, personal message, and delivery method.",
          "- The Stripe payment reference, Tremendous order id, reward id, and delivery link after a paid order.",
          "- Standard web logs (IP, user agent, request path) from the host/CDN.",
          "- We do not sell personal information or run advertising pixels. We do not receive full card numbers. Cash-payout destinations are not collected in this version.",
        ],
      },
      {
        heading: "What we do with it",
        body: [
          "In test and live mode, product lists are read-only Tremendous catalog calls. Creating a draft does not place an order. After Stripe reports payment_status paid, recipient and reward details are sent to Tremendous so it can deliver the reward.",
          "Demo mode keeps the draft in the connector's local store and does not send it to Tremendous or Stripe. The fulfillment service, when used, stores drafts and claims in its own database (SQLite locally, Postgres in production).",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Paid drafts and claim rows are kept so a retry cannot place a second reward and so delivery status can be read back. Contact jon@telep.io about access or deletion. Deletion cannot recall a reward the recipient has already redeemed.",
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
          "GiftSend is a digital reward connector operated by Telep IO LLC. An agent may draft a gift. A human reviews it and pays. Tremendous sends the reward only after that payment.",
        ],
      },
      {
        heading: "Tremendous agreement",
        body: [
          "End users receive Tremendous rewards through Telep's Platform Client relationship. The Tremendous Corporate Client Service Agreement (https://www.tremendous.com/terms/) is incorporated into these terms, as Platform Client Terms §1.3 requires. Platform Client Terms: https://www.tremendous.com/platform-client-terms/. Live mode is not available until Telep completes Platform Client registration with Tremendous Sales. A self-serve API key is not a license to resell rewards.",
        ],
      },
      {
        heading: "Gift cards, prepaid, and charity only",
        body: [
          "Launch scope is digital gift cards, Visa and Mastercard prepaid, and charity. Venmo, PayPal, ACH, bank, and other cash payouts are disabled. Enabling them requires a separate money-transmission review.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "The customer total is the reward face value plus a service fee. The default service fee is $2.99. Face value is a pass-through. Tremendous's published fee on gift cards, Visa/Mastercard prepaid, and charity is $0. The Tremendous balance is prefunded by bank ACH. GiftSend does not auto-fund that balance by credit card.",
        ],
      },
      {
        heading: "Cancellation",
        body: [
          "A reward can be cancelled before the recipient redeems it. Tremendous returns HTTP 422 when a reward is already redeemed, and GiftSend reports that refusal. The service fee is not refunded after Tremendous has accepted the order. Demo cancels do not contact Tremendous.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "- No sharing of API keys.",
          "- No fraud, and no rewards you are not allowed to send.",
          "- Agents may draft and read status. Humans review the amount and pay before a reward is sent.",
        ],
      },
      {
        heading: "Demo / stub status",
        body: [
          "Demo mode is a stub: the catalog and checkout URL are placeholders. A stub draft is not a sent reward. Do not treat demo status as proof that Tremendous delivered anything.",
        ],
      },
      {
        heading: "Meta independence",
        body: [
          "Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on GiftSend. This connector is prepared for Muse submission; filing is not approval.",
        ],
      },
      {
        heading: "No warranty",
        body: [
          "The service is provided as-is. Telep IO does not guarantee that a recipient can redeem a reward, or that a cancellation will be accepted after delivery.",
        ],
      },
    ],
  },
};
