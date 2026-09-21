import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell">
      <section className="product-hero">
        <div className="kicker">404</div>
        <h1>No such drawer</h1>
        <p className="lede">That path is not in the catalog.</p>
        <Link className="btn" href="/connectors">
          Back to connectors
        </Link>
      </section>
    </div>
  );
}
