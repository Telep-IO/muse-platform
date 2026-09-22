# FaxSend — provider terms diligence (WEEK ONE — do this before building live)

**Status: UNRESOLVED.** No fax provider has been contacted. No accounts exist.
No live provider code is written (see `src/providers.js` — demo stubs only).

## Why this file exists

Paper Send's review found the same trap: fax API providers' **self-serve
terms universally prohibit building a paid, customer-facing service on their
API** ("for your internal business purposes", non-sublicensable, no resale).
Launching on self-serve terms risks account suspension mid-stream — and the
whole product is the provider underneath.

**Decision rule:** FaxSend goes live only on a provider's **explicit
white-label / partner / reseller track**, confirmed **in writing** and
recorded in `FAX_AUTHORIZATION_REFERENCE` (live startup refuses to boot
without it — see `src/config.js`). If no provider offers such a track at
viable pricing, the project does not launch. That is a valid outcome.

## Candidates

### 1. Phaxio
- [ ] Read the current Terms of Service in full. Find the API-license section:
      does it permit or prohibit third-party/paid/resale use?
- [ ] Ask explicitly (email, keep the reply): "We operate a paid service where
      our customers pay us per fax and our backend submits to Phaxio. Is this
      permitted on a standard account, or do you have a partner/reseller/
      white-label arrangement for this model?"
- [ ] Record: per-page pricing, idempotency support on fax submission,
      delivery-status vocabulary (what counts as "delivered"), webhook
      signature scheme.

### 2. Telnyx Fax
- [ ] Same terms review and same explicit question as Phaxio.
- [ ] Record the same operational details.

### 3. Fallbacks (only if 1–2 fail)
- [ ] Any other fax API with a published partner/reseller program.

## Checklist before any live build

- [ ] Written confirmation from the chosen provider covering the paid
      customer-facing model (email from an authorized representative is
      sufficient; save it securely).
- [ ] Reference recorded in `FAX_AUTHORIZATION_REFERENCE`.
- [ ] Per-page provider cost verified against the provider account — confirm
      $0.99/page retail leaves a maintainable margin after Stripe fees.
- [ ] Idempotency behavior verified: a retried submission with the same key
      never transmits twice.
- [ ] Webhook signature verification tested against the real provider.
- [ ] One real test fax transmitted and its rendering confirmed.
- [ ] Real terms/privacy drafted (replacing the demo text in
      `src/approval.js`), with counsel review of liability and fax-specific
      compliance (e.g., junk-fax / TCPA-adjacent obligations for a
      transmission service).

## Explicit non-goals for week one

- Do not create provider accounts until the terms question is answered.
- Do not implement live provider API calls (the stubs in `src/providers.js`
  throw in non-demo modes by design).
- Do not submit any Muse connector application for FaxSend until the
  provider path is confirmed.
