export type Address = {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country?: string;
};

export type Job = {
  id: string;
  status: "draft" | "queued" | "stubbed";
  sender: Address;
  recipient: Address;
  document: {
    filename: string;
    pages: number;
  };
  amountCents: number;
  currency: "usd";
  reviewUrl: string;
  createdAt: string;
  ownerKeyId: string;
  note: string;
};

const STUB_NOTE =
  "Gateway stub: job is recorded in-memory only. Full PDF rasterization and mail-provider fulfillment still live in the PaperSend app. Do not treat this as a mailed letter.";

const jobs = new Map<string, Job>();

export function priceCents(pages: number): number {
  const n = Math.max(1, Math.min(5, Math.floor(pages) || 1));
  return 499 + 25 * (n - 1);
}

function requireAddress(value: unknown, label: string): Address {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} is required`);
  }
  const a = value as Record<string, unknown>;
  const name = String(a.name ?? "").trim();
  const address_line1 = String(a.address_line1 ?? "").trim();
  const address_city = String(a.address_city ?? "").trim();
  const address_state = String(a.address_state ?? "").trim();
  const address_zip = String(a.address_zip ?? "").trim();
  if (!name || !address_line1 || !address_city || !address_state || !address_zip) {
    throw new Error(`${label} needs name, address_line1, address_city, address_state, address_zip`);
  }
  return {
    name,
    address_line1,
    address_line2: a.address_line2 ? String(a.address_line2) : "",
    address_city,
    address_state,
    address_zip,
    address_country: String(a.address_country ?? "US"),
  };
}

export function createJob(input: {
  sender: unknown;
  recipient: unknown;
  document?: { filename?: string; pages?: number };
  ownerKeyId: string;
  catalogOrigin: string;
}): Job {
  const sender = requireAddress(input.sender, "sender");
  const recipient = requireAddress(input.recipient, "recipient");
  const pages = Math.max(1, Math.min(5, Number(input.document?.pages) || 1));
  const id = `ps_${crypto.randomUUID()}`;
  const job: Job = {
    id,
    status: "stubbed",
    sender,
    recipient,
    document: {
      filename: input.document?.filename || "letter.pdf",
      pages,
    },
    amountCents: priceCents(pages),
    currency: "usd",
    reviewUrl: `${input.catalogOrigin}/connectors/paper-send#review-${id}`,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: STUB_NOTE,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string, ownerKeyId: string): Job | undefined {
  const job = jobs.get(id);
  if (!job || job.ownerKeyId !== ownerKeyId) return undefined;
  return job;
}

export function listJobs(ownerKeyId: string): Job[] {
  return [...jobs.values()]
    .filter((job) => job.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicJob(job: Job): Omit<Job, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = job;
  return rest;
}

/** Test helper — not used by production routes. */
export function resetJobs(): void {
  jobs.clear();
}
