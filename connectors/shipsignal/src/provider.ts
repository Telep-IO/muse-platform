import { HttpError, assertProviderOk, basicAuthHeader, envValue, providerRequest, readAppMode, requireCredentials, type Env } from "@telep/platform";
import { createParcel, forgetParcel, getAccount, getParcel, guessCarrier, refreshParcel, type CarrierGuess, type MockPhase, type Parcel, type ParcelEvent } from "./parcels";

const AFTERSHIP = "https://api.aftership.com/tracking/2026-01";

type LiveTrack = {
  carrier?: CarrierGuess;
  phase: MockPhase;
  events: ParcelEvent[];
  note: string;
};

export function shipRuntime(env: Env = process.env) {
  const mode = readAppMode("SHIPSIGNAL_APP_MODE", env);
  return {
    mode,
    provider: envValue("SHIPSIGNAL_PROVIDER", env).toLowerCase(),
    apiKey: envValue("SHIPSIGNAL_API_KEY", env),
  };
}

function assertReady(env: Env) {
  const runtime = shipRuntime(env);
  requireCredentials(runtime.mode, "SHIPSIGNAL_APP_MODE", [
    { name: "SHIPSIGNAL_PROVIDER", value: runtime.provider },
    { name: "SHIPSIGNAL_API_KEY", value: runtime.apiKey },
  ]);
  if (runtime.mode === "demo") throw new HttpError(500, "internal_error", "assertReady called in demo mode");
  if (!["aftership", "shippo", "easypost"].includes(runtime.provider)) {
    throw new HttpError(
      400,
      "unsupported_provider",
      `SHIPSIGNAL_PROVIDER must be aftership, shippo, or easypost. "${runtime.provider}" is not called from the gateway.`,
    );
  }
  return runtime as { mode: "test" | "live"; provider: "aftership" | "shippo" | "easypost"; apiKey: string };
}

function phaseFrom(status: string): MockPhase {
  const value = status.toLowerCase();
  if (value.includes("deliver")) return "delivered";
  if (value.includes("out_for_delivery") || value.includes("out for delivery")) return "out_for_delivery";
  if (value.includes("transit") || value.includes("pickup")) return "in_transit";
  return "label_created";
}

function carrierFrom(value: string | undefined, fallback: CarrierGuess): CarrierGuess {
  const slug = (value ?? "").toLowerCase();
  if (slug.includes("usps")) return "usps";
  if (slug.includes("ups")) return "ups";
  if (slug.includes("fedex")) return "fedex";
  if (slug.includes("dhl")) return "dhl";
  return fallback;
}

function shippoSlug(guess: CarrierGuess): string | null {
  if (guess === "ups") return "ups";
  if (guess === "usps") return "usps";
  if (guess === "fedex") return "fedex";
  if (guess === "dhl") return "dhl_express";
  return null;
}

