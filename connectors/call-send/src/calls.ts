import { applyEvent, memoryStore, withoutOwner } from "@telep/platform";

export type CallStatus = "draft" | "paid" | "queued" | "completed" | "failed";

export type Call = {
  id: string;
  status: CallStatus;
  to: string;
  script: string;
  voice: string;
  record: boolean;
  amountCents: number;
  currency: "usd";
  reviewUrl: string;
  createdAt: string;
  ownerKeyId: string;
  note: string;
  fulfillment: "stub" | "live";
};

export const PRICE_CENTS = 99;
export const MAX_SCRIPT_CHARS = 2000;

const STUB_NOTE =
  "Gateway stub: call is recorded in-memory only. Voice provider fulfillment (Twilio) is not wired on this gateway yet. V1 plays a human-reviewed verbatim TTS script; it is not an autonomous conversation. Do not treat this as a placed call.";

const calls = memoryStore<Call>();

export function createCall(input: {
  to: string;
  script: string;
  voice?: string;
  record?: boolean;
  ownerKeyId: string;
  catalogOrigin: string;
  live?: boolean;
}): Call {
  const to = String(input.to ?? "").trim();
  if (!to.startsWith("+") || to.length < 2) {
    throw new Error("to must be an E.164-ish phone number starting with +");
  }
  const script = String(input.script ?? "");
  if (!script.trim()) {
    throw new Error("script is required and must be non-empty");
  }
  if (script.length > MAX_SCRIPT_CHARS) {
    throw new Error(`script must be at most ${MAX_SCRIPT_CHARS} characters`);
  }
  const id = `cs_${crypto.randomUUID()}`;
  const call: Call = {
    id,
    status: "draft",
    to,
    script,
    voice: input.voice?.trim() || "alloy",
    record: input.record === true,
    amountCents: PRICE_CENTS,
    currency: "usd",
    reviewUrl: `${input.catalogOrigin}/connectors/call-send#review-${id}`,
    createdAt: new Date().toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: input.live
      ? "Draft only. No call was placed. A human must review the verbatim script and pay before Twilio is asked to dial."
      : STUB_NOTE,
    fulfillment: input.live ? "live" : "stub",
  };
  return calls.save(call);
}

export const getCall = calls.get;
export const listCalls = calls.list;
export const resetCalls = calls.reset;
export const publicCall = withoutOwner<Call>;

export function demoEvent(id: string, ownerKeyId: string, event: string): Call {
  return applyEvent(getCall(id, ownerKeyId), "Call not found", event, {
    paid: { from: "draft", to: "paid", verb: "mark paid" },
    queued: { from: "paid", to: "queued", verb: "queue" },
    ringing: { from: "queued", verb: "mark ringing" },
    answered: { from: "queued", verb: "mark answered" },
    completed: { from: "queued", to: "completed", verb: "complete" },
    failed: { from: "queued", to: "failed", verb: "fail" },
  });
}
