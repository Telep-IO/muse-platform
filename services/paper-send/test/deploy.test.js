import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
async function deployment(t) {
  const root = await mkdtemp(join(tmpdir(), 'papersend-deploy-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'bin')); await mkdir(join(root, '.deploy'));
  await copyFile(new URL('../scripts/deploy.sh', import.meta.url), join(root, 'scripts/deploy.sh'));
  const settings = 'DOMAIN=mail.example.com\nDEPLOY_PROXY=existing\nAPP_PORT=39187\nACME_EMAIL=ops@example.com\nPROJECT=papersend-test\n';
  await writeFile(join(root, '.deploy/settings.env'), settings);
  await writeFile(join(root, '.deploy/runtime.env'), 'DATABASE_URL=postgresql://private-secret\n');
  await writeFile(join(root, 'bin/docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args)+'\\n');
if (args.join(' ') === 'compose version --short') console.log('2.39.0');
if (process.env.FAIL_PREFLIGHT && args.includes('scripts/preflight.js')) process.exit(1);
`, { mode: 0o755 });
  await writeFile(join(root, 'bin/ss'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, CALLS: join(root, 'calls') };
  return { root, env, settings, calls: async () => (await readFile(env.CALLS, 'utf8')).trim().split('\n').map(JSON.parse),
    run: extra => exec('bash', ['scripts/deploy.sh', 'deploy'], { cwd: root, env: { ...env, ...extra } }) };
}

test('repeat deployments preserve configuration and data and preflight before replacement', async t => {
  const d = await deployment(t);
  await d.run(); await d.run();
  const calls = await d.calls();
  assert.equal(calls.filter(args => args.includes('up')).length, 2);
  assert.ok(calls.findIndex(args => args.includes('scripts/preflight.js')) < calls.findIndex(args => args.includes('up')));
  assert.ok(calls.filter(args => args.includes('up')).every(args => args.includes('--wait') && args.includes('papersend-test')));
  assert.ok(!calls.some(args => args.some(arg => ['down', 'prune', 'rm', 'volume'].includes(arg))));
  assert.equal(await readFile(join(d.root, '.deploy/settings.env'), 'utf8'), d.settings);
  assert.ok(!JSON.stringify(calls).includes('private-secret'));
});

test('failed database preflight leaves the existing app running', async t => {
  const d = await deployment(t);
  await assert.rejects(d.run({ FAIL_PREFLIGHT: '1' }));
  const calls = await d.calls();
  assert.ok(calls.some(args => args.includes('scripts/preflight.js')));
  assert.ok(!calls.some(args => args.includes('up') || args.includes('stop') || args.includes('down')));
});
