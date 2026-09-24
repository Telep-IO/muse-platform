import { HttpError } from "./errors";

export type CheckoutInput = {
  connectorSlug: string;
  jobId: string;
  amountCents: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  description?: string;
  /** Extra Stripe metadata. `connector` and `jobId` always win over these keys. Values must be strings. */
  metadata?: Record<string, string>;
};

export type CheckoutResult = {
  id: string;
  url: string;
  mode: "live" | "stub";
};

function stripeSecret(): string | undefined {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || undefined;
}

export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const secret = stripeSecret();
  if (!secret) {
    return {
      id: `stub_cs_${input.jobId}`,
      url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}checkout=stub&job=${encodeURIComponent(input.jobId)}`,
      mode: "stub",
    };
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secret);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency ?? "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: input.description ?? `${input.connectorSlug} job ${input.jobId}`,
          },
        },
      },
    ],
    client_reference_id: input.jobId,
    metadata: {
      ...(input.metadata ?? {}),
      connector: input.connectorSlug,
      jobId: input.jobId,
    },
  });

  return {
    id: session.id,
    url: session.url ?? input.successUrl,
    mode: "live",
  };
}

export type WebhookResult = {
  received: true;
  stub: boolean;
  type?: string;
  id?: string;
  fulfilled?: boolean;
  duplicate?: boolean;
  reason?: string;
};

export type PaidSession = {
  id: string;
  eventId: string;
  eventType: string;
  paymentStatus: string | null;
  livemode: boolean;
  metadata: {
    connector?: string;
    jobId?: string;
    draft_id?: string;
    rate_id?: string;
    postage_cents?: string;
    fee_cents?: string;
  };
  amountSubtotal: number | null;
  amountTotal: number | null;
  currency: string | null;
};

export type FulfillResult = {
  fulfilled: boolean;
  duplicate?: boolean;
  reason?: string;
  /** Ask Stripe to retry. The HTTP handler turns this into a non-2xx response. */
  retry?: boolean;
};

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export function paidSessionFromEvent(event: {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
}): PaidSession | null {
  if (!PAID_EVENTS.has(event.type)) return null;
  const object = event.data?.object ?? {};
  const metadata = (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<string, unknown>;
  const paymentStatus = object.payment_status ? String(object.payment_status) : null;
  const text = (key: string) => (metadata[key] ? String(metadata[key]) : undefined);
  return {
    id: String(object.id ?? ""),
    eventId: event.id,
    eventType: event.type,
    paymentStatus: paymentStatus ?? (event.type === "checkout.session.async_payment_succeeded" ? "paid" : null),
    livemode: object.livemode === true,
    metadata: {
      connector: text("connector"),
      jobId: text("jobId"),
      draft_id: text("draft_id"),
      rate_id: text("rate_id"),
      postage_cents: text("postage_cents"),
      fee_cents: text("fee_cents"),
    },
    amountSubtotal: typeof object.amount_subtotal === "number" ? object.amount_subtotal : null,
    amountTotal: typeof object.amount_total === "number" ? object.amount_total : null,
    currency: object.currency ? String(object.currency) : null,
  };
}

export async function dispatchStripeEvent(
  event: { id: string; type: string; data?: { object?: Record<string, unknown> } },
  fulfill?: (session: PaidSession) => Promise<FulfillResult | void>,
): Promise<WebhookResult> {
  const session = paidSessionFromEvent(event);
  const base: WebhookResult = { received: true, stub: false, type: event.type, id: event.id };
  if (!session || !fulfill) return base;
  const outcome = await fulfill(session);
  if (!outcome) return base;
  if (outcome.retry) {
    throw new HttpError(500, "fulfillment_pending", outcome.reason || "Fulfillment did not finish");
  }
  return { ...base, fulfilled: outcome.fulfilled, duplicate: outcome.duplicate, reason: outcome.reason };
}

export async function handleWebhook(
  rawBody: string,
  signature: string | null,
  fulfill?: (session: PaidSession) => Promise<FulfillResult | void>,
): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const apiKey = stripeSecret();
  if (!secret || !apiKey) {
    return { received: true, stub: true, type: "stub.webhook" };
  }
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(apiKey);
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  return dispatchStripeEvent(
    { id: event.id, type: event.type, data: { object: event.data.object as unknown as Record<string, unknown> } },
    fulfill,
  );
}
