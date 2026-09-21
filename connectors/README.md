# connectors/

Each Telep Muse connector gets a directory here.

```
connectors/{slug}/
  package.json          # @telep/{slug}
  src/index.ts          # REST handler + MCP handler + OpenAPI
```

Register metadata in `packages/registry` (catalog + routing). Wire the module in `lib/gateway.ts` (REST + MCP dispatch).

v0 implements **paper-send** as the first callable gateway module. Other connectors appear in the catalog and return `501` from the gateway until their modules land.

See [FOUNDATION.md](../FOUNDATION.md) and [SUBMISSION.md](../SUBMISSION.md).
