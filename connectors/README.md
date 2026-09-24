# connectors/

Each Telep Muse connector gets a directory here.

```
connectors/{slug}/
  package.json          # @telep/{slug}
  src/index.ts          # REST handler + MCP handler + OpenAPI
```

Register metadata in `packages/registry` (catalog + routing). Wire the module in `lib/gateway.ts` (REST + MCP dispatch).

v0 implements **paper-send**, **ship-label**, **sumvid**, **shipsignal**, **sign-send**, **fax-send**, **call-send**, **ink-send**, **domain-send**, and **print-merch** as callable gateway modules. ShipLabel and PrintMerch demo drafts are stored in SQLite. PrintMerch demo mode does not call Printify. The other modules are in-memory stubs.

These directories are the agent-facing gateway modules only (REST + MCP + OpenAPI). Express fulfillment for call-send, domain-send, fax-send, ink-send, paper-send, print-merch, ship-label, and sign-send lives in [`services/`](../services/README.md). Those apps deploy separately, are not npm workspaces, and are not imported here. PaperSend's Express app is `services/paper-send`. ShipLabel's Express app is `services/ship-label`. PrintMerch's Express app is `services/print-merch`. The gateway calls ShipLabel over `SHIP_LABEL_SERVICE_URL` and PrintMerch over `PRINT_MERCH_SERVICE_URL` in test and live.

See [FOUNDATION.md](../FOUNDATION.md) and [SUBMISSION.md](../SUBMISSION.md).
