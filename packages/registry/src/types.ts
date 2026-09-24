export const CONNECTOR_STATUSES = [
  "submitted",
  "building",
  "ready",
  "planned",
] as const;

export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export const CONNECTOR_CATEGORIES = [
  "physical-mail",
  "media",
  "logistics",
  "documents",
  "communications",
  "identity",
  "merchandise",
] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export type Connector = {
  slug: string;
  name: string;
  oneLiner: string;
  status: ConnectorStatus;
  category: ConnectorCategory;
  pricingBlurb: string;
  repoUrl?: string;
  docsPath: string;
  apiBasePath: string;
  mcpPath: string;
  privacyPath: string;
  termsPath: string;
  howMuseUsesIt: string;
  examplePrompts: string[];
  productNotes?: string;
  gatewayImplemented: boolean;
};

export const STATUS_LABELS: Record<ConnectorStatus, string> = {
  submitted: "Submitted to Muse",
  building: "Building",
  ready: "Ready",
  planned: "Planned",
};

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  "physical-mail": "Physical mail",
  media: "Media",
  logistics: "Logistics",
  documents: "Documents",
  communications: "Communications",
  identity: "Identity",
  merchandise: "Merchandise",
};
