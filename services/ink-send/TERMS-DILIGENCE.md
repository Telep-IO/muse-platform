# InkSend — provider terms diligence (WEEK ONE — do this before building live)

**Status: UNRESOLVED.** No handwriting provider has been contacted. No
accounts exist. No live provider code is written (see `src/providers.js` —
demo stubs only).

## Why this file exists

The Paper Send review found the trap: API providers' **self-serve terms
universally prohibit building a paid, customer-facing service on their API**
("for your internal business purposes", non-sublicensable, no resale).
Handwrytten's API is explicitly built for integrations and resellers, which
makes it the leading candidate — but "integration-friendly" is not the same
as written permission for Jon's paid-on-top model. Launching without that
confirmation risks account suspension mid-stream, and the whole product is
the provider underneath.

**Decision rule:** InkSend goes live only with **written confirmation** from
the handwriting provider that a paid, customer-facing third-party service is
permitted — ideally via their reseller/partner/integration track. Record the
reference in `INK_AUTHORIZATION_REFERENCE` (live startup refuses to boot
without it — see `src/config.js`). If no provider confirms at viable
pricing, the project does not launch. That is a valid outcome.

## Candidate

### Handwrytten
- [ ] Read the current Terms of Service and API terms in full. Find the
      API-license section: does it permit or prohibit third-party/paid/
      resale use on a standard/developer account?
- [ ] Ask explicitly (email, keep the reply): "We operate a paid service
      where our customers pay us $3.99 per letter and our backend submits
      to Handwrytten. Is this permitted on a standard account, or do you
      have a reseller/partner/integration arrangement for this model?"
- [ ] Record: per-letter pricing (by card/stationery tier), handwriting
      style options and their API names, idempotency support on letter
      submission, status vocabulary (what counts as "accepted for mailing"
      vs. merely queued), webhook signature scheme, production lead times.

### Fallbacks (only if Handwrytten fails)
- [ ] Any other handwriting-robot API with a published partner/reseller
      program and US First Class mailing.

## Checklist before any live build

- [ ] Written confirmation from the chosen provider covering the paid
      customer-facing model (email from an authorized representative is
      sufficient; save it securely).
- [ ] Reference recorded in `INK_AUTHORIZATION_REFERENCE`.
- [ ] Per-letter provider cost verified against the provider account —
      confirm $3.99 retail leaves a maintainable margin after Stripe fees.
- [ ] Idempotency behavior verified: a retried submission with the same key
      never mails twice.
- [ ] Webhook signature verification tested against the real provider.
- [ ] One real test letter written and mailed; rendering confirmed from a
      photo/scan.
- [ ] Real terms/privacy drafted (replacing the demo text in `policies/`),
      with counsel review of liability for a service that sends physical
      mail on customers' behalf (content liability, undeliverable mail).

## Explicit non-goals for week one

- Do not create provider accounts until the terms question is answered.
- Do not implement live provider API calls (the stubs in `src/providers.js`
  throw in non-demo modes by design).
- Do not submit any Muse connector application for InkSend until the
  provider path is confirmed.
