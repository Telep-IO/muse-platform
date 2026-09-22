import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareDocument, documentDir, MAX_BYTES, MAX_PAGES } from './documents.js';
import { CONFIRMATION, sha256, canonical, reviewEvidence, reviewHash } from './approval.js';
import { ProviderError } from './providers.js';

export const fail = (status, message) => Object.assign(new Error(message), { status });
export const priceForPages = pages => 99 * pages; // 99¢ per page, server-computed.

// Strict E.164: + followed by 1–15 digits, first digit non-zero.
const E164 = /^\+[1-9]\d{7,14}$/;
// Obviously non-dialable patterns agents should never submit.
const FAKE_PATTERNS = [
  { test: n => /^\+?1?55501\d{2}$/.test(n.replace(/\D/g, '')), why: 'fictional 555-01XX range' },
  { test: n => { const d = n.replace(/\D/g, '').slice(-7); return d.length === 7 && new Set(d).size === 1; }, why: 'repeated digits' },
];

export function validateFaxNumber(raw) {
  const number = String(raw || '').trim().replace(/[\s\-().]/g, '');
  if (!E164.test(number))
    throw fail(400, 'Enter the destination fax number in E.164 format, e.g. +15551234567.');
  for (const { test, why } of FAKE_PATTERNS)
    if (test(number)) throw fail(400, `That fax number looks invalid (${why}). Check the number and try again.`);
  return number;
}

const toSchema = z.object({
  fax_number: z.string().min(1, 'fax_number is required'),
  cover_page: z.boolean().optional().default(false),
});

const hashToken = token => createHash('sha256').update(token).digest('hex');

