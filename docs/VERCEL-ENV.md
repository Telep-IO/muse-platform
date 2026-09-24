# Vercel environment variables

One Vercel project deploys this Next.js app (catalog + gateway). Apps under `services/` are Express processes. They are not npm workspaces and Vercel does not deploy them.

Jonathan: paste the names below into **Vercel → Project → Settings → Environment Variables**. Values in git stay empty. Fill secrets in the dashboard, then **Redeploy**. A running deployment does not pick up env edits, including `NEXT_PUBLIC_*` which are baked in at build time.

`*_APP_MODE` defaults to `demo` (in-memory stub, no provider HTTP). Set a connector to `test` to smoke sandbox keys tonight. `live` uses live provider hosts (OpenSRS production, Lob `live_` keys). Prefer `test` until a sandbox check is green.

The gateway calls providers **inside this Next.js app**. It does not need a separate Express deploy for these checks. `*_SERVICE_URL` is stored for a later proxy and is not called.

These routes do **not** create Lob letters, place Twilio calls, transmit faxes, order Handwrytten cards, send signature requests, or register domains. They can still spend in two places: Sumvid `POST /summaries` uses credits, and AfterShip/EasyPost tracking may count against a plan. Shippo tracking lookups are read-only.

## Production

Set **Production**. Use the same names on **Preview** only if a preview deployment should boot the gateway. Keep Preview `*_APP_MODE` at `demo`, and do not put live provider keys on Preview.

### Shared

| Name | Production value |
| --- | --- |
| `NEXT_PUBLIC_CATALOG_URL` | `https://muse.telep.io` |
| `NEXT_PUBLIC_API_URL` | `https://api.muse.telep.io` |
| `MUSE_API_KEYS` | Comma-separated `muse_sk_{demo\|test\|live}_{token}`. Do not reuse `muse_sk_demo_localdev`. |
| `STRIPE_SECRET_KEY` | Empty until checkout should leave stub mode. Stripe test key until a connector charges. |
| `STRIPE_WEBHOOK_SECRET` | Empty until `/v1/billing/webhook` should verify. Pair with the key above. |
| `STRIPE_SUCCESS_URL` | `https://muse.telep.io/docs` (or the post-checkout path you want) |
| `STRIPE_CANCEL_URL` | `https://muse.telep.io/docs` |
| `SUPPORT_EMAIL` | Operator support address. Empty until live mode on an Express app. |
| `LEGAL_BUSINESS_NAME` | Legal entity name. Empty until live mode. |
| `BUSINESS_ADDRESS` | Operator address. Empty until live mode. |

Optional shared Stripe Tax flags, read by the PaperSend, SignSend, and DomainSend Express apps (unprefixed) and not by the gateway:

| Name | Value until Stripe Tax is configured |
| --- | --- |
| `STRIPE_AUTOMATIC_TAX` | `false` |
| `STRIPE_TAX_CODE` | empty |

### PaperSend

Maps to `services/paper-send/.env.example` (`APP_MODE`, `LOB_API_KEY`, `LOB_AUTHORIZATION_REFERENCE`, `DATABASE_URL`).

| Vercel name | Express name |
| --- | --- |
| `PAPER_SEND_APP_MODE` | `APP_MODE` — `demo` by default; `test` for a Lob `test_` key |
| `PAPER_SEND_LOB_API_KEY` | `LOB_API_KEY` |
| `PAPER_SEND_LOB_AUTHORIZATION_REFERENCE` | `LOB_AUTHORIZATION_REFERENCE` |
| `PAPER_SEND_DATABASE_URL` | `DATABASE_URL` (optional on Vercel; required on the Express deploy) |
| `PAPER_SEND_SERVICE_URL` | optional proxy base URL; no Express equivalent |

### ShipLabel

Maps to `services/ship-label/.env.example`. The gateway does not import that app. In `test` or `live`, shipment drafts, checkout, and voids are HTTP calls to `SHIP_LABEL_SERVICE_URL`. Demo does not call that URL, EasyPost, or Stripe.

