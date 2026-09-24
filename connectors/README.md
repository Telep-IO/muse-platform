# connectors/

One folder per Telep Muse connector. Adding one = its folder + one line in [`index.ts`](index.ts). See [`.claude/skills/add-muse-connector/SKILL.md`](../.claude/skills/add-muse-connector/SKILL.md).

```
connectors/{slug}/src/
  index.ts       export { default } from "./connector"
  connector.ts   defineConnector({...}) → REST + MCP + OpenAPI (+ optional Stripe fulfill)
  listing.ts     catalog card, docs notes, privacy/terms
```

These are not npm packages. The tsconfig alias `@telep/{slug}` resolves to `connectors/{slug}/src/index.ts`. The registry, gateway dispatch, docs, legal pages, and billing webhook all read [`connectorModules`](index.ts). `tests/connectors.test.ts` checks every module here.

These directories are the agent-facing gateway modules only. Paid connectors hand off to Express fulfillment apps in [`services/`](../services/README.md) over `{PREFIX}_SERVICE_URL`. Those apps deploy separately and are never imported here.

See [FOUNDATION.md](../FOUNDATION.md) and [SUBMISSION.md](../SUBMISSION.md).
