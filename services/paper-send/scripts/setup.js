import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../src/config.js';
import { openStore } from '../src/store.js';

const directory = process.env.PAPERSEND_SETUP_DIR || '.deploy';
const readEnv = async name => Object.fromEntries((await readFile(join(directory, name), 'utf8').catch(() => '')).split('\n')
  .filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const oldRuntime = await readEnv('runtime.env'), oldSettings = await readEnv('settings.env');
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
rl.on('SIGINT', () => { rl.close(); process.exit(130); });
async function ask(label, previous = '', { secret = false, optional = false } = {}) {
  while (true) {
    process.stdout.write(`${label}${previous ? secret ? ' [saved; Enter keeps it]' : ` [${previous}]` : ''}: `);
    muted = secret;
    let answer;
    try { answer = (await rl.question('')).trim() || previous; }
    finally { muted = false; if (secret) process.stdout.write('\n'); }
    if (/[\r\n\x00]/.test(answer)) { console.log('Use a single-line value.'); continue; }
    if (answer || optional) return answer;
    console.log('This value is required.');
  }
}
async function save(name, entries) {
  const text = Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  const file = join(directory, name);
  await writeFile(`${file}.tmp`, text, { mode: 0o600 });
  await chmod(`${file}.tmp`, 0o600);
  await rename(`${file}.tmp`, file);
}

try {
  console.log('PaperSend VPS setup. Credentials stay in .deploy/ and are not printed.');
  console.log('Create a dedicated Neon database first. PDFs remain on the VPS.');
  const APP_MODE = await ask('Mode (demo, test, live)', oldRuntime.APP_MODE || 'demo');
  if (oldRuntime.APP_MODE && oldRuntime.APP_MODE !== APP_MODE) throw new Error('Use a separate checkout, Neon database, and deployment for a different mode.');
  const DOMAIN = await ask('Domain, without https://', oldSettings.DOMAIN);
  if (!/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(DOMAIN)) throw new Error('Enter a valid public domain name.');
  const DEPLOY_PROXY = await ask('HTTPS proxy (existing or caddy)', oldSettings.DEPLOY_PROXY || 'existing');
  if (!['existing', 'caddy'].includes(DEPLOY_PROXY)) throw new Error('Choose existing or caddy.');
  if (oldSettings.DEPLOY_PROXY && oldSettings.DEPLOY_PROXY !== DEPLOY_PROXY) throw new Error('Stop the existing deployment before changing proxy type; use a fresh deployment configuration.');
  const APP_PORT = await ask('Local app port (choose an unused port)', oldSettings.APP_PORT || '3000');
  if (!/^\d+$/.test(APP_PORT) || Number(APP_PORT) < 1024 || Number(APP_PORT) > 65535) throw new Error('App port must be 1024–65535.');
  const ACME_EMAIL = await ask('Certificate/support contact email', oldSettings.ACME_EMAIL);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ACME_EMAIL)) throw new Error('Enter a valid email address.');
  const runtime = { APP_MODE, BASE_URL: `https://${DOMAIN}`,
    DATABASE_URL: await ask('Neon connection URL (hidden)', oldRuntime.DATABASE_URL, { secret: true }),
    SUPPORT_EMAIL: await ask('Customer support email', oldRuntime.SUPPORT_EMAIL || ACME_EMAIL),
    BUSINESS_NAME: await ask('Display business name', oldRuntime.BUSINESS_NAME || 'PaperSend'),
  };
  // Neon supplies sslmode=require; explicitly verify both CA and hostname.
  try {
    const url = new URL(runtime.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
    url.searchParams.set('sslmode', 'verify-full');
    runtime.DATABASE_URL = url.toString();
  } catch { throw new Error('Enter the PostgreSQL connection URL from Neon.'); }
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'LOB_API_KEY']) {
    runtime[key] = APP_MODE === 'demo' ? '' : await ask(key + ' (hidden)', oldRuntime[key], { secret: true });
  }
  for (const key of ['LEGAL_BUSINESS_NAME', 'BUSINESS_ADDRESS', 'LOB_AUTHORIZATION_REFERENCE']) {
    runtime[key] = await ask(key + (APP_MODE === 'live' ? '' : ' (optional)'), oldRuntime[key], { optional: APP_MODE !== 'live' });
  }
  runtime.STRIPE_AUTOMATIC_TAX = oldRuntime.STRIPE_AUTOMATIC_TAX || 'false';
  runtime.STRIPE_TAX_CODE = oldRuntime.STRIPE_TAX_CODE || '';
  const config = readConfig(runtime);
  console.log('Checking database connection, schema, and mode isolation…');
  let db;
  try { db = await openStore(config); }
  catch { throw new Error('Database check failed. Check credentials, network, and that this database is dedicated to this mode. Configuration was not saved.'); }
  finally { if (db) await db.close(); }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await save('runtime.env', runtime);
  await save('settings.env', { DOMAIN, DEPLOY_PROXY, APP_PORT, ACME_EMAIL, PROJECT: `papersend-${APP_MODE}` });
  console.log('Configuration saved. Use make deploy for deployment and future updates.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { rl.close(); }
