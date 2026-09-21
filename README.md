# Telep Muse platform

Catalog website + API gateway for Telep IO’s Muse connectors.

- Catalog: [muse.telep.io](https://muse.telep.io) (this Next.js app)
- Gateway: [api.muse.telep.io](https://api.muse.telep.io) (same deploy; Host contains `api.`)
- Contact: [jon@telep.io](mailto:jon@telep.io)

Telep IO builds **independent** connectors that work with [Muse](https://muse.ai/platform), Meta’s personal assistant. Telep is not affiliated with, endorsed by, or a partner of Meta. Users discover and connect products through Meta’s own review process.

## Architecture

One Next.js App Router app, with connector modules kept separate so the path to ~100 connectors stays obvious:

```
app/                    Catalog pages + gateway route handlers
packages/registry/      Typed connector catalog (source of truth)
packages/platform/      Auth, CORS, errors, rate-limit stub, OpenAPI merge, Stripe helpers, MCP HTTP
connectors/paper-send/  First callable module (REST + MCP + OpenAPI)
lib/gateway.ts          Dispatch: slug → module
middleware.ts           api.* host rewrites `/` → `/v1`
```

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

No secrets belong in git. Demo key `muse_sk_demo_localdev` is for docs try-it and smoke tests only.

## Vercel

1. Import `Telep-IO/muse-platform`.
2. Framework: Next.js. Root directory: repository root.
3. Set env vars for Production and Preview.
4. Production `NEXT_PUBLIC_CATALOG_URL=https://muse.telep.io` and `NEXT_PUBLIC_API_URL=https://api.muse.telep.io`.
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

PaperSend’s gateway routes are **callable stubs**. They do not print or mail. Live fulfillment remains in [paper-send](https://github.com/Telep-IO/paper-send) until the mail provider is wired here. “Submitted” means Telep filed the connector for Meta review — not that Muse listed it.
