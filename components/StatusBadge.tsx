import type { ConnectorStatus } from "@telep/registry";
import { STATUS_LABELS } from "@telep/registry";

export function StatusBadge({ status }: { status: ConnectorStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}
