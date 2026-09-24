---
name: add-muse-connector
description: Add a new Telep Muse connector (gateway REST + MCP + OpenAPI + catalog card + legal pages) to muse-platform. Use when asked to add, scaffold, or port a connector, or to wire a paid connector into the Stripe billing webhook.
---

# Add a Muse connector

A connector is **one folder plus one line**. Catalog card, docs page, privacy/terms pages, REST routes, MCP tools, OpenAPI, and webhook dispatch are all derived from the module.

## Steps

1. **Copy the template.** `cp -r connectors/fax-send connectors/{slug}` (in-memory drafts, provider credential check, demo events). For a paid connector with SQLite drafts and a fulfillment service, copy `connectors/gift-send` instead.
2. **Rename.** In the new folder, replace `fax-send` / `FaxSend` / `FAX_SEND_` / `fax`/`faxes` with the new names. Delete what you do not need (`quote`, `demo`, `actions`, `account` are optional in `defineConnector`).
3. **Register.** One import + one array entry in `connectors/index.ts`. Array order is catalog order.
4. **Icon.** `docs/muse-connector/icons/{slug}.png`.
5. **Env.** Add `{PREFIX}_APP_MODE=demo` plus any provider keys to `.env.example` and `docs/VERCEL-ENV.md`. `PREFIX` is the slug uppercased with `-` → `_`.
6. **Category.** If `listing.category` is new, add it to `CONNECTOR_CATEGORIES` in `packages/registry/src/types.ts`.
7. **Verify.** `npx tsc --noEmit && npm test && npm run build`. `tests/connectors.test.ts` checks the new connector automatically. Do not add the slug to any test list.

Nothing else is edited: not `lib/gateway.ts`, not the registry, not `lib/legal.ts`, not `next.config.ts`, not `package.json`.

## Folder shape

```
connectors/{slug}/src/
  index.ts       export { default } from "./connector"; plus anything tests import
  connector.ts   defineConnector({ slug, name, status, listing, descriptor, gate, check, resource, ... }); export default
  listing.ts     catalog card + docs notes + legal (buildLegal)
  provider.ts    {slug}Runtime(env), assertReady, check{X}, descriptor — env reading and provider HTTP
  {items}.ts     types, memoryStore<T>() or withSqlite, create/validate, demoEvent
```

## Rules the conformance test enforces

- slug is kebab-case and matches the folder name.
- `listing.docs.createEndpoint` starts with `/v1/{slug}/`, and `createExampleBody` is valid JSON.
- `listing.legal` has privacy + terms and says the connector is independent of Meta. Use `buildLegal` so the standard sections come for free.
- OpenAPI paths stay under `/v1/{slug}`. MCP tool names are unique snake_case, and `check_credentials` exists (defineConnector adds it from `check`).
- **Demo mode makes no outbound HTTP.** `check` returns early when `mode === "demo"`. The test stubs `fetch` to throw.
- Creating an item without an API key returns 401.

## Honesty rules (not testable, still required)

- `status` is `building` until a real provider is wired and tested in live mode. Use `ready` only after that.
- Draft-first: create never spends money or sends anything. A human reviews and pays, and only the webhook moves an item to `paid`.
- Use `museFiling: "pending"` in legal until Meta has actually listed the connector. Never claim Meta approval or partnership.
- Provider HTTP goes through `providerRequest` from `@telep/platform`, never raw `fetch`.

## Paid connectors (Stripe → fulfillment)

1. Set `resource.checkout: { label, noun }` to get `POST /v1/{slug}/{items}/{id}/checkout`. It stamps `connector` and `jobId` into the Stripe session metadata automatically. Items need `id`, `status`, `amountCents`, and `currency`.
2. Add `fulfill` to `defineConnector`. The shared `/v1/billing/webhook` routes by `session.metadata.connector`:
   ```ts
   fulfill: (session) => fulfill{X}Payment(session),              // JSON hand-off to the service
   fulfill: (session, webhook) => fulfill{X}Payment(session, webhook), // forward the raw signed body
   ```
   Wrap it in a lambda. Passing the function directly binds `webhook` to its `env` parameter.
3. In `fulfill`, return `undefined` for other connectors, `{ fulfilled: false, reason: "demo" }` in demo, and `retry: true` on 5xx or in-flight so Stripe retries. Copy `connectors/gift-send/src/fulfill.ts`.
4. Store drafts with `withSqlite("{slug}", SCHEMA, env, db => ...)` from `@telep/platform`. It reads `{PREFIX}_APP_MODE` / `{PREFIX}_DATA_DIR` and refuses to reuse a DB across modes.
5. The fulfillment service lives in `services/{slug}` (Express, own lockfile, **not** a workspace, never imported by the app). Before calling the provider it must check that the paid amount, metadata, and livemode match the draft, then **claim the draft** (`INSERT INTO claims ... ON CONFLICT(draft_id) DO NOTHING`, with a lease). That way a redelivered webhook returns `duplicate`/`in_flight` instead of double-spending. See `fulfill()` in `services/gift-send/src/orders.js`.
6. Add `{PREFIX}_SERVICE_URL` / `{PREFIX}_SERVICE_TOKEN` to `.env.example` and `docs/VERCEL-ENV.md`.
