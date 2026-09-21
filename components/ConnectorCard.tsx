import Link from "next/link";
import { CATEGORY_LABELS, type Connector } from "@telep/registry";
import { StatusBadge } from "./StatusBadge";

export function ConnectorCard({ connector }: { connector: Connector }) {
  return (
    <Link className="card" href={`/connectors/${connector.slug}`} data-slug={connector.slug}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <StatusBadge status={connector.status} />
        <span className="meta">{CATEGORY_LABELS[connector.category]}</span>
      </div>
      <h3>{connector.name}</h3>
      <p>{connector.oneLiner}</p>
      <span className="meta">{connector.apiBasePath}</span>
    </Link>
  );
}
