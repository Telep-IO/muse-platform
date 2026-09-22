import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The exact human confirmation. Its SHA-256 is part of the approval
// fingerprint, so any wording change invalidates in-flight reviews.
export const CONFIRMATION = 'I have reviewed the fax document, the destination fax number, and the price. I have the rights and authorizations needed to share and transmit this content. I agree to the Terms and acknowledge the Privacy Notice. I authorize automatic fax transmission after successful payment; changes or cancellation may no longer be possible.';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const escape = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// TODO: replace the demo policy text with real terms/privacy drafted for
// FaxSend before any live use. Versions are content hashes, so publishing
// real policies automatically versions them.
const DEMO_POLICIES = {
  terms: '<h1>FaxSend Terms (demo)</h1><p>Demo terms. Replace before live use. Operator: {{OPERATOR}}. Contact: {{SUPPORT}}. Address: {{ADDRESS}}.</p>',
  privacy: '<h1>FaxSend Privacy Notice (demo)</h1><p>Demo notice. Replace before live use. Operator: {{OPERATOR}}. Contact: {{SUPPORT}}.</p>',
};

export async function registerPolicies(config, store) {
  const values = {
    OPERATOR: config.legalBusinessName || 'FaxSend demo (operator not configured)',
    ADDRESS: config.businessAddress || 'Business mailing address not configured for this demo.',
    SUPPORT: config.supportEmail || 'Support contact not configured for this demo.',
  };
  const result = {};
  for (const kind of ['terms', 'privacy']) {
    let html;
    try {
      html = readFileSync(new URL(`../policies/${kind}.html`, import.meta.url), 'utf8');
    } catch {
      html = DEMO_POLICIES[kind];
    }
    html = html.replace(/\{\{(OPERATOR|ADDRESS|SUPPORT)\}\}/g, (_, key) => escape(values[key]));
    const version = sha256(html);
    store.insertPolicy(version, kind, html);
    result[`${kind}_version`] = version;
  }
  return result;
}

// Everything the human approved, bound into one hash. Checkout and
// fulfillment re-verify this fingerprint; any drift -> needs_review.
export function reviewEvidence(fax, versions) {
  return {
    schema: 1,
    fax_id: fax.id,
    document_sha256: fax.document_sha256,
    destination_sha256: sha256(canonical({ fax_number: fax.fax_number, cover_page: !!fax.cover_page })),
    pages: fax.pages,
    amount: fax.amount,
    currency: 'usd',
    ...versions,
    confirmation_sha256: sha256(CONFIRMATION),
    transmission: { black_and_white: true, cover_page: !!fax.cover_page },
  };
}

export const reviewHash = evidence => sha256(canonical(evidence));
