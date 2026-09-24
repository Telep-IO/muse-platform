/** USPS only until a later phase explicitly expands scope. */
export const CARRIER_ALLOWLIST = Object.freeze(["USPS"]);

/** Suggested customer service fee. Postage is never taken from this constant. */
export const DEFAULT_SERVICE_FEE_CENTS = 199;

export function restrictionMessage(carrier) {
  const name = String(carrier || "That carrier").trim() || "That carrier";
  return (
    `${name} is not available. ShipLabel is USPS-only at launch. ` +
    "UPS is excluded because UPS DAP §4.2 does not permit marking up UPS rates to resell labels to another entity or End User, " +
    "and UPS DAP §4.5 requires a direct UPS agreement plus UPS written consent before a platform enrolls end users. " +
    "FedEx is excluded because FedEx by Default §3.2 does not permit selling, assigning, or transferring the benefit of pricing to any other party."
  );
}

export function assertCarrierAllowed(hint) {
  if (hint == null || String(hint).trim() === "") return "USPS";
  const name = String(hint).trim().toUpperCase();
  if (!CARRIER_ALLOWLIST.includes(name)) {
    const error = new Error(restrictionMessage(name));
    error.status = 400;
    error.code = "carrier_not_allowed";
    throw error;
  }
  return name;
}

export function dollarsToCents(amount) {
  const text = String(amount ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    const error = new Error("Carrier rate must be a dollar amount with at most two decimal places.");
    error.status = 502;
    error.code = "invalid_rate";
    throw error;
  }
  const [dollars, fraction = ""] = text.split(".");
  return Number(dollars) * 100 + Number((fraction + "00").slice(0, 2));
}

export function parseCents(raw, name, { fallback = undefined } = {}) {
  if (raw == null || String(raw).trim() === "") {
    if (fallback === undefined) return null;
    return fallback;
  }
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    const error = new Error(`${name} must be a non-negative integer number of cents.`);
    error.status = 500;
    error.code = "invalid_fee";
    throw error;
  }
  return n;
}

/** Customer total = live postage + configured service fee. Platform fee is not added again. */
export function quoteCents(postageCents, feeCents) {
  if (!Number.isInteger(postageCents) || postageCents < 0) {
    const error = new Error("postage_cents must be a non-negative integer.");
    error.status = 400;
    error.code = "invalid_postage";
    throw error;
  }
  if (!Number.isInteger(feeCents) || feeCents < 0) {
    const error = new Error("fee_cents must be a non-negative integer.");
    error.status = 500;
    error.code = "invalid_fee";
    throw error;
  }
  return postageCents + feeCents;
}

export function quoteFor(postageCents, config) {
  const fee = config.serviceFeeCents;
  const platform = config.platformFeeCents;
  return {
    postage_cents: postageCents,
    fee_cents: fee,
    platform_fee_cents: platform,
    total_cents: quoteCents(postageCents, fee),
    currency: "usd",
    note:
      platform == null
        ? "Customer total is the EasyPost USPS postage for the selected rate plus the configured service fee. The Forge per-label platform fee is not configured."
        : "Customer total is the EasyPost USPS postage for the selected rate plus the configured service fee. The Forge platform fee is recorded separately and is not added on top.",
  };
}

export function uspsRates(rates) {
  const kept = [];
  for (const rate of rates || []) {
    if (String(rate?.carrier || "").trim().toUpperCase() !== "USPS") continue;
    if (!rate?.id) continue;
    kept.push({
      id: String(rate.id),
      carrier: "USPS",
      service: String(rate.service || ""),
      rate: String(rate.rate),
      currency: String(rate.currency || "USD").toUpperCase(),
      postage_cents: dollarsToCents(rate.rate),
    });
  }
  kept.sort((a, b) => a.postage_cents - b.postage_cents);
  return kept;
}

export function lowestRate(rates) {
  return rates[0] || null;
}
