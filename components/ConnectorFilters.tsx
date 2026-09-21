import Link from "next/link";
import {
  CATEGORY_LABELS,
  CONNECTOR_CATEGORIES,
  CONNECTOR_STATUSES,
  STATUS_LABELS,
  type ConnectorCategory,
  type ConnectorStatus,
} from "@telep/registry";

export function ConnectorFilters({
  status,
  category,
}: {
  status: ConnectorStatus | "all";
  category: ConnectorCategory | "all";
}) {
  const statusHref = (value: string) => {
    const params = new URLSearchParams();
    if (value !== "all") params.set("status", value);
    if (category !== "all") params.set("category", category);
    const q = params.toString();
    return q ? `/connectors?${q}` : "/connectors";
  };
  const categoryHref = (value: string) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (value !== "all") params.set("category", value);
    const q = params.toString();
    return q ? `/connectors?${q}` : "/connectors";
  };

  return (
    <div>
      <div className="filters" aria-label="Filter by status">
        <Link className={status === "all" ? "active" : ""} href={statusHref("all")}>
          All statuses
        </Link>
        {CONNECTOR_STATUSES.map((value) => (
          <Link key={value} className={status === value ? "active" : ""} href={statusHref(value)}>
            {STATUS_LABELS[value]}
          </Link>
        ))}
      </div>
      <div className="filters" aria-label="Filter by category">
        <Link className={category === "all" ? "active" : ""} href={categoryHref("all")}>
          All categories
        </Link>
        {CONNECTOR_CATEGORIES.map((value) => (
          <Link key={value} className={category === value ? "active" : ""} href={categoryHref(value)}>
            {CATEGORY_LABELS[value]}
          </Link>
        ))}
      </div>
    </div>
  );
}
