# PaperSend

Upload a PDF, review your addresses and print content, pay with Stripe Checkout, and submit a physical letter to Lob. One Node process, Neon/PostgreSQL for VPS deployments (SQLite for the local demo), and a static frontend. No frontend build, account system, Redis, ORM, or separate queue service. PDFs stay on the VPS, never in Neon.

## Run locally

Requires Node 24+ and Poppler (`pdfinfo`, `pdftoppm`). On Debian/Ubuntu install `poppler-utils`; on Arch install `poppler`. Tests also use `qpdf` and Chromium.

```sh
cd /home/telep/Projects/PaperSend
pnpm install --frozen-lockfile
cp .env.example .env
pnpm start
```

Open http://localhost:3000. Default **demo mode** makes no external API calls, collects no payment, and sends no mail. It still exercises real PDF conversion, private previews, persisted orders, and the fulfillment state machine.

## Test with Stripe and Lob

Set these in `.env` locally; never commit credentials:

```dotenv
APP_MODE=test
DATA_DIR=./data/test
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_signing_secret
LOB_API_KEY=test_your_key
```

Run Stripe CLI `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and put its signing secret in `.env`. Restart the server. Use Stripe test payment details (for example `4242 4242 4242 4242`). Stripe Checkout collects an email; configure Stripe receipts in its dashboard if desired. **Email delivery and an account-based order-recovery flow are not implemented.** Customers keep the private order link.

The Lob account needs access to both Print & Mail and US Address Verification. PaperSend requires `deliverable` for both addresses, so use Lob's documented test addresses. Verification is internal: the customer sees only the addresses they supplied, not Lob's standardized result or confidence report. The collection notice appears before submission. A `200` response from Lob records printer acceptance, not postal delivery.

Configure the public business Terms URL in Stripe's dashboard (`https://your-domain/terms.html`). Checkout requires Stripe's terms checkbox as well as PaperSend's order confirmation. Its submit text links to the exact archived terms version. Test checkout and the returned `consent.terms_of_service` field with your actual Stripe account before launch.

## Product boundary

- US 50 states and DC; one recipient, one letter, no bulk advertising.
- 1–5 PDF pages, max 10 MB. Black-and-white, single-sided, US Letter paper.
- Each page is rasterized at a maximum 2,200-pixel edge and fitted into quarter-inch safe margins. Original embedded scripts, attachments, links, and interactive forms are not forwarded. Users approve the rendered content. This is not archival PDF or preservation of digital signatures.
- Lob inserts an address cover sheet. It is included in our price. Five uploaded pages plus that sheet avoid the provider's over-six-sheet surcharge.
- $4.99 for the first document page and $0.25 for each additional page. Price is calculated on the server. Verify provider pricing in your account before selling.
- Optional Stripe Tax configuration; determine tax treatment before enabling live sales. No subscription, certified mail, delivery guarantee, or proof of service.

## Deployment

For your VPS, clone this repository and run:

```sh
make deploy
```

First run prompts for a domain, proxy choice, Neon database URL, and provider settings. On Ubuntu/Debian it installs Docker if absent. Later runs reuse saved configuration, build the app, validate the remote database, deploy, and verify health. Use `make setup`, `make status`, `make logs`, and `make stop` for configuration and operations. See [VPS deployment](docs/vps-deployment.md) for Neon setup, HTTPS/proxy routing, prerequisites, and recovery. Secrets in `.deploy/` are excluded from Git and image builds. A Neon account/database, domain/DNS, and provider credentials still need to be supplied; no script can create those from nothing.

For a local Docker demo instead:

The included Dockerfile installs Poppler and runs as a non-root user. `compose.yaml` applies a read-only root filesystem, process/memory limits, and a persistent SQLite/files volume.

```sh
docker compose up --build -d
docker compose logs -f papersend
```

Put one HTTPS reverse proxy in front of `127.0.0.1:3000`. Set `BASE_URL` to its exact public origin. Set `TRUST_PROXY=1` only if that proxy replaces forwarded headers and is the only way to reach the container. Do not expose an unprotected second route around it. Use a single application replica with its persistent volume; this isn't a horizontally scaled deployment.

For real orders use a **new** `DATA_DIR`/Docker volume, `APP_MODE=live`, matching live Stripe/Lob keys, the live webhook signing secret, and a working `SUPPORT_EMAIL`. Live mode also requires `LEGAL_BUSINESS_NAME`, `BUSINESS_ADDRESS`, and `LOB_AUTHORIZATION_REFERENCE`. Record a genuine agreement/email reference covering the customer-facing paid API workflow; the setting does not obtain or verify permission. See [launch readiness](docs/launch-readiness.md). HTTPS and matching provider key modes are enforced at startup. Live and test orders cannot share a database. Docker Compose stores data in its named volume regardless of host `DATA_DIR`; use a different Compose project name for each mode, e.g. `docker compose -p papersend-live up -d`.

Register `https://your-domain/api/webhooks/stripe` for `checkout.session.completed` (and `checkout.session.async_payment_succeeded` if payment methods change). Only card-based immediate payment methods are enabled initially. The server verifies webhook signatures, mode, currency, subtotal, session, and order reference. It also reconciles Checkout sessions when the customer returns and in a background job.

