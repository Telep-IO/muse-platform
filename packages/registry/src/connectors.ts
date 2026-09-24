import { connectorModules } from "../../../connectors";
import type { Connector } from "./types";

/** Catalog cards, derived from connectors/index.ts. Edit a connector's src/listing.ts, not this file. */
export const connectors: Connector[] = connectorModules.map(({ slug, name, status, listing }) => {
  const { docs: _docs, legal: _legal, ...card } = listing;
  return {
    ...card,
    slug,
    name,
    status,
    docsPath: `/connectors/${slug}/docs`,
    apiBasePath: `/v1/${slug}`,
    mcpPath: `/mcp/${slug}`,
    privacyPath: `/connectors/${slug}/privacy`,
    termsPath: `/connectors/${slug}/terms`,
  };
});

const STATUS_ORDER: Record<Connector["status"], number> = {
  ready: 0,
  submitted: 1,
  building: 2,
  planned: 3,
};

export function listConnectors(): Connector[] {
  return [...connectors].sort((a, b) => {
    const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (status !== 0) return status;
    return a.name.localeCompare(b.name);
  });
}

export function getConnector(slug: string): Connector | undefined {
  return connectors.find((connector) => connector.slug === slug);
}

export function filterConnectors(opts: {
  status?: Connector["status"] | "all";
  category?: Connector["category"] | "all";
}): Connector[] {
  return listConnectors().filter((connector) => {
    if (opts.status && opts.status !== "all" && connector.status !== opts.status) {
      return false;
    }
    if (opts.category && opts.category !== "all" && connector.category !== opts.category) {
      return false;
    }
    return true;
  });
}

export function connectorCount(): number {
  return connectors.length;
}
