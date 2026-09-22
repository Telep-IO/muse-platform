import Stripe from 'stripe';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { documentDir } from './documents.js';
import { sha256 } from './approval.js';

// ============================================================================
// SCAFFOLD: fax-provider integration is NOT implemented.
// ----------------------------------------------------------------------------
// TODO (after TERMS-DILIGENCE.md is resolved):
//   1. Choose the provider: Phaxio or Telnyx Fax — whichever confirms in
//      writing that a paid, customer-facing third-party service is permitted
//      (look for their white-label / partner / reseller track; do NOT rely
//      on self-serve terms).
//   2. Implement sendFax() below against the real API:
//        - POST the print.pdf bytes with the destination number.
//        - Pass a stable idempotency key per fax (`fax-${fax.id}`) so a
//          retried submission can never transmit twice. Verify the provider
//          honors it (or emulate with a provider-side dedupe check).
//        - Validate the returned job id format before storing it.
//   3. Implement faxStatus() for polling, and wire the real webhook in
//      src/app.js (signature verification with FAX_WEBHOOK_SECRET).
//   4. Confirm what "delivered" means per provider (provider-confirmed
//      transmission vs. mere acceptance) and map it in normalizeStatus().
// Until then, every fax-provider call below is a demo stub, and any
// non-demo mode refuses to touch a fax provider.
// ============================================================================

export class ProviderError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
  // 4xx (except 408/409/429) = the provider rejected the job: do not retry,
  // queue a refund instead. Anything else = uncertain: retry with backoff.
  get rejected() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

const notImplemented = (name) =>
  Object.assign(new Error(`Fax provider "${name}" is not implemented. Resolve TERMS-DILIGENCE.md first.`), { status: 503 });

export function createProviders(config) {
  const stripe = config.mode === 'demo' ? null : new Stripe(config.stripeKey, { maxNetworkRetries: 2, timeout: 20000 });
  const demo = config.mode === 'demo';

  return {
    stripe,

    // Stripe Checkout session for the human-gated payment step.
    // Implemented for real: billing is ours, not the fax provider's.
    async checkout(fax, token, approval) {
      if (demo) {
        return { id: `demo_session_${fax.id}`, url: `${config.baseUrl}/#fax=${fax.id}.${token}&demo_paid=1` };
      }
      const link = `${config.baseUrl}/#fax=${fax.id}.${token}`;
      const evidence = JSON.parse(approval.evidence);
      return stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_creation: 'always',
        client_reference_id: fax.id,
        metadata: { fax_id: fax.id, review_hash: approval.review_hash },
        payment_intent_data: { metadata: { fax_id: fax.id, review_hash: approval.review_hash } },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { submit: { message: `Payment authorizes automatic fax transmission. Review the [accepted terms](${config.baseUrl}/policies/terms/${approval.terms_version}).` } },
        success_url: link,
        cancel_url: link,
        expires_at: Math.floor(fax.checkout_started / 1000) + 3600,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: fax.amount, tax_behavior: 'exclusive',
          product_data: { name: `FaxSend · ${fax.pages}-page fax`,
            description: 'Black-and-white fax transmission to the reviewed destination number.' } } }],
      }, { idempotencyKey: `checkout-${fax.id}` });
    },

    // Submit the approved document to the fax provider. Demo stub only.
    async sendFax(fax) {
      const bytes = await readFile(join(documentDir(config, fax.id), 'print.pdf'))
        .catch(() => { throw Object.assign(new Error('Approved document is unavailable.'), { integrity: true }); });
      if (sha256(bytes) !== fax.document_sha256)
        throw Object.assign(new Error('Approved document changed.'), { integrity: true });
      if (demo) {
        // Simulated provider job. A real implementation returns the provider's
        // job id and its initial status here.
        return { id: `demo_fax_${fax.id}`, status: 'queued' };
      }
      // TODO: real provider call (see header). Suggested shape:
      //   const form = new FormData();
      //   form.set('to', fax.fax_number);
      //   form.set('file', new Blob([bytes], { type: 'application/pdf' }), 'fax.pdf');
      //   const result = await providerPost('/faxes', form, { 'Idempotency-Key': `fax-${fax.id}` });
      //   if (!isValidJobId(result.id)) throw new ProviderError('Fax provider returned an invalid response.');
      //   return { id: result.id, status: normalizeStatus(result.status) };
      throw notImplemented('sendFax');
    },

    // Poll the provider for the job's delivery status. Demo stub only.
    async faxStatus(fax) {
      if (demo) {
        // Demo progression: queued -> sending -> delivered. A real
        // implementation GETs the job and maps provider statuses through
        // normalizeStatus() below.
        const age = Date.now() - (fax.provider_submitted_at || Date.now());
        if (age > 60_000) return 'delivered';
        if (age > 10_000) return 'sending';
        return 'queued';
      }
      // TODO: real provider poll (see header).
      throw notImplemented('faxStatus');
    },

    // Map provider-specific statuses to our canonical set:
    // 'queued' | 'sending' | 'delivered' | 'failed'.
    // TODO: fill in per the chosen provider's status vocabulary.
    normalizeStatus: (providerStatus) => {
      const map = { queued: 'queued', sending: 'sending', delivered: 'delivered', failed: 'failed' };
      return map[providerStatus] ?? 'unknown';
    },

    async refund(fax) {
      if (demo) return { id: `demo_refund_${fax.id}`, status: 'succeeded' };
      if (fax.refund_id) return stripe.refunds.retrieve(fax.refund_id);
      return stripe.refunds.create(
        { payment_intent: fax.payment_id, reason: 'requested_by_customer', metadata: { fax_id: fax.id } },
        { idempotencyKey: `refund-${fax.id}` });
    },
  };
}
