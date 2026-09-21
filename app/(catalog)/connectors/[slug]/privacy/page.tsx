import { notFound } from "next/navigation";
import { getConnector, listConnectors } from "@telep/registry";
import { LegalArticle } from "@/components/LegalBody";
import { getConnectorLegal } from "@/lib/legal";

export function generateStaticParams() {
  return listConnectors().map((connector) => ({ slug: connector.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const connector = getConnector(slug);
  return { title: connector ? `${connector.name} — Privacy Policy` : "Privacy Policy" };
}

export default async function ConnectorPrivacyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const connector = getConnector(slug);
  const legal = getConnectorLegal(slug);
  if (!connector || !legal) notFound();

  return (
    <LegalArticle
      kicker={`Telep IO · ${connector.name}`}
      title="Privacy Policy"
      sections={legal.privacy}
      related={{ href: `/connectors/${connector.slug}`, label: connector.name }}
      contactLead="Privacy questions:"
    />
  );
}
