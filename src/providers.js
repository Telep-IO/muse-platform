import Stripe from 'stripe';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { envelopeDir } from './documents.js';
import { sha256 } from './approval.js';

export class ProviderError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
  get rejected() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

// ============================================================================
// SCAFFOLD: demo-mode provider stub only.
//
// No live e-signature provider API is implemented here. Do NOT add real
// provider calls until TERMS-DILIGENCE.md is resolved: the chosen provider
// (Dropbox Sign, DocuSign, or other) must have a confirmed white-label /
// partner / reseller track that permits a paid customer-facing service built
// on their API. Self-serve developer terms alone are not sufficient.
//
// When integrating for real, every provider call below keeps its stable
// idempotency key (`envelope-${envelope.id}` etc.): a retried submission must
// never create a second envelope or notify signers twice.
// ============================================================================
export function createProviders(config) {
  const stripe = config.mode === 'demo' ? null : new Stripe(config.stripeKey, { maxNetworkRetries: 2, timeout: 20000 });
  return {
    stripe,
    async checkout(envelope, token, approval) {
      const link = `${config.baseUrl}/#envelope=${envelope.id}.${token}`;
      const evidence = JSON.parse(approval.evidence);
      return stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], customer_creation: 'always',
        client_reference_id: envelope.id, metadata: { envelope_id: envelope.id, review_hash: approval.review_hash },
        payment_intent_data: { metadata: { envelope_id: envelope.id, review_hash: approval.review_hash } },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { submit: { message: `Payment authorizes automatic submission for signing. Review the [accepted terms](${config.baseUrl}/policies/terms/${approval.terms_version}).` } },
        success_url: link, cancel_url: link, expires_at: Math.floor(envelope.checkout_started / 1000) + 3600,
        automatic_tax: { enabled: evidence.automatic_tax },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: envelope.amount, tax_behavior: 'exclusive',
          product_data: { name: 'SignSend · signature envelope', description: 'Prepare a document for e-signature: signature and date fields auto-placed, signers notified in order.',
            ...(evidence.tax_code ? { tax_code: evidence.tax_code } : {}) } } }],
      }, { idempotencyKey: `checkout-${envelope.id}` });
    },
    // Submit the approved envelope to the e-signature provider: upload the
    // ORIGINAL document, create signers in sequential order, auto-place a
    // signature + date field for each signer.
    async submitEnvelope(envelope) {
      const bytes = await readFile(join(envelopeDir(config, envelope.id), 'upload.pdf')).catch(() => { throw Object.assign(new Error('Approved document is unavailable.'), { integrity: true }); });
      if (sha256(bytes) !== envelope.document_sha256) throw Object.assign(new Error('Approved document changed.'), { integrity: true });
      if (config.mode === 'demo') return { id: `demo_${envelope.id}`, status: 'sent' };
      // TODO(provider): implement against the chosen provider with a stable
      // idempotency key (e.g. `envelope-${envelope.id}`) so a retried worker
      // tick never creates a duplicate envelope or re-notifies signers.
      // Expected return: { id: <provider envelope id>, status: 'sent' }.
      throw Object.assign(new Error('No e-signature provider is configured. See TERMS-DILIGENCE.md.'), { status: 503 });
    },
    // Poll the provider for the current per-signer state.
    async envelopeStatus(envelope) {
      if (config.mode === 'demo') {
        // Demo: the caller (worker/demo-event route) owns signer state.
        return { signers: JSON.parse(envelope.signers) };
      }
      // TODO(provider): GET the provider's envelope, verify the returned id
      // matches envelope.provider_envelope_id, and normalize to
      // { signers: [{ name, email, status: 'pending'|'signed'|'declined', ... }] }.
      throw Object.assign(new Error('No e-signature provider is configured. See TERMS-DILIGENCE.md.'), { status: 503 });
    },
    async refund(envelope) {
      if (envelope.refund_id) return stripe.refunds.retrieve(envelope.refund_id);
      return stripe.refunds.create({ payment_intent: envelope.payment_id, reason: 'requested_by_customer', metadata: { envelope_id: envelope.id } }, { idempotencyKey: `refund-${envelope.id}` });
    },
  };
}
