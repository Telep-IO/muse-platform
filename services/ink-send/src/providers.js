import Stripe from 'stripe';
import { sha256 } from './approval.js';

// ============================================================================
// SCAFFOLD: handwriting-provider integration is NOT implemented.
// ----------------------------------------------------------------------------
// TODO (after TERMS-DILIGENCE.md is resolved):
//   1. Confirm Handwrytten's reseller/integration terms IN WRITING for a
//      paid, customer-facing third-party service. Even though the
//      Handwrytten API is built for integrations, do NOT rely on
//      self-serve/developer terms for a paid-on-top model.
//   2. Implement sendLetter() below against the real API:
//        - POST the message text + recipient address + card/style options.
//        - Pass a stable idempotency key per letter (`letter-${letter.id}`)
//          so a retried submission can never mail twice. Verify the provider
//          honors it (or emulate with a provider-side dedupe check).
//        - Validate the returned job id format before storing it.
//   3. Implement letterStatus() for polling, and wire the real webhook in
//      src/app.js (signature verification with INK_WEBHOOK_SECRET).
//   4. Confirm what "sent" means per provider (accepted for writing/mailing
//      vs. merely queued) and map it in normalizeStatus(). InkSend never
//      claims delivery: First Class mail delivery is not tracked.
// Until then, every handwriting-provider call below is a demo stub, and any
// non-demo mode refuses to touch a handwriting provider.
// ============================================================================

export class ProviderError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
  // 4xx (except 408/409/429) = the provider rejected the job: do not retry,
  // queue a refund instead. Anything else = uncertain: retry with backoff.
  get rejected() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

const notImplemented = (name) =>
  Object.assign(new Error(`Handwriting provider "${name}" is not implemented. Resolve TERMS-DILIGENCE.md first.`), { status: 503 });

export function createProviders(config) {
  const stripe = config.mode === 'demo' ? null : new Stripe(config.stripeKey, { maxNetworkRetries: 2, timeout: 20000 });
  const demo = config.mode === 'demo';

  return {
    stripe,

    // Stripe Checkout session for the human-gated payment step.
    // Implemented for real: billing is ours, not the handwriting provider's.
    async checkout(letter, token, approval) {
      if (demo) {
        return { id: `demo_session_${letter.id}`, url: `${config.baseUrl}/#letter=${letter.id}.${token}` };
      }
      const link = `${config.baseUrl}/#letter=${letter.id}.${token}`;
      const evidence = JSON.parse(approval.evidence);
      return stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_creation: 'always',
        client_reference_id: letter.id,
        metadata: { letter_id: letter.id, review_hash: approval.review_hash },
        payment_intent_data: { metadata: { letter_id: letter.id, review_hash: approval.review_hash } },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { submit: { message: `Payment authorizes automatic handwriting and mailing. Review the [accepted terms](${config.baseUrl}/policies/terms/${approval.terms_version}).` } },
        success_url: link,
        cancel_url: link,
        expires_at: Math.floor(letter.checkout_started / 1000) + 3600,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: letter.amount, tax_behavior: 'exclusive',
          product_data: { name: 'InkSend · robot-handwritten letter',
            description: 'Handwritten in real ink and mailed First Class to the reviewed address.' } } }],
      }, { idempotencyKey: `checkout-${letter.id}` });
    },

    // Submit the approved letter to the handwriting provider. Demo stub only.
    async sendLetter(letter) {
      // Integrity: the exact text the human approved is what gets sent.
      if (sha256(letter.message) !== letter.message_sha256)
        throw Object.assign(new Error('Approved message changed.'), { integrity: true });
      if (demo) {
        // Simulated provider job. A real implementation returns the
        // provider's job id and its initial status here.
        return { id: `demo_letter_${letter.id}`, status: 'queued' };
      }
      // TODO: real provider call (see header). Suggested shape:
      //   const body = {
      //     message: letter.message,
      //     recipient: { name, address_line1, address_line2, city, state, zip, country },
      //     card: letter.card, handwriting_style: letter.handwriting_style,
      //   };
      //   const result = await providerPost('/letters', body, { 'Idempotency-Key': `letter-${letter.id}` });
      //   if (!isValidJobId(result.id)) throw new ProviderError('Handwriting provider returned an invalid response.');
      //   return { id: result.id, status: normalizeStatus(result.status) };
      throw notImplemented('sendLetter');
    },

    // Poll the provider for the job's status. Demo stub only.
    async letterStatus(letter) {
      if (demo) {
        // Demo progression: queued -> sending -> sent. A real implementation
        // GETs the job and maps provider statuses through normalizeStatus().
        const age = Date.now() - (letter.provider_submitted_at || Date.now());
        if (age > 60_000) return 'sent';
        if (age > 10_000) return 'sending';
        return 'queued';
      }
      // TODO: real provider poll (see header).
      throw notImplemented('letterStatus');
    },

    // Map provider-specific statuses to our canonical set:
    // 'queued' | 'sending' | 'sent' | 'failed'.
    // NOTE: InkSend has no 'delivered' — the provider accepts the letter for
    // writing and First Class mailing; onward delivery is not tracked.
    // TODO: fill in per the chosen provider's status vocabulary.
    normalizeStatus: (providerStatus) => {
      const map = { queued: 'queued', sending: 'sending', sent: 'sent', failed: 'failed' };
      return map[providerStatus] ?? 'unknown';
    },

    async refund(letter) {
      if (demo) return { id: `demo_refund_${letter.id}`, status: 'succeeded' };
      if (letter.refund_id) return stripe.refunds.retrieve(letter.refund_id);
      return stripe.refunds.create(
        { payment_intent: letter.payment_id, reason: 'requested_by_customer', metadata: { letter_id: letter.id } },
        { idempotencyKey: `refund-${letter.id}` });
    },
  };
}
