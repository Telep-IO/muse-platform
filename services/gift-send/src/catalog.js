/** Gift-card / prepaid / charity allowlist. Cash payouts stay off in v1. */

export const DEFAULT_SERVICE_FEE_CENTS = 299;
export const MAX_PAYOUT_CENTS = 200_000;
export const MAX_RECIPIENT_DAY_CENTS = 1_000_000;
export const DAY_MS = 86_400_000;

export const ALLOWED_CATEGORIES = new Set(["merchant_card", "visa_card", "charity"]);
export const CASH_CATEGORIES = new Set([
  "ach",
  "paypal",
  "venmo",
  "instant_debit_transfer",
  "cash_app",
  "international_bank",
  "wallet",
]);

export const SANDBOX_BASE = "https://testflight.tremendous.com/api/v2";
export const PRODUCTION_BASE = "https://api.tremendous.com/api/v2";

/** Demo catalog. PayPal and Venmo exist so tests can reject them; list endpoints hide them. */
export const STUB_PRODUCTS = [
  { id: "OKMHM2X2OHYV", name: "Amazon.com", category: "merchant_card", min: 1, max: 2000, countries: ["US"] },
  { id: "Q24BD9EZ332JT", name: "Virtual Visa", category: "visa_card", min: 1, max: 2000, countries: ["US"] },
  { id: "MCVIRTUALSTUB1", name: "Virtual Mastercard", category: "visa_card", min: 1, max: 2000, countries: ["US"] },
  { id: "CHARITYSTUB01", name: "Doctors Without Borders", category: "charity", min: 1, max: 2000, countries: ["US"] },
  { id: "KV934TZ93NQM", name: "PayPal", category: "paypal", min: 1, max: 2000, countries: ["US"] },
  { id: "VENMOSTUB0001", name: "Venmo", category: "venmo", min: 1, max: 2000, countries: ["US"] },
];

export function tremendousBase(mode) {
  if (mode === "live") return PRODUCTION_BASE;
  if (mode === "test") return SANDBOX_BASE;
  return null;
}

export function quoteCents(faceCents, feeCents = DEFAULT_SERVICE_FEE_CENTS) {
  return faceCents + feeCents;
}

export function buildQuote(faceCents, feeCents = DEFAULT_SERVICE_FEE_CENTS) {
  return {
    face_cents: faceCents,
    fee_cents: feeCents,
    provider_fee_cents: 0,
    total_cents: quoteCents(faceCents, feeCents),
    currency: "usd",
  };
}

export function dollarsToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function normalizeProduct(product) {
  const skus = Array.isArray(product?.skus) ? product.skus : [];
  const mins = skus.map((sku) => dollarsToCents(sku.min)).filter((n) => n != null);
  const maxs = skus.map((sku) => dollarsToCents(sku.max)).filter((n) => n != null);
  const countries = Array.isArray(product?.countries)
    ? product.countries.map((country) => String(country.abbr || country).toUpperCase())
    : [];
  return {
    reward_id: String(product.id),
    name: String(product.name || product.id),
    brand: String(product.name || product.id),
    category: String(product.category || ""),
    min_cents: mins.length ? Math.min(...mins) : 100,
    max_cents: maxs.length ? Math.max(...maxs) : MAX_PAYOUT_CENTS,
    fee_cents: 0,
    countries,
  };
}

export function stubProduct(id) {
  const found = STUB_PRODUCTS.find((product) => product.id === id);
  if (!found) return null;
  return normalizeProduct({
    ...found,
    skus: [{ min: found.min, max: found.max }],
    countries: found.countries.map((abbr) => ({ abbr })),
  });
}

export function listStubProducts({ country, category } = {}) {
  return STUB_PRODUCTS.map((product) =>
    normalizeProduct({
      ...product,
      skus: [{ min: product.min, max: product.max }],
      countries: product.countries.map((abbr) => ({ abbr })),
    }),
  ).filter((product) => allowedProduct(product) && matchesFilter(product, { country, category }));
}

export function matchesFilter(product, { country, category } = {}) {
  if (category && product.category !== String(category).trim()) return false;
  if (country) {
    const code = String(country).trim().toUpperCase();
    if (product.countries?.length && !product.countries.includes(code)) return false;
  }
  return true;
}

export function allowedProduct(product) {
  return ALLOWED_CATEGORIES.has(product?.category);
}

export function cashProduct(product) {
  return CASH_CATEGORIES.has(product?.category);
}

export function rejectionFor(product) {
  if (!product) return { status: 400, code: "unknown_reward", message: "That reward is not in the Tremendous catalog." };
  if (cashProduct(product)) {
    return {
      status: 400,
      code: "cash_payout_disabled",
      message: `Cash payouts are disabled in GiftSend v1 (${product.category}). Gift cards, Visa/Mastercard prepaid, and charity only.`,
    };
  }
  if (!allowedProduct(product)) {
    return {
      status: 400,
      code: "reward_not_allowed",
      message: `Reward category ${product.category || "unknown"} is not available in GiftSend v1.`,
    };
  }
  return null;
}
