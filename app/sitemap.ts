import { listConnectors } from "@telep/registry";
import { catalogUrl } from "@/lib/site";

export default function sitemap() {
  const staticPaths = ["/", "/connectors", "/docs", "/privacy", "/terms"];
  const connectorPaths = listConnectors().flatMap((connector) => [
    `/connectors/${connector.slug}`,
    connector.privacyPath,
    connector.termsPath,
  ]);
  return [...staticPaths, ...connectorPaths].map((path) => ({
    url: catalogUrl(path),
    lastModified: new Date("2026-09-21"),
  }));
}
