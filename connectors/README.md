# connectors/

Each Telep Muse connector gets a directory here.

```
connectors/{slug}/
  package.json          # @telep/{slug}
  src/index.ts          # REST handler + MCP handler + OpenAPI
```

Register metadata in `packages/registry` (catalog + routing). Wire the module in `lib/gateway.ts` (REST + MCP dispatch).

v0 implements **paper-send**, **sumvid**, **shipsignal**, **sign-send**, **fax-send**, **call-send**, **ink-send**, and **domain-send** as callable gateway modules (in-memory stubs).

These directories are the agent-facing gateway modules only (REST + MCP + OpenAPI). Express fulfillment for call-send, domain-send, fax-send, ink-send, and sign-send lives in [`services/`](../services/README.md). Those apps deploy separately, are not npm workspaces, and are not imported here. Live PaperSend mail stays in `Telep-IO/paper-send`.

See [FOUNDATION.md](../FOUNDATION.md) and [SUBMISSION.md](../SUBMISSION.md).
