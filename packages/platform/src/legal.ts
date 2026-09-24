import type { ConnectorLegal, LegalSection } from "@telep/registry";

export const KEYS_SECTION: LegalSection = {
  heading: "Keys",
  body: [
    "Bearer API keys authenticate agents. Treat them as secrets. Telep IO can revoke a key by removing it from the gateway configuration.",
  ],
};

type MuseFiling = "submitted" | "pending";

type LegalInput = {
  name: string;
  whatItDoes: string[];
  collects: string[];
  handlingHeading?: string;
  handling: string[];
  retentionExtra?: string;
  service: string[];
  extraTerms?: LegalSection[];
  pricing: string[];
  acceptableUse: string[];
  stub: string[];
  warranty: string[];
  museFiling: MuseFiling;
};

function bullets(items: string[]): string[] {
  return items.map((item) => (item.startsWith("- ") ? item : `- ${item}`));
}

function metaIndependence(name: string, filing: MuseFiling): LegalSection {
  if (filing === "submitted") {
    return {
      heading: "Meta independence",
      body: [
        `Telep’s catalog status for ${name} is “submitted”: Telep filed it for Meta Muse connector review. “Submitted” means Telep filed paperwork; it is not approved, featured, or partnered. Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on ${name}.`,
      ],
    };
  }
  return {
    heading: "Meta independence",
    body: [
      `Telep IO is independent of Meta. Listing here is not a claim that Meta approved, featured, or partnered on ${name}. This connector is prepared for Muse submission; filing is not approval.`,
    ],
  };
}

function retentionSection(extra?: string): LegalSection {
  return {
    heading: "Retention",
    body: [
      "Gateway state is in-memory and ephemeral: it disappears when the serverless instance recycles. There is no durable database on the gateway.",
      ...(extra ? [extra] : []),
    ],
  };
}

export function buildLegal(input: LegalInput): ConnectorLegal {
  return {
    privacy: [
      { heading: `What ${input.name} does`, body: input.whatItDoes },
      {
        heading: "What we collect",
        body: bullets([
          ...input.collects,
          "Standard web logs (IP, user agent, request path) from the host/CDN.",
          "We do not sell personal information or run advertising pixels.",
        ]),
      },
      {
        heading: input.handlingHeading ?? "What we do with it",
        body: input.handling,
      },
      retentionSection(input.retentionExtra),
      KEYS_SECTION,
    ],
    terms: [
      { heading: "The service", body: input.service },
      ...(input.extraTerms ?? []),
      { heading: "Pricing", body: input.pricing },
      {
        heading: "Acceptable use",
        body: bullets(["No sharing of API keys.", ...input.acceptableUse]),
      },
      { heading: "Demo / stub status", body: input.stub },
      metaIndependence(input.name, input.museFiling),
      { heading: "No warranty", body: input.warranty },
    ],
  };
}
