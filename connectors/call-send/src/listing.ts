import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Agent-drafted phone calls with a human-approved verbatim script.",
  category: "communications",
  pricingBlurb: "$0.99 per call (planned).",
  repoUrl: "https://github.com/Telep-IO/muse-platform/tree/main/services/call-send",
  howMuseUsesIt:
    "Muse drafts a short script. You read it, edit if needed, and pay before the call is placed.",
  examplePrompts: [
    "Call the pharmacy and read this message verbatim: my prescription should be ready today. Here’s the exact script.",
    "Did my call to the pharmacy complete?",
    "Show me my recent calls.",
  ],
  productNotes: "On the gateway as a stub: calls, review, and demo state transitions work; provider integration pending. Verbatim TTS script only.",
  docs: {
    demoNote:
      "Demo gateway: calls are drafts only — nothing is placed. Planned trust model: the agent drafts a verbatim TTS script; a human reviews the exact script and pays $0.99 before any call is placed. Provider: Twilio (number provisioning in progress; API not wired).",
    createEndpoint: "/v1/call-send/calls",
    createExampleBody: '{"to":"+15555550100","script":"example"}',
  },
  legal: buildLegal({
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
};
