import Link from "next/link";
import { listConnectors } from "@telep/registry";
import { LEGAL_DISCLAIMER, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  const connectors = listConnectors();

  return (
    <article className="product-hero prose">
      <div className="kicker">Telep IO</div>
      <h1>Privacy</h1>
      <p>Last updated {LEGAL_UPDATED}. Contact jon@telep.io.</p>
      <p>{LEGAL_DISCLAIMER}</p>
      <p>
        This notice covers the Telep Muse catalog website and API gateway operated by Telep IO. It
        does not cover Meta, Muse, or third-party fulfillment providers.
      </p>
      <p>
        Each connector has its own privacy policy. Those pages are the ones to paste into Meta Muse
        submission forms:
      </p>
      <ul>
        {connectors.map((connector) => (
          <li key={connector.slug}>
            <Link href={connector.privacyPath}>
              {connector.name} privacy
            </Link>
          </li>
        ))}
      </ul>
      <h2>What we collect on the platform</h2>
      <ul>
        <li>Catalog: standard web logs (IP, user agent, path) from the host/CDN.</li>
        <li>
          Gateway: API key identifier, request path, and the job payload you send. Current job
          stores are in-memory and ephemeral. See each connector privacy page for the exact fields.
        </li>
        <li>No marketing pixels. No sale of personal information.</li>
      </ul>
      <h2>What we do not do</h2>
      <p>
        Every current gateway module is an honest demo stub. Creating a job does not call a mail,
        fax, voice, signature, registrar, video, or carrier provider. Do not upload live customer
        documents or personal data here until a durable store and a provider contract exist for that
        connector.
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
