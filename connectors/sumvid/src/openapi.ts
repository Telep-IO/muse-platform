import { authedGet, connectorSpec, descriptorPath, listAndCreate } from "@telep/platform";

export function sumvidOpenApi() {
  const tag = "sumvid";
  return connectorSpec(
    {
      title: "Sumvid",
      description:
        "YouTube summarize stub on the Telep Muse gateway. Summaries are in-memory and hashed from the video id; no captions or paid summarizer are used.",
      tag,
      tagDescription: "Summarize a YouTube video (stub)",
    },
    {
      "/v1/sumvid": descriptorPath(tag),
      "/v1/sumvid/account": authedGet(tag, "Stub account"),
      "/v1/sumvid/summaries": listAndCreate(tag, "List summaries", "Create a YouTube summary (stub)", {
        type: "object",
        required: ["youtubeUrl"],
        properties: { youtubeUrl: { type: "string" }, language: { type: "string" } },
      }),
      "/v1/sumvid/summaries/{id}": authedGet(tag, "Get a summary", true),
    },
  );
}
