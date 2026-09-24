# ShipLabel

Muse drafts a USPS shipping label. A person reviews the EasyPost rate and pays postage plus a service fee in Stripe. EasyPost buys the label only after a webhook with `payment_status` `paid`.

## Draft Meta submission description

ShipLabel lets Muse draft a USPS shipping label from sender, recipient, and parcel details. You review the carrier rate, pay postage plus a service fee through Stripe, and EasyPost purchases and issues the label with tracking. Demo mode returns stub rates and labels and never contacts EasyPost. USPS only at launch — UPS and FedEx are excluded because their programs prohibit third-party resale markups.

## Mode

| Mode | Behavior |
| --- | --- |
| demo | Stub USPS rate and stub label. No HTTP to EasyPost or Stripe. |
| test | EasyPost test key. Stripe test key. Buy runs only after a paid webhook. |
| live | Forge production key. Refuses to boot without `EASYPOST_ORDER_FORM_REFERENCE` and Postgres `DATABASE_URL`. Not live-ready until EasyPost sales completes Forge enrollment. |

## Pricing

`total_cents = postage_cents + fee_cents`

Postage comes from the selected EasyPost USPS rate at runtime. `fee_cents` defaults to 199 (`$1.99`) via `SERVICE_FEE_CENTS`. `EASYPOST_PLATFORM_FEE_CENTS` is the Forge per-label fee and stays empty until the Order Form states it. It is not added on top of the service fee.

## HTTP

- `POST /drafts` — validate, create an EasyPost shipment in test/live (no postage), store the draft, return USPS rates.
- `POST /drafts/:id/checkout` — one Stripe Checkout session. A second call returns 409.
- `POST /webhooks/stripe` — buy only when `payment_status` is `paid`, after an `INSERT ... ON CONFLICT DO NOTHING` claim on the draft id.
- `GET /labels/:id`
- `POST /labels/:id/void`

Carrier allowlist: `USPS`.
