export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <article className="product-hero prose">
      <div className="kicker">Telep IO</div>
      <h1>Terms</h1>
      <p>Last updated 21 September 2026. Contact jon@telep.io.</p>
      <p>
        The Telep Muse catalog and gateway are provided by Telep IO. They are independent of Meta.
        Listing a connector here is not a claim that Meta approved, featured, or partnered on it.
      </p>
      <h2>The service</h2>
      <p>
        The catalog describes Telep connectors. The gateway exposes HTTP and MCP endpoints. v0
        PaperSend jobs are stubs: creating a job does not mail a letter, charge a card, or bind a
        provider.
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
        Telep filed a connector for Meta review, not that Muse users can see it.
      </p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:jon@telep.io">jon@telep.io</a>
      </p>
    </article>
  );
}
