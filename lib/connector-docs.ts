import type { McpTool } from "@telep/platform";
import { paperSendTools } from "@telep/paper-send";
import { sumvidTools } from "@telep/sumvid";
import { shipSignalTools } from "@telep/shipsignal";
import { signSendTools } from "@telep/sign-send";
import { faxSendTools } from "@telep/fax-send";
import { callSendTools } from "@telep/call-send";
import { inkSendTools } from "@telep/ink-send";
import { domainSendTools } from "@telep/domain-send";

export interface ConnectorToolParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ConnectorToolDoc {
  name: string;
  description: string;
  params: ConnectorToolParamDoc[];
}

export interface ConnectorDocs {
  demoNote: string;
  createEndpoint: string;
  createExampleBody: string;
  tools: ConnectorToolDoc[];
}

const NOTES: Record<string, { demoNote: string; createEndpoint: string; createExampleBody: string }> = {
  "paper-send": {
    demoNote:
      "Demo (the default): creating a job does not print, mail, or charge. Status is “stubbed”, in memory, and Lob is never called. With Postgres, Stripe, and a Lob key, set PAPER_SEND_APP_MODE to test or live: the draft is durable, and Lob sends only after the Stripe webhook confirms payment. The gateway does not store PDF bytes; Lob receives HTML built from the job. No separate Express deploy is required for that path.",
    createEndpoint: "/v1/paper-send/jobs",
    createExampleBody:
      '{"sender":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"},"recipient":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"}}',
  },
  sumvid: {
    demoNote: "Demo gateway: summaries are stub summaries hashed from the video URL — no captions are fetched and no paid summarizer is called.",
    createEndpoint: "/v1/sumvid/summaries",
    createExampleBody: '{"youtubeUrl":"example"}',
  },
  shipsignal: {
    demoNote:
      "Demo gateway: parcels are stubs — timelines are hashed from the tracking number; no UPS, USPS, FedEx, or DHL API is called. Watch is an in-memory flag, not a carrier notification.",
    createEndpoint: "/v1/shipsignal/parcels",
    createExampleBody: '{"trackingNumber":"example"}',
  },
  "sign-send": {
    demoNote:
      "Demo gateway: envelopes are drafts only — nothing is sent to a provider. Planned provider: DocuSign (partner-program application in progress, not wired).",
    createEndpoint: "/v1/sign-send/envelopes",
    createExampleBody: '{"signers":[{"name":"example","email":"a@example.com"}]}',
  },
  "fax-send": {
    demoNote: "Demo gateway: fax jobs are drafts only — nothing transmits. Planned provider: Sinch Fax API v3 (not wired).",
    createEndpoint: "/v1/fax-send/faxes",
    createExampleBody: '{"to":"+15555550100","document":{"pages":1}}',
  },
  "call-send": {
    demoNote:
      "Demo gateway: calls are drafts only — nothing is placed. Planned trust model: the agent drafts a verbatim TTS script; a human reviews the exact script and pays $0.99 before any call is placed. Provider: Twilio (number provisioning in progress; API not wired).",
    createEndpoint: "/v1/call-send/calls",
    createExampleBody: '{"to":"+15555550100","script":"example"}',
  },
  "ink-send": {
    demoNote: "Demo gateway: letters are drafts only — nothing is mailed. Planned provider: Handwrytten (not wired; resale terms unconfirmed).",
    createEndpoint: "/v1/ink-send/letters",
    createExampleBody:
      '{"message":"example","to":{"name":"example","address_line1":"example","address_city":"example","address_state":"example","address_zip":"example"}}',
  },
  "domain-send": {
    demoNote:
      "Demo gateway: availability checks are simulated and registrations are drafts only — no real registrations. WHOIS privacy is planned (the stub sets whoisPrivacy: true on drafts; no registrar privacy is applied). Planned provider: OpenSRS / Tucows reseller track (not wired).",
    createEndpoint: "/v1/domain-send/domains",
    createExampleBody: '{"domain":"example.com"}',
  },
};

const TOOLS: Record<string, McpTool[]> = {
  "paper-send": paperSendTools,
  sumvid: sumvidTools,
  shipsignal: shipSignalTools,
  "sign-send": signSendTools,
  "fax-send": faxSendTools,
  "call-send": callSendTools,
  "ink-send": inkSendTools,
  "domain-send": domainSendTools,
};

function toolParams(schema: Record<string, unknown>): ConnectorToolParamDoc[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return Object.entries(properties as Record<string, Record<string, unknown>>).map(([name, prop]) => ({
    name,
    type: String(prop.type ?? "object"),
    required: required.has(name),
    description: typeof prop.description === "string" ? prop.description : "",
  }));
}

export function getConnectorDocs(slug: string): ConnectorDocs | undefined {
  const notes = NOTES[slug];
  const tools = TOOLS[slug];
  if (!notes || !tools) return undefined;
  return {
    ...notes,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      params: toolParams(tool.inputSchema),
    })),
  };
}
