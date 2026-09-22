# Hostinger VPS deployment

PaperSend runs as one Docker application on your existing VPS. Neon holds the
order database; PDFs and preview images stay in a private Docker volume on the
VPS. No PDF bytes are sent to Neon. Use one application replica.

## First deployment

On an Ubuntu/Debian VPS with Git and Make available:

```sh
git clone YOUR_PRIVATE_REPOSITORY_URL PaperSend
cd PaperSend
make deploy
```

If Git or Make is missing, install them first with
`sudo apt-get update && sudo apt-get install -y git make`.

The first run installs Docker from its official apt repository if absent, builds
PaperSend, and asks for the domain, mode, proxy choice, Neon URL, and applicable
provider keys. Docker installation requires root/sudo. Existing Docker installs
are reused and must provide Compose 2.30 or newer. The script does not replace
existing container runtimes, reconfigure your firewall, or edit another app's proxy.

Configuration is stored in `.deploy/runtime.env` and `.deploy/settings.env`, with
directory mode 0700 and file mode 0600. Both are excluded from Git and Docker build
contexts. Secret input is hidden. The runtime env file uses literal, unquoted,
single-line values (Compose `format: raw`), so `$` characters are not interpolated.
Never `source` this file. Docker administrators can still read container secrets.

The deployment preflight checks configuration, database connectivity, schema, and
mode before replacing the app. It then waits for container health and checks the
public HTTPS health endpoint. If DNS/proxy setup isn't complete, it reports that
the app is running but public verification failed; fix the routing and rerun.
It does not claim a public deployment succeeded based only on local health.

## Neon

1. Create a dedicated Neon project/database in a region near the VPS.
2. Copy its PostgreSQL connection string (the pooled endpoint is supported).
3. Paste it into the hidden setup prompt. Setup changes `sslmode` to `verify-full`
   to authenticate the server certificate and hostname.
4. Choose a restore window and plan appropriate for financial order records in
   Neon's dashboard. Verify the actual window; free and paid plans differ.

Schema creation is automatic and serialized in a transaction. Production needs
permission to create tables, indexes, a trigger function, and triggers in its
dedicated database. The application uses a small five-connection pool and keeps
checkout approval transactions on one connection, including through PgBouncer.

Use separate databases and deployments for demo, test, and live. Do not attach a
live deployment to the local demo's database. Changing DATABASE_URL starts using
that database; it does **not** import SQLite records. Keep the existing local demo
as-is. If you ever need to migrate real orders, stop processing and perform a
separate verified migration of records and retained files before switching.

The worker checks for jobs every five seconds, so it can keep Neon compute awake.
Do not assume a free tier will cover continuous production use. Monitor Neon
compute/storage usage and set billing notifications.

## HTTPS: choose one

**Existing proxy (default for a VPS already hosting apps):** the app binds only
to `127.0.0.1:APP_PORT` (default 3000). Choose an unused port during setup and add
one virtual host in the existing proxy. For a host-based Nginx proxy, the relevant
location configuration is:

```nginx
location / {
    client_max_body_size 11m;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    access_log off;
}
```

Replace 3000 if you selected another port. Configure TLS for the domain using your
existing proxy's certificate workflow. There must be exactly one trusted proxy
hop that replaces forwarded headers. Do not use `$proxy_add_x_forwarded_for` here.
A containerized proxy cannot reach the host's loopback through its own loopback;
it needs a deliberately configured shared Docker network or host networking.
Panel-managed proxies (Coolify/Dokploy/Traefik) require that panel's routing setup;
`make deploy` does not edit their configuration or join their networks automatically.

**Bundled Caddy:** choose `caddy` when nothing already owns ports 80/443. Point the
domain's A record to the VPS (and AAAA only if IPv6 routing actually works). Allow
inbound 80/443 in Hostinger's firewall and the host's firewall. Caddy requests and
renews TLS certificates and forwards to PaperSend privately. Certificate data has
its own persistent volume. A busy 80/443 port must be resolved by using the existing
proxy option; don't stop unrelated apps to make room.

## Operations and updates

```sh
git pull --ff-only
make deploy         # rebuild, validate, restart, verify; saved config is reused
make status
make logs
make setup          # edit saved configuration, then run make deploy
make stop           # stops this deployment; does not delete volumes or Neon data
```

The app restarts automatically after a crash or VPS reboot. Deployments briefly
interrupt requests. The script doesn't automatically roll back a failed release;
check `make status` and logs, then redeploy a known-good revision. Do not use
`docker compose down -v` on real order volumes. No deployment step charges a card
or sends a sample letter.

Only one mode is configured per checkout. To prepare live alongside demo, use
another checkout with a different domain, local port, and Neon database. Project
names are `papersend-demo`, `papersend-test`, and `papersend-live`. Stop the old
deployment before assigning its domain or port to the new one.

Stripe webhook: `https://YOUR_DOMAIN/api/webhooks/stripe`, event
`checkout.session.completed`. Use that endpoint's signing secret, not the Stripe
CLI secret. Configure Stripe's terms URL and test your actual Stripe/Lob accounts.
Live mode still requires the operator details and genuine Lob authorization
described in [launch readiness](launch-readiness.md).

## Data minimization, refunds, and recovery

| Data | Location | Purpose and cleanup |
| --- | --- | --- |
| Original uploaded PDF | VPS during conversion | Deleted after successful preparation; failed preparations removed |
| Prepared PDF and previews | Private VPS volume | Deleted after 48 hours for unpaid drafts or 30 days for resolved orders |
| Sender/recipient addresses and filename | Neon | Needed for fulfillment/recovery; removed on the same schedule |
| Approval fingerprints, wording, policy versions, timestamps | Neon | Removed after at least 180 days once resolved and documents removed |
| Order ID, amounts/tax, state, Stripe payment/refund IDs, Lob ID, retry state | Neon | Retained for payment reconciliation, refunds, accounting and disputes |

Unresolved orders are excluded from ordinary cleanup until investigated. A PDF is
not required to issue a Stripe refund. The app can process a refund from retained
payment records after document/address deletion. This does not make every mailed
order refundable or recall a letter; operator decisions still follow the terms.
The periods above are product retention rules, not universal statutory requirements.
Have your adviser set the final accounting/legal retention schedule for the business.

Neon's restore history protects the database, **not** the VPS document volume.
Losing that volume before fulfillment can prevent a paid letter from being sent.
Back up retained files securely with deletion limits, or accept that such orders
must be held for review/refund. Never regenerate an approved PDF and silently send
it. A database restored to an earlier point may omit successful sends or refunds;
restore into a separate database, keep the app stopped, reconcile Stripe/Lob IDs,
and only resume after checking for duplicate-mail/payment risks. Protecting records
on another server does not replace a tested recovery procedure.

References: [Neon restore](https://neon.com/docs/introduction/branch-restore),
[Neon pooling](https://neon.com/docs/connect/connection-pooling),
[FTC data minimization](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business).

## Developer verification against PostgreSQL

With an isolated local PostgreSQL server available to a test role that can create
databases, set `TEST_DATABASE_URL` and run `pnpm test`. Each fixture creates a fresh
random database and deletes only that database afterward. Never use production
credentials for test runs. With the variable absent, the same tests use temporary
SQLite databases. Provider calls remain mocked in both runs.
