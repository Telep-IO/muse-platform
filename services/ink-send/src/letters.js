import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CONFIRMATION, sha256, canonical, reviewEvidence, reviewHash } from './approval.js';
import { ProviderError } from './providers.js';

export const fail = (status, message) => Object.assign(new Error(message), { status });
export const priceForLetter = () => 399; // $3.99 flat per letter, server-computed.

export const CARD_OPTIONS = ['plain-letter', 'thank-you', 'condolence', 'holiday'];

const addressSchema = z.object({
  name: z.string().trim().min(1, 'recipient name is required').max(120),
  address_line1: z.string().trim().min(1, 'address_line1 is required').max(120),
  address_line2: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(1, 'city is required').max(80),
  state: z.string().trim().min(1, 'state is required').max(40),
  zip: z.string().trim().min(1, 'zip is required').max(20),
  country: z.string().trim().max(2).optional().default('US'),
}).superRefine((addr, ctx) => {
  // Never "fix" an address server-side; reject with a plain-language error
  // and let the human correct it.
  if (addr.country === 'US' && !/^\d{5}(-\d{4})?$/.test(addr.zip)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zip'],
      message: 'Enter a US ZIP code like 44113 or 44113-1234.' });
  }
});

const createSchema = z.object({
  message: z.string().min(10, 'The message must be at least 10 characters.').max(2000, 'The message must be 2000 characters or fewer.'),
  to: addressSchema,
  card: z.enum(CARD_OPTIONS).optional().default('plain-letter'),
  handwriting_style: z.string().trim().max(64).optional().default(''),
});

const hashToken = token => createHash('sha256').update(token).digest('hex');

