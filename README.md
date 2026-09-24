# Telep Muse platform

Catalog website + API gateway for Telep IO’s Muse connectors.

- Catalog: [muse.telep.io](https://muse.telep.io) (this Next.js app)
- Gateway: [api.muse.telep.io](https://api.muse.telep.io) (same deploy; Host contains `api.`)
- Contact: [jon@telep.io](mailto:jon@telep.io)

Telep IO builds **independent** connectors that work with [Muse](https://muse.ai/platform), Meta’s personal assistant. Telep is not affiliated with, endorsed by, or a partner of Meta. Users discover and connect products through Meta’s own review process.

## Architecture

One Next.js App Router app, with one folder per connector. Adding one is its folder plus one line in `connectors/index.ts` ([skill](.claude/skills/add-muse-connector/SKILL.md)):

```
app/                    Catalog pages + gateway route handlers (Vercel)
connectors/index.ts     The list of connector modules. Everything else derives from it.
connectors/{slug}/      One folder per connector: connector.ts (REST + MCP + OpenAPI), listing.ts (card + legal)
packages/registry/      Catalog types + cards derived from connectors/index.ts
packages/platform/      defineConnector, auth, CORS, errors, rate-limit, OpenAPI, Stripe, MCP, SQLite, legal builder
services/{slug}/        Express fulfillment apps (not workspaces; not in the Vercel build)
lib/gateway.ts          Dispatch: slug → connector module
middleware.ts           api.* host rewrites `/` → `/v1`
```

`services/` holds the Express fulfillment apps formerly published as standalone repos (`call-send`, `domain-send`, `fax-send`, `ink-send`, `paper-send`, `sign-send`). Each keeps its own `package.json` and lockfile. They are not npm workspaces and the Next.js app does not import them. PaperSend is the furthest along and is the one that ships a Dockerfile and compose files. Moving it under `services/paper-send` changes the code location only; where it is deployed does not change. See [services/README.md](services/README.md).

The legacy Vite frontend [Telep-IO/api-gateway-app](https://github.com/Telep-IO/api-gateway-app) is not this gateway.

Production is two hostnames, one Vercel project. Preview and local are one host: `/` is the catalog; `/v1`, `/mcp`, and `/health` are the gateway.

## Local run

Requires Node 20+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Gateway paths work on the same origin:

```sh
curl http://localhost:3000/health
curl http://localhost:3000/v1
curl -H "Authorization: Bearer muse_sk_demo_localdev" \
  -H "Content-Type: application/json" \
  -d '{"sender":{"name":"A","address_line1":"1 Main","address_city":"Cleveland","address_state":"OH","address_zip":"44113"},"recipient":{"name":"B","address_line1":"2 Main","address_city":"Cleveland","address_state":"OH","address_zip":"44114"},"document":{"pages":1}}' \
  http://localhost:3000/v1/paper-send/jobs
curl -H "Authorization: Bearer muse_sk_demo_localdev" \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  http://localhost:3000/v1/sumvid/summaries
curl -H "Authorization: Bearer muse_sk_demo_localdev" \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"1Z999AA10123456784"}' \
  http://localhost:3000/v1/shipsignal/parcels
```

```sh
npm test
npm run build
```

## Env vars

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CATALOG_URL` | Public catalog origin (local: `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | Public API origin (local: same; prod: `https://api.muse.telep.io`) |
| `MUSE_API_KEYS` | Comma-separated keys `muse_sk_{demo\|test\|live}_{token}` |
| `STRIPE_SECRET_KEY` | Optional. Without it, Checkout helpers return a stub URL |
| `STRIPE_WEBHOOK_SECRET` | Optional. Without it, `/v1/billing/webhook` acknowledges as a stub |

Connector keys (PaperSend, Sumvid, ShipSignal, SignSend, FaxSend, CallSend, InkSend, DomainSend) use namespaced prefixes so one Vercel project can hold them. Full list, Production values, and the Express-name mapping: [docs/VERCEL-ENV.md](docs/VERCEL-ENV.md).

No secrets belong in git. Demo key `muse_sk_demo_localdev` is for docs try-it and smoke tests only.

## Vercel

1. Import `Telep-IO/muse-platform`.
2. Framework: Next.js. Root directory: repository root.
3. Set env vars for Production and Preview from [docs/VERCEL-ENV.md](docs/VERCEL-ENV.md). Paste empty names, fill values in the dashboard, then **Redeploy**. Env edits do not apply to the current deployment.
4. Production `NEXT_PUBLIC_CATALOG_URL=https://muse.telep.io` and `NEXT_PUBLIC_API_URL=https://api.muse.telep.io`. Keep every `*_APP_MODE` at `demo` until gateway wiring lands.
5. Attach both domains to this project.

## Cloudflare DNS (Jonathan owns DNS)

Point both names at the same Vercel project. Typical Cloudflare setup:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `muse` | `<project>.vercel.app` (or Vercel-provided CNAME) | Proxied or DNS-only |
| CNAME | `api.muse` | same Vercel target | Proxied or DNS-only |

Then in Vercel → Project → Domains, add `muse.telep.io` and `api.muse.telep.io`. If Cloudflare is orange-cloud proxied, use SSL/TLS Full (strict) and do not flatten in a way that bypasses Vercel verification.

Checklist:

- [ ] `muse.telep.io` → this Vercel project
- [ ] `api.muse.telep.io` → this Vercel project
- [ ] Vercel domain list includes both
- [ ] After deploy, `curl https://api.muse.telep.io/health` returns `muse-platform`
- [ ] `curl https://muse.telep.io` returns the catalog HTML

## Conventions

See [FOUNDATION.md](FOUNDATION.md) for hostname, path, key format, and how to add a connector. See [SUBMISSION.md](SUBMISSION.md) when filing a connector with Meta.

## Status honesty

With `*_APP_MODE` unset or `demo`, PaperSend, Sumvid, ShipSignal, and the *-send connectors stay **in-memory stubs**. Set `test` or `live` plus that connector’s keys and the gateway calls the provider in-process: Lob auth, Sumvid summarize, ShipSignal tracking, e-sign/fax/Twilio/Handwrytten auth, and OpenSRS availability. Those calls still do not print mail, transmit faxes, place calls, order handwriting, send signature requests, or register domains. “Submitted” means Telep filed the connector for Meta review — not that Muse listed it. “Ready” means the module is callable on this gateway, not that Meta listed or endorsed it. Smoke commands: [docs/VERCEL-ENV.md](docs/VERCEL-ENV.md).
