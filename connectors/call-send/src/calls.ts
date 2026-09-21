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
};

export const PRICE_CENTS = 99;
export const MAX_SCRIPT_CHARS = 2000;
export const MAX_CALL_MINUTES = 5;

const STUB_NOTE =
  "Gateway stub: call is recorded in-memory only. Voice provider fulfillment (Twilio) is not wired on this gateway yet. V1 plays a human-reviewed verbatim TTS script; it is not an autonomous conversation. Do not treat this as a placed call.";

const calls = new Map<string, Call>();

export function createCall(input: {
  to: string;
  script: string;
  voice?: string;
  record?: boolean;
  ownerKeyId: string;
  catalogOrigin: string;
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
    note: STUB_NOTE,
  };
  calls.set(id, call);
  return call;
}

export function getCall(id: string, ownerKeyId: string): Call | undefined {
  const call = calls.get(id);
  if (!call || call.ownerKeyId !== ownerKeyId) return undefined;
  return call;
}

export function listCalls(ownerKeyId: string): Call[] {
  return [...calls.values()]
    .filter((c) => c.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicCall(call: Call): Omit<Call, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = call;
  return rest;
}

/**
 * Test/demo-only state transitions. Never wired to a real provider.
 * paid (draft->paid), queued (paid->queued), ringing/answered (queued->queued),
 * completed (queued->completed), failed (queued->failed).
 */
export function demoEvent(id: string, ownerKeyId: string, event: string): Call {
  const call = getCall(id, ownerKeyId);
  if (!call) throw new Error("Call not found");

  if (event === "paid") {
    if (call.status !== "draft") throw new Error(`cannot mark paid from status ${call.status}`);
    call.status = "paid";
    return call;
  }
  if (event === "queued") {
    if (call.status !== "paid") throw new Error(`cannot queue from status ${call.status}`);
    call.status = "queued";
    return call;
  }
  if (event === "ringing" || event === "answered") {
    if (call.status !== "queued") throw new Error(`cannot mark ${event} from status ${call.status}`);
    return call;
  }
  if (event === "completed") {
    if (call.status !== "queued") throw new Error(`cannot complete from status ${call.status}`);
    call.status = "completed";
    return call;
  }
  if (event === "failed") {
    if (call.status !== "queued") throw new Error(`cannot fail from status ${call.status}`);
    call.status = "failed";
    return call;
  }
  throw new Error(`unknown demo event: ${event}`);
}

/** Test helper — not used by production routes. */
export function resetCalls(): void {
  calls.clear();
}
