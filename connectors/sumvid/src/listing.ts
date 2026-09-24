import { buildLegal, type Listing } from "@telep/platform";

export const listing: Listing = {
  oneLiner: "Summarize YouTube and other videos for Muse.",
  category: "media",
  pricingBlurb: "See the Sumvid product for current pricing.",
  repoUrl: "https://github.com/Telep-IO/sumvid-muse",
  howMuseUsesIt:
    "When you ask Muse to catch you up on a video, it can call Sumvid for a concise summary instead of watching the whole thing in-session.",
  examplePrompts: [
    "Summarize this YouTube video and pull out the three action items.",
    "What’s the thesis of this talk, in six sentences?",
    "Give me the key takeaways from this video.",
  ],
  productNotes:
    "Gateway summaries are in-memory stubs hashed from the YouTube URL. No captions are fetched and no paid summarization API is called. Status ‘ready’ means the module is callable on api.muse.telep.io — not that Meta listed or endorsed it.",
  docs: {
    demoNote: "Demo gateway: summaries are stub summaries hashed from the video URL — no captions are fetched and no paid summarizer is called.",
    createEndpoint: "/v1/sumvid/summaries",
    createExampleBody: '{"youtubeUrl":"example"}',
  },
  legal: buildLegal({
    name: "Sumvid",
    museFiling: "pending",
    whatItDoes: [
      "Sumvid summarizes videos: you give it a video URL (typically YouTube) and it returns an AI-generated summary.",
      "The Muse gateway endpoints are stubs: summaries are hashed from the URL in-memory, no captions are fetched, and no paid AI API is called. Real summarization happens in the Sumvid product, which is a separate service.",
    ],
    collects: [
      "Video URLs: the links you submit for summarization.",
      "Generated stub summaries: the placeholder text the gateway returns for a URL.",
      "Job metadata: timestamps, status, and your API key identifier.",
    ],
    handling: [
      "Gateway stub summaries go nowhere: they are generated in-memory from the URL and never sent to YouTube, to an AI provider, or to any third party. No video-fetching or AI provider is wired to the gateway stubs today. If you use the Sumvid product, its own privacy notice governs that service.",
    ],
    service: [
      "Sumvid is a video-summarization connector operated by Telep IO LLC. Through Muse, an agent can request a summary of a video URL and read it back.",
      "The gateway endpoints are stubs: they return deterministic placeholder summaries derived from the URL. They do not fetch video content, captions, or transcripts, and they do not call an AI service. Real summarization happens in the Sumvid product, a separate service with its own terms.",
    ],
    pricing: [
      "See the Sumvid product for current pricing. No payment is collected through the gateway stubs.",
    ],
    acceptableUse: [
      "Submit only URLs you have the right to have summarized. Do not use the service to circumvent access controls, paywalls, or copyright protections.",
      "Agents may request summaries; stub summaries are placeholders and should never be treated as an account of what a video says.",
    ],
    stub: [
      "Everything on the gateway today is a demo. Stub summaries are placeholders, not real summaries of the video’s content. Do not treat a gateway summary as an accurate account of what a video says.",
    ],
    warranty: [
      "The service is provided as-is. Telep IO makes no guarantee about the accuracy, completeness, or availability of summaries.",
    ],
  }),
};
