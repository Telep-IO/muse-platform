import { getModule } from "@/connectors";
import type { ConnectorLegal } from "@telep/registry";

export type { ConnectorLegal, LegalSection } from "@telep/registry";

export const LEGAL_UPDATED = "21 September 2026";
export const LEGAL_DISCLAIMER =
  "Plain-language product notice maintained by Telep IO — not legal advice.";

export function getConnectorLegal(slug: string): ConnectorLegal | undefined {
  return getModule(slug)?.listing.legal;
}
