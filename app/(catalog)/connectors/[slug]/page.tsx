import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, getConnector, listConnectors } from "@telep/registry";
import { StatusBadge } from "@/components/StatusBadge";
import { apiUrl, catalogUrl } from "@/lib/site";

export function generateStaticParams() {
  return listConnectors().map((connector) => ({ slug: connector.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const connector = getConnector(slug);
  return {
    title: connector ? connector.name : "Connector",
    description: connector?.oneLiner,
  };
}

export default async function ConnectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const connector = getConnector(slug);
  if (!connector) notFound();

  return (
    <article className="product-hero">
      <div className="kicker">{CATEGORY_LABELS[connector.category]}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1>{connector.name}</h1>
        <StatusBadge status={connector.status} />
      </div>
      <p className="lede">{connector.oneLiner}</p>

      <section className="section">
        <h2>What it does</h2>
        <p className="prose">{connector.howMuseUsesIt}</p>
        {connector.productNotes ? <p className="notice">{connector.productNotes}</p> : null}
      </section>

      <section className="section">
        <h2>Example Muse prompts</h2>
        <ul className="prompt-list">
          {connector.examplePrompts.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>For agents</h2>
        <dl className="dl">
          <dt>API base</dt>
          <dd>
            <code>{apiUrl(connector.apiBasePath)}</code>
          </dd>
          <dt>MCP</dt>
          <dd>
            <code>{apiUrl(connector.mcpPath)}</code>
          </dd>
          <dt>Pricing</dt>
          <dd>{connector.pricingBlurb}</dd>
          <dt>Repo</dt>
          <dd>
            {connector.repoUrl ? (
              <a href={connector.repoUrl} rel="noreferrer">
                {connector.repoUrl}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt>Privacy</dt>
          <dd>
            <Link href={connector.privacyPath}>{catalogUrl(connector.privacyPath)}</Link>
          </dd>
          <dt>Terms</dt>
          <dd>
            <Link href={connector.termsPath}>{catalogUrl(connector.termsPath)}</Link>
          </dd>
        </dl>
      </section>
    </article>
  );
}
