import { listConnectors } from "@telep/registry";
import { catalogUrl } from "@/lib/site";

export default function sitemap() {
  const staticPaths = ["/", "/connectors", "/docs", "/privacy", "/terms"];
  const connectorPaths = listConnectors().map((connector) => `/connectors/${connector.slug}`);
  return [...staticPaths, ...connectorPaths].map((path) => ({
    url: catalogUrl(path),
    lastModified: new Date("2026-09-21"),
  }));
}
