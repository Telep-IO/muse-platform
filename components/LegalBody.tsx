import type { ReactNode } from "react";
import Link from "next/link";
import { LEGAL_DISCLAIMER, LEGAL_UPDATED, type LegalSection } from "@/lib/legal";

export function LegalBody({ body }: { body: string[] }) {
  const items: string[] = [];
  const blocks: ReactNode[] = [];
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
  return <>{blocks}</>;
}

export function LegalArticle({
  kicker,
  title,
  sections,
  related,
  contactLead,
}: {
  kicker: string;
  title: string;
  sections: LegalSection[];
  related?: { href: string; label: string };
  contactLead?: string;
}) {
  return (
    <article className="product-hero prose">
      <div className="kicker">{kicker}</div>
      <h1>{title}</h1>
      <p>Last updated {LEGAL_UPDATED}. Contact jon@telep.io.</p>
      <p>{LEGAL_DISCLAIMER}</p>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <LegalBody body={section.body} />
        </section>
      ))}
      <h2>Contact</h2>
      <p>
        {contactLead ? `${contactLead} ` : null}
        <a href="mailto:jon@telep.io">jon@telep.io</a>.
      </p>
      {related ? (
        <p>
          Related: <Link href={related.href}>{related.label}</Link>
          {" · "}
          <Link href="/privacy">Platform privacy</Link>
          {" · "}
          <Link href="/terms">Platform terms</Link>
        </p>
      ) : null}
    </article>
  );
}
