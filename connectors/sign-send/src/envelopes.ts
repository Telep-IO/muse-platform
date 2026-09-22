import { applyEvent, memoryStore, withoutOwner } from "@telep/platform";

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
  fulfillment: "stub" | "live";
};

export const PRICE_CENTS = 299;
export const MAX_PAGES = 5;
export const MAX_SIGNERS = 5;

const STUB_NOTE =
  "Gateway stub: envelope is recorded in-memory only. E-signature provider fulfillment (DocuSign planned) is not wired on this gateway yet. Do not treat this as a sent signature request.";

const envelopes = memoryStore<Envelope>();

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
  live?: boolean;
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
    note: input.live
      ? "Draft only. No signature request was sent. A human must review and pay before the e-sign provider is asked to send."
      : STUB_NOTE,
    fulfillment: input.live ? "live" : "stub",
  };
  return envelopes.save(envelope);
}

export const getEnvelope = envelopes.get;
export const listEnvelopes = envelopes.list;
export const resetEnvelopes = envelopes.reset;
export const publicEnvelope = withoutOwner<Envelope>;

export function demoEvent(id: string, ownerKeyId: string, event: string, signerEmail?: string): Envelope {
  const envelope = getEnvelope(id, ownerKeyId);
  if (event === "signed") {
    const current = applyEvent(envelope, "Envelope not found", event, {
      signed: { from: "sent", verb: "sign" },
    });
    const email = (signerEmail ?? "").trim().toLowerCase();
    const signer = current.signers.find((item) => item.email === email);
    if (!signer) throw new Error(`unknown signer: ${signerEmail}`);
    signer.status = "signed";
    if (current.signers.every((item) => item.status === "signed")) current.status = "signed";
    return current;
  }
  return applyEvent(envelope, "Envelope not found", event, {
    paid: { from: "draft", to: "paid", verb: "mark paid" },
    sent: { from: "paid", to: "sent", verb: "send" },
    declined: { from: "sent", to: "declined", verb: "decline" },
  });
}
