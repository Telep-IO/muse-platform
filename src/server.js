import { execFileSync } from 'node:child_process';
import { readConfig } from './config.js';
import { openStore } from './store.js';
import { createProviders } from './providers.js';
import { createApp } from './app.js';

process.umask(0o077);
const config = readConfig();
for (const command of ['pdfinfo', 'pdftoppm']) execFileSync(command, ['-v'], { stdio: 'ignore' });
const db = await openStore(config);
const { app, envelopes } = await createApp(config, db, createProviders(config));
const server = app.listen(config.port, config.host, () => console.log(`SignSend (${config.mode}): ${config.baseUrl}`));
server.requestTimeout = 120000;
server.headersTimeout = 15000;
let working = false, maintaining = false;
const work = async () => { if (working) return; working = true; try { await envelopes.work(); } catch { console.error('Worker failed; retrying.'); } finally { working = false; } };
const maintain = async () => { if (maintaining) return; maintaining = true; try { await envelopes.maintenance(); } catch { console.error('Maintenance failed; retrying.'); } finally { maintaining = false; } };
const worker = setInterval(work, 5000), maintenance = setInterval(maintain, 60000);
void work(); void maintain();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  clearInterval(worker); clearInterval(maintenance);
  server.close(async () => { if (!working && !maintaining) { await db.close(); process.exit(0); } });
  // An interrupted request is recovered from its durable lease on restart.
  setTimeout(() => process.exit(0), 10000).unref();
});
