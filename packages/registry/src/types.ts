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
  "rewards",
] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

export type LegalSection = {
  heading: string;
  /** Paragraphs; items starting with "- " render as bullet list items. */
  body: string[];
};

export type ConnectorLegal = { privacy: LegalSection[]; terms: LegalSection[] };

export type ConnectorDocsSection = { heading: string; paragraphs: string[] };

/** Copy for /connectors/{slug}/docs. Tool reference is generated from the MCP tools. */
export type ConnectorDocsNotes = {
  demoNote: string;
  createEndpoint: string;
  createExampleBody: string;
  /** Replaces the generic stub-billing sentence when the connector charges after payment. */
  billingNote?: string;
  extraSections?: ConnectorDocsSection[];
  disclosures?: string[];
};

/** Everything a connector says about itself. Lives in connectors/{slug}/src/listing.ts. */
export type Listing = {
  oneLiner: string;
  category: ConnectorCategory;
  pricingBlurb: string;
  repoUrl?: string;
  howMuseUsesIt: string;
  examplePrompts: string[];
  productNotes?: string;
  docs: ConnectorDocsNotes;
  legal: ConnectorLegal;
};

/** Catalog card. Built from a connector module; paths are derived from the slug. */
export type Connector = Omit<Listing, "docs" | "legal"> & {
  slug: string;
  name: string;
  status: ConnectorStatus;
  docsPath: string;
  apiBasePath: string;
  mcpPath: string;
  privacyPath: string;
  termsPath: string;
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
  rewards: "Rewards",
};