Before taking live customer orders: complete provider activation and funding, verify a Stripe/Lob test order, confirm your support contact and operator identity in the published notices, configure receipts/taxes as appropriate, place an approved low-value physical sample order, and verify the resulting print and address placement. The local tests mock provider responses; they cannot verify your account permissions, billing, print quality, or postal delivery.

## Failure behavior and operations

Before checkout, the server verifies a review fingerprint covering the print PDF's SHA-256, a fingerprint of the approved addresses, page count, price/tax configuration, print settings, exact confirmation wording, and archived policy versions. Stale review submissions are rejected. The approval and checkout lease are committed in one database transaction. Approval and policy records reject UPDATE operations; this is application/database integrity protection, not a claim of external notarization or proof that a person actually read every page.

At payment confirmation, the signed Stripe session must match the approval fingerprint, terms acceptance, subtotal, final total, tax, currency, mode, session and order. Before fulfillment, the approved order must still match and the actual PDF bytes are hashed again. Missing or changed evidence/files place the order in `needs_review`, never silently re-authorize it.

Policy templates live in `policies/` and are rendered with the configured operator/contact details. The exact HTML is archived by content hash in the configured database. `/terms.html` and `/privacy.html` serve current versions; `/policies/{kind}/{hash}` serves the archived version linked during review. Existing approved sessions keep their accepted versions. Legacy drafts without a document fingerprint must be recreated; legacy paid orders without evidence stop for review. Back up the database before upgrading; never invent historical consent.

```
draft → checkout → paid → sending → submitted
                          ├─ rejected → refund_pending → refunded
                          └─ uncertain beyond retry window → needs_review
```

Both databases enforce unique payment/provider identifiers, transactional approval, and compare-and-set worker leases. SQLite additionally uses WAL and full synchronization; PostgreSQL transactions use a dedicated connection. Every send and refund has a stable provider idempotency key. Retrying a webhook does not create a second job. A printer rejection queues a refund; network errors leave the outcome uncertain and retry the same request. Ambiguous requests stop at 23 hours, before Lob's documented 24-hour key expiry. A restart recovers expired leases. No request claims that a redirect alone means payment succeeded.

```sh
pnpm ops
pnpm ops evidence ORDER_UUID
# Inside the container:
docker compose exec papersend node scripts/ops.js
```

Review outstanding orders daily and alert on `needs_review`, prolonged `sending`/`refund_pending`, process restarts, low disk, and failed health checks. `pnpm ops` prints references and sanitized failure categories, not addresses or documents. For `needs_review`, reconcile the Stripe payment/refund and Lob's `metadata.order_id` in their dashboards before changing the order. Never blindly resend with a new key after 24 hours. There is deliberately no public administrative retry endpoint. A manual refund in Stripe does not cancel mail at Lob; coordinate both before intervening.

This version shows **submitted to printer**, not delivery tracking. The background job polls Lob until PDF rendering succeeds; a documented `failed` render queues a refund, and a render stuck in `processed` for more than 24 hours stops for review. Lob can report downstream delivery problems after printing; monitor its dashboard and handle these through support. Delivery tracking, outbound support alerts, and customer email updates are future work.

Unpaid drafts are purged after 48 hours; submitted/refunded files and addresses after 30 days. Unresolved orders remain available for investigation. Approval evidence contains fingerprints rather than a second copy of documents/addresses; it is removed once an order is resolved, its documents are purged, and it is older than 180 days. Minimal transaction/order references remain. `pnpm ops evidence ORDER_UUID` exports retained acceptance and payment evidence without postal addresses, document contents, or private tokens. Treat these financial references/fingerprints as sensitive. The cleanup job also removes orphaned uploads older than 48 hours. Backups and provider records have separate retention. Use encrypted host storage and encrypted backups; this app does not implement application-level document encryption. Preserve the database and documents together when backing up, and apply retention to backups too.

Private order links use random 256-bit bearer tokens in URL fragments; only hashes are stored in the order table. Tokens are never query parameters or public document URLs. Checkout return URLs necessarily share the private link with Stripe. No external analytics or frontend scripts are loaded. Request headers, addresses, and documents are not logged by the app. Configure your proxy similarly.

## Verification

```sh
pnpm check
pnpm test
pnpm test:browser
pnpm audit --prod
```

Browser tests use `/usr/bin/chromium`; override with `CHROMIUM_PATH`. Tests cover price tampering, auth, malformed/encrypted documents, signature verification, duplicate webhooks, concurrent workers, retry cutoffs, refunds, retention, mode isolation, and mobile/desktop checkout. All tests use temporary data and simulated providers; they do not charge or send mail.

## Muse integration

The app already exposes a narrow REST interface for agent-created drafts; see [docs/connector.md](docs/connector.md). An agent uploads a document and addresses, then gives the user the returned `review_url`. Human review and Stripe Checkout complete the order. Do not give an agent a provider API key or permission to skip the final review.

**No native Muse connector has been implemented, tested, submitted, or approved.** The public platform page confirms a review process but does not supply the authenticated connector schema. Verify that schema in the developer account before building its adapter. The standalone app remains usable without directory approval.

## Sources checked

- [Lob API and letter create specification](https://github.com/lob/lob-openapi/blob/main/resources/letters/letters.yml)
- [Lob idempotency and 24-hour expiration](https://help.lob.com/print-and-mail/building-a-mail-strategy/managing-mail-settings)
- [Lob pricing](https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details)
- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create)
- [Muse Connector Platform](https://muse.ai/platform)