Postage is the EasyPost USPS rate at draft time. `SHIP_LABEL_SERVICE_FEE_CENTS` defaults to `199` ($1.99). Leave `SHIP_LABEL_EASYPOST_PLATFORM_FEE_CENTS` empty until the Forge Order Form names the platform fee. Do not set `SHIP_LABEL_APP_MODE=live` until `SHIP_LABEL_EASYPOST_ORDER_FORM_REFERENCE` is the real Forge reference. A Developer Plan key is not a live credential.

| Vercel name | Express name |
| --- | --- |
| `SHIP_LABEL_APP_MODE` | `APP_MODE` — `demo` by default |
| `SHIP_LABEL_EASYPOST_API_KEY` | `EASYPOST_API_KEY` |
| `SHIP_LABEL_EASYPOST_ORDER_FORM_REFERENCE` | `EASYPOST_ORDER_FORM_REFERENCE` |
| `SHIP_LABEL_EASYPOST_PLATFORM_FEE_CENTS` | `EASYPOST_PLATFORM_FEE_CENTS` |
| `SHIP_LABEL_SERVICE_FEE_CENTS` | `SERVICE_FEE_CENTS` |
| `SHIP_LABEL_DATABASE_URL` | `DATABASE_URL` |
| `SHIP_LABEL_SERVICE_URL` | no Express equivalent; the gateway's base URL for the service |

Shared `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` are the Stripe values. The Express process reads those same unprefixed names.

### GiftSend

Maps to `services/gift-send/.env.example`. The gateway does not import that app. In `test` or `live`, drafts, checkout binding, and cancellation are HTTP calls to `GIFT_SEND_SERVICE_URL`. Demo does not call that URL, Tremendous, or Stripe.

Face value is the Tremendous catalog amount at draft time. `GIFT_SEND_SERVICE_FEE_CENTS` defaults to `299` ($2.99). Tremendous's fee on gift cards, Visa/Mastercard prepaid, and charity is $0. Do not set `GIFT_SEND_APP_MODE=live` until `GIFT_SEND_PLATFORM_CLIENT_REFERENCE` records Platform Client registration with Tremendous Sales. A self-serve API key is not a live credential. The Express app also needs `TREMENDOUS_WEBHOOK_SECRET` in test and live so webhook signatures can be checked.

| Vercel name | Express name |
| --- | --- |
| `GIFT_SEND_APP_MODE` | `APP_MODE` — `demo` by default |
| `GIFT_SEND_API_KEY` | `TREMENDOUS_API_KEY` |
| `GIFT_SEND_TREMENDOUS_WEBHOOK_SECRET` | `TREMENDOUS_WEBHOOK_SECRET` |
| `GIFT_SEND_PLATFORM_CLIENT_REFERENCE` | `TREMENDOUS_PLATFORM_CLIENT_REFERENCE` |
| `GIFT_SEND_SERVICE_FEE_CENTS` | `SERVICE_FEE_CENTS` |
| `GIFT_SEND_DATABASE_URL` | `DATABASE_URL` |
| `GIFT_SEND_SERVICE_URL` | no Express equivalent; the gateway's base URL for the service |
| `GIFT_SEND_SERVICE_TOKEN` | `SERVICE_TOKEN` |

Shared `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` are the Stripe values. The Express process reads those same unprefixed names. Test mode uses `https://testflight.tremendous.com/api/v2`. Live uses `https://api.tremendous.com/api/v2`.

### Sumvid

There is no `services/sumvid` tree and no sumvid-muse README in this repository (the registry links `Telep-IO/sumvid-muse`). `test`/`live` calls `POST {SUMVID_API_BASE_URL}/v1/summaries` with `Authorization: Bearer {SUMVID_API_KEY}` and JSON `{ youtubeUrl, videoId, language }`. `GET /v1/account` is the credential check. A 402 or `error.code` of `insufficient_credits` is returned with `topUpUrl` when Sumvid sends one.

