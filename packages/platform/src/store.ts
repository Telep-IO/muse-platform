export type OwnedRecord = {
  id: string;
  ownerKeyId: string;
  createdAt: string;
};

export function memoryStore<T extends OwnedRecord>() {
  const items = new Map<string, T>();
  return {
    save(item: T): T {
      items.set(item.id, item);
      return item;
    },
    get(id: string, ownerKeyId: string): T | undefined {
      const item = items.get(id);
      return item && item.ownerKeyId === ownerKeyId ? item : undefined;
    },
    list(ownerKeyId: string, sortKey: keyof T = "createdAt"): T[] {
      return [...items.values()]
        .filter((item) => item.ownerKeyId === ownerKeyId)
        .sort((a, b) => String(b[sortKey]).localeCompare(String(a[sortKey])));
    },
    delete(id: string): void {
      items.delete(id);
    },
    reset(): void {
      items.clear();
    },
  };
}

export function withoutOwner<T extends { ownerKeyId: string }>(item: T): Omit<T, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = item;
  return rest;
}

type StatusStep = { from: string; to?: string; verb: string };

export function applyEvent<T extends { status: string }>(
  item: T | undefined,
  missing: string,
  event: string,
  table: Record<string, StatusStep>,
): T {
  if (!item) throw new Error(missing);
  const step = table[event];
  if (!step) throw new Error(`unknown demo event: ${event}`);
  if (item.status !== step.from) throw new Error(`cannot ${step.verb} from status ${item.status}`);
  if (step.to) item.status = step.to as T["status"];
  return item;
}
