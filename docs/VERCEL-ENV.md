# Vercel environment variables

One Vercel project deploys this Next.js app (catalog + gateway). Apps under `services/` are Express processes. They are not npm workspaces and Vercel does not deploy them.

Jonathan: paste the names below into **Vercel → Project → Settings → Environment Variables**. Values in git stay empty. Fill secrets in the dashboard, then **Redeploy**. A running deployment does not pick up env edits, including `NEXT_PUBLIC_*` which are baked in at build time.

`*_APP_MODE` stays `demo` until a later PR wires the gateway to providers. `demo` means no external provider calls. Do not set `test` or `live` on Vercel while the connectors are still stubs.

This document is the template. It does not turn on Lob, Stripe charges, Twilio, fax, handwriting, e-sign, domain registration, Sumvid, or carrier polling.

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
| `PAPER_SEND_APP_MODE` | `APP_MODE` — keep `demo` |
| `PAPER_SEND_LOB_API_KEY` | `LOB_API_KEY` |
| `PAPER_SEND_LOB_AUTHORIZATION_REFERENCE` | `LOB_AUTHORIZATION_REFERENCE` |
| `PAPER_SEND_DATABASE_URL` | `DATABASE_URL` (optional on Vercel; required on the Express deploy) |
| `PAPER_SEND_SERVICE_URL` | optional proxy base URL; no Express equivalent |

### Sumvid

`connectors/sumvid` reads no environment variables. There is no `services/sumvid` tree and no sumvid-muse README in this repository (the registry links `Telep-IO/sumvid-muse`). These names are the gateway contract. A later wiring PR will map them.

| Vercel name | Notes |
| --- | --- |
| `SUMVID_APP_MODE` | `demo` until wiring is live |
| `SUMVID_API_BASE_URL` | Product API origin. Empty until known. |
| `SUMVID_API_KEY` | Empty. |

### ShipSignal

`connectors/shipsignal` reads no environment variables and calls no carrier. There is no `services/shipsignal` tree and no shipsignal-muse README here (the registry links `Telep-IO/shipsignal-muse`).

TODO: choose a multi-carrier aggregator, or one of `ups`, `usps`, `fedex`, `dhl`. Per-carrier key names are not defined. Commented placeholders in the root `.env.example` (`SHIPSIGNAL_UPS_API_KEY`, `SHIPSIGNAL_USPS_API_KEY`, `SHIPSIGNAL_FEDEX_API_KEY`, `SHIPSIGNAL_DHL_API_KEY`) are not required dashboard rows.

| Vercel name | Notes |
| --- | --- |
| `SHIPSIGNAL_APP_MODE` | `demo` until wiring is live |
| `SHIPSIGNAL_PROVIDER` | Aggregator slug, or `ups` / `usps` / `fedex` / `dhl`. Empty until chosen. |
| `SHIPSIGNAL_API_KEY` | Empty. |

### SignSend

Maps to `services/sign-send/.env.example`. `ESIGN_API_KEY` is still commented there until a provider is chosen.

| Vercel name | Express name |
| --- | --- |
| `SIGN_SEND_APP_MODE` | `APP_MODE` — keep `demo` |
| `SIGN_SEND_ESIGN_API_KEY` | `ESIGN_API_KEY` |
| `SIGN_SEND_ESIGN_AUTHORIZATION_REFERENCE` | `ESIGN_AUTHORIZATION_REFERENCE` |
| `SIGN_SEND_DATABASE_URL` | `DATABASE_URL` (optional on Vercel; Express production uses Postgres) |
| `SIGN_SEND_SERVICE_URL` | optional proxy base URL |

### FaxSend

Maps to `services/fax-send/.env.example`. Provider TODO: Phaxio or Telnyx Fax (`services/fax-send/TERMS-DILIGENCE.md`).

| Vercel name | Express name |
| --- | --- |
| `FAX_SEND_APP_MODE` | `APP_MODE` — keep `demo` |
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
| `CALL_SEND_APP_MODE` | `APP_MODE` — keep `demo` |
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
| `INK_SEND_APP_MODE` | `APP_MODE` — keep `demo` |
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
| `DOMAIN_SEND_APP_MODE` | `APP_MODE` — keep `demo` |
| `DOMAIN_SEND_RESELLER_API_KEY` | `RESELLER_API_KEY` |
| `DOMAIN_SEND_RESELLER_USERNAME` | `RESELLER_USERNAME` |
| `DOMAIN_SEND_DOMAIN_AUTHORIZATION_REFERENCE` | `DOMAIN_AUTHORIZATION_REFERENCE` |
| `DOMAIN_SEND_DATABASE_URL` | `DATABASE_URL` (needed for the Express app; registrant contacts are stored there) |
| `DOMAIN_SEND_SERVICE_URL` | optional proxy base URL |

## Docker or Coolify instead of Vercel

`services/*` keep their own `.env.example` files. Those files stay the source for a separate deploy. Use the **unprefixed** names in that file (`LOB_API_KEY`, `APP_MODE`, `TWILIO_ACCOUNT_SID`, and so on). The namespaced `PAPER_SEND_*` / `FAX_SEND_*` variables are for this Vercel project so one dashboard can hold every connector without collisions.

Also set on the Express process only (not on Vercel): `PORT`, `HOST`, `BASE_URL`, `DATA_DIR`, `TRUST_PROXY`, and `BUSINESS_NAME`. PaperSend, SignSend, and DomainSend use `DATABASE_URL` there, not the `*_DATABASE_URL` Vercel name, unless you deliberately point the process at the namespaced variable.

## After you save variables

1. Vercel → Deployments → Redeploy the Production deployment (and Preview, if you changed Preview).
2. Leave every `*_APP_MODE` at `demo`.
3. Confirm `https://api.muse.telep.io/health` still returns `muse-platform`. Provider calls stay unwired until the next PR.
