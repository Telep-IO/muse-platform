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
};

export const PRICE_PER_PAGE_CENTS = 99;
export const MAX_PAGES = 10;

const STUB_NOTE =
  "Gateway stub: fax is recorded in-memory only. Fax provider fulfillment (Phaxio / Telnyx) is not wired on this gateway yet. Do not treat this as a transmitted fax.";

const faxes = new Map<string, Fax>();

const E164_RE = /^\+(?=.*\d)[0-9\-\s]+$/;

export function createFax(input: {
  to?: unknown;
  document?: { filename?: string; pages?: number };
  coverPage?: unknown;
  ownerKeyId: string;
  catalogOrigin: string;
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
    note: STUB_NOTE,
  };
  faxes.set(id, fax);
  return fax;
}

export function getFax(id: string, ownerKeyId: string): Fax | undefined {
  const fax = faxes.get(id);
  if (!fax || fax.ownerKeyId !== ownerKeyId) return undefined;
  return fax;
}

export function listFaxes(ownerKeyId: string): Fax[] {
  return [...faxes.values()]
    .filter((f) => f.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicFax(fax: Fax): Omit<Fax, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = fax;
  return rest;
}

/**
 * Test/demo-only state transitions. Never wired to a real provider.
 * paid -> sending -> delivered | failed.
 */
export function demoEvent(id: string, ownerKeyId: string, event: string): Fax {
  const fax = getFax(id, ownerKeyId);
  if (!fax) throw new Error("Fax not found");

  if (event === "paid") {
    if (fax.status !== "draft") throw new Error(`cannot mark paid from status ${fax.status}`);
    fax.status = "paid";
    return fax;
  }
  if (event === "sending") {
    if (fax.status !== "paid") throw new Error(`cannot send from status ${fax.status}`);
    fax.status = "sending";
    return fax;
  }
  if (event === "delivered") {
    if (fax.status !== "sending") throw new Error(`cannot deliver from status ${fax.status}`);
    fax.status = "delivered";
    return fax;
  }
  if (event === "failed") {
    if (fax.status !== "sending") throw new Error(`cannot fail from status ${fax.status}`);
    fax.status = "failed";
    return fax;
  }
  throw new Error(`unknown demo event: ${event}`);
}

/** Test helper — not used by production routes. */
export function resetFaxes(): void {
  faxes.clear();
}
