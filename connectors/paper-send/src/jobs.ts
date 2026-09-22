import { memoryStore, parsePostalAddress, withoutOwner } from "@telep/platform";

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
  fulfillment: "stub" | "live";
};

const STUB_NOTE =
  "Gateway stub: job is recorded in-memory only. Full PDF rasterization and mail-provider fulfillment still live in the PaperSend app. Do not treat this as a mailed letter.";

const jobs = memoryStore<Job>();

export function priceCents(pages: number): number {
  const n = Math.max(1, Math.min(5, Math.floor(pages) || 1));
  return 499 + 25 * (n - 1);
}

export function createJob(input: {
  sender: unknown;
  recipient: unknown;
  document?: { filename?: string; pages?: number };
  ownerKeyId: string;
  catalogOrigin: string;
  live?: boolean;
}): Job {
  const sender = parsePostalAddress(input.sender, "sender", { line2: true, country: true });
  const recipient = parsePostalAddress(input.recipient, "recipient", { line2: true, country: true });
  const pages = Math.max(1, Math.min(5, Number(input.document?.pages) || 1));
  const id = `ps_${crypto.randomUUID()}`;
  const live = input.live === true;
  const job: Job = {
    id,
    status: live ? "draft" : "stubbed",
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
    note: live
      ? "Draft only. Lob was not asked to print or mail this job. A human must review and pay before any letter is created."
      : STUB_NOTE,
    fulfillment: live ? "live" : "stub",
  };
  return jobs.save(job);
}

export const getJob = jobs.get;
export const listJobs = jobs.list;
export const resetJobs = jobs.reset;
export const publicJob = withoutOwner<Job>;
