# FaxSend

> **Status: SCAFFOLD.** Architecture, trust model, and agent contract are
> drafted and mirror the proven Paper Send design. The fax provider is **not**
> integrated (demo stubs only), provider terms are **not** confirmed, and
> nothing here is launchable. See `TERMS-DILIGENCE.md` for the week-one
> checklist that gates any live work.

FaxSend transmits a black-and-white fax on behalf of a user, driven by an AI
agent. The agent uploads a PDF and a destination fax number; the human
reviews the rendered pages and the number on a private review page, pays a
per-page price with Stripe, and only then does the fax transmit. Delivery
status flows back to the agent with provider confirmation.

## The flow

1. Agent: `POST /api/faxes` (multipart: `document` PDF + `to` JSON with an
   E.164 `fax_number` and optional `cover_page`) → draft with private
   `review_url` + bearer `token`.
2. Human: opens the review page, sees every rendered page, the destination
   number, and the exact price; confirms and pays via Stripe Checkout.
3. Server: verifies the signed Stripe webhook against the cryptographic
   approval fingerprint (document SHA-256, destination, pages, price, policy
   versions, confirmation wording), then submits to the fax provider with a
   stable idempotency key.
4. Agent: `GET /api/faxes/{id}` (bearer token) → status. Only
   `state: "delivered"` means the provider confirmed transmission.

## Pricing

**$0.99 per transmitted page.** A cover page, when enabled, counts as a
page. `GET /api/config` exposes `pricePerPageCents` so agents can quote
without creating a draft. No subscription.

## Trust model

- The agent can **only** create drafts and check status.
- Payment and the irreversible transmission happen after human review on
  the website. `POST /api/faxes/{id}/checkout` is not an agent action.
- Every provider call carries a stable idempotency key: a retried
  submission can never transmit twice or charge twice.
- Tokens are SHA-256 hashed at rest and never returned in status responses.
- Failed transmissions queue an automatic refund (`failed` →
  `refund_pending` → `refunded`). Ambiguous provider outcomes age out to
  `needs_review` instead of being retried blindly.
- The PDF is rasterized to black-and-white before transmission; scripts,
  links, forms, and attachments never reach the provider. What the human
  previews is pixel-identical to what transmits.

## States

```
draft → checkout → paid → sending → delivered
                                  └→ failed → refund_pending → refunded
sending (ambiguous past retry window) → needs_review
draft/checkout (unpaid 48h) → expired
```

## Run locally (demo mode)

Requires Node 24+ and Poppler (`pdfinfo`, `pdftoppm`).

```sh
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000. Demo mode makes no external calls, collects no
payment, and transmits nothing. It exercises PDF rasterization, private
previews, persisted faxes, and the fulfillment state machine.

## Layout

```
src/
  index.js      entry point
  app.js        routes, helmet, rate limits, webhooks, static review page
  config.js     env parsing; live mode gates (HTTPS, identity, FAX_AUTHORIZATION_REFERENCE)
  store.js      SQLite store (node:sqlite); swap for Postgres in production
  approval.js   confirmation wording, canonical JSON, review-hash fingerprint
  documents.js  PDF → rasterized B&W pages → print-ready PDF (+ cover sheet)
  faxes.js      draft/checkout/payment/fulfillment state machine, refunds
  providers.js  provider isolation — DEMO STUBS ONLY, TODOs for the real API
schema.sql      tables: faxes, approvals (append-only), policies
docs/
  connector.md  the agent-facing contract (two operations, pricing, never-dos)
public/
  index.html    minimal human review page (private link, token in URL hash)
TERMS-DILIGENCE.md   week-one provider-terms checklist (gates live work)
```

## Not yet real

- Fax provider integration (Phaxio / Telnyx Fax) — stubs throw outside demo.
- Provider delivery webhooks — endpoint exists, verification TODO.
- Real terms & privacy — demo text in `src/approval.js`.
- Muse connector application — do not submit until the provider path in
  `TERMS-DILIGENCE.md` is confirmed in writing.