export async function createLetters(config, store, providers, options = {}) {
  const policies = options.policies || {};

  const authorized = id => {
    const letter = store.get(id);
    if (!letter) throw fail(404, 'Letter not found.');
    return letter;
  };
  // The hash the human approves. Before checkout it is computed fresh from
  // the draft; after checkout the recorded approval is authoritative.
  const currentReviewHash = letter =>
    store.approval(letter.id)?.review_hash || reviewHash(reviewEvidence(letter, policies));
  const checkToken = (letter, token) => {
    const a = Buffer.from(letter.token_hash, 'hex');
    const b = Buffer.from(hashToken(token || ''), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail(401, 'Invalid or missing token.');
  };

  function recipient(letter) {
    return {
      name: letter.recipient_name,
      address_line1: letter.recipient_line1,
      address_line2: letter.recipient_line2 || '',
      city: letter.recipient_city,
      state: letter.recipient_state,
      zip: letter.recipient_zip,
      country: letter.recipient_country,
    };
  }

  async function create(input) {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) throw parsed.error;

    if (store.unpurgedCount() >= 500)
      throw fail(503, 'We are at capacity right now. Please try again later.');

    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const message = parsed.data.message;
    const to = parsed.data.to;
    const card = parsed.data.card;
    const style = parsed.data.handwriting_style;
    const now = Date.now();
    store.insert({
      id, token_hash: hashToken(token),
      message, message_sha256: sha256(message),
      recipient_name: to.name, recipient_line1: to.address_line1,
      recipient_line2: to.address_line2, recipient_city: to.city,
      recipient_state: to.state, recipient_zip: to.zip,
      recipient_country: to.country,
      card, handwriting_style: style,
      amount: priceForLetter(), created_at: now,
    });

    const letter = store.get(id);
    return {
      id, token,
      review_url: `${config.baseUrl}/#letter=${id}.${token}`,
      to: recipient(letter), card, handwriting_style: style,
      message_preview: message.length > 120 ? message.slice(0, 120) + '…' : message,
      amount_cents: letter.amount, currency: 'usd',
      mode: config.mode, state: 'draft',
      review_hash: reviewHash(reviewEvidence(letter, policies)),
      terms_version: policies.terms_version, privacy_version: policies.privacy_version,
    };
  }

  function view(id, token) {
    const letter = authorized(id);
    checkToken(letter, token);
    return {
      id: letter.id, state: letter.state,
      // The exact text to be handwritten. Purged letters return null here;
      // the fingerprint in the approval record still proves what was sent.
      message: letter.purged ? null : letter.message,
      to: letter.purged ? null : recipient(letter),
      card: letter.card, handwriting_style: letter.handwriting_style || '',
      amount_cents: letter.amount, currency: letter.currency,
      mode: config.mode,
      review_url: `${config.baseUrl}/#letter=${letter.id}.${token}`,
      review_hash: currentReviewHash(letter),
      terms_version: letter.terms_version || policies.terms_version,
      privacy_version: letter.privacy_version || policies.privacy_version,
      provider_status: letter.provider_status || null,
      // Sent means the handwriting provider accepted the letter for writing
      // and mailing. InkSend does NOT track delivery: it goes by First Class
      // mail, and we say so honestly instead of guessing.
      sent: letter.state === 'sent',
      created_at: letter.created_at,
    };
  }

  async function checkout(id, token, body) {
    const letter = authorized(id);
    checkToken(letter, token);
    if (letter.state !== 'draft') throw fail(409, 'This letter is no longer a draft.');
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

    const evidence = reviewEvidence(letter, policies);
    const hash = reviewHash(evidence);
    if (parsed.data.review_hash !== hash)
      throw fail(409, 'The review is stale (message, address, options, or price changed). Re-review before paying.');

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
    if (!store.transition(id, 'draft', 'checkout')) throw fail(409, 'This letter is no longer a draft.');

    if (config.mode === 'demo') {
      // Demo: no payment is taken. Mark paid so the worker picks it up and
      // the full draft -> sent machine is exercisable end to end.
      store.set(id, { payment_id: `demo_${id}`, lease_until: null });
      store.transition(id, 'checkout', 'paid');
      await fulfillOnce();
      return { checkout_url: `${config.baseUrl}/#letter=${id}.${token}`, state: 'paid', demo: true };
    }

    const session = await providers.checkout(store.get(id), token, store.approval(id));
    store.set(id, { session_id: session.id, lease_until: null });
    return { checkout_url: session.url, state: 'checkout' };
  }

  // Called from the signed Stripe webhook and the return-URL reconciliation.
  async function recordPayment(session) {
    const letterId = session.client_reference_id || session.metadata?.letter_id;
    if (!letterId) throw fail(400, 'Unrecognized payment session.');
    const letter = store.get(letterId);
    if (!letter || !['checkout', 'paid', 'sending'].includes(letter.state)) return { ignored: true };
    const checks = [
      session.payment_status === 'paid',
      session.currency === 'usd',
      session.amount_subtotal === letter.amount || session.amount_total === letter.amount,
      session.metadata?.review_hash === letter.review_hash,
      session.metadata?.letter_id === letter.id,
      session.consent?.terms_of_service === 'accepted' || config.mode === 'demo',
      (session.mode || 'payment') === 'payment',
    ];
    if (!checks.every(Boolean)) {
      store.set(letter.id, { state: 'needs_review', fail_reason: 'payment_mismatch' });
      throw fail(409, 'Payment did not match the approved letter. It is held for review; you will not be charged twice.');
    }
    store.set(letter.id, { payment_id: session.payment_intent, session_id: session.id, lease_until: null });
    store.transition(letter.id, letter.state, 'paid');
    return { letter_id: letter.id, state: 'paid' };
  }

  // Background fulfillment worker. Claims paid letters with a lease, submits
  // with a stable idempotency key, then polls until the provider accepts
  // ('sent') or rejects ('failed'). Ambiguous provider outcomes older than
  // the retry window go to needs_review — never retried blindly. There is no
  // delivery tracking: once accepted, the letter travels by First Class mail.
  const RETRY_WINDOW_MS = 23 * 3600_000;
  async function fulfillOnce() {
    // Claim paid letters with a lease; the lease (not row age) prevents
    // double-claiming, so newly-paid rows are picked up immediately.
    const due = store.inStates(['paid']).filter(l => !l.lease_until || l.lease_until < Date.now());
    for (const letter of due) {
      if (!store.claim(letter.id, 'paid', 'sending', 15 * 60_000)) continue;
      try {
        const result = await providers.sendLetter(store.get(letter.id));
        store.set(letter.id, { provider_letter_id: result.id, provider_status: result.status, provider_submitted_at: Date.now() });
      } catch (error) {
        if (error.integrity) {
          store.set(letter.id, { state: 'needs_review', fail_reason: 'message_integrity' });
          continue;
        }
        if (error instanceof ProviderError && error.rejected) {
          if (store.transition(letter.id, 'sending', 'failed')) {
            store.set(letter.id, { fail_reason: 'provider_rejected' });
            queueRefund(letter.id);
          }
          continue;
        }
        // Uncertain: leave in sending for the poller; age-out below.
      }
    }
    const sending = store.inStates(['sending']);
    for (const letter of sending) {
      try {
        const status = providers.normalizeStatus(await providers.letterStatus(letter));
        store.set(letter.id, { provider_status: status });
        if (status === 'sent') store.transition(letter.id, 'sending', 'sent');
        else if (status === 'failed') {
          if (store.transition(letter.id, 'sending', 'failed')) queueRefund(letter.id);
        } else if (Date.now() - (letter.provider_submitted_at || letter.updated_at) > RETRY_WINDOW_MS) {
          store.set(letter.id, { state: 'needs_review', fail_reason: 'ambiguous_outcome' });
        }
      } catch { /* poll again next tick */ }
    }
  }

  async function queueRefund(letterId) {
    const letter = store.get(letterId);
    if (!letter || !['failed'].includes(letter.state)) return;
    if (!store.transition(letterId, 'failed', 'refund_pending')) return;
    try {
      const refund = await providers.refund(store.get(letterId));
      store.set(letterId, { refund_id: refund.id });
      store.transition(letterId, 'refund_pending', 'refunded');
    } catch {
      // stays refund_pending for the next tick / manual review
    }
  }

  // Provider status webhook handler (stub until the real provider is wired).
  // TODO: verify the provider signature with config.inkWebhookSecret, then
  // map the event to sent/failed via providers.normalizeStatus().
  async function providerWebhook(rawBody, headers) {
    if (config.mode === 'demo') throw fail(404, 'Provider webhooks are not enabled in demo mode.');
    // TODO: const event = verifyInkWebhook(rawBody, headers, config.inkWebhookSecret);
    // const letter = store.get(event.letter_id_from_metadata);
    // ... update provider_status; sent/failed transitions; queueRefund on failed.
    throw fail(501, 'Handwriting provider webhooks are not implemented yet. See TERMS-DILIGENCE.md.');
  }

  async function maintenance() {
    // Expire unpaid drafts/checkouts after 48h.
    for (const letter of store.dueFor(['draft', 'checkout'], 48 * 3600_000)) {
      store.transition(letter.id, letter.state, 'expired');
    }
    // Purge message + personal data 30 days after terminal states. The
    // approval fingerprint remains as proof of what was sent.
    for (const letter of store.dueFor(['sent', 'refunded', 'expired'], 30 * 24 * 3600_000)) {
      store.set(letter.id, {
        purged: 1, message: '[purged]',
        recipient_name: '[purged]', recipient_line1: '[purged]', recipient_line2: null,
        recipient_city: '[purged]', recipient_state: '[purged]', recipient_zip: '[purged]',
      });
    }
    await fulfillOnce();
  }

  return { create, view, checkout, recordPayment, fulfillOnce, queueRefund, providerWebhook, maintenance, authorized, checkToken, policies };
}
