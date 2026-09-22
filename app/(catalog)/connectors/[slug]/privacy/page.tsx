import { getConnector } from "@telep/registry";
import { ConnectorLegalPage, connectorLegalParams } from "@/components/ConnectorLegalPage";

export function generateStaticParams() {
  return connectorLegalParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const connector = getConnector((await params).slug);
  return { title: connector ? `${connector.name} — Privacy Policy` : "Privacy Policy" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return ConnectorLegalPage({ params, kind: "privacy" });
}
