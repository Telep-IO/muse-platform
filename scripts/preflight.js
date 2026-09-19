import { readConfig } from '../src/config.js';
import { openStore } from '../src/store.js';
try {
  const config = readConfig();
  if (!config.databaseUrl) throw new Error('Deployment requires DATABASE_URL.');
  const db = await openStore(config);
  await db.close();
  console.log('Configuration and PostgreSQL preflight passed.');
} catch {
  console.error('Preflight failed. Check configuration, PostgreSQL connectivity, and database mode. The existing app has not been replaced.');
  process.exitCode = 1;
}
