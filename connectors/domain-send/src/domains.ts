export type DomainStatus = "draft" | "paid" | "active" | "failed";

export type Domain = {
  id: string;
  status: DomainStatus;
  domain: string;
  tld: string;
  years: 1 | 2;
  amountCents: number;
  currency: "usd";
  whoisPrivacy: true;
  reviewUrl: string;
  createdAt: string;
  ownerKeyId: string;
  note: string;
  fulfillment: "stub" | "live";
};

export type AvailabilityResult = {
  available: boolean;
  reason?: "unsupported-tld" | "taken" | "invalid-domain";
  priceCents?: number;
  years?: number;
};

export const YEARLY_PRICE_CENTS: Record<string, number> = {
  com: 1499,
  net: 1499,
  org: 1399,
  io: 3999,
  dev: 1499,
  app: 1999,
  tools: 2999,
};

const SUPPORTED_TLDS = Object.keys(YEARLY_PRICE_CENTS);

const STUB_NOTE =
  "Gateway stub: registration is recorded in-memory only. Registrar fulfillment (OpenSRS/Tucows reseller) is not wired on this gateway yet. Only registry-confirmed 'active' means registered. Do not treat this as a registered domain.";

const domains = new Map<string, Domain>();

function normalizeDomain(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function tldOf(domain: string): string {
  const labels = domain.split(".");
  return labels[labels.length - 1];
}

export function checkAvailability(value: unknown): AvailabilityResult {
  const domain = normalizeDomain(value);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return { available: false, reason: "invalid-domain" };
  }
  const tld = tldOf(domain);
  if (!SUPPORTED_TLDS.includes(tld)) {
    return { available: false, reason: "unsupported-tld" };
  }
  const name = domain.slice(0, -(tld.length + 1));
  if (name.startsWith("taken-")) {
    return { available: false, reason: "taken" };
  }
  return { available: true, priceCents: YEARLY_PRICE_CENTS[tld], years: 1 };
}

export function createDomain(input: {
  domain: unknown;
  years?: unknown;
  ownerKeyId: string;
  catalogOrigin: string;
  live?: boolean;
}): Domain {
  const domain = normalizeDomain(input.domain);
  if (!domain) throw new Error("domain is required");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    throw new Error("domain must be a valid domain name (e.g. example.com)");
  }
  const tld = tldOf(domain);
  if (!SUPPORTED_TLDS.includes(tld)) {
    throw new Error(`tld .${tld} is not supported (${SUPPORTED_TLDS.join(", ")})`);
  }
  const years = input.years === undefined || input.years === null ? 1 : Number(input.years);
  if (years !== 1 && years !== 2) {
    throw new Error("years must be 1 or 2");
  }
  const id = `ds_${crypto.randomUUID()}`;
  const record: Domain = {
    id,
    status: "draft",
    domain,
    tld,
    years: years as 1 | 2,
    amountCents: YEARLY_PRICE_CENTS[tld] * years,
    currency: "usd",
    whoisPrivacy: true,
    reviewUrl: `${input.catalogOrigin}/connectors/domain-send#review-${id}`,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: input.live
      ? "Draft only. This name was not registered. A human must review and pay before OpenSRS is asked to register."
      : STUB_NOTE,
    fulfillment: input.live ? "live" : "stub",
  };
  domains.set(id, record);
  return record;
}

export function getDomain(id: string, ownerKeyId: string): Domain | undefined {
  const record = domains.get(id);
  if (!record || record.ownerKeyId !== ownerKeyId) return undefined;
  return record;
}

export function listDomains(ownerKeyId: string): Domain[] {
  return [...domains.values()]
    .filter((d) => d.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicDomain(domain: Domain): Omit<Domain, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = domain;
  return rest;
}

/**
 * Test/demo-only state transitions. Never wired to a real registrar.
 * paid (draft -> paid), active (paid -> active), failed (paid -> failed).
 */
export function demoEvent(id: string, ownerKeyId: string, event: string): Domain {
  const record = getDomain(id, ownerKeyId);
  if (!record) throw new Error("Domain not found");

  if (event === "paid") {
    if (record.status !== "draft") throw new Error(`cannot mark paid from status ${record.status}`);
    record.status = "paid";
    return record;
  }
  if (event === "active") {
    if (record.status !== "paid") throw new Error(`cannot activate from status ${record.status}`);
    record.status = "active";
    return record;
  }
  if (event === "failed") {
    if (record.status !== "paid") throw new Error(`cannot fail from status ${record.status}`);
    record.status = "failed";
    return record;
  }
  throw new Error(`unknown demo event: ${event}`);
}

/** Test helper — not used by production routes. */
export function resetDomains(): void {
  domains.clear();
}
