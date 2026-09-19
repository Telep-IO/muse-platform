import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, input, consent } from './helpers.js';
import { ProviderError } from '../src/providers.js';
import { readConfig } from '../src/config.js';
import { openStore } from '../src/store.js';
import { createOrders } from '../src/orders.js';

test('pricing is server-controlled; address schema rejects unknown fields and non-US addresses', async t => {
  const f = await fixture(t), o = await f.draft();
  assert.equal(o.amount, 524);
  await assert.rejects(f.orders.create({ ...input, amount: 1 }, {}));
  await assert.rejects(f.orders.create({ ...input, recipient: { ...input.recipient, address_country: 'CA' } }, {}));
  await assert.rejects(f.orders.create({ ...input, recipient: { ...input.recipient, address_state: 'ZZ' } }, {}));
});
test('unguessable token protects orders; only the hash is stored', async t => {
  const f = await fixture(t), o = await f.draft();
  assert.equal(o.token.length, 43);
  await assert.rejects(async () => (await f.orders.authorized(o.id, 'wrong')), { status: 404 });
  await assert.rejects(async () => (await f.orders.authorized(o.id, '')), { status: 404 });
  assert.ok(!JSON.stringify((await f.orders.get(o.id))).includes(o.token));
  assert.equal((await f.orders.authorized(o.id, o.token)).id, o.id);
});
test('consent is required and concurrent checkout attempts create one session', async t => {
  const f = await fixture(t), o = await f.draft();
  await assert.rejects(f.orders.checkout(o.id, o.token, false), { status: 400 });
  const results = await Promise.allSettled([f.orders.checkout(o.id, o.token, consent(o)), f.orders.checkout(o.id, o.token, consent(o))]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(f.counts().checkouts, 1);
  await f.orders.checkout(o.id, o.token, consent(o));
  assert.equal(f.counts().checkouts, 1);
});
test('forged payment amounts, currency, mode, session, and reference never authorize mail', async t => {
  const f = await fixture(t), o = await f.draft(); await f.orders.checkout(o.id, o.token, consent(o));
  for (const override of [{ amount_subtotal: 1 }, { currency: 'eur' }, { livemode: true }, { id: 'cs_bad' }, { client_reference_id: 'wrong' }, { mode: 'subscription' }, { payment_intent: null }]) {
    await assert.rejects(async () => (await f.orders.recordPayment(await f.payment(o, override))), { status: 400 });
  }
  (await f.orders.recordPayment(await f.payment(o, { payment_status: 'unpaid' })));
  await f.orders.work(); assert.equal(f.counts().sends, 0);
});
test('duplicate payment events and parallel workers produce one mailing', async t => {
  const f = await fixture(t), o = await f.paid();
  for (let n = 0; n < 5; n++) (await f.orders.recordPayment(await f.payment(o)));
  await Promise.all([f.orders.work(), f.orders.work(), f.orders.work()]);
  assert.equal(f.counts().sends, 1); assert.equal((await f.orders.get(o.id)).state, 'submitted');
  (await f.orders.recordPayment(await f.payment(o))); await f.orders.work(); assert.equal(f.counts().sends, 1);
});
test('uncertain printer response retries the same order, without refunding or duplicate fulfillment', async t => {
  const f = await fixture(t), o = await f.paid(), ids = [];
  f.providers.sendLetter = async row => { ids.push(row.id); if (ids.length === 1) throw new Error('Timeout after provider accepted request'); return { id: 'ltr_recovered' }; };
  await f.orders.work(); assert.equal((await f.orders.get(o.id)).state, 'sending');
  assert.equal(f.counts().refunds, 0);
  f.advance(20000); await f.orders.work();
  assert.deepEqual(ids, [o.id, o.id]); assert.equal((await f.orders.get(o.id)).lob_id, 'ltr_recovered');
});
test('ambiguous sends stop before idempotency expiry', async t => {
  const f = await fixture(t), o = await f.paid();
  f.providers.sendLetter = async () => { throw new Error('Timeout'); };
  await f.orders.work(); f.advance(24 * 3600000); await f.orders.work();
  assert.equal((await f.orders.get(o.id)).state, 'needs_review'); assert.equal((await f.orders.get(o.id)).attempts, 1);
  assert.equal(f.counts().refunds, 0);
});
test('a new process recovers a crashed worker lease from the persisted database', async t => {
  const f = await fixture(t), o = await f.paid(), now = Date.now();
  (await f.db.prepare("UPDATE orders SET state='sending', lease_until=?, first_attempt=? WHERE id=?").run(now - 1, now - 180000, o.id));
  const recoveredDb = await openStore(f.config);
  try {
    const recovered = await createOrders(f.config, recoveredDb, f.providers);
    await recovered.work();
    assert.equal((await recovered.get(o.id)).state, 'submitted'); assert.equal(f.counts().sends, 1);
  } finally { await recoveredDb.close(); }
});
test('definitive rejection refunds once; 429 and 409 are retryable', async t => {
  const f = await fixture(t), o = await f.paid();
  assert.equal(new ProviderError('Rate limit', 429).rejected, false);
  assert.equal(new ProviderError('In progress', 409).rejected, false);
  f.providers.sendLetter = async () => { throw new ProviderError('Rejected', 422); };
  await f.orders.work(); assert.equal((await f.orders.get(o.id)).state, 'refund_pending');
  await Promise.all([f.orders.work(), f.orders.work()]);
  assert.equal((await f.orders.get(o.id)).state, 'refunded'); assert.equal(f.counts().refunds, 1);
  (await f.orders.recordPayment(await f.payment(o))); await f.orders.work(); assert.equal(f.counts().refunds, 1);
});
test('signed payment can be recovered by server-side checkout reconciliation', async t => {
  const f = await fixture(t), o = await f.draft(); await f.orders.checkout(o.id, o.token, consent(o));
  f.sessions.set(`cs_${o.id}`, await f.payment(o));
  assert.equal((await f.orders.status(o.id, o.token)).state, 'paid');
  await f.orders.work(); assert.equal(f.counts().sends, 1);
});
test('retention purges abandoned and completed PII, but keeps unresolved orders', async t => {
  const f = await fixture(t), draft = await f.draft(), paid = await f.paid();
  f.advance(49 * 3600000); await f.orders.maintenance();
  assert.equal((await f.orders.get(draft.id)).purged, 1); assert.equal((await f.orders.get(draft.id)).sender, '{}');
  assert.equal((await f.orders.get(paid.id)).purged, 0);
});
test('mode isolation and live configuration fail closed', async t => {
  assert.throws(() => readConfig({ APP_MODE: 'live' }), /HTTPS/);
  assert.throws(() => readConfig({ APP_MODE: 'test', STRIPE_SECRET_KEY: 'sk_live_wrong' }), /test secret/);
  assert.throws(() => readConfig({ APP_MODE: 'live', BASE_URL: 'https://example.com', STRIPE_SECRET_KEY: 'sk_live_ok', LOB_API_KEY: 'test_wrong' }), /Lob live/);
  const f = await fixture(t); await assert.rejects(async () => await openStore({ ...f.config, mode: 'live' }), /separate (DATA_DIR|database)/);
});
test('an asynchronous Lob rendering failure queues a refund after initial acceptance', async t => {
  const f = await fixture(t), o = await f.paid();
  await f.orders.work(); assert.equal((await f.orders.get(o.id)).state, 'submitted');
  f.providers.letterStatus = async () => 'failed';
  await f.orders.maintenance(); assert.equal((await f.orders.get(o.id)).state, 'refund_pending');
  await f.orders.work(); assert.equal((await f.orders.get(o.id)).state, 'refunded'); assert.equal(f.counts().refunds, 1);
});
