export type CarrierGuess = "ups" | "usps" | "fedex" | "dhl" | "unknown";

export type MockPhase = "label_created" | "in_transit" | "out_for_delivery" | "delivered";

export type ParcelEvent = {
  at: string;
  mockStatus: MockPhase;
  location: string;
  description: string;
};

export type Parcel = {
  id: string;
  status: "stubbed" | "tracked";
  trackingNumber: string;
  carrierGuess: CarrierGuess;
  mockPhase: MockPhase;
  origin?: string;
  destination?: string;
  watching: boolean;
  events: ParcelEvent[];
  createdAt: string;
  updatedAt: string;
  ownerKeyId: string;
  note: string;
  fulfillment: "stub" | "live";
};

export const STUB_NOTE =
  "Gateway stub: this timeline is hashed from the tracking number. No carrier API (UPS, USPS, FedEx, DHL, or otherwise) was called. carrierGuess is from number shape only. Do not treat this as a live shipment.";

export const STUB_ACCOUNT_NOTE =
  "Gateway stub account. ShipSignal on this edge does not poll carriers or bill tracking usage.";

const PHASES: MockPhase[] = ["label_created", "in_transit", "out_for_delivery", "delivered"];

const LOCATIONS = [
  "Origin facility (stub)",
  "Transit hub (stub)",
  "Regional sort (stub)",
  "Local depot (stub)",
  "Destination area (stub)",
];

const parcels = new Map<string, Parcel>();

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeTrackingNumber(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  if (!raw) throw new Error("trackingNumber is required");
  if (raw.length < 8 || raw.length > 40) {
    throw new Error("trackingNumber must be 8–40 characters");
  }
  if (!/^[A-Z0-9]+$/.test(raw)) {
    throw new Error("trackingNumber must be alphanumeric");
  }
  return raw;
}

export function guessCarrier(trackingNumber: string): CarrierGuess {
  if (/^1Z[0-9A-Z]{16}$/.test(trackingNumber)) return "ups";
  if (/^(94|93|92|95)\d{18,22}$/.test(trackingNumber)) return "usps";
  if (/^\d{12}$/.test(trackingNumber) || /^\d{15}$/.test(trackingNumber)) return "fedex";
  if (/^\d{10}$/.test(trackingNumber)) return "dhl";
  return "unknown";
}

function optionalPlace(value: unknown, label: string): string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (text.length > 120) throw new Error(`${label} is too long`);
  return text;
}

function mockTimeline(trackingNumber: string, now: Date): { mockPhase: MockPhase; events: ParcelEvent[] } {
  const hex = fnv1aHex(trackingNumber);
  const phaseIndex = parseInt(hex.slice(0, 2), 16) % PHASES.length;
  const mockPhase = PHASES[phaseIndex];
  const locSeed = parseInt(hex.slice(2, 4), 16);
  const events: ParcelEvent[] = [];
  for (let i = 0; i <= phaseIndex; i += 1) {
    const at = new Date(now.getTime() - (phaseIndex - i) * 36 * 3600 * 1000);
    events.push({
      at: at.toISOString(),
      mockStatus: PHASES[i],
      location: LOCATIONS[(locSeed + i) % LOCATIONS.length],
      description: `Stub event ${i + 1} of ${phaseIndex + 1} hashed from ${trackingNumber}. Not a carrier scan.`,
    });
  }
  return { mockPhase, events };
}

export function createParcel(input: {
  trackingNumber: unknown;
  origin?: unknown;
  destination?: unknown;
  ownerKeyId: string;
}): Parcel {
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  const origin = optionalPlace(input.origin, "origin");
  const destination = optionalPlace(input.destination, "destination");
  const now = new Date();
  const timeline = mockTimeline(trackingNumber, now);
  const id = `ss_${crypto.randomUUID()}`;
  const parcel: Parcel = {
    id,
    status: "stubbed",
    trackingNumber,
    carrierGuess: guessCarrier(trackingNumber),
    mockPhase: timeline.mockPhase,
    origin,
    destination,
    watching: false,
    events: timeline.events,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ownerKeyId: input.ownerKeyId,
    note: STUB_NOTE,
    fulfillment: "stub",
  };
  parcels.set(id, parcel);
  return parcel;
}

export function getParcel(id: string, ownerKeyId: string): Parcel | undefined {
  const parcel = parcels.get(id);
  if (!parcel || parcel.ownerKeyId !== ownerKeyId) return undefined;
  return parcel;
}

export function listParcels(ownerKeyId: string): Parcel[] {
  return [...parcels.values()]
    .filter((parcel) => parcel.ownerKeyId === ownerKeyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function refreshParcel(id: string, ownerKeyId: string): Parcel | undefined {
  const parcel = getParcel(id, ownerKeyId);
  if (!parcel) return undefined;
  const now = new Date();
  const timeline = mockTimeline(parcel.trackingNumber, now);
  parcel.mockPhase = timeline.mockPhase;
  parcel.events = timeline.events;
  parcel.updatedAt = now.toISOString();
  parcel.note = STUB_NOTE;
  return parcel;
}

export function setWatching(id: string, ownerKeyId: string, watching: boolean): Parcel | undefined {
  const parcel = getParcel(id, ownerKeyId);
  if (!parcel) return undefined;
  parcel.watching = watching;
  parcel.updatedAt = new Date().toISOString();
  return parcel;
}

export function getAccount(ownerKeyId: string) {
  const owned = listParcels(ownerKeyId);
  return {
    product: "shipsignal",
    plan: "stub",
    parcelsTracked: owned.length,
    watches: owned.filter((parcel) => parcel.watching).length,
    note: STUB_ACCOUNT_NOTE,
  };
}

export function publicParcel(parcel: Parcel): Omit<Parcel, "ownerKeyId"> {
  const { ownerKeyId: _omit, ...rest } = parcel;
  return rest;
}

export function forgetParcel(id: string): void {
  parcels.delete(id);
}

/** Test helper — not used by production routes. */
export function resetParcels(): void {
  parcels.clear();
}
