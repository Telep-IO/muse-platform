import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { listStubProducts, normalizeProduct, stubProduct, tremendousBase } from "./catalog.js";

export class ProviderError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
    this.name = "ProviderError";
  }
}

function blocked(what) {
  const error = new ProviderError(`Demo mode does not call ${what}.`);
  error.code = "demo_egress_blocked";
  return error;
}

export function verifyTremendousSignature(raw, header, secret) {
  if (!secret) {
    const error = new ProviderError("Tremendous webhook secret is not configured.", 401);
    error.code = "invalid_signature";
    throw error;
  }
  const match = /^sha256=([0-9a-f]+)$/i.exec(String(header || "").trim());
  if (!match) {
    const error = new ProviderError("Invalid Tremendous webhook signature.", 401);
    error.code = "invalid_signature";
    throw error;
  }
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const left = Buffer.from(match[1], "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    const error = new ProviderError("Invalid Tremendous webhook signature.", 401);
    error.code = "invalid_signature";
    throw error;
  }
}

export function createProviders(config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const stripe = config.mode === "demo" ? null : deps.stripe || new Stripe(config.stripeKey, { timeout: 20000, maxNetworkRetries: 2 });
  const base = tremendousBase(config.mode);

  async function tremendous(path, { method = "GET", body } = {}) {
    if (config.mode === "demo" || !base) throw blocked("Tremendous");
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.tremendousKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ProviderError("Tremendous request failed.", 502);
    }
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) {
      const message = json?.errors?.[0]?.message || json?.error || `Tremendous returned HTTP ${response.status}.`;
      const error = new ProviderError(typeof message === "string" ? message : `Tremendous returned HTTP ${response.status}.`, response.status);
      error.code = response.status === 422 ? "already_redeemed" : "provider_error";
      error.body = json;
      throw error;
    }
    return json;
  }

  return {
    stripe,
    async listProducts(query = {}) {
      if (config.mode === "demo") return listStubProducts(query);
      const params = new URLSearchParams();
      if (query.country) params.set("country", String(query.country));
      params.set("currency", "USD");
      const suffix = params.size ? `?${params}` : "";
      const json = await tremendous(`/products${suffix}`);
      const products = Array.isArray(json?.products) ? json.products : [];
      return products.map(normalizeProduct);
    },
    async getProduct(id) {
      if (config.mode === "demo") {
        const product = stubProduct(id);
        if (!product) {
          const error = new ProviderError("That reward is not in the Tremendous catalog.", 404);
          error.code = "unknown_reward";
          throw error;
        }
        return product;
      }
      const json = await tremendous(`/products/${encodeURIComponent(id)}`);
      const product = json?.product || json;
      if (!product?.id) throw new ProviderError("Tremendous did not return that product.", 502);
      return normalizeProduct(product);
    },
    async checkout(draft) {
      if (config.mode === "demo") throw blocked("Stripe");
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          success_url: config.successUrl,
          cancel_url: config.cancelUrl,
          client_reference_id: draft.id,
          metadata: {
            connector: "gift-send",
            jobId: draft.id,
            draft_id: draft.id,
            face_cents: String(draft.amount_cents),
            fee_cents: String(draft.fee_cents),
            reward_id: draft.reward_id,
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: draft.amount_cents + draft.fee_cents,
                product_data: { name: `GiftSend ${draft.reward_name}` },
              },
            },
          ],
        },
        { idempotencyKey: `gift-send-checkout-${draft.id}` },
      );
      return { id: session.id, url: session.url };
    },
    /**
     * Places a Tremendous order from the prefunded balance.
     * external_id is the claim id. Tremendous treats that as the idempotency key.
     * Never calls a top-up or card funding source.
     */
    async createOrder(draft, claimId) {
      if (config.mode === "demo") throw blocked("Tremendous");
      const denomination = draft.amount_cents / 100;
      const recipient = { name: draft.recipient_name };
      if (draft.recipient_email) recipient.email = draft.recipient_email;
      if (draft.recipient_phone) recipient.phone = draft.recipient_phone;
      const reward = {
        value: { denomination, currency_code: "USD" },
        products: [draft.reward_id],
        recipient,
        delivery: {
          method: draft.delivery_method,
          ...(draft.message ? { meta: { message: draft.message } } : {}),
        },
      };
      const json = await tremendous("/orders", {
        method: "POST",
        body: {
          external_id: claimId,
          payment: { funding_source_id: "BALANCE" },
          reward,
        },
      });
      const order = json?.order || json;
      const placed = order?.rewards?.[0] || order?.reward || {};
      return {
        orderId: order?.id || null,
        rewardId: placed.id || null,
        deliveryLink: placed.delivery?.link || null,
        deliveryStatus: placed.delivery?.status || "PENDING",
      };
    },
    async cancelReward(rewardId) {
      if (config.mode === "demo") throw blocked("Tremendous");
      return tremendous(`/rewards/${encodeURIComponent(rewardId)}/cancel`, { method: "POST", body: {} });
    },
  };
}