| Vercel name | Notes |
| --- | --- |
| `SUMVID_APP_MODE` | `demo` by default; `test` to call Sumvid |
| `SUMVID_API_BASE_URL` | Product API origin, no trailing path |
| `SUMVID_API_KEY` | Bearer token |

### ShipSignal

There is no `services/shipsignal` tree and no shipsignal-muse README here (the registry links `Telep-IO/shipsignal-muse`). `SHIPSIGNAL_PROVIDER` must be `aftership`, `shippo`, or `easypost`. Direct UPS/USPS/FedEx/DHL keys are not called. Commented per-carrier placeholders in `.env.example` are not dashboard rows.

| Vercel name | Notes |
| --- | --- |
| `SHIPSIGNAL_APP_MODE` | `demo` by default; `test` to track |
| `SHIPSIGNAL_PROVIDER` | `aftership`, `shippo`, or `easypost` |
| `SHIPSIGNAL_API_KEY` | That provider’s key |

### SignSend

Maps to `services/sign-send/.env.example`. `ESIGN_API_KEY` is still commented there until a provider is chosen.

| Vercel name | Express name |
| --- | --- |
| `SIGN_SEND_APP_MODE` | `APP_MODE` — `demo` by default; `test` to validate the key |
| `SIGN_SEND_ESIGN_PROVIDER` | `hellosign` or `boldsign` (default `hellosign`) |
| `SIGN_SEND_ESIGN_API_KEY` | `ESIGN_API_KEY` |
| `SIGN_SEND_ESIGN_AUTHORIZATION_REFERENCE` | `ESIGN_AUTHORIZATION_REFERENCE` |
| `SIGN_SEND_DATABASE_URL` | `DATABASE_URL` (optional on Vercel; Express production uses Postgres) |
| `SIGN_SEND_SERVICE_URL` | optional proxy base URL |

### FaxSend

Maps to `services/fax-send/.env.example`. Provider TODO: Phaxio or Telnyx Fax (`services/fax-send/TERMS-DILIGENCE.md`).

| Vercel name | Express name |
| --- | --- |
| `FAX_SEND_APP_MODE` | `APP_MODE` — `demo` by default; `test` to validate auth. Provider: `phaxio`, `sinch`, or `telnyx` |
| `FAX_SEND_FAX_PROVIDER` | `FAX_PROVIDER` |
| `FAX_SEND_FAX_API_KEY` | `FAX_API_KEY` |
| `FAX_SEND_FAX_API_SECRET` | `FAX_API_SECRET` |
| `FAX_SEND_FAX_WEBHOOK_SECRET` | `FAX_WEBHOOK_SECRET` |
| `FAX_SEND_FAX_AUTHORIZATION_REFERENCE` | `FAX_AUTHORIZATION_REFERENCE` |
| `FAX_SEND_SERVICE_URL` | optional proxy base URL |

### CallSend

Maps to `services/call-send/.env.example`. Planned provider is Twilio Programmable Voice.

| Vercel name | Express name |
| --- | --- |
| `CALL_SEND_APP_MODE` | `APP_MODE` — `demo` by default; `test` to fetch the Twilio account |
| `CALL_SEND_CALL_PROVIDER` | `CALL_PROVIDER` — `twilio` |
| `CALL_SEND_TWILIO_ACCOUNT_SID` | `TWILIO_ACCOUNT_SID` |
| `CALL_SEND_TWILIO_AUTH_TOKEN` | `TWILIO_AUTH_TOKEN` |
| `CALL_SEND_TWILIO_FROM_NUMBER` | `TWILIO_FROM_NUMBER` |
| `CALL_SEND_TWILIO_WEBHOOK_SECRET` | `TWILIO_WEBHOOK_SECRET` |
| `CALL_SEND_CALL_AUTHORIZATION_REFERENCE` | `CALL_AUTHORIZATION_REFERENCE` |
| `CALL_SEND_SERVICE_URL` | optional proxy base URL |

### InkSend

Maps to `services/ink-send/.env.example`. Provider TODO after `services/ink-send/TERMS-DILIGENCE.md`.

