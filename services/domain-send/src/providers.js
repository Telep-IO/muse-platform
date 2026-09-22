import Stripe from 'stripe';

export class ProviderError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
  get rejected() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

// Demo availability: a small blocklist of famously-taken names plus a
// `taken-` prefix hook so the unavailable path is exercisable without a
// provider. A `fail-` prefix hook makes registration fail after payment so
// the failed -> refunded path is exercisable end to end. Documented in
// docs/connector.md; meaningless against a real registry.
const TAKEN_EXACT = new Set(['google.com', 'example.com', 'github.com', 'stripe.com', 'apple.com',
  'microsoft.com', 'amazon.com', 'facebook.com', 'openai.com', 'telep.dev', 'telep.io']);
function demoAvailable(domain) {
  return !TAKEN_EXACT.has(domain) && !domain.startsWith('taken-');
}

// ============================================================================
// SCAFFOLD: demo-mode provider stub only.
//
// No live domain-registry API is implemented here. Do NOT add real provider
// calls until TERMS-DILIGENCE.md is resolved: the reseller platform (OpenSRS
// / Tucows or other) must have its reseller onboarding completed and pricing
// confirmed for a paid customer-facing registration service.
//
// When integrating for real, every provider call below keeps its stable
// idempotency key (`register-${record.id}` etc.): a retried registration must
// never create a second order or double-charge the reseller account.
// ============================================================================
export function createProviders(config) {
  const stripe = config.mode === 'demo' ? null : new Stripe(config.stripeKey, { maxNetworkRetries: 2, timeout: 20000 });
  return {
    stripe,
    // True when the registry will accept a new registration for this domain.
    async checkAvailability(domain) {
      if (config.mode === 'demo') return demoAvailable(domain);
      // TODO(provider): implement against the reseller API (e.g. OpenSRS
      // lookup / domain availability call). Cache negative results briefly;
      // never cache a positive result across the checkout re-check.
      throw Object.assign(new Error('No domain provider is configured. See TERMS-DILIGENCE.md.'), { status: 503 });
    },
    async checkout(record, token, approval) {
      const link = `${config.baseUrl}/#domain=${record.id}.${token}`;
      const evidence = JSON.parse(approval.evidence);
      return stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], customer_creation: 'always',
        client_reference_id: record.id, metadata: { domain_id: record.id, review_hash: approval.review_hash },
        payment_intent_data: { metadata: { domain_id: record.id, review_hash: approval.review_hash } },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { submit: { message: `Payment authorizes automatic registration of this domain. Review the [accepted terms](${config.baseUrl}/policies/terms/${approval.terms_version}).` } },
        success_url: link, cancel_url: link, expires_at: Math.floor(record.checkout_started / 1000) + 3600,
        automatic_tax: { enabled: evidence.automatic_tax },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: record.amount, tax_behavior: 'exclusive',
          product_data: { name: 'DomainSend · domain registration',
            description: `${record.years}-year registration of ${record.domain} with WHOIS privacy included. Renewals are not handled in v1.`,
            ...(evidence.tax_code ? { tax_code: evidence.tax_code } : {}) } } }],
      }, { idempotencyKey: `checkout-${record.id}` });
    },
    // Submit the approved registration to the registry. Expected return:
    // { id, status: 'active' } on immediate completion,
    // { id, status: 'pending' } when the registry queues the order,
    // { status: 'failed' } when the registry cannot register the name.
    // Throw ProviderError (rejected=true) for hard registry rejections.
    async registerDomain(record) {
      if (config.mode === 'demo') {
        if (record.domain.startsWith('fail-')) return { status: 'failed' };
        const registeredAt = Date.now();
        return { id: `demo_${record.id}`, status: 'active', registered_at: registeredAt,
          expires_at: registeredAt + record.years * 365 * 24 * 3600000 };
      }
      // TODO(provider): implement against the reseller API (e.g. OpenSRS
      // sw_register) with idempotency key `register-${record.id}` so a retried
      // worker tick never creates a duplicate order. Submit the registrant
      // contact from the approval evidence, enable WHOIS privacy, set the
      // term to record.years. Normalize the provider's order state to
      // active/pending/failed.
      throw Object.assign(new Error('No domain provider is configured. See TERMS-DILIGENCE.md.'), { status: 503 });
    },
    // Poll a previously submitted order (crash recovery, or registries that
    // queue). Returns the same shape as registerDomain.
    async registrationStatus(record) {
      if (config.mode === 'demo') {
        const registeredAt = record.registered_at || Date.now();
        return { id: record.provider_domain_id, status: 'active', registered_at: registeredAt,
          expires_at: registeredAt + record.years * 365 * 24 * 3600000 };
      }
      // TODO(provider): poll the reseller order status for
      // record.provider_domain_id and normalize to active/pending/failed.
      throw Object.assign(new Error('No domain provider is configured. See TERMS-DILIGENCE.md.'), { status: 503 });
    },
    async refund(record) {
      // Demo has no Stripe object: simulate an immediately-succeeded refund so
      // the failed -> refunded path is fully exercisable in demo mode.
      if (config.mode === 'demo') return { id: `demo_refund_${record.id}`, status: 'succeeded' };
      if (record.refund_id) return stripe.refunds.retrieve(record.refund_id);
      return stripe.refunds.create({ payment_intent: record.payment_id, reason: 'requested_by_customer', metadata: { domain_id: record.id } }, { idempotencyKey: `refund-${record.id}` });
    },
  };
}
