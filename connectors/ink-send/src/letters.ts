import { applyEvent, memoryStore, parsePostalAddress, withoutOwner } from "@telep/platform";

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

const letters = memoryStore<Letter>();

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
  const to = parsePostalAddress(input.to, "to", { each: true });
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
  return letters.save(letter);
}

export const getLetter = letters.get;
export const listLetters = letters.list;
export const resetLetters = letters.reset;
export const publicLetter = withoutOwner<Letter>;

export function demoEvent(id: string, ownerKeyId: string, event: string): Letter {
  return applyEvent(getLetter(id, ownerKeyId), "Letter not found", event, {
    paid: { from: "draft", to: "paid", verb: "mark paid" },
    sent: { from: "paid", to: "sent", verb: "send" },
  });
}
