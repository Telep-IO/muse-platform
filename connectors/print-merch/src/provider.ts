import {
  HttpError,
  assertProviderOk,
  envValue,
  modeFulfillment,
  providerRequest,
  readAppMode,
  requireCredentials,
  type Env,
} from "@telep/platform";
import {
  DEMO_BLUEPRINT_ID,
  DEMO_PROVIDER_ID,
  DEMO_UNIT_COST_CENTS,
  DEMO_VARIANT_ID,
  demoBaseAndShipping,
  markupBps,
  quoteCents,
} from "./jobs";

const PRINTIFY = "https://api.printify.com/v1";

export function printMerchRuntime(env: Env = process.env) {
  const mode = readAppMode("PRINT_MERCH_APP_MODE", env);
  return {
    mode,
    apiKey: envValue("PRINT_MERCH_PRINTIFY_API_KEY", env),
    shopId: envValue("PRINT_MERCH_SHOP_ID", env),
    serviceUrl: envValue("PRINT_MERCH_SERVICE_URL", env),
    stripeKey: envValue("STRIPE_SECRET_KEY", env),
  };
}

export function assertPrintMerchReady(env: Env = process.env): void {
  const runtime = printMerchRuntime(env);
  requireCredentials(runtime.mode, "PRINT_MERCH_APP_MODE", [
    { name: "PRINT_MERCH_PRINTIFY_API_KEY", value: runtime.apiKey },
    { name: "PRINT_MERCH_SHOP_ID", value: runtime.shopId },
    { name: "PRINT_MERCH_SERVICE_URL", value: runtime.serviceUrl },
  ]);
}

export function quotePrintMerch(url: string, env: Env = process.env) {
  const params = new URL(url).searchParams;
  const baseRaw = params.get("base_cents");
  const shipRaw = params.get("shipping_cents");
  const bps = markupBps(env);
  if (baseRaw == null && shipRaw == null && printMerchRuntime(env).mode === "demo") {
    const costs = demoBaseAndShipping(1);
    return {
      ...quoteCents(costs.base_cents, costs.shipping_cents, bps),
      spend: "none" as const,
      source: "demo_fixture" as const,
      note: "Demo fixture quote for one unit. Live prices come from the Printify catalog at draft time. This call does not create a product or an order.",
    };
  }
  const base = Number(baseRaw);
  const shipping = Number(shipRaw);
  if (!Number.isInteger(base) || !Number.isInteger(shipping)) {
    throw new HttpError(400, "invalid_request", "Pass integer base_cents and shipping_cents. This route only applies the configured markup.");
  }
  return {
    ...quoteCents(base, shipping, bps),
    spend: "none" as const,
    source: "local_markup" as const,
    note: "Local markup only. base_cents and shipping_cents must already be live catalog figures. This call does not contact Printify.",
  };
}

type Shop = Record<string, unknown>;

export function approvalMode(shop: Shop): string {
  const nested = (shop.order_settings as { approval?: unknown } | undefined)?.approval;
  const settings = (shop.settings as { order_approval?: unknown } | undefined)?.order_approval;
  const candidates = [shop.order_approval, shop.orders_approval, nested, settings];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return "";
}

export function assertManualApproval(shop: Shop): void {
  const mode = approvalMode(shop);
  if (mode === "manual") return;
  throw new HttpError(
    503,
    "approval_not_manual",
    mode
      ? `Printify shop order approval is "${mode}", not manual. Refusing to continue so orders cannot auto-send to production after 24 hours.`
      : "Printify shop payload has no order approval field. Refusing to continue until it reports order_approval=manual. Set Order approval to Manual in the Printify dashboard.",
  );
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "Telep-PrintMerch/0.1",
    Accept: "application/json",
  };
}

async function printifyGet(path: string, apiKey: string) {
  const response = await providerRequest(`${PRINTIFY}${path}`, { headers: authHeaders(apiKey) });
  assertProviderOk(response, "Printify");
  return response.json;
}

function asList(json: unknown): Shop[] {
  if (Array.isArray(json)) return json as Shop[];
  if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
    return (json as { data: Shop[] }).data;
  }
  return [];
}

export async function checkPrintMerch(env: Env = process.env) {
  const runtime = printMerchRuntime(env);
  const quote = quotePrintMerch("http://local/quote", env);
  if (runtime.mode === "demo") {
    return {
      ok: true,
      connector: "print-merch",
      mode: "demo" as const,
      fulfillment: "stub" as const,
      printify: "skipped",
      order_approval: "not_checked",
      stripe: runtime.stripeKey ? "present_not_called" : "not_set",
      spend: "none" as const,
      quote,
      note: "Demo mode does not call Printify or Stripe. test/live reads the shop and the catalog and refuses to boot unless order approval is manual.",
    };
  }
  assertPrintMerchReady(env);
  const shops = asList(await printifyGet("/shops.json", runtime.apiKey));
  const shop = shops.find((item) => String(item.id) === runtime.shopId);
  if (!shop) {
    throw new HttpError(503, "shop_not_found", "PRINT_MERCH_SHOP_ID was not in the Printify shop list. No product was created.");
  }
  assertManualApproval(shop);
  await printifyGet("/catalog/blueprints.json", runtime.apiKey);
  return {
    ok: true,
    connector: "print-merch",
    mode: runtime.mode,
    fulfillment: "printify" as const,
    printify: "ok",
    order_approval: "manual",
    shop_id: runtime.shopId,
    stripe: runtime.stripeKey ? "present_not_called" : "not_set",
    mailed: false,
    production: false,
    spend: "none" as const,
    quote,
    note: "Read-only Printify check: shop order approval is manual and the catalog responded. No product or order was created.",
  };
}

