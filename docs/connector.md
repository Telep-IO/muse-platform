# Agent draft interface

This is DomainSend's REST contract, not a claim of a certified Muse connector. The adapter must follow Meta's authenticated developer documentation when available.

**Status: SCAFFOLD.** No registry provider is integrated yet (see `TERMS-DILIGENCE.md`). Availability checks, draft creation, review, demo payment, and the registration state machine work in demo mode; no real domain is registered anywhere.

## Check availability

`POST /api/domains/check` with JSON `{domain: "example.com"}` → `{domain, tld, available, price_per_year_cents, whois_privacy_included, mode}`. Use this while brainstorming names with the user. It creates nothing and is rate-limited.

Domain rules: lowercase ASCII, valid labels, one of `com, net, org, io, dev, app, tools`. Internationalized (punycode) names are rejected in v1.

Demo hooks: `taken-<anything>.<tld>` always reports unavailable; `fail-<anything>.<tld>` reports available but fails at registration (after payment) so the failed → refunded path is exercisable. These hooks mean nothing against a real registry.

## Create a draft

`POST /api/domains` with JSON:

```json
{
  "domain": "example.com",
  "years": 1,
  "registrant": { "name": "Jane Doe", "email": "jane@example.org", "org": "Acme LLC" }
}
```

`years` is 1 or 2. `org` is optional. The draft is created only if the domain is currently available; otherwise the call fails with 409 and nothing is stored.

The response contains `id`, `token`, `review_url`, the normalized domain, `tld`, `years`, `price_per_year_cents`, `amount` (USD cents total), `whois_privacy_included: true`, `mode`, `state`, `review_hash`, `terms_version`, and `privacy_version`.

Before drafting, ask the user which **email address** to use for the registrant contact — the registry sends a verification email there that the human must click, or the domain may be suspended. Also explain that the human pays for the registration on the review page and that v1 does not handle renewals. Show the price and review link to the user. Never claim the domain is registered, owned, or reserved merely because a draft was created. Never log the token or private review link.

## Read a registration

`GET /api/domains/{id}` with `Authorization: Bearer {token}`. The response includes `state`, and when `active`, `registered_at` and `expires_at`. The token is never returned. **Only `active` means the domain is registered as confirmed by the registry.** `registering` means the order is in flight; it does not mean the domain is yours. Demo/test responses always indicate their mode.

## Human approval

The adapter should expose availability checks, draft creation, and registration status only. The user opens `review_url`, checks the exact domain spelling, the term, the registrant contact, and the price, explicitly confirms, and pays through the website. `/api/domains/{id}/checkout` is used by the website after confirmation; do not make it an autonomous agent action.

Checkout requires `{confirmed: true, review_hash, terms_version, privacy_version}` from the current review response, with the registration bearer token. A boolean alone is rejected. Availability is re-checked at checkout: if the domain was taken since the draft was created, the registration moves to `failed` with no charge. The server records the approved content fingerprint (domain, term, registrant, price, policy versions, confirmation wording) and time. Stripe also collects terms acceptance. These records bind the request to a registration; they do not establish the identity of a human or prove someone read the page. Do not describe the API as a biometric/human-verification mechanism.

If the registry cannot complete a paid registration, the payment is refunded automatically; a registered domain cannot be cancelled. **Renewals are not handled in v1** — tell the user the expiry date from the `active` status and that they are responsible for renewing.

## Pricing (retail, USD)

| TLD | Per year |
|-----|----------|
| .com | $14.99 |
| .net | $14.99 |
| .org | $13.99 |
| .io | $39.99 |
| .dev | $14.99 |
| .app | $19.99 |
| .tools | $29.99 |

WHOIS privacy is included free on every registration. Terms of 1–2 years. No subscription.

## Proposed directory description

“Register a domain name through your agent. DomainSend checks availability and prepares a private review with exact pricing for your approval, then registers the domain with WHOIS privacy included. From $13.99/year. No subscription; renewals not handled in v1.”

Submission still needs a live domain, operator/support details, a reseller platform with completed onboarding and confirmed pricing, verified live registrations, authenticated Meta developer requirements, and Meta review.
