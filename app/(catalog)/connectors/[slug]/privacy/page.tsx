import { notFound } from "next/navigation";
import { getConnector, listConnectors } from "@telep/registry";
import { connectorLegal } from "@/lib/legal";

export function generateStaticParams() {
  return listConnectors().map((connector) => ({ slug: connector.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const connector = getConnector(slug);
  return { title: connector ? `${connector.name} — Privacy Policy` : "Privacy Policy" };
}

function renderBody(body: string[]) {
  const items: string[] = [];
  const blocks: React.ReactNode[] = [];
  const flush = () => {
    if (items.length > 0) {
      blocks.push(
        <ul key={blocks.length}>
          {items.map((item, i) => (
            <li key={i}>{item.slice(2)}</li>
          ))}
        </ul>,
      );
      items.length = 0;
    }
  };
  body.forEach((para) => {
    if (para.startsWith("- ")) items.push(para);
    else {
      flush();
      blocks.push(<p key={blocks.length}>{para}</p>);
    }
  });
  flush();
  return blocks;
}

export default async function ConnectorPrivacyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const connector = getConnector(slug);
  const legal = connectorLegal[slug];
  if (!connector || !legal) notFound();

  return (
    <article className="product-hero prose">
      <div className="kicker">Telep IO · {connector.name}</div>
      <h1>Privacy Policy</h1>
      <p>Last updated 21 September 2026. Contact jon@telep.io.</p>
      {legal.privacy.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {renderBody(section.body)}
        </section>
      ))}
      <h2>Contact</h2>
      <p>
        Privacy questions: <a href="mailto:jon@telep.io">jon@telep.io</a>.
      </p>
    </article>
  );
}
