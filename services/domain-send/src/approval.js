import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const CONFIRMATION = 'I have reviewed the exact domain name, the registration term in years, the registrant name, organization and email address, the per-year and total price, and that WHOIS privacy is included free. I understand the domain is registered only after successful payment; that the registry sends a verification email to the registrant address which I must click or the domain may be suspended; and that DomainSend v1 does not handle renewals — I am responsible for renewing before the expiry date. I agree to the Terms and acknowledge the Privacy Notice. I authorize automatic registration after successful payment. Once registered, a domain cannot be cancelled; a refund is only issued when registration fails before completing.';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function registerPolicies(config, db) {
  const values = {
    OPERATOR: config.legalBusinessName || 'DomainSend demo (operator not configured)',
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
// The fingerprint binds the exact domain string (lowercased), the term, the
// registrant contact, and the price — the four things the human must verify
// before money moves. There is no document here; the row itself is the record,
// so integrity is re-derived from the row at every gate.
export function reviewEvidence(record, config, versions) {
  const registrant = JSON.parse(record.registrant || '{}');
  return {
    schema: 1, domain_id: record.id, domain: record.domain, tld: record.tld, years: record.years,
    price_per_year: record.price_per_year, amount: record.amount, currency: 'usd',
    registrant_sha256: sha256(canonical({ name: registrant.name || '', email: registrant.email || '', org: registrant.org || '' })),
    whois_privacy: true, automatic_tax: !!config.automaticTax,
    tax_code: config.taxCode || null, ...versions, confirmation_sha256: sha256(CONFIRMATION),
  };
}
export const reviewHash = evidence => sha256(canonical(evidence));
