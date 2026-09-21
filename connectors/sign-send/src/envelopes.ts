export type SignerStatus = "pending" | "signed" | "declined";

export type Signer = {
  name: string;
  email: string;
  order: number;
  status: SignerStatus;
};

export type EnvelopeStatus = "draft" | "paid" | "sent" | "signed" | "declined";

export type Envelope = {
  id: string;
  status: EnvelopeStatus;
  document: {
    filename: string;
    pages: number;
  };
  signers: Signer[];
  amountCents: number;
  currency: "usd";
  reviewUrl: string;
  createdAt: string;
  ownerKeyId: string;
  note: string;
};

export const PRICE_CENTS = 299;
export const MAX_PAGES = 5;
export const MAX_SIGNERS = 5;

const STUB_NOTE =
  "Gateway stub: envelope is recorded in-memory only. E-signature provider fulfillment (DocuSign planned) is not wired on this gateway yet. Do not treat this as a sent signature request.";

const envelopes = new Map<string, Envelope>();

function requireSigner(value: unknown, index: number): Omit<Signer, "order" | "status"> {
  if (!value || typeof value !== "object") {
    throw new Error(`signers[${index}] must be an object with name and email`);
  }
  const s = value as Record<string, unknown>;
  const name = String(s.name ?? "").trim();
  const email = String(s.email ?? "").trim().toLowerCase();
  if (!name) throw new Error(`signers[${index}].name is required`);
  if (!email || !email.includes("@")) throw new Error(`signers[${index}].email must be a valid email`);
  return { name, email };
}

export function createEnvelope(input: {
  document?: { filename?: string; pages?: number };
  signers: unknown;
  ownerKeyId: string;
  catalogOrigin: string;
}): Envelope {
  if (!Array.isArray(input.signers) || input.signers.length === 0) {
    throw new Error("signers must be a non-empty array (1-5 signers)");
  }
  if (input.signers.length > MAX_SIGNERS) {
    throw new Error(`at most ${MAX_SIGNERS} signers per envelope`);
  }
  const pages = Math.max(1, Math.min(MAX_PAGES, Number(input.document?.pages) || 1));
  const signers: Signer[] = input.signers.map((s, i) => ({
    ...requireSigner(s, i),
    order: i + 1,
    status: "pending" as SignerStatus,
  }));
  const seen = new Set(signers.map((s) => s.email));
  if (seen.size !== signers.length) {
    throw new Error("signer emails must be unique");
  }
  const id = `ss_${crypto.randomUUID()}`;
  const envelope: Envelope = {
    id,
    status: "draft",
    document: {
      filename: input.document?.filename || "contract.pdf",
      pages,
    },
    signers,
    amountCents: PRICE_CENTS,
    currency: "usd",
    reviewUrl: `${input.catalogOrigin}/connectors/sign-send#review-${id}`,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: STUB_NOTE,
  };
  envelopes.set(id, envelope);
  return envelope;
}

export function getEnvelope(id: string, ownerKeyId: string): Envelope | undefined {
  const envelope = envelopes.get(id);
  if (!envelope || envelope.ownerKeyId !== ownerKeyId) return undefined;
  return envelope;
}

export function listEnvelopes(ownerKeyId: string): Envelope[] {
  return [...envelopes.values()]
    .filter((e) => e.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicEnvelope(envelope: Envelope): Omit<Envelope, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = envelope;
  return rest;
}

/**
 * Test/demo-only state transitions. Never wired to a real provider.
 * paid -> sent -> signed (per signer) | declined.
 */
export function demoEvent(
  id: string,
  ownerKeyId: string,
  event: string,
  signerEmail?: string,
): Envelope {
  const envelope = getEnvelope(id, ownerKeyId);
  if (!envelope) throw new Error("Envelope not found");

  if (event === "paid") {
    if (envelope.status !== "draft") throw new Error(`cannot mark paid from status ${envelope.status}`);
    envelope.status = "paid";
    return envelope;
  }
  if (event === "sent") {
    if (envelope.status !== "paid") throw new Error(`cannot send from status ${envelope.status}`);
    envelope.status = "sent";
    return envelope;
  }
  if (event === "signed") {
    if (envelope.status !== "sent") throw new Error(`cannot sign from status ${envelope.status}`);
    const email = (signerEmail ?? "").trim().toLowerCase();
    const signer = envelope.signers.find((s) => s.email === email);
    if (!signer) throw new Error(`unknown signer: ${signerEmail}`);
    signer.status = "signed";
    if (envelope.signers.every((s) => s.status === "signed")) {
      envelope.status = "signed";
    }
    return envelope;
  }
  if (event === "declined") {
    if (envelope.status !== "sent") throw new Error(`cannot decline from status ${envelope.status}`);
    envelope.status = "declined";
    return envelope;
  }
  throw new Error(`unknown demo event: ${event}`);
}

/** Test helper — not used by production routes. */
export function resetEnvelopes(): void {
  envelopes.clear();
}
