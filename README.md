# DomainSend

**Status: SCAFFOLD.** Availability checks, draft creation, human review, demo payment, and the registration state machine work in demo mode. **No registry provider is integrated** — no real domain is registered anywhere. See `TERMS-DILIGENCE.md` before doing anything live.

Register a domain name through an AI agent. An agent checks availability and creates a draft with the desired domain, term, and registrant contact; the human reviews the exact domain spelling, term, contact, and price, pays via Stripe Checkout; the domain is registered through a reseller API with WHOIS privacy included free; the agent polls registration status. No subscription, no accounts.

Architecture mirrors [Paper Send](https://github.com/Telep-IO/paper-send) (TeleP IO's PDF-to-physical-mail connector): one Node process, SQLite for local demo / PostgreSQL for production, static frontend, provider isolated in `src/providers.js` so a provider swap is a contained change.

## Flow

1. Agent: `POST /api/domains/check` (`{domain}`) while brainstorming names, then `POST /api/domains` (`{domain, years: 1–2, registrant: {name, email, org?}}`). Gets `id`, `token`, `review_url`, price.
2. Human: opens `review_url`, checks the exact domain, term, registrant contact, and price, confirms, pays via Stripe. Availability is re-checked at checkout — a domain taken since the draft was created fails with no charge.
3. Server: verifies the signed Stripe webhook against the approval fingerprint (exact domain string, TLD, term, registrant contact, price, policy versions, confirmation wording), then submits the registration. WHOIS privacy is enabled.
4. Agent: `GET /api/domains/{id}` (bearer token) polls status. Only `active` means the domain is registered as confirmed by the registry; the response includes the expiry date.

The trust model: the agent can only check availability, create drafts, and read status. Payment and the irreversible registration happen after human review on the website. See `docs/connector.md` for the exact agent contract.

## Pricing (retail, USD per year)

.com $14.99 · .net $14.99 · .org $13.99 · .io $39.99 · .dev $14.99 · .app $19.99 · .tools $29.99. WHOIS privacy included free. Terms of 1–2 years. Provider wholesale costs TBD — see `TERMS-DILIGENCE.md`.

## Honest limitations (v1)

- **No renewals.** v1 registers domains only. The `active` status reports the expiry date; the owner is responsible for renewing. The review page and agent contract say this plainly.
- **Registry verification email.** The registry emails the registrant address; the human must click it or the domain may be suspended. The agent is instructed to ask the user for a controlled inbox before drafting.
- **ASCII domains only.** Internationalized (punycode) names are rejected in v1.
- **Seven TLDs** at launch: com, net, org, io, dev, app, tools.
- Once a domain is registered it cannot be cancelled; refunds are issued only when registration fails before completing.

## Run locally

Requires Node 24+.

```sh
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000. Default **demo mode** makes no external API calls, collects no payment, and registers no domains. It exercises availability checks, draft creation, the approval fingerprint, and the registration/refund state machine. Demo hooks: `taken-<name>.<tld>` simulates an unavailable domain; `fail-<name>.<tld>` simulates a registry failure after payment (exercises failed → refunded).

## States

```
draft → checkout → paid → registering → active
                                    ├─ failed → refund_pending → refunded
                                    └─ uncertain beyond retry window → needs_review
```

A domain lost between draft and checkout fails before any charge. A registry failure after payment refunds automatically. Registry uncertainty retries with backoff; ambiguous operations older than 23 hours move to `needs_review` instead of retrying blindly. Idempotency keys on every provider call (`register-<id>`, `checkout-<id>`, `refund-<id>`). Tokens are hashed and never returned in status responses. A partial unique index prevents two open registrations for the same domain. Unpaid drafts purge after 48 hours; registrant PII is scrubbed on purge (failed/refunded after 30 days, active 90 days after expiry).

## Key design decisions

- **The approval fingerprint binds the exact domain string** (lowercased), TLD, term years, registrant contact hash, and price — the four things that must not change between review and payment. Re-derived from the row at every gate.
- **Availability is checked three times**: at draft creation, at checkout (pre-charge), and effectively at registration (registry has final word; late failure → automatic refund).
- **`src/providers.js` is a demo stub.** Live provider calls are marked TODO and throw until `TERMS-DILIGENCE.md` is resolved.
- **Demo refund succeeds immediately** so the full failed → refunded path is exercisable without Stripe.

## What's missing before launch

1. Reseller terms diligence → written onboarding/pricing (`TERMS-DILIGENCE.md`).
2. Real reseller integration in `src/providers.js` (availability, registration, order polling).
3. Counsel-reviewed `policies/terms.html` and `policies/privacy.html` (placeholders now).
4. Live domain, HTTPS, operator details, Stripe live keys, test registrations end to end.
5. Muse connector application (after Meta's developer requirements are met).
