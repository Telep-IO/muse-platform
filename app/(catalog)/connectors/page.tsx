import { CONNECTOR_CATEGORIES, CONNECTOR_STATUSES, filterConnectors } from "@telep/registry";
import type { ConnectorCategory, ConnectorStatus } from "@telep/registry";
import { ConnectorCard } from "@/components/ConnectorCard";
import { ConnectorFilters } from "@/components/ConnectorFilters";

function asStatus(value: string | undefined): ConnectorStatus | "all" {
  if (value && (CONNECTOR_STATUSES as readonly string[]).includes(value)) {
    return value as ConnectorStatus;
  }
  return "all";
}

function asCategory(value: string | undefined): ConnectorCategory | "all" {
  if (value && (CONNECTOR_CATEGORIES as readonly string[]).includes(value)) {
    return value as ConnectorCategory;
  }
  return "all";
}

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const params = await searchParams;
  const status = asStatus(params.status);
  const category = asCategory(params.category);
  const connectors = filterConnectors({ status, category });

  return (
    <section className="product-hero">
      <div className="kicker">Index</div>
      <h1>Connectors</h1>
      <p className="lede">
        Filter by status or category. Status is Telep’s own: planned, building, submitted to Muse,
        or ready for use. Meta’s directory is separate.
      </p>
      <ConnectorFilters status={status} category={category} />
      <div className="grid">
        {connectors.map((connector) => (
          <ConnectorCard key={connector.slug} connector={connector} />
        ))}
      </div>
      {connectors.length === 0 ? <p>No connectors match those filters.</p> : null}
    </section>
  );
}
