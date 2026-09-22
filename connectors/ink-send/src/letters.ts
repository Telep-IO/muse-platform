export type LetterStatus = "draft" | "paid" | "sent";

export type LetterCard = "plain" | "thank-you" | "condolence" | "holiday";

export type LetterAddress = {
  name: string;
  address_line1: string;
  address_city: string;
  address_state: string;
  address_zip: string;
};

export type Letter = {
  id: string;
  status: LetterStatus;
  message: string;
  to: LetterAddress;
  card: LetterCard;
  handwriting_style: string;
  amountCents: number;
  currency: "usd";
  reviewUrl: string;
  createdAt: string;
  ownerKeyId: string;
  note: string;
  fulfillment: "stub" | "live";
};

export const PRICE_CENTS = 399;
export const MAX_MESSAGE_CHARS = 5000;
export const CARDS: LetterCard[] = ["plain", "thank-you", "condolence", "holiday"];

const STUB_NOTE =
  "Gateway stub: letter is recorded in-memory only. Handwritten-mail provider fulfillment (Handwrytten) is not wired on this gateway yet. Status 'sent' means accepted for mailing, not delivered (First Class is untracked). Do not treat this as a mailed letter.";

const letters = new Map<string, Letter>();

function requireAddress(value: unknown): LetterAddress {
  if (!value || typeof value !== "object") {
    throw new Error("to must be an object with name, address_line1, address_city, address_state, address_zip");
  }
  const t = value as Record<string, unknown>;
  const field = (key: string) => {
    const v = String(t[key] ?? "").trim();
    if (!v) throw new Error(`to.${key} is required`);
    return v;
  };
  return {
    name: field("name"),
    address_line1: field("address_line1"),
    address_city: field("address_city"),
    address_state: field("address_state"),
    address_zip: field("address_zip"),
  };
}

export function createLetter(input: {
  message: unknown;
  to: unknown;
  card?: unknown;
  handwriting_style?: unknown;
  ownerKeyId: string;
  catalogOrigin: string;
  live?: boolean;
}): Letter {
  const message = String(input.message ?? "").trim();
  if (!message) throw new Error("message is required and must be non-empty");
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new Error(`message must be at most ${MAX_MESSAGE_CHARS} characters`);
  }
  const to = requireAddress(input.to);
  const card = input.card === undefined ? "plain" : String(input.card);
  if (!(CARDS as string[]).includes(card)) {
    throw new Error(`card must be one of: ${CARDS.join(", ")}`);
  }
  const handwriting_style = String(input.handwriting_style ?? "casual").trim() || "casual";
  const id = `ik_${crypto.randomUUID()}`;
  const letter: Letter = {
    id,
    status: "draft",
    message,
    to,
    card: card as LetterCard,
    handwriting_style,
    amountCents: PRICE_CENTS,
    currency: "usd",
    reviewUrl: `${input.catalogOrigin}/connectors/ink-send#review-${id}`,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: input.live
      ? "Draft only. Handwrytten was not asked to write or mail. A human must review and pay first."
      : STUB_NOTE,
    fulfillment: input.live ? "live" : "stub",
  };
  letters.set(id, letter);
  return letter;
}

export function getLetter(id: string, ownerKeyId: string): Letter | undefined {
  const letter = letters.get(id);
  if (!letter || letter.ownerKeyId !== ownerKeyId) return undefined;
  return letter;
}

export function listLetters(ownerKeyId: string): Letter[] {
  return [...letters.values()]
    .filter((l) => l.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicLetter(letter: Letter): Omit<Letter, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = letter;
  return rest;
}

/**
 * Test/demo-only state transitions. Never wired to a real provider.
 * paid -> sent.
 */
export function demoEvent(id: string, ownerKeyId: string, event: string): Letter {
  const letter = getLetter(id, ownerKeyId);
  if (!letter) throw new Error("Letter not found");

  if (event === "paid") {
    if (letter.status !== "draft") throw new Error(`cannot mark paid from status ${letter.status}`);
    letter.status = "paid";
    return letter;
  }
  if (event === "sent") {
    if (letter.status !== "paid") throw new Error(`cannot send from status ${letter.status}`);
    letter.status = "sent";
    return letter;
  }
  throw new Error(`unknown demo event: ${event}`);
}

/** Test helper — not used by production routes. */
export function resetLetters(): void {
  letters.clear();
}
