import Link from "next/link";
import { notFound } from "next/navigation";
import { getConnector, listConnectors } from "@telep/registry";
import { apiUrl, catalogUrl } from "@/lib/site";
import { getConnectorDocs } from "@/lib/connector-docs";

export function generateStaticParams() {
  return listConnectors().map((connector) => ({ slug: connector.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const connector = getConnector(slug);
  return {
    title: connector ? `${connector.name} \u2014 API & MCP Documentation` : "Documentation",
    description: connector
      ? `API and MCP reference for the ${connector.name} connector: endpoints, tools, parameters, and examples.`
      : undefined,
  };
}

export default async function ConnectorDocsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const connector = getConnector(slug);
  const docs = getConnectorDocs(slug);
  if (!connector || !docs) notFound();

  const mcpUrl = apiUrl(connector.mcpPath);
  const restBase = apiUrl(connector.apiBasePath);
  const openapiUrl = apiUrl(`${connector.apiBasePath}/openapi.json`);
  const createUrl = apiUrl(docs.createEndpoint);

  const mcpExample = JSON.stringify(
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    null,
    2,
  );

  return (
    <article className="product-hero">
      <div className="kicker">Telep IO · {connector.name}</div>
      <h1>API &amp; MCP documentation</h1>
      <p className="lede">{connector.oneLiner}</p>
      <p className="notice">{docs.demoNote}</p>

      <section className="section">
        <h2>Connecting</h2>
        <dl className="dl">
          <dt>MCP endpoint</dt>
          <dd>
            <code>{mcpUrl}</code> — streamable HTTP, JSON-RPC 2.0. Methods:{" "}
            <code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>.
          </dd>
          <dt>REST base</dt>
          <dd>
            <code>{restBase}</code>
          </dd>
          <dt>OpenAPI</dt>
          <dd>
            <code>{openapiUrl}</code> — exact request/response shapes for every REST route.
          </dd>
          <dt>Auth</dt>
          <dd>
            <code>Authorization: Bearer &lt;api-key&gt;</code> on every call. Calls are scoped to the key.
          </dd>
        </dl>
      </section>

      <section className="section">
        <h2>MCP tools</h2>
        {docs.tools.map((tool) => (
          <div key={tool.name} style={{ marginBottom: 24 }}>
            <h3>
              <code>{tool.name}</code>
            </h3>
            <p className="prose">{tool.description}</p>
            {tool.params.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Parameter</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Type</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Required</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "6px 8px" }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tool.params.map((p) => (
                    <tr key={p.name}>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>
                        <code>{p.name}</code>
                      </td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>
                        <code>{p.type}</code>
                      </td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>{p.required ? "yes" : "no"}</td>
                      <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>{p.description || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="prose">Takes no parameters.</p>
            )}
          </div>
        ))}
        <h3>Example: list tools over MCP</h3>
        <pre className="prose" style={{ overflowX: "auto" }}>
          <code>
{`curl -X POST ${mcpUrl} \
  -H "Authorization: Bearer $TELEP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '${mcpExample}'`}
          </code>
        </pre>
      </section>

      <section className="section">
        <h2>REST example</h2>
        <p className="prose">
          Create via <code>POST {createUrl}</code>:
        </p>
        <pre className="prose" style={{ overflowX: "auto" }}>
          <code>
{`curl -X POST ${createUrl} \
  -H "Authorization: Bearer $TELEP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '${docs.createExampleBody}'`}
          </code>
        </pre>
        <p className="prose">
          Every REST route is described exactly in the{" "}
          <a href={openapiUrl} rel="noreferrer">
            OpenAPI document
          </a>
          .
        </p>
      </section>

      <section className="section">
        <h2>Demo status</h2>
        <p className="prose">{docs.demoNote}</p>
        <p className="prose">
          Pricing: {connector.pricingBlurb}{" "}
          {docs.billingNote ?? "Nothing is billed while the gateway is a stub."}
        </p>
      </section>

      {docs.extraSections?.map((section) => (
        <section className="section" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p className="prose" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}

      <section className="section">
        <h2>Related</h2>
        <ul className="prompt-list">
          <li>
            <Link href={`/connectors/${connector.slug}`}>{connector.name} overview</Link> —{" "}
            {catalogUrl(`/connectors/${connector.slug}`)}
          </li>
          <li>
            <Link href={connector.privacyPath}>Privacy policy</Link>
          </li>
          <li>
            <Link href={connector.termsPath}>Terms of service</Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
