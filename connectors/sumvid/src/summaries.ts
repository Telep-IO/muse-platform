export type Summary = {
  id: string;
  status: "stubbed";
  youtubeUrl: string;
  videoId: string;
  language: string;
  title: string;
  summary: string;
  bullets: string[];
  createdAt: string;
  ownerKeyId: string;
  note: string;
  fulfillment: "stub";
};

export const STUB_NOTE =
  "Gateway stub: this text is derived from the YouTube URL / video id hash only. No captions were fetched and no paid summarization API was called. Do not present this as a real summary of the video.";

export const STUB_ACCOUNT_NOTE =
  "Gateway stub account. Sumvid on this edge does not bill usage or call a transcription provider.";

const summaries = new Map<string, Summary>();

const VIDEO_ID_RE = /^[\w-]{11}$/;

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function youtubeHost(hostname: string): "watch" | "short" | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return "short";
  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  ) {
    return "watch";
  }
  return null;
}

export function parseYoutubeInput(value: unknown): { youtubeUrl: string; videoId: string } {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("youtubeUrl is required");
  if (raw.length > 2048) throw new Error("youtubeUrl is too long");
  if (VIDEO_ID_RE.test(raw)) {
    return { youtubeUrl: `https://www.youtube.com/watch?v=${raw}`, videoId: raw };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("youtubeUrl must be a YouTube URL or 11-character video id");
  }

  const kind = youtubeHost(url.hostname);
  if (!kind) {
    throw new Error("youtubeUrl must be a youtube.com or youtu.be URL");
  }

  let videoId = "";
  if (kind === "short") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else {
    videoId = url.searchParams.get("v") ?? "";
    if (!videoId) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") {
        videoId = parts[1] ?? "";
      }
    }
  }

  videoId = videoId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 11);
  if (!VIDEO_ID_RE.test(videoId)) {
    throw new Error("Could not parse an 11-character YouTube video id");
  }
  return { youtubeUrl: raw, videoId };
}

function mockCopy(videoId: string, language: string): Pick<Summary, "title" | "summary" | "bullets"> {
  const hex = fnv1aHex(videoId);
  const n = parseInt(hex.slice(0, 2), 16);
  const shapes = ["walkthrough", "talk", "tutorial", "interview", "explainer"];
  const shape = shapes[n % shapes.length];
  return {
    title: `Stub title for YouTube ${videoId}`,
    summary:
      `This is a gateway stub summary of YouTube video ${videoId} (hashed as ${hex}, language=${language}). ` +
      `It is shaped like a ${shape} only because of the video id hash — captions were not downloaded and no paid model ran. ` +
      `Replace this stub before treating Sumvid as a real summarizer.`,
    bullets: [
      `Stub: classified as a ${shape} from the video id hash, not from the actual footage.`,
      `Stub: video id ${videoId} — no transcript, audio, or third-party summarizer was used.`,
      "Do not present this payload as a real summary of the video.",
    ],
  };
}

export function createSummary(input: {
  youtubeUrl: unknown;
  language?: unknown;
  ownerKeyId: string;
}): Summary {
  const parsed = parseYoutubeInput(input.youtubeUrl);
  const language = String(input.language ?? "en").trim() || "en";
  if (language.length > 16) throw new Error("language is too long");
  const mock = mockCopy(parsed.videoId, language);
  const id = `sv_${crypto.randomUUID()}`;
  const summary: Summary = {
    id,
    status: "stubbed",
    youtubeUrl: parsed.youtubeUrl,
    videoId: parsed.videoId,
    language,
    title: mock.title,
    summary: mock.summary,
    bullets: mock.bullets,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: STUB_NOTE,
    fulfillment: "stub",
  };
  summaries.set(id, summary);
  return summary;
}

export function getSummary(id: string, ownerKeyId: string): Summary | undefined {
  const summary = summaries.get(id);
  if (!summary || summary.ownerKeyId !== ownerKeyId) return undefined;
  return summary;
}

export function listSummaries(ownerKeyId: string): Summary[] {
  return [...summaries.values()]
    .filter((summary) => summary.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAccount(ownerKeyId: string) {
  return {
    product: "sumvid",
    plan: "stub",
    summariesCreated: listSummaries(ownerKeyId).length,
    note: STUB_ACCOUNT_NOTE,
  };
}

export function publicSummary(summary: Summary): Omit<Summary, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = summary;
  return rest;
}

/** Test helper — not used by production routes. */
export function resetSummaries(): void {
  summaries.clear();
}