export async function createFaxes(config, store, providers, options = {}) {
  const policies = options.policies || {};

  const authorized = id => {
    const fax = store.get(id);
    if (!fax) throw fail(404, 'Fax not found.');
    return fax;
  };
  // The hash the human approves. Before checkout it is computed fresh from
  // the draft; after checkout the recorded approval is authoritative.
  const currentReviewHash = fax =>
    store.approval(fax.id)?.review_hash || reviewHash(reviewEvidence(fax, policies));
  const checkToken = (fax, token) => {
    const a = Buffer.from(fax.token_hash, 'hex');
    const b = Buffer.from(hashToken(token || ''), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail(401, 'Invalid or missing token.');
  };

  async function create(input, file) {
    if (!file?.buffer?.length) throw fail(400, 'Upload one PDF document.');
    if (file.size > MAX_BYTES) throw fail(400, 'PDF must be 10 MB or smaller.');
    const parsed = toSchema.safeParse(input);
    if (!parsed.success) throw parsed.error;
    const faxNumber = validateFaxNumber(parsed.data.fax_number);
    const coverPage = parsed.data.cover_page;

    if (store.unpurgedCount() >= 500)
      throw fail(503, 'We are at capacity right now. Please try again later.');

    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const pages = await prepareDocument(config, id, file.buffer,
      { coverPage, faxNumber, businessName: config.businessName });
    const amount = priceForPages(pages);
    const printBytes = await readFile(join(documentDir(config, id), 'print.pdf'));
    const documentSha = sha256(printBytes);
    const now = Date.now();
    store.insert({ id, token_hash: hashToken(token), fax_number: faxNumber, cover_page: coverPage, pages, amount, document_sha256: documentSha, created_at: now });

    return {
      id, token,
      review_url: `${config.baseUrl}/#fax=${id}.${token}`,
      fax_number: faxNumber, cover_page: coverPage, pages,
      amount_cents: amount, currency: 'usd',
      mode: config.mode, state: 'draft',
      review_hash: reviewHash(reviewEvidence(
        { id, document_sha256: documentSha, fax_number: faxNumber, cover_page: coverPage, pages, amount }, policies)),
      terms_version: policies.terms_version, privacy_version: policies.privacy_version,
    };
  }

  function view(id, token) {
    const fax = authorized(id);
    checkToken(fax, token);
    return {
      id: fax.id, state: fax.state,
      fax_number: fax.fax_number, cover_page: !!fax.cover_page,
      pages: fax.pages, amount_cents: fax.amount, currency: fax.currency,
      mode: config.mode,
      review_url: `${config.baseUrl}/#fax=${fax.id}.${token}`,
      review_hash: currentReviewHash(fax),
      terms_version: fax.terms_version || policies.terms_version,
      privacy_version: fax.privacy_version || policies.privacy_version,
      provider_status: fax.provider_status || null,
      // Delivered means the provider confirmed transmission. Anything else
      // is not delivery, no matter how far along the job looks.
      delivered: fax.state === 'delivered',
      created_at: fax.created_at,
    };
  }

  async function checkout(id, token, body) {
    const fax = authorized(id);
    checkToken(fax, token);
    if (fax.state !== 'draft') throw fail(409, 'This fax is no longer a draft.');
    const parsed = z.object({
      confirmed: z.literal(true, { errorMap: () => ({ message: 'The human review confirmation is required.' }) }),
      review_hash: z.string().min(1),
      terms_version: z.string().min(1),
      privacy_version: z.string().min(1),
      confirmation: z.literal(CONFIRMATION, { errorMap: () => ({ message: 'The confirmation wording changed. Re-review before paying.' }) }),
    }).safeParse(body);
    if (!parsed.success) throw parsed.error;
    if (parsed.data.terms_version !== policies.terms_version || parsed.data.privacy_version !== policies.privacy_version)
      throw fail(409, 'Policies changed since review. Re-review before paying.');

    const evidence = reviewEvidence(fax, policies);
    const hash = reviewHash(evidence);
    if (parsed.data.review_hash !== hash)
      throw fail(409, 'The review is stale (document, number, pages, price, or policies changed). Re-review before paying.');

    // Commit approval + checkout lease in one step; a duplicate submission
    // reuses the existing Stripe session instead of creating a second one.
    const now = Date.now();
    store.set(id, { review_hash: hash, terms_version: policies.terms_version, privacy_version: policies.privacy_version, checkout_started: now, lease_until: now + 3600_000 });
    const alreadyApproved = !!store.approval(id);
    if (alreadyApproved) {
      const existing = store.get(id);
      if (existing.session_id) {
        const session = await providers.checkout(existing, token, store.approval(id));
        return { checkout_url: session.url, state: existing.state };
      }
      throw fail(409, 'Checkout already started.');
    }
    store.insertApproval(id, hash, canonical(evidence));
    if (!store.transition(id, 'draft', 'checkout')) throw fail(409, 'This fax is no longer a draft.');
    const session = await providers.checkout(store.get(id), token, store.approval(id));
    store.set(id, { session_id: session.id });
    return { checkout_url: session.url, state: 'checkout' };
  }

  // Called from the signed Stripe webhook and the return-URL reconciliation.
  async function recordPayment(session) {
    const faxId = session.client_reference_id || session.metadata?.fax_id;
    if (!faxId) throw fail(400, 'Unrecognized payment session.');
    const fax = store.get(faxId);
    if (!fax || !['checkout', 'paid', 'sending'].includes(fax.state)) return { ignored: true };
    const checks = [
      session.payment_status === 'paid',
      session.currency === 'usd',
      session.amount_subtotal === fax.amount || session.amount_total === fax.amount,
      session.metadata?.review_hash === fax.review_hash,
      session.metadata?.fax_id === fax.id,
      session.consent?.terms_of_service === 'accepted' || config.mode === 'demo',
      (session.mode || 'payment') === 'payment',
    ];
    if (!checks.every(Boolean)) {
      store.set(fax.id, { state: 'needs_review', fail_reason: 'payment_mismatch' });
      throw fail(409, 'Payment did not match the approved fax. It is held for review; you will not be charged twice.');
    }
    store.set(fax.id, { payment_id: session.payment_intent, session_id: session.id, lease_until: null });
    store.transition(fax.id, fax.state, 'paid');
    return { fax_id: fax.id, state: 'paid' };
  }

  // Background fulfillment worker. Claims paid faxes with a lease, submits
  // with a stable idempotency key, then polls until the provider confirms
  // delivery or failure. Ambiguous provider outcomes older than the retry
  // window go to needs_review — never retried blindly.
  const RETRY_WINDOW_MS = 23 * 3600_000;
  async function fulfillOnce() {
    // Claim paid faxes with a lease; the lease (not row age) prevents
    // double-claiming, so newly-paid rows are picked up immediately.
    const due = store.inStates(['paid']).filter(f => !f.lease_until || f.lease_until < Date.now());
    for (const fax of due) {
      if (!store.claim(fax.id, 'paid', 'sending', 15 * 60_000)) continue;
      try {
        const result = await providers.sendFax(store.get(fax.id));
        store.set(fax.id, { provider_fax_id: result.id, provider_status: result.status, provider_submitted_at: Date.now() });
      } catch (error) {
        if (error.integrity) {
          store.set(fax.id, { state: 'needs_review', fail_reason: 'document_integrity' });
          continue;
        }
        if (error instanceof ProviderError && error.rejected) {
          if (store.transition(fax.id, 'sending', 'failed')) {
            store.set(fax.id, { fail_reason: 'provider_rejected' });
            queueRefund(fax.id);
          }
          continue;
        }
        // Uncertain: leave in sending for the poller; age-out below.
      }
    }
    const sending = store.inStates(['sending']);
    for (const fax of sending) {
      try {
        const status = providers.normalizeStatus(await providers.faxStatus(fax));
        store.set(fax.id, { provider_status: status });
        if (status === 'delivered') store.transition(fax.id, 'sending', 'delivered');
        else if (status === 'failed') {
          if (store.transition(fax.id, 'sending', 'failed')) queueRefund(fax.id);
        } else if (Date.now() - (fax.provider_submitted_at || fax.updated_at) > RETRY_WINDOW_MS) {
          store.set(fax.id, { state: 'needs_review', fail_reason: 'ambiguous_outcome' });
        }
      } catch { /* poll again next tick */ }
    }
  }

  async function queueRefund(faxId) {
    const fax = store.get(faxId);
    if (!fax || !['failed'].includes(fax.state)) return;
    if (!store.transition(faxId, 'failed', 'refund_pending')) return;
    try {
      const refund = await providers.refund(store.get(faxId));
      store.set(faxId, { refund_id: refund.id });
      store.transition(faxId, 'refund_pending', 'refunded');
    } catch {
      // stays refund_pending for the next tick / manual review
    }
  }

  // Provider delivery webhook handler (stub until the real provider is wired).
  // TODO: verify the provider signature with config.faxWebhookSecret, then
  // map the event to delivered/failed via providers.normalizeStatus().
  async function providerWebhook(rawBody, headers) {
    if (config.mode === 'demo') throw fail(404, 'Provider webhooks are not enabled in demo mode.');
    // TODO: const event = verifyFaxWebhook(rawBody, headers, config.faxWebhookSecret);
    // const fax = store.get(event.fax_id_from_metadata);
    // ... update provider_status; delivered/failed transitions; queueRefund on failed.
    throw fail(501, 'Fax provider webhooks are not implemented yet. See TERMS-DILIGENCE.md.');
  }

  async function maintenance() {
    // Expire unpaid drafts/checkouts after 48h.
    for (const fax of store.dueFor(['draft', 'checkout'], 48 * 3600_000)) {
      if (store.transition(fax.id, fax.state, 'expired'))
        await rm(documentDir(config, fax.id), { recursive: true, force: true });
    }
    // Purge documents + personal data 30 days after terminal states.
    for (const fax of store.dueFor(['delivered', 'refunded', 'expired'], 30 * 24 * 3600_000)) {
      await rm(documentDir(config, fax.id), { recursive: true, force: true });
      store.set(fax.id, { purged: 1, fax_number: '[purged]' });
    }
    await fulfillOnce();
  }

  return { create, view, checkout, recordPayment, fulfillOnce, queueRefund, providerWebhook, maintenance, authorized: authorized, checkToken, policies };
}
