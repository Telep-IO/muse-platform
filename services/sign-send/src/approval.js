import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CONFIRMATION = 'I have reviewed the document, the signer names and email addresses, the signing order, and the price. I have the rights and authorizations needed to share this content and to request signatures from these signers, including any AI-generated content. I agree to the Terms and acknowledge the Privacy Notice. I authorize automatic submission to the e-signature provider after successful payment; changes or cancellation may no longer be possible once signers are notified.';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function registerPolicies(config, db) {
  const values = {
    OPERATOR: config.legalBusinessName || 'SignSend demo (operator not configured)',
    ADDRESS: config.businessAddress || 'Business mailing address not configured for this demo.',
    SUPPORT: config.supportEmail || 'Support contact not configured for this demo.',
  };
  const result = {};
  for (const kind of ['terms', 'privacy']) {
    const html = readFileSync(new URL(`../policies/${kind}.html`, import.meta.url), 'utf8').replace(/\{\{(OPERATOR|ADDRESS|SUPPORT)\}\}/g, (_, key) => escape(values[key]));
    const version = sha256(html);
    await db.prepare('INSERT INTO policies (version, kind, html, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').run(version, kind, html, Date.now());
    result[`${kind}_version`] = version;
  }
  return result;
}
// The fingerprint binds the ORIGINAL uploaded PDF (what the provider receives
// for signing), not the rasterized preview. The preview is a faithful rendering
// of the same bytes; signers sign the original document.
export function reviewEvidence(envelope, config, versions) {
  return {
    schema: 1, envelope_id: envelope.id, document_sha256: envelope.document_sha256,
    signers_sha256: sha256(canonical(JSON.parse(envelope.signers).map(({ name, email }) => ({ name, email })))),
    pages: envelope.pages, amount: envelope.amount, currency: 'usd', automatic_tax: !!config.automaticTax,
    tax_code: config.taxCode || null, ...versions, confirmation_sha256: sha256(CONFIRMATION),
    signing: { order: 'sequential', fields: 'signature+date auto-placed' },
  };
}
export const reviewHash = evidence => sha256(canonical(evidence));
