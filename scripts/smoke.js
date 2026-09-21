// InkSend demo-mode smoke test: exercises the full state machine end to
// end without any external calls. Run with: npm run smoke
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { CONFIRMATION } from '../src/approval.js';

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dataDir = await mkdtemp(join(tmpdir(), 'inksend-smoke-'));
const config = readConfig({ APP_MODE: 'demo', BASE_URL: 'http://localhost:3999', DATA_DIR: dataDir });
const { letters, stop } = await createApp(config, { noRateLimit: true });

const addr = { name: 'Ana Rivera', address_line1: '123 Lake Ave', city: 'Cleveland', state: 'OH', zip: '44113' };

// 1. Validation: short message, bad ZIP, bad card rejected.
for (const [body, why] of [
  [{ message: 'too short', to: addr }, 'short message'],
  [{ message: 'This message is long enough to pass.', to: { ...addr, zip: 'not-a-zip' } }, 'bad zip'],
  [{ message: 'This message is long enough to pass.', to: addr, card: 'birthday' }, 'bad card'],
]) {
  let threw = false;
  try { await letters.create(body); } catch { threw = true; }
  assert(threw, `create should reject: ${why}`);
}
console.log('ok: validation rejects short message, bad ZIP, bad card');

// 2. Create a draft.
const draft = await letters.create({ message: 'Dear Ana,\n\nThank you for the wonderful weekend. Dinner was perfect.\n\n— Jon', to: addr, card: 'thank-you' });
assert(draft.state === 'draft' && draft.amount_cents === 399 && draft.token.length >= 32, 'draft fields');
assert(draft.review_hash && draft.review_url.includes(draft.id), 'draft review fields');
console.log('ok: draft created, $3.99 flat');

// 3. Wrong token rejected; stale review hash rejected at checkout.
let threw = false;
try { letters.view(draft.id, 'wrong-token'); } catch (e) { threw = e.status === 401; }
assert(threw, 'wrong token -> 401');
threw = false;
try {
  await letters.checkout(draft.id, draft.token, { confirmed: true, review_hash: 'stale', terms_version: draft.terms_version, privacy_version: draft.privacy_version, confirmation: CONFIRMATION });
} catch (e) { threw = e.status === 409; }
assert(threw, 'stale review_hash -> 409');
// Boolean-only confirmation rejected.
threw = false;
try {
  await letters.checkout(draft.id, draft.token, { confirmed: true, review_hash: draft.review_hash, terms_version: draft.terms_version, privacy_version: draft.privacy_version });
} catch { threw = true; }
assert(threw, 'missing confirmation wording rejected');
console.log('ok: token auth, stale hash, and confirmation wording enforced');

// 4. Demo checkout marks paid and the worker submits to the demo provider.
const co = await letters.checkout(draft.id, draft.token, { confirmed: true, review_hash: draft.review_hash, terms_version: draft.terms_version, privacy_version: draft.privacy_version, confirmation: CONFIRMATION });
assert(co.demo === true, 'demo checkout');
let v = letters.view(draft.id, draft.token);
assert(['paid', 'sending'].includes(v.state), `after demo checkout state is paid/sending, got ${v.state}`);
assert(v.sent === false, 'not sent yet');
console.log('ok: demo checkout -> paid, submitted to demo provider');

// 5. Duplicate checkout after paid is rejected.
threw = false;
try {
  await letters.checkout(draft.id, draft.token, { confirmed: true, review_hash: v.review_hash, terms_version: v.terms_version, privacy_version: v.privacy_version, confirmation: CONFIRMATION });
} catch (e) { threw = e.status === 409; }
assert(threw, 'second checkout -> 409');
console.log('ok: double checkout rejected');

// 6. Poll the worker until the demo provider accepts ('sent'). Demo timing:
// queued -> sending after 10s, -> sent after 60s.
for (let i = 0; i < 40; i++) {
  await letters.fulfillOnce();
  v = letters.view(draft.id, draft.token);
  if (v.state === 'sent') break;
  await sleep(2000);
}
assert(v.state === 'sent', `expected sent, got ${v.state}`);
assert(v.sent === true && v.provider_status === 'sent', 'sent flag + provider status');
console.log('ok: worker polled provider -> sent (accepted for mailing)');

// 7. Token never leaks in status responses.
assert(!('token' in v) && !('token_hash' in v), 'no token in view');
console.log('ok: token not leaked');

stop();
console.log('\nSMOKE OK');
