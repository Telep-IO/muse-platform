import Link from "next/link";
import { listConnectors } from "@telep/registry";
import { ConnectorCard } from "@/components/ConnectorCard";
import { SITE } from "@/lib/site";

export default function HomePage() {
  const connectors = listConnectors();
  return (
    <>
      <section className="hero">
        <div>
          <div className="kicker">Built by Telep IO</div>
          <h1>Telep Muse connectors</h1>
          <p className="lede">
            A letterpress catalog of Telep connectors for Muse — Meta’s personal assistant. Mail a
            letter, track a package, summarize a video. Telep builds the modules; Meta reviews what
            appears inside Muse.
          </p>
          <div className="cta-row">
            <a className="btn" href={SITE.musePlatform} rel="noreferrer">
              Use these in Muse
            </a>
            <Link className="btn secondary" href="/docs">
              Docs for builders
            </Link>
          </div>
        </div>
        <div className="seal" aria-hidden="true">
          <div>
            <span>Catalog · 2026</span>
            <strong>MUSE</strong>
            <span>not a Meta partner</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>The drawers</h2>
          <Link href="/connectors">Full list</Link>
        </div>
        <div className="grid">
          {connectors.map((connector) => (
            <ConnectorCard key={connector.slug} connector={connector} />
          ))}
        </div>
      </section>

      <section className="section split">
        <div>
          <h2>How Muse uses them</h2>
          <p className="lede">
            A connector is an API Muse can call while finishing a task you asked for. Telep’s
            pattern is consistent: the agent prepares a draft; a human reviews the exact content and
            pays; a provider performs the irreversible step.
          </p>
        </div>
        <div className="notice">
          PaperSend is the first Telep connector submitted to Meta’s Muse Connector Platform. That
          is a filing for review, not an approval, featured placement, or partnership.
        </div>
      </section>

      <p className="footnote">
        BarkMarks and CallCatch were internal prototypes only. They are not catalog products and are
        not offered as Muse connectors.
      </p>
    </>
  );
}
