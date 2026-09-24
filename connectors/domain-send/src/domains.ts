import { applyEvent, memoryStore, withoutOwner } from "@telep/platform";

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

const domains = memoryStore<Domain>();

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
  return domains.save(record);
}

export const getDomain = domains.get;
export const listDomains = domains.list;
export const resetDomains = domains.reset;
export const publicDomain = withoutOwner<Domain>;

export function demoEvent(id: string, ownerKeyId: string, event: string): Domain {
  return applyEvent(getDomain(id, ownerKeyId), "Domain not found", event, {
    paid: { from: "draft", to: "paid", verb: "mark paid" },
    active: { from: "paid", to: "active", verb: "activate" },
    failed: { from: "paid", to: "failed", verb: "fail" },
  });
}
