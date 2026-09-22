import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The exact human confirmation. Its SHA-256 is part of the approval
// fingerprint, so any wording change invalidates in-flight reviews.
export const CONFIRMATION = 'I have reviewed the destination phone number, the exact script that will be spoken, the voice, and the price. I have the rights and authorizations needed to place this call, including any consent required from the recipient. I agree to the Terms and acknowledge the Privacy Notice. I authorize the call to be placed automatically after successful payment; once placed, the call cannot be recalled.';

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
// CallSend before any live use. Versions are content hashes, so publishing
// real policies automatically versions them.
const DEMO_POLICIES = {
  terms: '<h1>CallSend Terms (demo)</h1><p>Demo terms. Replace before live use. Operator: {{OPERATOR}}. Contact: {{SUPPORT}}. Address: {{ADDRESS}}.</p>',
  privacy: '<h1>CallSend Privacy Notice (demo)</h1><p>Demo notice. Replace before live use. Operator: {{OPERATOR}}. Contact: {{SUPPORT}}.</p>',
};

export async function registerPolicies(config, store) {
  const values = {
    OPERATOR: config.legalBusinessName || 'CallSend demo (operator not configured)',
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
// The fingerprint binds the script's SHA-256 (not the script itself) so the
// verbatim text can be purged after the call while the audit trail survives.
export function reviewEvidence(call, versions) {
  return {
    schema: 1,
    call_id: call.id,
    phone_number: call.phone_number,
    script_sha256: call.script_sha256,
    script_chars: call.script_chars,
    voice: call.voice,
    record_call: !!call.record_call,
    amount: call.amount,
    currency: 'usd',
    tod_check: call.tod_check || 'unknown',
    ...versions,
    confirmation_sha256: sha256(CONFIRMATION),
    disclosure: 'automated-call disclosure spoken before the script',
  };
}

export const reviewHash = evidence => sha256(canonical(evidence));
