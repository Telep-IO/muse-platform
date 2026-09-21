/**
 * Shared Stripe helpers for connector checkout.
 * Unwired to live Stripe unless STRIPE_SECRET_KEY is set (test mode recommended).
 */

export type CheckoutInput = {
  connectorSlug: string;
  jobId: string;
  amountCents: number;
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  description?: string;
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

export function stripeConfigured(): boolean {
  return Boolean(stripeSecret());
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
    metadata: {
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
};

export async function handleWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
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
  return { received: true, stub: false, type: event.type, id: event.id };
}