| Vercel name | Express name |
| --- | --- |
| `INK_SEND_APP_MODE` | `APP_MODE` — `demo` by default; `test` calls Handwrytten `getUser` |
| `INK_SEND_INK_PROVIDER` | `INK_PROVIDER` |
| `INK_SEND_INK_API_KEY` | `INK_API_KEY` |
| `INK_SEND_INK_API_SECRET` | `INK_API_SECRET` |
| `INK_SEND_INK_WEBHOOK_SECRET` | `INK_WEBHOOK_SECRET` |
| `INK_SEND_INK_AUTHORIZATION_REFERENCE` | `INK_AUTHORIZATION_REFERENCE` |
| `INK_SEND_SERVICE_URL` | optional proxy base URL |

### DomainSend

Maps to `services/domain-send/.env.example`. Reseller TODO: OpenSRS or the platform chosen in `services/domain-send/TERMS-DILIGENCE.md`.

| Vercel name | Express name |
| --- | --- |
| `DOMAIN_SEND_APP_MODE` | `APP_MODE` — `demo` by default; `test` uses OpenSRS horizon, `live` uses the production reseller host |
| `DOMAIN_SEND_RESELLER_API_KEY` | `RESELLER_API_KEY` |
| `DOMAIN_SEND_RESELLER_USERNAME` | `RESELLER_USERNAME` |
| `DOMAIN_SEND_DOMAIN_AUTHORIZATION_REFERENCE` | `DOMAIN_AUTHORIZATION_REFERENCE` |
| `DOMAIN_SEND_DATABASE_URL` | `DATABASE_URL` (needed for the Express app; registrant contacts are stored there) |
| `DOMAIN_SEND_SERVICE_URL` | optional proxy base URL |

## Docker or Coolify instead of Vercel

`services/*` keep their own `.env.example` files. Those files stay the source for a separate deploy. Use the **unprefixed** names in that file (`LOB_API_KEY`, `APP_MODE`, `TWILIO_ACCOUNT_SID`, and so on). The namespaced `PAPER_SEND_*` / `FAX_SEND_*` variables are for this Vercel project so one dashboard can hold every connector without collisions.

Also set on the Express process only (not on Vercel): `PORT`, `HOST`, `BASE_URL`, `DATA_DIR`, `TRUST_PROXY`, and `BUSINESS_NAME`. PaperSend, SignSend, and DomainSend use `DATABASE_URL` there, not the `*_DATABASE_URL` Vercel name, unless you deliberately point the process at the namespaced variable.

## After you save variables

1. Vercel → Deployments → Redeploy Production (and Preview, if you changed Preview). Env edits do not apply to the current deployment.
2. For tonight’s smoke, set each connector you are testing to `test`, not `live`, unless you intend to hit the live provider.
3. Confirm `https://api.muse.telep.io/health` still returns `muse-platform`.

## Smoke commands

Replace `$MUSE_KEY` with a key that is already in `MUSE_API_KEYS`. Do not paste provider secrets into chat or git.

```bash
export MUSE_KEY='muse_sk_test_your_gateway_key'
BASE=https://api.muse.telep.io
auth=( -H "Authorization: Bearer $MUSE_KEY" -H "Content-Type: application/json" )
```

