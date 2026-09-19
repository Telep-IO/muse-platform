import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CONFIRMATION = 'I have reviewed the print-ready document, recipient and return addresses, and price. I have the rights and authorizations needed to share and mail this content, including any AI-generated content. I agree to the Terms and acknowledge the Privacy Notice. I authorize automatic submission for printing and mailing after successful payment; changes or cancellation may no longer be possible.';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function registerPolicies(config, db) {
  const values = {
    OPERATOR: config.legalBusinessName || 'PaperSend demo (operator not configured)',
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
export function reviewEvidence(order, config, versions) {
  return {
    schema: 1, order_id: order.id, document_sha256: order.document_sha256,
    addresses_sha256: sha256(canonical({ sender: JSON.parse(order.sender), recipient: JSON.parse(order.recipient) })),
    pages: order.pages, amount: order.amount, currency: 'usd', automatic_tax: !!config.automaticTax,
    tax_code: config.taxCode || null, ...versions, confirmation_sha256: sha256(CONFIRMATION),
    print: { paper: 'us_letter', color: false, double_sided: false, address_cover_sheet: true },
  };
}
export const reviewHash = evidence => sha256(canonical(evidence));
