export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="product-hero prose">
      <div className="kicker">Telep IO</div>
      <h1>Privacy</h1>
      <p>Last updated 21 September 2026. Contact jon@telep.io.</p>
      <p>
        This notice covers the Telep Muse catalog website and API gateway operated by Telep IO. It
        does not cover Meta, Muse, or third-party fulfillment providers. Individual connectors may
        add product notes on their catalog pages.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Catalog: standard web logs (IP, user agent, path) from the host/CDN.</li>
        <li>
          Gateway: API key identifier, request path, and the job payload you send (addresses,
          document metadata). The v0 job store is in-memory and ephemeral.
        </li>
        <li>No marketing pixels. No sale of personal information.</li>
      </ul>
      <h2>What we do not do</h2>
      <p>
        The gateway stub does not forward documents to a mail provider. Do not upload live customer
        documents here until a durable store and provider contract exist.
      </p>
      <h2>Keys</h2>
      <p>
        Bearer API keys authenticate agents. Treat them as secrets. Telep operators can revoke keys
        by removing them from <code>MUSE_API_KEYS</code>.
      </p>
      <h2>Contact</h2>
      <p>
        Privacy questions: <a href="mailto:jon@telep.io">jon@telep.io</a>.
      </p>
    </article>
  );
}