export async function listPrintProducts(blueprint: number | undefined, env: Env = process.env) {
  const runtime = printMerchRuntime(env);
  if (runtime.mode === "demo") {
    if (blueprint != null && blueprint !== DEMO_BLUEPRINT_ID) return [];
    return [
      {
        blueprint_id: DEMO_BLUEPRINT_ID,
        title: "Mug 11oz (demo fixture)",
        provider_id: blueprint == null ? null : DEMO_PROVIDER_ID,
        provider_title: blueprint == null ? null : "Demo Print Provider",
        from_price_cents: blueprint == null ? null : DEMO_UNIT_COST_CENTS,
        source: "demo_fixture",
      },
    ];
  }
  assertPrintMerchReady(env);
  if (blueprint == null) {
    const blueprints = asList(await printifyGet("/catalog/blueprints.json", runtime.apiKey));
    return blueprints.map((item) => ({
      blueprint_id: Number(item.id),
      title: String(item.title ?? ""),
      provider_id: null,
      provider_title: null,
      from_price_cents: null,
    }));
  }
  const providers = asList(await printifyGet(`/catalog/blueprints/${blueprint}/print_providers.json`, runtime.apiKey));
  const rows = [];
  for (const provider of providers) {
    const providerId = Number(provider.id);
    const variantPayload = (await printifyGet(
      `/catalog/blueprints/${blueprint}/print_providers/${providerId}/variants.json`,
      runtime.apiKey,
    )) as { variants?: Shop[] };
    const variants = asList(variantPayload.variants ?? variantPayload);
    const costs = variants
      .map((variant) => (typeof variant.cost === "number" ? variant.cost : null))
      .filter((cost): cost is number => cost != null);
    rows.push({
      blueprint_id: blueprint,
      title: String(provider.title ?? `Blueprint ${blueprint}`),
      provider_id: providerId,
      provider_title: String(provider.title ?? ""),
      from_price_cents: costs.length ? Math.min(...costs) : null,
    });
  }
  return rows;
}

export async function getPrintProduct(blueprintId: number, printProviderId: number, env: Env = process.env) {
  const runtime = printMerchRuntime(env);
  if (runtime.mode === "demo") {
    return {
      blueprint_id: blueprintId,
      print_provider_id: printProviderId,
      source: "demo_fixture",
      variants: [
        {
          id: DEMO_VARIANT_ID,
          title: "11oz (demo fixture)",
          cost_cents: blueprintId === DEMO_BLUEPRINT_ID ? DEMO_UNIT_COST_CENTS : null,
          placeholders: ["front"],
        },
      ],
      print_areas: ["front"],
      shipping: [
        {
          countries: ["US"],
          first_item_cents: 450,
          additional_items_cents: 200,
          note: "Demo fixture, not a live Printify shipping profile.",
        },
      ],
    };
  }
  assertPrintMerchReady(env);
  const variantJson = (await printifyGet(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
    runtime.apiKey,
  )) as { variants?: Shop[] };
  const shippingJson = (await printifyGet(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/shipping.json`,
    runtime.apiKey,
  )) as { profiles?: Shop[] };
  const variants = asList(variantJson.variants ?? variantJson).map((variant) => ({
    id: Number(variant.id),
    title: String(variant.title ?? ""),
    cost_cents: typeof variant.cost === "number" ? variant.cost : null,
    placeholders: Array.isArray(variant.placeholders)
      ? variant.placeholders.map((item) => String((item as { position?: string }).position ?? item))
      : [],
  }));
  const profiles = asList(shippingJson.profiles ?? shippingJson);
  return {
    blueprint_id: blueprintId,
    print_provider_id: printProviderId,
    source: "printify_catalog",
    variants,
    print_areas: [...new Set(variants.flatMap((variant) => variant.placeholders))],
    shipping: profiles.map((profile) => ({
      countries: profile.countries ?? [],
      variant_ids: profile.variant_ids ?? [],
      first_item_cents: (profile.first_item as { cost?: number } | undefined)?.cost ?? null,
      additional_items_cents: (profile.additional_items as { cost?: number } | undefined)?.cost ?? null,
    })),
    note: variants.some((variant) => variant.cost_cents == null)
      ? "Catalog variants omitted cost. The draft flow reads variant.cost from the created Printify product and fails closed if it is still missing. No product was created by this read."
      : "Live catalog read. No product or order was created.",
  };
}

export function printMerchDescriptor(env: Env = process.env) {
  const runtime = printMerchRuntime(env);
  const ready = runtime.mode !== "demo" && Boolean(runtime.apiKey && runtime.shopId && runtime.serviceUrl);
  return {
    ...modeFulfillment(
      runtime.mode,
      ready,
      {
        demo: "Demo mode stores a draft and mockup locally. It does not call Printify or Stripe.",
        ready: "test/live proxies drafts to the fulfillment service. Production is submitted only after Stripe payment_status is paid, and only when the shop is on manual approval.",
        missing: "PRINT_MERCH_APP_MODE is test or live but the Printify token, shop id, or service URL is empty.",
      },
      "printify",
    ),
    markup_bps: markupBps(env),
    pricing: "customer_total = live base + live shipping + configured markup (default 25%)",
    production: "manual_approval_required",
  };
}
