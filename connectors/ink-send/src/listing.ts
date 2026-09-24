import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Robot-handwritten letters and cards, mailed for you.",
  category: "physical-mail",
  pricingBlurb: "$3.99 per letter (planned).",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/ink-send",
  howMuseUsesIt:
    "Muse drafts the note. You approve the handwriting preview and address, then pay, before the robot writes and mails it.",
  examplePrompts: [
    "Write a thank-you note to my aunt and mail it in handwriting, not a printed letter.",
    "Has my letter to Aunt Mary been mailed yet?",
    "Show me my recent letters.",
  ],
  productNotes: "On the gateway as a stub: letters, review, and demo state transitions work; provider integration pending.",
  docs: {
    demoNote: "Demo gateway: letters are drafts only — nothing is mailed. Planned provider: Handwrytten (not wired; resale terms unconfirmed).",
    createEndpoint: "/v1/ink-send/letters",
    createExampleBody:
      '{"message":"example","to":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"}}',
  },
  legal: buildLegal({
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
};
