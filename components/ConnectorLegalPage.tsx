import { notFound } from "next/navigation";
import { getConnector, listConnectors } from "@telep/registry";
import { LegalArticle } from "@/components/LegalBody";
import { getConnectorLegal } from "@/lib/legal";

export function connectorLegalParams() {
  return listConnectors().map((connector) => ({ slug: connector.slug }));
}

export async function ConnectorLegalPage({
  params,
  kind,
}: {
  params: Promise<{ slug: string }>;
  kind: "privacy" | "terms";
}) {
  const { slug } = await params;
  const connector = getConnector(slug);
  const legal = getConnectorLegal(slug);
  if (!connector || !legal) notFound();
  const privacy = kind === "privacy";
  return (
    <LegalArticle
      kicker={`Telep IO · ${connector.name}`}
      title={privacy ? "Privacy Policy" : "Terms of Service"}
      sections={privacy ? legal.privacy : legal.terms}
      related={{ href: `/connectors/${connector.slug}`, label: connector.name }}
      contactLead={privacy ? "Privacy questions:" : undefined}
    />
  );
}
