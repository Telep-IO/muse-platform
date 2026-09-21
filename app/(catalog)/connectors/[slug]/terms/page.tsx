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
  return { title: connector ? `${connector.name} — Terms of Service` : "Terms of Service" };
}

export default async function ConnectorTermsPage({
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
      title="Terms of Service"
      sections={legal.terms}
      related={{ href: `/connectors/${connector.slug}`, label: connector.name }}
    />
  );
}
