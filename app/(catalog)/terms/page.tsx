import Link from "next/link";
import { listConnectors } from "@telep/registry";
import { LEGAL_DISCLAIMER, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  const connectors = listConnectors();

  return (
    <article className="product-hero prose">
      <div className="kicker">Telep IO</div>
      <h1>Terms</h1>
      <p>Last updated {LEGAL_UPDATED}. Contact jon@telep.io.</p>
      <p>{LEGAL_DISCLAIMER}</p>
      <p>
        The Telep Muse catalog and gateway are provided by Telep IO. They are independent of Meta.
        Listing a connector here is not a claim that Meta approved, featured, or partnered on it.
      </p>
      <p>
        Each connector has its own terms of service. Those pages are the ones to paste into Meta Muse
        submission forms:
      </p>
      <ul>
        {connectors.map((connector) => (
          <li key={connector.slug}>
            <Link href={connector.termsPath}>
              {connector.name} terms
            </Link>
          </li>
        ))}
      </ul>
      <h2>The service</h2>
      <p>
        The catalog describes Telep connectors. The gateway exposes HTTP and MCP endpoints for every
        listed connector. In demo mode every gateway module is a stub: creating a job does not
        fulfill, charge, or bind a provider. See each connector&apos;s own terms for test and live
        behavior.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>No unsolicited bulk mail, fraud, or illegal content.</li>
        <li>No sharing of API keys.</li>
        <li>Agents may create drafts; humans must review irreversible actions.</li>
      </ul>
      <h2>No warranty</h2>
      <p>
        Software is provided as-is. Status badges are Telep’s internal states. “Submitted” means
        Telep filed a connector for Meta review, not that Muse users can see it, and not that Meta
        approved or featured it.
      </p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:jon@telep.io">jon@telep.io</a>
      </p>
    </article>
  );
}