async function trackAftership(trackingNumber: string, apiKey: string): Promise<LiveTrack> {
  const headers = { "as-api-key": apiKey, "Content-Type": "application/json" };
  const listed = await providerRequest(
    `${AFTERSHIP}/trackings?tracking_numbers=${encodeURIComponent(trackingNumber)}&limit=1`,
    { headers },
  );
  assertProviderOk(listed, "AfterShip");
  let tracking = firstTracking(listed.json);
  let registered = false;
  if (!tracking) {
    const created = await providerRequest(`${AFTERSHIP}/trackings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tracking_number: trackingNumber }),
    });
    assertProviderOk(created, "AfterShip");
    tracking = unwrapTracking(created.json);
    registered = true;
  }
  return toLive(tracking, trackingNumber, registered
    ? "AfterShip registered this number (plan quota). No postage was purchased."
    : "Tracking returned by AfterShip. No postage was purchased.");
}

function firstTracking(json: unknown): Record<string, unknown> | null {
  const data = asRecord(asRecord(json).data);
  const list = data.trackings;
  if (Array.isArray(list) && list[0] && typeof list[0] === "object") return list[0] as Record<string, unknown>;
  return null;
}

function unwrapTracking(json: unknown): Record<string, unknown> {
  const data = asRecord(asRecord(json).data);
  if (data.tracking && typeof data.tracking === "object") return data.tracking as Record<string, unknown>;
  if (data.tracking_number) return data;
  return asRecord(json);
}

async function trackShippo(trackingNumber: string, apiKey: string, guess: CarrierGuess): Promise<LiveTrack> {
  const slugs = shippoSlug(guess) ? [shippoSlug(guess)!] : ["usps", "ups", "fedex", "dhl_express"];
  let lastStatus = 404;
  for (const slug of slugs) {
    const response = await providerRequest(`https://api.goshippo.com/tracks/${slug}/${encodeURIComponent(trackingNumber)}`, {
      headers: { Authorization: `ShippoToken ${apiKey}` },
    });
    if (response.status === 401 || response.status === 403) assertProviderOk(response, "Shippo");
    if (response.status >= 200 && response.status < 300) {
      const body = asRecord(response.json);
      const history = Array.isArray(body.tracking_history) ? body.tracking_history : [];
      const events: ParcelEvent[] = history.slice(-8).map((item) => {
        const row = asRecord(item);
        const location = asRecord(row.location);
        const place = [location.city, location.state].filter(Boolean).join(", ");
        return {
          at: String(row.status_date ?? new Date().toISOString()),
          mockStatus: phaseFrom(String(row.status ?? "")),
          location: place || "Carrier",
          description: String(row.status_details ?? row.status ?? "Scan"),
        };
      });
      const status = asRecord(body.tracking_status);
      const phase = phaseFrom(String(status.status ?? events.at(-1)?.mockStatus ?? ""));
      return {
        carrier: carrierFrom(String(body.carrier ?? slug), guess),
        phase,
        events: events.length ? events : [{
          at: new Date().toISOString(),
          mockStatus: phase,
          location: "Carrier",
          description: String(status.status_details ?? "No scans yet"),
        }],
        note: "Tracking returned by Shippo. No label was purchased.",
      };
    }
    lastStatus = response.status;
  }
  throw new HttpError(502, "provider_error", `Shippo returned HTTP ${lastStatus} for this tracking number`);
}

async function trackEasypost(trackingNumber: string, apiKey: string, guess: CarrierGuess): Promise<LiveTrack> {
  const carrier = guess === "unknown" ? undefined : guess === "dhl" ? "DHLExpress" : guess.toUpperCase();
  const response = await providerRequest("https://api.easypost.com/v2/trackers", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tracker: { tracking_code: trackingNumber, ...(carrier ? { carrier } : {}) } }),
  });
  assertProviderOk(response, "EasyPost");
  const body = asRecord(response.json);
  const details = Array.isArray(body.tracking_details) ? body.tracking_details : [];
  const events: ParcelEvent[] = details.slice(-8).map((item) => {
    const row = asRecord(item);
    const location = asRecord(row.tracking_location);
    const place = [location.city, location.state].filter(Boolean).join(", ");
    return {
      at: String(row.datetime ?? new Date().toISOString()),
      mockStatus: phaseFrom(String(row.status ?? "")),
      location: place || "Carrier",
      description: String(row.message ?? row.status ?? "Scan"),
    };
  });
  const phase = phaseFrom(String(body.status ?? ""));
  return {
    carrier: carrierFrom(String(body.carrier ?? ""), guess),
    phase,
    events: events.length ? events : [{
      at: new Date().toISOString(),
      mockStatus: phase,
      location: "Carrier",
      description: "EasyPost has no scans yet",
    }],
    note: "EasyPost created a tracker (may count on the EasyPost plan). No label was purchased.",
  };
}

function toLive(tracking: Record<string, unknown>, trackingNumber: string, note: string): LiveTrack {
  const checkpoints = Array.isArray(tracking.checkpoints) ? tracking.checkpoints : [];
  const events: ParcelEvent[] = checkpoints.slice(-8).map((item) => {
    const row = asRecord(item);
    return {
      at: String(row.checkpoint_time ?? row.created_at ?? new Date().toISOString()),
      mockStatus: phaseFrom(String(row.tag ?? row.message ?? "")),
      location: String(row.location ?? "Carrier"),
      description: String(row.message ?? row.tag ?? "Scan"),
    };
  });
  const phase = phaseFrom(String(tracking.tag ?? ""));
  return {
    carrier: carrierFrom(String(tracking.slug ?? ""), guessCarrier(trackingNumber)),
    phase,
    events: events.length ? events : [{
      at: new Date().toISOString(),
      mockStatus: phase,
      location: "Carrier",
      description: "Provider has no scans yet",
    }],
    note,
  };
}

