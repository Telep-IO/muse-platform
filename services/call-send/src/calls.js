import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CONFIRMATION, sha256, canonical, reviewEvidence, reviewHash } from './approval.js';
import { validatePhoneNumber, checkCallingWindow } from './compliance.js';
import { ProviderError } from './providers.js';

export const fail = (status, message) => Object.assign(new Error(message), { status });

// Flat price: 99¢ per call, up to 5 minutes. Server-computed, never trusted
// from the client.
export const PRICE_CENTS = 99;
export const MIN_SCRIPT_CHARS = 20;
export const MAX_SCRIPT_CHARS = 1200;
export const VOICES = ['alloy', 'echo', 'sage'];

const hashToken = token => createHash('sha256').update(token).digest('hex');

const createSchema = z.object({
  to: z.string().min(1, 'to (destination phone number) is required'),
  script: z.string()
    .min(MIN_SCRIPT_CHARS, `The script must be at least ${MIN_SCRIPT_CHARS} characters — write out exactly what should be spoken.`)
    .max(MAX_SCRIPT_CHARS, `The script must be ${MAX_SCRIPT_CHARS} characters or fewer.`),
  voice: z.enum(VOICES).optional().default('alloy'),
  record: z.boolean().optional().default(false),
});

export async function createCalls(config, store, providers, options = {}) {
  const policies = options.policies || {};

  const authorized = id => {
    const call = store.get(id);
    if (!call) throw fail(404, 'Call not found.');
    return call;
  };
  // The hash the human approves. Before checkout it is computed fresh from
  // the draft; after checkout the recorded approval is authoritative.
  const currentReviewHash = call =>
    store.approval(call.id)?.review_hash || reviewHash(reviewEvidence(call, policies));
  const checkToken = (call, token) => {
    const a = Buffer.from(call.token_hash, 'hex');
    const b = Buffer.from(hashToken(token || ''), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail(401, 'Invalid or missing token.');
  };

  async function create(input) {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) throw parsed.error;
    const phoneNumber = validatePhoneNumber(parsed.data.to);
    const script = parsed.data.script.trim();
    if (script.length < MIN_SCRIPT_CHARS)
      throw fail(400, `The script must be at least ${MIN_SCRIPT_CHARS} characters after trimming.`);

    // Time-of-day guard at draft time (best-effort; re-checked at placement).
    const tod = checkCallingWindow(phoneNumber);
    if (!tod.ok) throw fail(409, tod.reason);

    if (store.unpurgedCount() >= 500)
      throw fail(503, 'We are at capacity right now. Please try again later.');

    const scriptSha = sha256(script);
    // Anti-bulk: same number + same script drafted in the last 24h.
    if (store.recentDuplicate(phoneNumber, scriptSha, 24 * 3600_000))
      throw fail(409, 'A call to this number with this script was already created in the last 24 hours.');

    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const row = {
      id, token_hash: hashToken(token), phone_number: phoneNumber, script,
      script_sha256: scriptSha, script_chars: script.length,
      voice: parsed.data.voice, record_call: parsed.data.record,
      amount: PRICE_CENTS, tod_check: tod.unknown ? 'unknown' : 'ok', created_at: now,
    };
    store.insert(row);

    return {
      id, token,
      review_url: `${config.baseUrl}/#call=${id}.${token}`,
      phone_number: phoneNumber,
      script_chars: script.length, voice: row.voice, record: !!row.record_call,
      amount_cents: PRICE_CENTS, currency: 'usd',
      mode: config.mode, state: 'draft',
      review_hash: reviewHash(reviewEvidence({ ...row, id }, policies)),
      terms_version: policies.terms_version, privacy_version: policies.privacy_version,
      calling_window: tod.unknown
        ? 'unknown — the recipient timezone could not be determined; the human reviewer is the final gate'
        : `ok — currently inside 08:00–21:00 recipient-local (${tod.timeZone})`,
    };
  }

  function view(id, token) {
    const call = authorized(id);
    checkToken(call, token);
    const response = {
      id: call.id, state: call.state,
      phone_number: call.phone_number,
      script_chars: call.script_chars, voice: call.voice,
      record: !!call.record_call,
      amount_cents: call.amount, currency: call.currency,
      mode: config.mode,
      review_url: `${config.baseUrl}/#call=${call.id}.${token}`,
      review_hash: currentReviewHash(call),
      terms_version: call.terms_version || policies.terms_version,
      privacy_version: call.privacy_version || policies.privacy_version,
      provider_status: call.provider_status || null,
      duration_seconds: call.duration_seconds ?? null,
      // Completed means the provider confirmed the call connected and the
      // script played. Anything else is not a completed call.
      completed: call.state === 'completed',
      created_at: call.created_at,
    };
    // The verbatim script is shown while the draft is alive; it is purged
    // after the call reaches a terminal state (only the fingerprint remains).
    if (call.script) response.script = call.script;
    // Recording URL only when recording was requested AND the provider
    // produced one.
    if (call.record_call && call.recording_url) response.recording_url = call.recording_url;
    return response;
  }

  async function checkout(id, token, body) {
    const call = authorized(id);
    checkToken(call, token);
    if (call.state !== 'draft') throw fail(409, 'This call is no longer a draft.');
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

    const evidence = reviewEvidence(call, policies);
    const hash = reviewHash(evidence);
    if (parsed.data.review_hash !== hash)
      throw fail(409, 'The review is stale (number, script, voice, price, or policies changed). Re-review before paying.');

    // Commit approval + checkout lease in one step; a duplicate submission
    // reuses the existing Stripe session instead of creating a second one.
    const now = Date.now();
    store.set(id, { review_hash: hash, terms_version: policies.terms_version, privacy_version: policies.privacy_version, checkout_started: now, lease_until: now + 3600_000 });
    if (store.approval(id)) {
      const existing = store.get(id);
      if (existing.session_id) {
        const session = await providers.checkout(existing, token, store.approval(id));
        return { checkout_url: session.url, state: existing.state };
      }
      throw fail(409, 'Checkout already started.');
    }
    store.insertApproval(id, hash, canonical(evidence));
    if (!store.transition(id, 'draft', 'checkout')) throw fail(409, 'This call is no longer a draft.');
    const session = await providers.checkout(store.get(id), token, store.approval(id));
    store.set(id, { session_id: session.id });
    return { checkout_url: session.url, state: 'checkout' };
  }

  // Called from the signed Stripe webhook and the return-URL reconciliation.
  async function recordPayment(session) {
    const callId = session.client_reference_id || session.metadata?.call_id;
    if (!callId) throw fail(400, 'Unrecognized payment session.');
    const call = store.get(callId);
    if (!call || !['checkout', 'paid', 'queued'].includes(call.state)) return { ignored: true };
    const checks = [
      session.payment_status === 'paid',
      session.currency === 'usd',
      session.amount_subtotal === call.amount || session.amount_total === call.amount,
      session.metadata?.review_hash === call.review_hash,
      session.metadata?.call_id === call.id,
      session.consent?.terms_of_service === 'accepted' || config.mode === 'demo',
      (session.mode || 'payment') === 'payment',
    ];
    if (!checks.every(Boolean)) {
      store.set(call.id, { state: 'needs_review', fail_reason: 'payment_mismatch' });
      throw fail(409, 'Payment did not match the approved call. It is held for review; you will not be charged twice.');
    }
    store.set(call.id, { payment_id: session.payment_intent, session_id: session.id, lease_until: null, paid_at: Date.now() });
    store.transition(call.id, call.state, 'paid');
    return { call_id: call.id, state: 'paid' };
  }

  // Background fulfillment worker. Claims paid calls with a lease, re-checks
  // the calling window, submits with a stable idempotency key, then polls
  // until the provider reports a terminal state. No-answer and failed calls
  // never delivered value: they are refunded automatically. Ambiguous
  // provider outcomes older than the retry window go to needs_review — never
  // retried blindly.
  const RETRY_WINDOW_MS = 23 * 3600_000;
  const CALLING_WINDOW_HOLD_MS = 24 * 3600_000;
  async function fulfillOnce() {
    const due = store.inStates(['paid']).filter(c => !c.lease_until || c.lease_until < Date.now());
    for (const call of due) {
      // Re-check the calling window at placement time. Outside the window:
      // hold for the next tick; strand into needs_review after 24h.
      const tod = checkCallingWindow(call.phone_number);
      if (!tod.ok) {
        if (Date.now() - (call.paid_at || call.updated_at) > CALLING_WINDOW_HOLD_MS)
          store.set(call.id, { state: 'needs_review', fail_reason: 'calling_hours' });
        continue;
      }
      if (!store.claim(call.id, 'paid', 'queued', 15 * 60_000)) continue;
      try {
        const result = await providers.placeCall(store.get(call.id));
        store.set(call.id, { provider_call_id: result.id, provider_status: result.status, provider_submitted_at: Date.now() });
      } catch (error) {
        if (error.integrity) {
          store.set(call.id, { state: 'needs_review', fail_reason: 'script_integrity' });
          continue;
        }
        if (error instanceof ProviderError && error.rejected) {
          if (store.transition(call.id, 'queued', 'failed')) {
            store.set(call.id, { fail_reason: 'provider_rejected' });
            queueRefund(call.id);
          }
          continue;
        }
        // Uncertain: leave in queued for the poller; age-out below.
      }
    }
    const active = store.inStates(['queued', 'ringing', 'in-progress']);
    for (const call of active) {
      try {
        const status = providers.normalizeStatus(await providers.callStatus(call));
        store.set(call.id, { provider_status: status });
        if (status === 'completed') {
          if (store.transition(call.id, call.state, 'completed')) purgeScript(call.id);
        } else if (status === 'no-answer' || status === 'failed') {
          if (store.transition(call.id, call.state, status === 'no-answer' ? 'no-answer' : 'failed')) {
            store.set(call.id, { fail_reason: status === 'no-answer' ? 'no_answer' : 'provider_failed' });
            queueRefund(call.id);
          }
        } else if (['queued', 'ringing', 'in-progress'].includes(status)) {
          store.transition(call.id, call.state, status); // track progress; no-op if same
        } else if (Date.now() - (call.provider_submitted_at || call.updated_at) > RETRY_WINDOW_MS) {
          store.set(call.id, { state: 'needs_review', fail_reason: 'ambiguous_outcome' });
        }
      } catch { /* poll again next tick */ }
    }
  }

  // The verbatim script is retained only while the draft is alive. Once the
  // call is terminal, only the SHA-256 fingerprint is kept for audit.
  function purgeScript(callId) {
    store.set(callId, { script: null });
  }

  async function queueRefund(callId) {
    const call = store.get(callId);
    if (!call || !['failed', 'no-answer'].includes(call.state)) return;
    if (!store.transition(callId, call.state, 'refund_pending')) return;
    try {
      const refund = await providers.refund(store.get(callId));
      store.set(callId, { refund_id: refund.id });
      store.transition(callId, 'refund_pending', 'refunded');
    } catch {
      // stays refund_pending for the next tick / manual review
    }
    purgeScript(callId);
  }

  // Provider status webhook handler (stub until the real provider is wired).
  // TODO: verify the provider signature with config.twilioWebhookSecret, then
  // map the event to completed/no-answer/failed via normalizeStatus().
  async function providerWebhook(rawBody, headers) {
    if (config.mode === 'demo') throw fail(404, 'Provider webhooks are not enabled in demo mode.');
    // TODO: const event = verifyTwilioWebhook(rawBody, headers, config.twilioWebhookSecret);
    // const call = store.get(event.call_id_from_metadata);
    // ... update provider_status/duration/recording_url; terminal transitions; queueRefund on failed/no-answer.
    throw fail(501, 'Voice provider webhooks are not implemented yet. See TERMS-DILIGENCE.md.');
  }

  // Demo-only: simulate a provider event so the full state machine is
  // exercisable end-to-end without a telephony provider.
  async function demoEvent(id, token, body) {
    if (config.mode !== 'demo') throw fail(404, 'Demo events are only available in demo mode.');
    const call = authorized(id);
    checkToken(call, token);
    const parsed = z.object({
      event: z.enum(['ringing', 'answered', 'completed', 'no-answer', 'failed']),
      duration_seconds: z.number().int().min(0).max(300).optional(),
    }).safeParse(body);
    if (!parsed.success) throw parsed.error;
    const { event, duration_seconds } = parsed.data;
    const apply = (from, to, extra = {}) => {
      if (!store.transition(id, from, to, extra)) throw fail(409, `Cannot apply "${event}" while the call is ${store.get(id).state}.`);
    };
    if (event === 'ringing' && ['queued'].includes(call.state)) apply('queued', 'ringing', { provider_status: 'ringing' });
    else if (event === 'answered' && ['queued', 'ringing'].includes(call.state))
      apply(call.state, 'in-progress', { provider_status: 'in-progress' });
    else if (event === 'completed' && ['queued', 'ringing', 'in-progress'].includes(call.state)) {
      apply(call.state, 'completed', { provider_status: 'completed', duration_seconds: duration_seconds ?? 45 });
      purgeScript(id);
    } else if ((event === 'no-answer' || event === 'failed') && ['queued', 'ringing', 'in-progress'].includes(call.state)) {
      const to = event === 'no-answer' ? 'no-answer' : 'failed';
      apply(call.state, to, { provider_status: event, fail_reason: event === 'no-answer' ? 'no_answer' : 'provider_failed' });
      await queueRefund(id);
    } else throw fail(409, `Cannot apply "${event}" while the call is ${call.state}.`);
    return view(id, token);
  }

  async function maintenance() {
    // Expire unpaid drafts/checkouts after 48h.
    for (const call of store.dueFor(['draft', 'checkout'], 48 * 3600_000)) {
      if (store.transition(call.id, call.state, 'expired')) purgeScript(call.id);
    }
    // Purge personal data 30 days after terminal states.
    for (const call of store.dueFor(['completed', 'no-answer', 'refunded', 'expired'], 30 * 24 * 3600_000)) {
      store.set(call.id, { purged: 1, phone_number: '[purged]', script: null, recording_url: null });
    }
    await fulfillOnce();
  }

  return { create, view, checkout, recordPayment, fulfillOnce, queueRefund, providerWebhook, demoEvent, maintenance, authorized, checkToken, policies };
}
