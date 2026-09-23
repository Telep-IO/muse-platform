# connectors/

Each Telep Muse connector gets a directory here.

```
connectors/{slug}/
  package.json          # @telep/{slug}
  src/index.ts          # REST handler + MCP handler + OpenAPI
```

Register metadata in `packages/registry` (catalog + routing). Wire the module in `lib/gateway.ts` (REST + MCP dispatch).

v0 implements **paper-send**, **sumvid**, **shipsignal**, **sign-send**, **fax-send**, **call-send**, **ink-send**, and **domain-send** as callable gateway modules. Unset or `demo` mode is an in-memory stub.

These directories are the agent-facing gateway modules (REST + MCP + OpenAPI). Express apps for call-send, domain-send, fax-send, ink-send, paper-send, and sign-send live in [`services/`](../services/README.md). Those apps are not npm workspaces, are not imported here, and Vercel does not deploy them. PaperSend paid send runs in this gateway when `PAPER_SEND_APP_MODE` is `test` or `live` and the Stripe webhook has confirmed payment. `services/paper-send` is still the optional Express app, not a requirement for that path.

See [FOUNDATION.md](../FOUNDATION.md) and [SUBMISSION.md](../SUBMISSION.md).
