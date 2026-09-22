import Stripe from 'stripe';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { documentDir } from './documents.js';
import { sha256 } from './approval.js';

export class ProviderError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
  get rejected() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

export function createProviders(config) {
  const stripe = config.mode === 'demo' ? null : new Stripe(config.stripeKey, { maxNetworkRetries: 2, timeout: 20000 });
  async function lob(path, body) {
    const response = await fetch(`https://api.lob.com/v1/${path}`, {
      method: body.method || 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.lobKey}:`).toString('base64')}`, ...(body.headers || {}) },
      body: body.form, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new ProviderError(`Lob request failed (${response.status}).`, response.status);
    return response.json();
  }
  return {
    stripe,
    async verifyAddress(address) {
      if (config.mode === 'demo') return address;
      const result = await lob('us_verifications', { form: new URLSearchParams({
        primary_line: address.address_line1, secondary_line: address.address_line2,
        city: address.address_city, state: address.address_state, zip_code: address.address_zip,
      }) });
      if (result.deliverability !== 'deliverable') throw Object.assign(new Error('The address could not be verified as deliverable. Check the street, apartment, and ZIP code.'), { status: 400 });
      // Verification is an internal mailing check, not an address-data product.
      // Do not expose or retain Lob's standardized address/report in our API.
      return address;
    },
    async checkout(order, token, approval) {
      const link = `${config.baseUrl}/#order=${order.id}.${token}`;
      const evidence = JSON.parse(approval.evidence);
      return stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'], customer_creation: 'always',
        client_reference_id: order.id, metadata: { order_id: order.id, review_hash: approval.review_hash },
        payment_intent_data: { metadata: { order_id: order.id, review_hash: approval.review_hash } },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { submit: { message: `Payment authorizes automatic printing and mailing. Review the [accepted terms](${config.baseUrl}/policies/terms/${approval.terms_version}).` } },
        success_url: link, cancel_url: link, expires_at: Math.floor(order.checkout_started / 1000) + 3600,
        automatic_tax: { enabled: evidence.automatic_tax },
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: order.amount, tax_behavior: 'exclusive',
          product_data: { name: `PaperSend · ${order.pages}-page letter`, description: 'Black-and-white printing, address cover sheet, envelope, and US First Class postage.',
            ...(evidence.tax_code ? { tax_code: evidence.tax_code } : {}) } } }],
      }, { idempotencyKey: `checkout-${order.id}` });
    },
    async sendLetter(order) {
      const bytes = await readFile(join(documentDir(config, order.id), 'print.pdf')).catch(() => { throw Object.assign(new Error('Approved document is unavailable.'), { integrity: true }); });
      if (sha256(bytes) !== order.document_sha256) throw Object.assign(new Error('Approved document changed.'), { integrity: true });
      if (config.mode === 'demo') return { id: `demo_${order.id}`, expected_delivery_date: null, status: 'rendered' };
      const form = new FormData();
      for (const side of ['to', 'from']) {
        const address = JSON.parse(side === 'to' ? order.recipient : order.sender);
        for (const [key, value] of Object.entries(address)) form.set(`${side}[${key}]`, value);
      }
      for (const [key, value] of Object.entries({ color: 'false', double_sided: 'false', address_placement: 'insert_blank_page',
        mail_type: 'usps_first_class', use_type: 'operational', description: `PaperSend ${order.id}`, 'metadata[order_id]': order.id })) form.set(key, value);
      form.set('file', new Blob([bytes], { type: 'application/pdf' }), 'letter.pdf');
      const result = await lob('letters', { form, headers: { 'Idempotency-Key': `letter-${order.id}` } });
      if (!/^ltr_[A-Za-z0-9]+$/.test(result.id || '')) throw new ProviderError('Lob returned an invalid response.');
      return result;
    },
    async letterStatus(order) {
      const result = await lob(`letters/${encodeURIComponent(order.lob_id)}`, { method: 'GET' });
      if (result.id !== order.lob_id) throw new ProviderError('Unexpected letter response.');
      return result.status;
    },
    async refund(order) {
      if (order.refund_id) return stripe.refunds.retrieve(order.refund_id);
      return stripe.refunds.create({ payment_intent: order.payment_id, reason: 'requested_by_customer', metadata: { order_id: order.id } }, { idempotencyKey: `refund-${order.id}` });
    },
  };
}