function applyLive(parcel: Parcel, live: LiveTrack): Parcel {
  parcel.status = "tracked";
  parcel.fulfillment = "live";
  parcel.mockPhase = live.phase;
  parcel.events = live.events;
  parcel.note = live.note;
  if (live.carrier) parcel.carrierGuess = live.carrier;
  parcel.updatedAt = new Date().toISOString();
  return parcel;
}

export async function trackParcel(input: {
  trackingNumber: unknown;
  origin?: unknown;
  destination?: unknown;
  ownerKeyId: string;
}, env: Env = process.env): Promise<Parcel> {
  const runtime = shipRuntime(env);
  if (runtime.mode === "demo") return createParcel(input);
  const ready = assertReady(env);
  const parcel = createParcel(input);
  try {
    const live = await fetchLive(parcel.trackingNumber, ready.provider, ready.apiKey, parcel.carrierGuess);
    return applyLive(parcel, live);
  } catch (error) {
    forgetParcel(parcel.id);
    throw error;
  }
}

export async function refreshParcelResolved(id: string, ownerKeyId: string, env: Env = process.env): Promise<Parcel | undefined> {
  const runtime = shipRuntime(env);
  if (runtime.mode === "demo") return refreshParcel(id, ownerKeyId);
  const ready = assertReady(env);
  const parcel = getParcel(id, ownerKeyId);
  if (!parcel) return undefined;
  const live = await fetchLive(parcel.trackingNumber, ready.provider, ready.apiKey, parcel.carrierGuess);
  return applyLive(parcel, live);
}

async function fetchLive(trackingNumber: string, provider: "aftership" | "shippo" | "easypost", apiKey: string, guess: CarrierGuess): Promise<LiveTrack> {
  if (provider === "aftership") return trackAftership(trackingNumber, apiKey);
  if (provider === "shippo") return trackShippo(trackingNumber, apiKey, guess);
  return trackEasypost(trackingNumber, apiKey, guess);
}

export async function checkShip(env: Env = process.env) {
  const runtime = shipRuntime(env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "shipsignal",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      spend: "none" as const,
      note: "Demo mode hashes a timeline. No carrier API is called.",
    };
  }
  const ready = assertReady(env);
  if (ready.provider === "aftership") {
    const response = await providerRequest(`${AFTERSHIP}/couriers`, { headers: { "as-api-key": ready.apiKey } });
    assertProviderOk(response, "AfterShip");
  } else if (ready.provider === "shippo") {
    const response = await providerRequest("https://api.goshippo.com/carrier_accounts?results=1", {
      headers: { Authorization: `ShippoToken ${ready.apiKey}` },
    });
    assertProviderOk(response, "Shippo");
  } else {
    const response = await providerRequest("https://api.easypost.com/v2/trackers?page_size=1", {
      headers: { Authorization: basicAuthHeader(ready.apiKey) },
    });
    assertProviderOk(response, "EasyPost");
  }
  return {
    ok: true,
    connector: "shipsignal",
    mode: ready.mode,
    provider: ready.provider,
    fulfillment: "live" as const,
    spend: "none" as const,
    note: `Credential check against ${ready.provider} did not register a tracking number. POST /parcels may create an AfterShip tracking or an EasyPost tracker (plan metering). Shippo track lookups are read-only. No postage is purchased.`,
  };
}

export function shipAccount(ownerKeyId: string, env: Env = process.env) {
  const runtime = shipRuntime(env);
  const account = getAccount(ownerKeyId);
  if (runtime.mode === "demo") return account;
  return {
    ...account,
    plan: runtime.mode,
    provider: runtime.provider || "unset",
    note: "ShipSignal account for this API key. Provider calls use SHIPSIGNAL_PROVIDER.",
  };
}

export function shipDescriptor(env: Env = process.env) {
  const runtime = shipRuntime(env);
  const ready = runtime.mode !== "demo" && Boolean(runtime.provider && runtime.apiKey);
  return {
    mode: runtime.mode,
    provider: runtime.provider || null,
    fulfillment: runtime.mode === "demo" ? "stub" : ready ? "live" : "missing_credentials",
    note:
      runtime.mode === "demo"
        ? "Track a stub parcel at POST /v1/shipsignal/parcels. Timelines are hashed from the tracking number; no carrier API is called."
        : ready
          ? `Tracking uses ${runtime.provider}. GET /check does not register a number.`
          : "SHIPSIGNAL_APP_MODE is test or live but SHIPSIGNAL_PROVIDER or SHIPSIGNAL_API_KEY is empty.",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
