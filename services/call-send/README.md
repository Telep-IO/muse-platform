# CallSend — **SCAFFOLD**

An agent-driven phone-call service in the Paper Send family: the agent
prepares a call (destination number + verbatim script), the **human**
reviews the exact script and number on a website and pays **$0.99 per
call** via Stripe, and a telephony provider places the call with
text-to-speech.

**Status: scaffold.** The full draft → review → pay → place state machine
works end-to-end in demo mode. The voice-provider integration (Twilio
Programmable Voice) is a **stub** — no real calls can be placed until
[TERMS-DILIGENCE.md](TERMS-DILIGENCE.md) is resolved. Do not take live
orders.

## The flow

1. Agent: `POST /api/calls` → `{to, script, voice?, record?}` → draft +
   private `review_url` + exact price ($0.99 flat).
2. Human: opens the review link, reads the **verbatim script**, the
   destination number, and the price; checks the confirmation box; pays
   with Stripe Checkout.
3. Server: verifies payment (signed Stripe webhook) + approval fingerprint
   (number, script SHA-256, voice, price, policy versions, confirmation
   wording) → submits to the voice provider with a stable idempotency key.
4. Agent: `GET /api/calls/{id}` → polls until `completed`. Only
   `completed` means the provider confirmed the call.

## Trust model

Copied from Paper Send:

- The agent can **only** create drafts and check status. Checkout is
  human-gated on the website.
- Payment is confirmed via signed Stripe webhook; the approval fingerprint
  is re-verified before fulfillment. Any drift → `needs_review`.
- Idempotency keys on Stripe checkout (`checkout-{id}`), provider
  submission (`call-{id}` — lease-guarded; Twilio has no native idempotency
  key, so the worker claim + stored provider id is the dedupe), and
  refunds (`refund-{id}`).
- Tokens are SHA-256 hashed; never returned in status responses.
- `Cache-Control: no-store` on all API responses.

## Compliance posture (voice is the strictest surface in this family)

- **One call per draft; no bulk endpoint.** Duplicate (same number + same
  script) drafts within 24h are rejected. Draft creation is rate-limited
  to 10/hour.
- **Time-of-day guard:** calls only 08:00–21:00 recipient-local,
  best-effort via NANP area-code mapping (`src/compliance.js`). Unknown
  timezone → allowed but flagged; the human reviewer is the final gate.
  Production needs a real numbering-plan/LRN lookup.
- **Disclosure:** every call begins with an automated-call disclosure
  before the script.
- **Consent:** the confirmation wording requires the reviewer to assert
  they have the needed authorizations/consent. No marketing calls — the
  agent contract says so explicitly.
- **Data minimization:** the verbatim script is purged once the call is
  terminal (only the SHA-256 remains); phone numbers are purged 30 days
  after terminal states.

## Pricing

$0.99 flat per call, up to 5 minutes. No subscription. `no-answer` and
`failed` calls are refunded automatically — no value delivered, no charge
kept.

## Layout

```
src/
  index.js        boot + graceful shutdown
  app.js          routes, helmet, rate limits, webhooks, review page
  config.js       demo/test/live modes; live gates (HTTPS, keys, identity,
                  CALL_AUTHORIZATION_REFERENCE)
  compliance.js   E.164 validation, fake-number rejection, NANP timezone
                  map, calling-window guard, disclosure text
  calls.js        state machine, approval gating, worker, refunds,
                  demo-event simulation
  providers.js    Stripe (real) + Twilio (STUB — see TERMS-DILIGENCE.md)
  approval.js     confirmation wording, policy versioning, review fingerprint
  store.js        SQLite (node:sqlite); swap for Postgres in production
schema.sql        tables: calls, approvals (append-only), policies
public/           review page: number, verbatim script, price → pay → status
docs/connector.md the agent-facing contract
```

## Run it (demo)

```sh
npm install
npm start            # APP_MODE=demo by default; no external calls
```

Demo flow: `POST /api/calls` → open `review_url` → the demo checkout link
marks payment → the worker "places" the call → `POST
/api/calls/:id/demo-event` with `{"event":"completed"}` (or `ringing`,
`answered`, `no-answer`, `failed`) to walk the state machine.

## Launch gaps (before any live use)

- [TERMS-DILIGENCE.md](TERMS-DILIGENCE.md): Twilio partner/white-label
  confirmation in writing; voice-compliance legal review (consent,
  disclosure, DNC, recording consent by state).
- Real terms/privacy (demo placeholders are content-hashed and versioned).
- Wire Twilio: call creation, status callbacks with signature
  verification, recording URLs.
- Replace the best-effort timezone table with a numbering-plan lookup.
- Postgres for production; real `TWILIO_FROM_NUMBER` with verified
  caller-ID / STIR-SHAKEN posture.
