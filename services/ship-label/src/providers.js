import Stripe from "stripe";
import { uspsRates } from "./pricing.js";

const EASYPOST = "https://api.easypost.com/v2";

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

export function createProviders(config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const stripe = config.mode === "demo" ? null : new Stripe(config.stripeKey, { timeout: 20000, maxNetworkRetries: 2 });

  async function easypost(path, { method = "GET", body, idempotencyKey } = {}) {
    if (config.mode === "demo") throw blocked("EasyPost");
    let response;
    try {
      response = await fetchImpl(`${EASYPOST}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.easypostKey}:`).toString("base64")}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ProviderError("EasyPost request failed.", 502);
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
      const message = json?.error?.message || `EasyPost returned HTTP ${response.status}.`;
      throw new ProviderError(message, response.status);
    }
    return json;
  }

  function toAddress(address) {
    return {
      name: address.name,
      street1: address.address_line1,
      street2: address.address_line2 || "",
      city: address.address_city,
      state: address.address_state,
      zip: address.address_zip,
      country: "US",
    };
  }

  return {
    stripe,
    async createShipment(input) {
      if (config.mode === "demo") throw blocked("EasyPost");
      const shipment = await easypost("/shipments", {
        method: "POST",
        body: {
          shipment: {
            from_address: toAddress(input.from),
            to_address: toAddress(input.to),
            parcel: {
              weight: input.parcel.weight_oz,
              length: input.parcel.length_in,
              width: input.parcel.width_in,
              height: input.parcel.height_in,
            },
          },
        },
      });
      return { id: shipment?.id, rates: uspsRates(shipment?.rates) };
    },
    async inspectShipment(shipmentId) {
      if (config.mode === "demo") throw blocked("EasyPost");
      const shipment = await easypost(`/shipments/${encodeURIComponent(shipmentId)}`);
      if (!shipment?.postage_label?.label_url) return null;
      return {
        easypost_shipment_id: shipment.id || shipmentId,
        label_url: shipment.postage_label.label_url,
        tracking_code: shipment.tracking_code || null,
      };
    },
    async buyShipment(shipmentId, rateId) {
      if (config.mode === "demo") throw blocked("EasyPost");
      const shipment = await easypost(`/shipments/${encodeURIComponent(shipmentId)}/buy`, {
        method: "POST",
        idempotencyKey: `ship-label-buy-${shipmentId}-${rateId}`,
        body: { rate: { id: rateId } },
      });
      return {
        easypost_shipment_id: shipment?.id || shipmentId,
        label_url: shipment?.postage_label?.label_url || null,
        tracking_code: shipment?.tracking_code || null,
      };
    },
    async voidShipment(shipmentId) {
      if (config.mode === "demo") throw blocked("EasyPost");
      const shipment = await easypost(`/shipments/${encodeURIComponent(shipmentId)}/refund`, {
        method: "POST",
        idempotencyKey: `ship-label-refund-${shipmentId}`,
      });
      return { refund_status: shipment?.refund_status || "submitted" };
    },
    async listShipments() {
      if (config.mode === "demo") throw blocked("EasyPost");
      return easypost("/shipments?page_size=1");
    },
    async checkout(draft) {
      if (config.mode === "demo") throw blocked("Stripe");
      const lineItems = [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: draft.postage_cents,
            product_data: {
              name: "USPS postage",
              description: "Pass-through EasyPost USPS rate for this shipment. ShipLabel does not mark up postage.",
            },
          },
        },
      ];
      if (draft.fee_cents > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: draft.fee_cents,
            product_data: {
              name: "ShipLabel service fee",
              description: "Service fee for drafting, checkout, and label delivery. Separate from USPS postage.",
            },
          },
        });
      }
      return stripe.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: draft.id,
          success_url: config.successUrl,
          cancel_url: config.cancelUrl,
          metadata: {
            draft_id: draft.id,
            rate_id: draft.selected_rate_id,
            postage_cents: String(draft.postage_cents),
            fee_cents: String(draft.fee_cents),
          },
          line_items: lineItems,
        },
        { idempotencyKey: `ship-label-checkout-${draft.id}` },
      );
    },
  };
}
