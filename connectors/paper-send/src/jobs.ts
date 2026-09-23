import { HttpError, createDraftStore, parsePostalAddress, withoutOwner, type DraftStore, type Env } from "@telep/platform";
import { paperDatabaseUrl } from "./db";

export type Address = {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country?: string;
};

export type JobStatus = "draft" | "queued" | "stubbed" | "paid" | "submitted";

export type Job = {
  id: string;
  status: JobStatus;
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
  stripeSessionId?: string;
  stripeEventId?: string;
  lobId?: string;
  lobStatus?: string;
  expectedDelivery?: string | null;
  /** Set when Lob was refused or rejected. A later webhook must not pretend this mailed. */
  fulfillmentError?: string;
};

const STUB_NOTE =
  "Demo stub: this job is in memory only. Demo mode does not call Lob. Do not treat this as a mailed letter.";

const DRAFT_NOTE =
  "Draft only. Nothing has been transmitted. Lob is asked to send only after Stripe confirms payment.";

const memory = createDraftStore<Job>({ connector: "paper-send" });
let storeOverride: DraftStore<Job> | null = null;

export function useJobStore(store: DraftStore<Job> | null): void {
  storeOverride = store;
}

export function hasDurableJobStore(env: Env = process.env): boolean {
  return Boolean(storeOverride || paperDatabaseUrl(env));
}

function storeFor(env: Env): DraftStore<Job> {
  if (storeOverride) return storeOverride;
  const url = paperDatabaseUrl(env);
  if (!url) return memory;
  return createDraftStore<Job>({ connector: "paper-send", databaseUrl: url });
}

export function priceCents(pages: number): number {
  const n = Math.max(1, Math.min(5, Math.floor(pages) || 1));
  return 499 + 25 * (n - 1);
}

export async function createJob(
  input: {
    sender: unknown;
    recipient: unknown;
    document?: { filename?: string; pages?: number };
    ownerKeyId: string;
    catalogOrigin: string;
    live?: boolean;
  },
  env: Env = process.env,
): Promise<Job> {
  const live = input.live === true;
  if (live && !hasDurableJobStore(env)) {
    throw new HttpError(503, "database_required", "DATABASE_URL required");
  }
  const sender = parsePostalAddress(input.sender, "sender", { line2: true, country: true });
  const recipient = parsePostalAddress(input.recipient, "recipient", { line2: true, country: true });
  const pages = Math.max(1, Math.min(5, Number(input.document?.pages) || 1));
  const id = `ps_${crypto.randomUUID()}`;
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
    note: live ? DRAFT_NOTE : STUB_NOTE,
    fulfillment: live ? "live" : "stub",
  };
  return storeFor(env).save(job);
}

export function getJob(id: string, ownerKeyId: string, env: Env = process.env): Promise<Job | undefined> {
  return storeFor(env).get(id, ownerKeyId);
}

export function getJobById(id: string, env: Env = process.env): Promise<Job | undefined> {
  return storeFor(env).getById(id);
}

export function listJobs(ownerKeyId: string, env: Env = process.env): Promise<Job[]> {
  return storeFor(env).list(ownerKeyId);
}

export function saveJob(job: Job, env: Env = process.env): Promise<Job> {
  return storeFor(env).save(job);
}

export function recordJobEvent(eventId: string, jobId: string, env: Env = process.env): Promise<boolean> {
  return storeFor(env).recordEvent(eventId, jobId);
}

export async function attachCheckout(
  id: string,
  ownerKeyId: string,
  session: { id: string; mode: "live" | "stub" },
  env: Env = process.env,
): Promise<void> {
  if (session.mode !== "live") return;
  const job = await getJob(id, ownerKeyId, env);
  if (!job) return;
  await saveJob({ ...job, stripeSessionId: session.id }, env);
}

export function resetJobs(): void {
  storeOverride = null;
  void memory.reset();
}

export const publicJob = withoutOwner<Job>;
