import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        Built by <a href="https://telep.io">Telep IO</a> · {SITE.contact}
      </div>
      <div>
        <Link href="/privacy">Privacy</Link>
        {" · "}
        <Link href="/terms">Terms</Link>
        {" · "}
        <Link href="/docs">Gateway docs</Link>
      </div>
      <p className="fine-print">
        Telep IO builds independent connectors that work with Muse, Meta’s personal assistant.
        Telep is not affiliated with, endorsed by, or a partner of Meta. Users connect products
        through Meta’s own review process at{" "}
        <a href={SITE.musePlatform} rel="noreferrer">
          muse.ai/platform
        </a>
        .
      </p>
    </footer>
  );
}
