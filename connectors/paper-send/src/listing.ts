import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "PDF → physical mail. Print, envelope, and First Class postage in the US.",
  category: "physical-mail",
  pricingBlurb: "$4.99 first page, $0.25 each additional page. US letter, 1–5 pages.",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/paper-send",
  howMuseUsesIt:
    "Muse drafts a letter from a PDF and addresses, then hands you a private review link. You check the rendered pages, confirm, and pay. The agent never skips review or holds a print-provider key.",
  examplePrompts: [
    "Mail this PDF to 1600 Pennsylvania Avenue NW, Washington DC 20500 from my home address.",
    "Prepare a one-page letter to my landlord and give me a review link before anything is printed.",
    "What’s the price to mail a 3-page US Letter PDF?",
    "Show me all my recent mail jobs.",
  ],
  productNotes:
    "First Telep connector submitted to Meta’s Muse Connector Platform. Gateway jobs are stubs until the mail provider is wired here; live print still lives in the PaperSend app. Status ‘submitted’ means Telep filed the connector for Meta review — it is not a Meta partnership, endorsement, or directory listing.",
  docs: {
    demoNote:
      "Demo gateway: creating a job does not print, mail, or charge anything. Jobs are created with status “stubbed”. The live print-and-mail app lives in services/paper-send in this repository; provider fulfillment is not wired into this gateway.",
    createEndpoint: "/v1/paper-send/jobs",
    createExampleBody:
      '{"sender":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"},"recipient":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"}}',
  },
  legal: buildLegal({
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
};
