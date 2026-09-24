# Phase 0 — Telep Muse platform conventions

Contact: jon@telep.io. Company: Telep IO.

These rules exist so the next ~100 connectors can land without renaming the world.

## Hostnames

| Surface | Production host | Local / preview |
| --- | --- | --- |
| Catalog | `muse.telep.io` | `NEXT_PUBLIC_CATALOG_URL` (default `http://localhost:3000`) |
| Gateway | `api.muse.telep.io` | `NEXT_PUBLIC_API_URL` (same origin locally) |

If the `Host` header **contains** `api.`, the app is gateway-first: `/` rewrites to `/v1`. Path prefixes always work, so a single Vercel preview URL can serve both catalog and API.

Cloudflare: both `muse.telep.io` and `api.muse.telep.io` CNAME to this Vercel project. Jonathan owns DNS.

## Repository layout

| Path | Role |
| --- | --- |
| `app/` | Next.js catalog and gateway handlers. This is what Vercel builds. |
| `connectors/` | One folder per connector (`@telep/{slug}` via tsconfig alias). Agent-facing MCP + REST + catalog listing. |
| `packages/` | Workspace packages `@telep/registry` and `@telep/platform`. |
| `services/` | Express fulfillment backends, including PaperSend. Own lockfiles. Not workspaces. Not imported by `app/`, `connectors/`, or `packages/`. |

CallSend, DomainSend, FaxSend, InkSend, PaperSend, and SignSend fulfillment code lives in `services/{slug}`, moved from the former standalone repos. Do not add `services/*` to npm workspaces. Do not import `services/` from the Next.js build.

PaperSend's Express app is `services/paper-send` (Dockerfile and compose files; furthest along). That move is code location only — deployment location is unchanged. `connectors/paper-send` stays the MCP + REST stub. `Telep-IO/api-gateway-app` is a legacy Vite frontend and is not this gateway.

## Path scheme

```
GET  /health                         → { ok, service: "muse-platform", connectors: N }
GET  /v1                             → connector index
GET  /v1/openapi.json                → merged OpenAPI
GET  /v1/{slug}                      → connector descriptor
GET|POST /v1/{slug}/...              → connector REST
GET|POST /mcp/{slug}                 → MCP streamable HTTP
POST /v1/billing/checkout            → Stripe Checkout helper
POST /v1/billing/webhook             → Stripe webhook helper
```

Catalog:

```
/  /connectors  /connectors/{slug}  /connectors/{slug}/docs  /connectors/{slug}/privacy  /connectors/{slug}/terms  /docs  /privacy  /terms
```

## API keys

Format: `muse_sk_{env}_{token}`

- `env` is `demo`, `test`, or `live`
- `token` is at least 8 alphanumeric characters
- Header: `Authorization: Bearer <key>`
- Configure via `MUSE_API_KEYS` (comma-separated)
- **Write routes** and job reads reject a missing/unknown key with `401`
- `GET /health`, `GET /v1`, OpenAPI, and connector descriptors are public

Do not commit live keys. Rotate by replacing the env var.

## Registry

`packages/registry` derives catalog cards from `connectors/index.ts`. Each connector's `listing.ts` holds `oneLiner`, `category`, `pricingBlurb`, `repoUrl?`, `howMuseUsesIt`, `examplePrompts`, `docs`, and `legal`. `slug`, `name`, and `status` (`submitted` | `building` | `ready` | `planned`) come from `defineConnector`, and paths are derived from the slug.

Do not list BarkMarks or CallCatch as catalog heroes.

## How to add a connector

Follow [`.claude/skills/add-muse-connector/SKILL.md`](.claude/skills/add-muse-connector/SKILL.md). In short: copy `connectors/fax-send` to `connectors/{slug}`, rename, add one line to `connectors/index.ts`, add the icon and `{PREFIX}_APP_MODE` env, then run `npm test`. `tests/connectors.test.ts` enforces the contract.

Fill [SUBMISSION.md](SUBMISSION.md) before sending Meta a listing. Use gateway URLs, not localhost. Never claim Meta partnership, endorsement, or directory placement unless Meta has actually listed the connector.

## Stripe

`packages/platform` exposes Checkout session create + webhook verification. They stay in **stub mode** unless `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are set. Use Stripe test mode until a connector is actually charging.

## Honesty

- Telep connectors are independent software. Meta’s Muse Connector Platform is Meta’s product.
- With `PAPER_SEND_APP_MODE` unset or `demo`, PaperSend jobs are in-memory stubs. `test`/`live` can verify a Lob key and store a draft. This gateway does not call Lob to create a letter.
- With `SUMVID_APP_MODE` unset or `demo`, summaries are hashed from the YouTube video id. `test`/`live` calls `POST {SUMVID_API_BASE_URL}/v1/summaries`.
- With `SHIPSIGNAL_APP_MODE` unset or `demo`, timelines are hashed from the tracking number. `test`/`live` calls AfterShip, Shippo, or EasyPost. No postage is purchased.
- Rate limiting is an in-memory stub. Replace before production load.
