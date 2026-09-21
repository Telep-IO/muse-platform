import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">Telep Muse</span>
        <span className="brand-sub">Connector catalog</span>
      </Link>
      <nav className="nav" aria-label="Primary">
        <Link href="/connectors">Connectors</Link>
        <Link href="/docs">Docs</Link>
        <a href="https://muse.ai/platform" rel="noreferrer">
          Muse platform
        </a>
      </nav>
    </header>
  );
}
