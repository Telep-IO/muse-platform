import { createHmac, timingSafeEqual } from "node:crypto";

const PRINTIFY = "https://api.printify.com/v1";

export function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function approvalMode(shop) {
  if (!shop || typeof shop !== "object") return "";
  const nested = shop.order_settings?.approval;
  const settings = shop.settings?.order_approval;
  for (const value of [shop.order_approval, shop.orders_approval, nested, settings]) {
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return "";
}

export function assertManualApproval(shop) {
  const mode = approvalMode(shop);
  if (mode === "manual") return;
  throw fail(
    503,
    "approval_not_manual",
    mode
      ? `Printify shop order approval is "${mode}", not manual. Refusing to continue so orders cannot auto-send to production after 24 hours.`
      : "Printify shop payload has no order approval field. Refusing to continue until it reports order_approval=manual. Set Order approval to Manual in the Printify dashboard.",
  );
}

export function verifyPrintifySignature(raw, header, secret) {
  if (!secret || !header) return false;
  const digest = createHmac("sha256", secret).update(raw).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const got = Buffer.from(String(header));
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

function asList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.variants)) return json.variants;
  return [];
}

export function shippingCents(profiles, variantId, country, quantity) {
  const list = Array.isArray(profiles) ? profiles : [];
  const variant = Number(variantId);
  const match =
    list.find((profile) => (profile.variant_ids || []).map(Number).includes(variant) && (profile.countries || []).includes(country)) ||
    list.find((profile) => (profile.countries || []).includes("REST_OF_THE_WORLD")) ||
    list[0];
  if (!match || typeof match.first_item?.cost !== "number") {
    throw fail(502, "missing_shipping", "Printify returned no shipping cost for this variant. No order was created.");
  }
  const extra = typeof match.additional_items?.cost === "number" ? match.additional_items.cost : 0;
  return match.first_item.cost + extra * (quantity - 1);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createPrintify(config, fetchImpl = globalThis.fetch) {
  async function request(method, path, body) {
    if (config.mode === "demo") throw fail(500, "demo_egress", "Demo mode cannot call Printify.");
    const response = await fetchImpl(`${PRINTIFY}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.printifyKey}`,
        "User-Agent": "Telep-PrintMerch/0.1",
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await readJson(response);
    return { status: response.status, json };
  }

  return {
    async preflight() {
      const shops = await request("GET", "/shops.json");
      if (shops.status < 200 || shops.status >= 300) {
        throw fail(502, "provider_error", `Printify shops read returned HTTP ${shops.status}. No product was created.`);
      }
      const shop = asList(shops.json).find((item) => String(item.id) === String(config.shopId));
      if (!shop) throw fail(503, "shop_not_found", "PRINTIFY_SHOP_ID was not in the Printify shop list.");
      assertManualApproval(shop);
      const catalog = await request("GET", "/catalog/blueprints.json");
      if (catalog.status < 200 || catalog.status >= 300) {
        throw fail(502, "provider_error", `Printify catalog read returned HTTP ${catalog.status}.`);
      }
    },

    async listProducts(blueprint) {
      if (blueprint == null) {
        const listed = await request("GET", "/catalog/blueprints.json");
        return asList(listed.json).map((item) => ({
          blueprint_id: Number(item.id),
          title: String(item.title ?? ""),
          provider_id: null,
          provider_title: null,
          from_price_cents: null,
        }));
      }
      const providers = await request("GET", `/catalog/blueprints/${blueprint}/print_providers.json`);
      const rows = [];
      for (const provider of asList(providers.json)) {
        const variants = await request("GET", `/catalog/blueprints/${blueprint}/print_providers/${provider.id}/variants.json`);
        const costs = asList(variants.json)
          .map((variant) => (typeof variant.cost === "number" ? variant.cost : null))
          .filter((cost) => cost != null);
        rows.push({
          blueprint_id: Number(blueprint),
          title: String(provider.title ?? ""),
          provider_id: Number(provider.id),
          provider_title: String(provider.title ?? ""),
          from_price_cents: costs.length ? Math.min(...costs) : null,
        });
      }
      return rows;
    },

    async getProduct(blueprintId, printProviderId) {
      const variants = await request("GET", `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`);
      const shipping = await request("GET", `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/shipping.json`);
      return { variants: variants.json, shipping: shipping.json };
    },

    async createProduct(input) {
      let ship = 0;
      if (!input.mockupOnly) {
        const shipping = await request(
          "GET",
          `/catalog/blueprints/${input.blueprint_id}/print_providers/${input.print_provider_id}/shipping.json`,
        );
        if (shipping.status < 200 || shipping.status >= 300) {
          throw fail(502, "provider_error", `Printify shipping read returned HTTP ${shipping.status}.`);
        }
        const profiles = shipping.json?.profiles || asList(shipping.json);
        ship = shippingCents(profiles, input.variant_id, input.recipient.country, input.quantity);
      }
      const variants = await request(
        "GET",
        `/catalog/blueprints/${input.blueprint_id}/print_providers/${input.print_provider_id}/variants.json`,
      );
      const variant = asList(variants.json).find((item) => Number(item.id) === Number(input.variant_id));
      const position = variant?.placeholders?.[0]?.position || "front";
      const uploaded = await request("POST", "/uploads/images.json", {
        file_name: `print-merch-${input.draftId}.png`,
        url: input.artwork_url,
      });
      if (uploaded.status < 200 || uploaded.status >= 300 || !uploaded.json?.id) {
        throw fail(502, "provider_error", "Printify image upload failed. No order was created.");
      }
      const created = await request("POST", `/shops/${config.shopId}/products.json`, {
        title: `PrintMerch ${input.draftId}`,
        description: "Custom printed merchandise. Telep IO LLC is the merchant of record.",
        blueprint_id: input.blueprint_id,
        print_provider_id: input.print_provider_id,
        variants: [{ id: input.variant_id, price: Math.max(typeof variant?.cost === "number" ? variant.cost : 0, 1), is_enabled: true }],
        print_areas: [
          {
            variant_ids: [input.variant_id],
            placeholders: [{ position, images: [{ id: uploaded.json.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }],
          },
        ],
      });
      if (created.status < 200 || created.status >= 300) {
        throw fail(502, "provider_error", `Printify product create returned HTTP ${created.status}. No order was created.`);
      }
      const priced = (created.json?.variants || []).find((item) => Number(item.id) === Number(input.variant_id));
      if (!input.mockupOnly && typeof priced?.cost !== "number") {
        throw fail(502, "missing_cost", "Printify product did not include a variant cost. Refusing to invent a price.");
      }
      const mockupUrls = (created.json?.images || []).map((image) => image.src).filter(Boolean);
      if (!mockupUrls.length) {
        throw fail(502, "missing_mockup", "Printify did not return mockup images, so this draft was not stored.");
      }
      const unitRetail = typeof priced?.cost === "number" ? priced.cost + Math.round((priced.cost * (config.markupBps ?? 2500)) / 10000) : 0;
      if (!input.mockupOnly && unitRetail > 0) {
        const pricedProduct = await request("PUT", `/shops/${config.shopId}/products/${created.json.id}.json`, {
          variants: [{ id: input.variant_id, price: unitRetail, is_enabled: true }],
        });
        if (pricedProduct.status < 200 || pricedProduct.status >= 300) {
          throw fail(502, "provider_error", "Printify accepted the product but rejected the retail price update. No order was created.");
        }
      }
      return {
        productId: String(created.json.id),
        baseCents: typeof priced?.cost === "number" ? priced.cost * input.quantity : null,
        shippingCents: ship,
        mockupUrls,
      };
    },

    async submitOrder(input) {
      const created = await request("POST", `/shops/${config.shopId}/orders.json`, {
        external_id: input.externalId,
        line_items: [
          {
            product_id: input.productId,
            variant_id: input.variantId,
            quantity: input.quantity,
            external_id: input.externalId,
          },
        ],
        shipping_method: 1,
        send_shipping_notification: false,
        address_to: input.recipient,
      });
      if (created.status === 409) {
        const existing = await this.findByExternalId(input.externalId);
        if (!existing) throw fail(409, "conflict", "Printify rejected the duplicate external_id and the existing order was not found.");
        return existing;
      }
      if (created.status < 200 || created.status >= 300 || !created.json?.id) {
        throw fail(502, "provider_error", `Printify order create returned HTTP ${created.status}.`);
      }
      if (created.json.status) return { id: String(created.json.id), status: created.json.status, external_id: input.externalId };
      return this.getOrder(created.json.id);
    },

    async getOrder(id) {
      const loaded = await request("GET", `/shops/${config.shopId}/orders/${id}.json`);
      if (loaded.status < 200 || loaded.status >= 300) throw fail(502, "provider_error", `Printify order read returned HTTP ${loaded.status}.`);
      return normalizeOrder(loaded.json);
    },

    async findByExternalId(externalId) {
      const listed = await request("GET", `/shops/${config.shopId}/orders.json`);
      const rows = listed.json?.data || asList(listed.json);
      const found = rows.find((order) => order.external_id === externalId || order.metadata?.shop_order_id === externalId);
      return found ? normalizeOrder(found) : null;
    },

    async sendToProduction(id) {
      const sent = await request("POST", `/shops/${config.shopId}/orders/${id}/send_to_production.json`);
      if (sent.status < 200 || sent.status >= 300) {
        throw fail(502, "provider_error", `Printify send_to_production returned HTTP ${sent.status}.`);
      }
      return sent.json?.status ? normalizeOrder(sent.json) : this.getOrder(id);
    },

    async cancelOrder(id) {
      const canceled = await request("POST", `/shops/${config.shopId}/orders/${id}/cancel.json`);
      if (canceled.status < 200 || canceled.status >= 300) {
        throw fail(502, "provider_error", `Printify cancel returned HTTP ${canceled.status}.`);
      }
      return canceled.json?.status ? normalizeOrder(canceled.json) : this.getOrder(id);
    },
  };
}

function normalizeOrder(json) {
  const shipment = json?.shipments?.[0];
  return {
    id: String(json.id),
    status: json.status || "unknown",
    external_id: json.external_id || json.metadata?.shop_order_id || null,
    tracking: shipment?.number || shipment?.tracking_number || null,
  };
}

const DEMO_UNIT = 516;
const DEMO_FIRST_SHIP = 450;
const DEMO_EXTRA_SHIP = 200;

export function demoPrintify() {
  const blocked = async () => {
    throw fail(500, "demo_egress", "Demo mode cannot call Printify.");
  };
  return {
    preflight: async () => {},
    async listProducts() {
      return [
        {
          blueprint_id: 68,
          title: "Mug 11oz (demo fixture)",
          provider_id: 9,
          provider_title: "Demo Print Provider",
          from_price_cents: DEMO_UNIT,
          source: "demo_fixture",
        },
      ];
    },
    async getProduct() {
      return {
        source: "demo_fixture",
        variants: [{ id: 184, title: "11oz (demo fixture)", cost_cents: DEMO_UNIT, placeholders: ["front"] }],
        shipping: [{ countries: ["US"], first_item_cents: DEMO_FIRST_SHIP, additional_items_cents: DEMO_EXTRA_SHIP }],
      };
    },
    async createProduct(input) {
      return {
        productId: `demo_${input.draftId}`,
        baseCents: DEMO_UNIT * input.quantity,
        shippingCents: DEMO_FIRST_SHIP + DEMO_EXTRA_SHIP * (input.quantity - 1),
        mockupUrls: [`https://mockup.invalid/print-merch/${input.draftId}.png`],
        source: "demo_fixture",
      };
    },
    submitOrder: blocked,
    getOrder: blocked,
    findByExternalId: blocked,
    sendToProduction: blocked,
    cancelOrder: blocked,
  };
}

export function createStripe(config) {
  return {
    async create(draft) {
      if (config.mode === "demo") {
        return {
          id: `stub_cs_${draft.id}`,
          url: `${config.successUrl}${config.successUrl.includes("?") ? "&" : "?"}checkout=stub&job=${encodeURIComponent(draft.id)}`,
        };
      }
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeKey);
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          success_url: config.successUrl,
          cancel_url: config.cancelUrl,
          customer_email: draft.recipient.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: draft.quote.total_cents,
                product_data: { name: `PrintMerch ${draft.id}` },
              },
            },
          ],
          metadata: {
            connector: "print-merch",
            jobId: draft.id,
            draft_id: draft.id,
            base_cents: String(draft.quote.base_cents),
            shipping_cents: String(draft.quote.shipping_cents),
            markup_cents: String(draft.quote.markup_cents),
          },
        },
        { idempotencyKey: `print-merch-${draft.id}` },
      );
      return { id: session.id, url: session.url || config.successUrl };
    },
    async constructEvent(raw, signature) {
      if (config.mode === "demo") {
        try {
          return JSON.parse(raw);
        } catch {
          throw fail(400, "webhook_invalid", "Invalid JSON");
        }
      }
      if (!config.webhookSecret || !config.stripeKey) throw fail(400, "webhook_invalid", "Stripe webhook is not configured.");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripeKey);
      if (!signature) throw fail(400, "webhook_invalid", "Missing Stripe-Signature header");
      return stripe.webhooks.constructEvent(raw, signature, config.webhookSecret);
    },
  };
}