| Connector | Command | What it does | Spend |
| --- | --- | --- | --- |
| PaperSend check | `curl -sS "${auth[@]}" $BASE/v1/paper-send/check` | Lob `GET /v1/addresses?limit=1`. Stripe balance only if `STRIPE_SECRET_KEY` is set. | None. Does not create a letter. |
| PaperSend quote | `curl -sS "${auth[@]}" "$BASE/v1/paper-send/quote?pages=2"` | Local $4.99 + $0.25 math. | None. |
| PaperSend draft | `curl -sS "${auth[@]}" -d '{"sender":{"name":"A","address_line1":"1 Main","address_city":"Cleveland","address_state":"OH","address_zip":"44113"},"recipient":{"name":"B","address_line1":"2 Main","address_city":"Cleveland","address_state":"OH","address_zip":"44114"},"document":{"pages":1}}' $BASE/v1/paper-send/jobs` | Stores a draft. | None. A human must review before any mail. Live Lob keys are rejected when mode is `test`. |
| Sumvid check | `curl -sS "${auth[@]}" $BASE/v1/sumvid/check` | `GET {SUMVID_API_BASE_URL}/v1/account`. | None. |
| Sumvid summarize | `curl -sS "${auth[@]}" -d '{"youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' $BASE/v1/sumvid/summaries` | Real summarize. `402` body includes `error.code=insufficient_credits` and `error.topUpUrl` when Sumvid sends them. | **Spends Sumvid credits.** |
| ShipSignal check | `curl -sS "${auth[@]}" $BASE/v1/shipsignal/check` | Auth only (AfterShip couriers, Shippo carrier accounts, or EasyPost tracker list). | None. |
| ShipSignal track | `curl -sS "${auth[@]}" -d '{"trackingNumber":"1Z999AA10123456784"}' $BASE/v1/shipsignal/parcels` | Shippo: read-only GET. AfterShip: may register the number. EasyPost: creates a tracker. | **AfterShip quota or EasyPost tracker metering.** No postage. |
| SignSend check | `curl -sS "${auth[@]}" $BASE/v1/sign-send/check` | Dropbox Sign `GET /v3/account` or BoldSign `GET /v1/user`. | None. No envelope is sent. |
| SignSend draft | `curl -sS "${auth[@]}" -d '{"signers":[{"name":"Ada","email":"ada@example.com"}]}' $BASE/v1/sign-send/envelopes` | Draft only. | None. |
| FaxSend check | `curl -sS "${auth[@]}" $BASE/v1/fax-send/check` | Phaxio account status, Sinch projects, or Telnyx balance. | None. No fax is sent. |
| FaxSend quote | `curl -sS "${auth[@]}" "$BASE/v1/fax-send/quote?pages=1"` | Local $0.99/page. | None. |
| CallSend check | `curl -sS "${auth[@]}" $BASE/v1/call-send/check` | Twilio `GET Accounts/{SID}.json`. | None. No call is placed. |
| InkSend check | `curl -sS "${auth[@]}" $BASE/v1/ink-send/check` | Handwrytten `GET /v2/auth/getUser`. | None. No card is ordered. |
| DomainSend check | `curl -sS "${auth[@]}" $BASE/v1/domain-send/check` | OpenSRS LOOKUP of `example.com`. | None. Does not register. |
| DomainSend availability | `curl -sS "${auth[@]}" -d '{"domain":"example.com"}' $BASE/v1/domain-send/domains/check` | OpenSRS LOOKUP in `test`/`live`. Demo uses the local stub (`taken-` prefix). | None. |
| MCP | `curl -sS "${auth[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_credentials","arguments":{}}}' $BASE/mcp/paper-send` | Same checks via MCP. Tool name `check_credentials` was added. Existing tool names are unchanged. | Same as the REST check for that connector. |

**Do not point `*_APP_MODE` at `live` for a first smoke.** A live Lob key is refused when mode is `test`. Live mode still does not mail from these routes, but OpenSRS lookups hit the production reseller host, and a live Sumvid key spends real credits.

The Express apps under `services/` can still spend if you deploy them separately and set their own unprefixed keys. This Vercel gateway does not proxy `*_SERVICE_URL`, except ShipLabel and PrintMerch. In test and live, ShipLabel calls `SHIP_LABEL_SERVICE_URL` for drafts, checkout, and voids, and PrintMerch calls `PRINT_MERCH_SERVICE_URL` for drafts, checkout reservation, and paid fulfillment. Demo mode does not call either URL.

PrintMerch check is read-only (`GET /v1/shops.json` and the catalog) and refuses to continue unless the shop's order approval is manual. A draft does not submit a production order. Production starts only after the Stripe webhook reports `payment_status` paid.
