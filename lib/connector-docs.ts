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
      "Demo gateway: creating a job does not print, mail, or charge anything. Jobs are created with status “stubbed”. The live print-and-mail app lives in services/paper-send in this repository; provider fulfillment is not wired into this gateway.",
    createEndpoint: "/v1/paper-send/jobs",
    createExampleBody:
      "{\n  \"sender\": {\n    \"name\": \"example\",\n    \"address_line1\": \"example\",\n    \"address_line2\": \"example\",\n    \"address_city\": \"example\",\n    \"address_state\": \"example\",\n    \"address_zip\": \"example\"\n  },\n  \"recipient\": {\n    \"name\": \"example\",\n    \"address_line1\": \"example\",\n    \"address_line2\": \"example\",\n    \"address_city\": \"example\",\n    \"address_state\": \"example\",\n    \"address_zip\": \"example\"\n  },\n  \"document\": {\n    \"filename\": \"example\",\n    \"pages\": 1\n  }\n}",
  },
  sumvid: {
    demoNote: "Demo gateway: summaries are stub summaries hashed from the video URL — no captions are fetched and no paid summarizer is called.",
    createEndpoint: "/v1/sumvid/summaries",
    createExampleBody: "{\n  \"youtubeUrl\": \"example\",\n  \"language\": \"example\"\n}",
  },
  shipsignal: {
    demoNote:
      "Demo gateway: parcels are stubs — timelines are hashed from the tracking number; no UPS, USPS, FedEx, or DHL API is called. Watch is an in-memory flag, not a carrier notification.",
    createEndpoint: "/v1/shipsignal/parcels",
    createExampleBody: "{\n  \"trackingNumber\": \"example\",\n  \"origin\": \"example\",\n  \"destination\": \"example\"\n}",
  },
  "sign-send": {
    demoNote:
      "Demo gateway: envelopes are drafts only — nothing is sent to a provider. Planned provider: DocuSign (partner-program application in progress, not wired).",
    createEndpoint: "/v1/sign-send/envelopes",
    createExampleBody:
      "{\n  \"signers\": [\n    {\n      \"name\": \"...\",\n      \"email\": \"...\"\n    }\n  ],\n  \"document\": {\n    \"filename\": \"example\",\n    \"pages\": 1\n  }\n}",
  },
  "fax-send": {
    demoNote: "Demo gateway: fax jobs are drafts only — nothing transmits. Planned provider: Sinch Fax API v3 (not wired).",
    createEndpoint: "/v1/fax-send/faxes",
    createExampleBody: "{\n  \"to\": \"example\",\n  \"document\": {\n    \"filename\": \"example\",\n    \"pages\": 1\n  },\n  \"coverPage\": true\n}",
  },
  "call-send": {
    demoNote:
      "Demo gateway: calls are drafts only — nothing is placed. Planned trust model: the agent drafts a verbatim TTS script; a human reviews the exact script and pays $0.99 before any call is placed. Provider: Twilio (number provisioning in progress; API not wired).",
    createEndpoint: "/v1/call-send/calls",
    createExampleBody: "{\n  \"to\": \"example\",\n  \"script\": \"example\",\n  \"voice\": \"example\",\n  \"record\": true\n}",
  },
  "ink-send": {
    demoNote: "Demo gateway: letters are drafts only — nothing is mailed. Planned provider: Handwrytten (not wired; resale terms unconfirmed).",
    createEndpoint: "/v1/ink-send/letters",
    createExampleBody:
      "{\n  \"message\": \"example\",\n  \"to\": {\n    \"name\": \"example\",\n    \"address_line1\": \"example\",\n    \"address_city\": \"example\",\n    \"address_state\": \"example\",\n    \"address_zip\": \"example\"\n  },\n  \"card\": \"plain\",\n  \"handwriting_style\": \"example\"\n}",
  },
  "domain-send": {
    demoNote:
      "Demo gateway: availability checks are simulated and registrations are drafts only — no real registrations. WHOIS privacy is planned (the stub sets whoisPrivacy: true on drafts; no registrar privacy is applied). Planned provider: OpenSRS / Tucows reseller track (not wired).",
    createEndpoint: "/v1/domain-send/domains",
    createExampleBody: "{\n  \"domain\": \"example\",\n  \"years\": 1\n}",
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
