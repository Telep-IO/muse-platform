import { readConfig } from "./config.js";
import { openStore } from "./store.js";
import { createProviders } from "./providers.js";
import { createApp } from "./app.js";

process.umask(0o077);
const config = readConfig();
const db = await openStore(config);
const { app } = await createApp(config, db, createProviders(config));
const server = app.listen(config.port, config.host, () => {
  console.log(`ShipLabel (${config.mode}) listening on ${config.host}:${config.port}`);
});
server.requestTimeout = 120000;
server.headersTimeout = 15000;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
