import { applyEvent, memoryStore, withoutOwner } from "@telep/platform";

export type FaxStatus = "draft" | "paid" | "sending" | "delivered" | "failed";

export type Fax = {
  id: string;
  status: FaxStatus;
  to: string;
  document: {
    filename: string;
    pages: number;
  };
  coverPage: boolean;
  amountCents: number;
  currency: "usd";
  reviewUrl: string;
  createdAt: string;
  ownerKeyId: string;
  note: string;
  fulfillment: "stub" | "live";
};

export const PRICE_PER_PAGE_CENTS = 99;
export const MAX_PAGES = 10;

const STUB_NOTE =
  "Gateway stub: fax is recorded in-memory only. Fax provider fulfillment (Sinch Fax API v3, formerly Phaxio) is not wired on this gateway yet. Do not treat this as a transmitted fax.";

const faxes = memoryStore<Fax>();

const E164_RE = /^\+(?=.*\d)[0-9\-\s]+$/;

export function createFax(input: {
  to?: unknown;
  document?: { filename?: string; pages?: number };
  coverPage?: unknown;
  ownerKeyId: string;
  catalogOrigin: string;
  live?: boolean;
}): Fax {
  const to = String(input.to ?? "").trim();
  if (!to) throw new Error("to is required");
  if (!E164_RE.test(to)) {
    throw new Error("to must look like E.164: start with + followed by digits, dashes, or spaces");
  }
  if (!input.document || typeof input.document !== "object") {
    throw new Error("document is required");
  }
  const pages = Number(input.document.pages);
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) {
    throw new Error(`document.pages must be an integer from 1 to ${MAX_PAGES}`);
  }
  const coverPage = input.coverPage === true;
  const totalPages = pages + (coverPage ? 1 : 0);
  const id = `fx_${crypto.randomUUID()}`;
  const fax: Fax = {
    id,
    status: "draft",
    to,
    document: {
      filename: input.document.filename || "document.pdf",
      pages,
    },
    coverPage,
    amountCents: totalPages * PRICE_PER_PAGE_CENTS,
    currency: "usd",
    reviewUrl: `${input.catalogOrigin}/connectors/fax-send#review-${id}`,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: input.live
      ? "Draft only. Nothing was transmitted. A human must review and pay before the fax provider is asked to send."
      : STUB_NOTE,
    fulfillment: input.live ? "live" : "stub",
  };
  return faxes.save(fax);
}

export const getFax = faxes.get;
export const listFaxes = faxes.list;
export const resetFaxes = faxes.reset;
export const publicFax = withoutOwner<Fax>;

export function demoEvent(id: string, ownerKeyId: string, event: string): Fax {
  return applyEvent(getFax(id, ownerKeyId), "Fax not found", event, {
    paid: { from: "draft", to: "paid", verb: "mark paid" },
    sending: { from: "paid", to: "sending", verb: "send" },
    delivered: { from: "sending", to: "delivered", verb: "deliver" },
    failed: { from: "sending", to: "failed", verb: "fail" },
  });
}
