import Stripe from 'stripe';
import { sha256 } from './approval.js';
import { DISCLOSURE } from './compliance.js';

// ============================================================================
// SCAFFOLD: voice-provider integration is NOT implemented.
// ----------------------------------------------------------------------------
// TODO (after TERMS-DILIGENCE.md is resolved):
//   1. Confirm in writing that Twilio's terms permit a paid, customer-facing
//      third-party service placing calls on end users' behalf (look for a
//      partner / reseller track; do NOT rely on self-serve terms). Voice
//      compliance (TCPA-adjacent consent, disclosure, time-of-day, DNC) is
//      documented in TERMS-DILIGENCE.md and enforced best-effort in
//      src/compliance.js — legal review is still required before live use.
//   2. Implement placeCall() below against Twilio Programmable Voice:
//        - POST /2010-04-01/Accounts/{sid}/Calls.json with To, From, and a
//          TwiML URL (or inline Twiml) that speaks DISCLOSURE + the script
//          via <Say>. The script is plain text: XML-escape it; never pass
//          raw SSML from the agent.
//        - Twilio has no native idempotency key for call creation, so the
//          worker's lease-guarded claim (src/calls.js) plus the stored
//          provider_call_id is the dedupe. Before submitting, re-check that
//          provider_call_id is still empty; never place twice for one draft.
//        - Pass a stable client identifier per call (`call-${call.id}`) in
//          the request so provider-side logs can be correlated.
//        - Validate the returned CallSid format before storing it.
//   3. Implement callStatus() polling and wire the real status-callback
//      webhook in src/app.js (verify X-Twilio-Signature with
//      TWILIO_WEBHOOK_SECRET). Map provider statuses via normalizeStatus().
//   4. Confirm what "completed" means per provider (answered + audio played
//      vs. mere dial) and map it in normalizeStatus().
//   5. Recording: enable only when record_call is true; store the returned
//      recording URL; honor deletion requests.
// Until then, every voice-provider call below is a demo stub, and any
// non-demo mode refuses to touch a voice provider.
// ============================================================================

export class ProviderError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
  // 4xx (except 408/409/429) = the provider rejected the job: do not retry,
  // queue a refund instead. Anything else = uncertain: retry with backoff.
  get rejected() { return this.status >= 400 && this.status < 500 && ![408, 409, 429].includes(this.status); }
}

const notImplemented = (name) =>
  Object.assign(new Error(`Voice provider "${name}" is not implemented. Resolve TERMS-DILIGENCE.md first.`), { status: 503 });

// What the recipient hears: fixed disclosure, then the verbatim script.
// Plain text only — the real implementation XML-escapes this into TwiML.
export const spokenText = (script) => `${DISCLOSURE}${script}`;

export function createProviders(config) {
  const stripe = config.mode === 'demo' ? null : new Stripe(config.stripeKey, { maxNetworkRetries: 2, timeout: 20000 });
  const demo = config.mode === 'demo';

  return {
    stripe,
    spokenText,

    // Stripe Checkout session for the human-gated payment step.
    // Implemented for real: billing is ours, not the voice provider's.
    async checkout(call, token, approval) {
      if (demo) {
        return { id: `demo_session_${call.id}`, url: `${config.baseUrl}/#call=${call.id}.${token}&demo_paid=1` };
      }
      const link = `${config.baseUrl}/#call=${call.id}.${token}`;
      const evidence = JSON.parse(approval.evidence);
      return stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_creation: 'always',
        client_reference_id: call.id,
        metadata: { call_id: call.id, review_hash: approval.review_hash },
        payment_intent_data: { metadata: { call_id: call.id, review_hash: approval.review_hash } },
        consent_collection: { terms_of_service: 'required' },
        custom_text: { submit: { message: `Payment authorizes the call to be placed automatically. Review the [accepted terms](${config.baseUrl}/policies/terms/${approval.terms_version}).` } },
        success_url: link,
        cancel_url: link,
        expires_at: Math.floor(call.checkout_started / 1000) + 3600,
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: call.amount, tax_behavior: 'exclusive',
          product_data: { name: 'CallSend · automated phone call',
            description: 'One automated call speaking the reviewed script to the reviewed number.' } } }],
      }, { idempotencyKey: `checkout-${call.id}` });
    },

    // Place the approved call with the voice provider. Demo stub only.
    async placeCall(call) {
      if (!call.script || sha256(call.script) !== call.script_sha256)
        throw Object.assign(new Error('Approved script changed or is unavailable.'), { integrity: true });
      if (demo) {
        // Simulated provider call. A real implementation returns the
        // provider's call id and its initial status here.
        return { id: `demo_call_${call.id}`, status: 'queued' };
      }
      // TODO: real provider call (see header). Suggested shape:
      //   if (call.provider_call_id) throw new ProviderError('Call already submitted.');
      //   const twiml = `<Response><Say voice="${voiceMap(call.voice)}">${escapeXml(spokenText(call.script))}</Say>${call.record_call ? '<Record/>' : ''}</Response>`;
      //   const result = await twilioPost('/Calls.json', { To: call.phone_number, From: config.twilioFrom, Twiml: twiml });
      //   if (!/^CA[0-9a-f]{32}$/i.test(result.sid)) throw new ProviderError('Voice provider returned an invalid response.');
      //   return { id: result.sid, status: normalizeStatus(result.status) };
      throw notImplemented('placeCall');
    },

    // Poll the provider for the call's status. Demo stub only.
    async callStatus(call) {
      if (demo) {
        // Demo progression: queued -> ringing -> in-progress -> completed.
        // Use POST /api/calls/:id/demo-event for deterministic outcomes
        // (completed, no-answer, failed). A real implementation GETs the
        // call and maps provider statuses through normalizeStatus() below.
        const age = Date.now() - (call.provider_submitted_at || Date.now());
        if (age > 60_000) return 'completed';
        if (age > 20_000) return 'in-progress';
        if (age > 10_000) return 'ringing';
        return 'queued';
      }
      // TODO: real provider poll (see header).
      throw notImplemented('callStatus');
    },

    // Map provider-specific statuses to our canonical set:
    // 'queued' | 'ringing' | 'in-progress' | 'completed' | 'no-answer' | 'failed'.
    // Twilio's vocabulary: queued, ringing, in-progress, completed, busy,
    // failed, no-answer, canceled. Busy is mapped to no-answer: the line was
    // never reached, so no value was delivered and the call is refunded.
    // TODO: confirm per the chosen provider's status vocabulary.
    normalizeStatus: (providerStatus) => {
      const map = {
        queued: 'queued', ringing: 'ringing', 'in-progress': 'in-progress',
        completed: 'completed', 'no-answer': 'no-answer', busy: 'no-answer',
        failed: 'failed', canceled: 'failed',
      };
      return map[providerStatus] ?? 'unknown';
    },

    async refund(call) {
      if (demo) return { id: `demo_refund_${call.id}`, status: 'succeeded' };
      if (call.refund_id) return stripe.refunds.retrieve(call.refund_id);
      return stripe.refunds.create(
        { payment_intent: call.payment_id, reason: 'requested_by_customer', metadata: { call_id: call.id } },
        { idempotencyKey: `refund-${call.id}` });
    },
  };
}
