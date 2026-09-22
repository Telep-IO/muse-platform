# SignSend

**Status: SCAFFOLD.** Draft creation, human review, demo payment, and the envelope state machine work in demo mode. **No e-signature provider is integrated** — no real signature request is sent anywhere. See `TERMS-DILIGENCE.md` before doing anything live.

Collect e-signatures on a PDF through an AI agent. An agent uploads a document and a signer list; the human reviews a rendered preview, pays a flat **$2.99 per envelope** via Stripe Checkout; the document is submitted to an e-signature provider for sequential signing; the agent polls per-signer status. No subscription, no accounts.

Architecture mirrors [Paper Send](https://github.com/Telep-IO/paper-send) (TeleP IO's PDF-to-physical-mail connector): one Node process, SQLite for local demo / PostgreSQL for production, static frontend, provider isolated in `src/providers.js` so a provider swap is a contained change.

## Flow

1. Agent: `POST /api/envelopes` (multipart: `document` PDF ≤10 MB / 5 pages, `signers` JSON: 1–5 × `{name, email}`). Gets `id`, `token`, `review_url`, price.
2. Human: opens `review_url`, checks rendered pages + signer list, confirms, pays $2.99 via Stripe.
3. Server: verifies the signed Stripe webhook against the approval fingerprint (document SHA-256, signer list, price, policy versions, confirmation wording), then submits to the provider. Signature + date fields are auto-placed; signers are notified in order.
4. Agent: `GET /api/envelopes/{id}` (bearer token) polls per-signer status. Only `signed` means every signer signed as confirmed by the provider.

The trust model: the agent can only create drafts and check status. Payment and the irreversible submission happen after human review on the website. See `docs/connector.md` for the exact agent contract.

## Run locally

Requires Node 24+ and Poppler (`pdfinfo`, `pdftoppm`).

```sh
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000. Default **demo mode** makes no external API calls, collects no payment, and sends no signature requests. It exercises real PDF rendering, persisted envelopes, and the fulfillment state machine. In demo mode, `POST /api/envelopes/:id/demo-event` with `{email, event: 'signed'|'declined'}` simulates provider signer events.

## States

```
draft → checkout → paid → sending → sent → signed
                                    ├─ declined → refund_pending → refunded
                                    └─ uncertain beyond retry window → needs_review
```

A signer declining closes the envelope; the payment is refunded automatically since signing can never complete. Provider uncertainty retries with backoff; ambiguous operations older than 23 hours move to `needs_review` instead of retrying blindly. Idempotency keys on every provider call. Tokens are hashed and never returned in status responses. Unpaid drafts purge after 48 hours; completed envelope files after 30 days.

## Key design decisions

- **The approval fingerprint binds the original upload**, not the rasterized preview: the provider receives the original PDF for signing, so `document_sha256` is the SHA-256 of the uploaded bytes. The preview PNGs are a faithful rendering of the same bytes; the confirmation wording says so.
- **Sequential signing, auto-placed fields** — no field-placement UI in v1; keeps the agent contract to document + signer list.
- **Declined ⇒ automatic refund** — a declined envelope can never complete, so no value was delivered.
- **`src/providers.js` is a demo stub.** Live provider calls are marked TODO and throw until `TERMS-DILIGENCE.md` is resolved.

## What's missing before launch

1. Provider terms diligence → written authorization (`TERMS-DILIGENCE.md`).
2. Real provider integration in `src/providers.js` + provider webhook signature verification.
3. Counsel-reviewed `policies/terms.html` and `policies/privacy.html` (placeholders now).
4. Live domain, HTTPS, operator details, Stripe live keys, test envelopes end to end.
5. Muse connector application (after Meta's developer requirements are met).
