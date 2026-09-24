# GiftSend

GiftSend lets Muse draft a digital gift card or prepaid reward. The human reviews the recipient, amount, brand, and message, then pays the face value plus a service fee through Stripe. Tremendous delivers the reward by email, text, or link.

## Tools

- `list_reward_products` — read-only catalog. Demo returns a stub list. Cash payouts are omitted.
- `create_gift_draft` — stores a draft and a quote. Does not place a Tremendous order.
- `send_gift` — opens one Stripe checkout for that draft. A second checkout returns 409. Does not place a Tremendous order.
- `get_gift_status` — status, delivery state, and redemption state.
- `cancel_gift` — asks Tremendous to cancel. HTTP 422 means the reward was already redeemed.
- `list_gifts` — drafts for this API key.
- `check_credentials` — demo skips Tremendous. Test and live list products and never create an order.

## Modes

- **demo** — offline stubs. Zero HTTP to Tremendous, including the free sandbox, and zero HTTP to Stripe.
- **test** — Tremendous sandbox at `https://testflight.tremendous.com/api/v2`. The sandbox ships with a fake balance.
- **live** — production API at `https://api.tremendous.com/api/v2`. The fulfillment service refuses to boot until `TREMENDOUS_PLATFORM_CLIENT_REFERENCE` is set. That value is a non-secret record that Platform Client registration with Tremendous Sales happened. This repository does not claim live-readiness. A self-serve API key is not a live credential. Tremendous API Terms §1.4(3) prohibit sublicensing on the self-serve track.

## Pricing

`total_cents = face_cents + service_fee_cents`.

The default service fee is $2.99 (`SERVICE_FEE_CENTS=299`). Tremendous's published fee for digital gift cards, Visa/Mastercard prepaid, and charity is $0, so a $50 card costs $50.00 at Tremendous plus the service fee. Prices for the face value come from the Tremendous catalog at request time.

The Tremendous balance is prefunded by bank ACH (free). Card funding is +3% on Tremendous's pricing page and this service never auto-funds by card. `payment.funding_source_id` is `BALANCE` only.

## Scope

Allowed Tremendous categories: `merchant_card`, `visa_card` (covers Visa and Mastercard prepaid in Tremendous's category enum), and `charity`.

Disabled: `ach`, `paypal`, `venmo`, `instant_debit_transfer`, `cash_app`, `international_bank`, `wallet`, and any other category. Cash payouts stay off until a separate money-transmission review.

Limits: $2,000.00 per payout and $10,000.00 per recipient per rolling 24 hours.

## Cancellation

Cancel calls `POST /rewards/{id}/cancel`. A redeemed reward fails with HTTP 422, and GiftSend returns that fact. The API documents cancellation for non-expired rewards that have a delivery failure; redeemed rewards fail 422. Contract language allows cancellation until redemption or 7 days, subject to what that endpoint accepts.

## Scheduling

The create-order API accepts `deliver_at`: a date within the next year. If a date-time is sent, Tremendous ignores the time. GiftSend v1 does not send `deliver_at`. Rewards are delivered when the paid webhook places the order.

## Docs that were checked

- Introduction: https://developers.tremendous.com/docs/introduction (loaded).
- Endpoint overview URL https://developers.tremendous.com/reference/api-endpoints-overview returned 404. Production and sandbox servers were taken from the OpenAPI `servers` list on the list-products and cancel-reward reference pages.
- Sandbox base: `https://testflight.tremendous.com/api/v2`
- Production base: `https://api.tremendous.com/api/v2`
- Platform Client Terms: https://www.tremendous.com/platform-client-terms/
- Corporate Client Service Agreement, incorporated into GiftSend terms: https://www.tremendous.com/terms/
- Pricing: https://www.tremendous.com/pricing/

## Draft Muse submission text

This paragraph is a draft disclosure. Filing it is a separate step and is not done by this change.

GiftSend lets Muse draft a digital gift card or prepaid reward — you choose the recipient, amount, and message, review it, and pay the face value plus a service fee through Stripe. Tremendous delivers the reward by email, text, or link. Demo mode is fully stubbed and never touches Tremendous; test mode uses Tremendous's free sandbox. Rewards can be cancelled before the recipient redeems them. Operated by Telep IO LLC as a registered Tremendous Platform Client.
