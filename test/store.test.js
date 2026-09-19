import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fixture, consent } from './helpers.js';
import { openStore } from '../src/store.js';
import { createOrders } from '../src/orders.js';
import { documentDir } from '../src/documents.js';
import { readConfig } from '../src/config.js';

test('transaction rollback does not roll back an unrelated request', async t => {
  const f = await fixture(t), first = await f.draft(), second = await f.draft();
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const transaction = f.db.transaction(async tx => {
    await tx.prepare("UPDATE orders SET filename='rollback' WHERE id=?").run(first.id);
    entered(); await gate;
    throw new Error('Deliberate rollback');
  });
  const rejected = assert.rejects(transaction, /Deliberate rollback/);
  await ready;
  const unrelated = f.db.prepare("UPDATE orders SET filename='keep' WHERE id=?").run(second.id);
  release(); await rejected; await unrelated;
  assert.equal((await f.orders.get(first.id)).filename, 'letter.pdf');
  assert.equal((await f.orders.get(second.id)).filename, 'keep');
});

test('independent database connections cannot claim the same checkout or mailing', async t => {
  const f = await fixture(t), o = await f.draft();
  const secondDb = await openStore(f.config);
  try {
    const second = await createOrders(f.config, secondDb, f.providers, { now: () => 1700000000000 });
    const attempts = await Promise.allSettled([
      f.orders.checkout(o.id, o.token, consent(o)), second.checkout(o.id, o.token, consent(o)),
    ]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(f.counts().checkouts, 1);
    const payment = await f.payment(o);
    await Promise.all(Array.from({ length: 10 }, () => f.orders.recordPayment(payment)));
    await Promise.all([f.orders.work(), second.work()]);
    await Promise.all([f.orders.recordPayment(payment), second.recordPayment(payment)]);
    assert.equal((await second.get(o.id)).state, 'submitted');
    assert.equal(f.counts().sends, 1);
  } finally { await secondDb.close(); }
});

test('a refund works after PDF and address deletion using only retained payment records', async t => {
  const f = await fixture(t), o = await f.paid();
  await f.orders.work(); await f.orders.maintenance();
  f.advance(31 * 24 * 3600000); await f.orders.maintenance();
  const row = await f.orders.get(o.id);
  assert.equal(row.sender, '{}'); assert.equal(row.recipient, '{}');
  await assert.rejects(access(documentDir(f.config, o.id)));
  assert.equal(row.payment_id, `pi_${o.id}`);
  // Simulate a reconciled operator decision, not an automatic late cancellation.
  await f.db.prepare("UPDATE orders SET state='refund_pending' WHERE id=?").run(o.id);
  await f.orders.work();
  assert.equal((await f.orders.get(o.id)).state, 'refunded');
  assert.equal(f.counts().refunds, 1);
});

test('remote database configuration requires certificate and hostname verification', () => {
  assert.throws(() => readConfig({ DATABASE_URL: 'postgresql://user:pass@remote.example/db?sslmode=require' }), /verify-full/);
  assert.throws(() => readConfig({ DATABASE_URL: 'https://remote.example/db' }), /PostgreSQL/);
  assert.ok(readConfig({ DATABASE_URL: 'postgresql://user:pass@remote.example/db?sslmode=verify-full' }).databaseUrl);
});

test('retention does not delete an order that advances after selection and resumes interrupted deletion', async t => {
  const f = await fixture(t), advancing = await f.draft(), interrupted = await f.draft();
  f.advance(49 * 3600000);
  const prepare = f.db.prepare.bind(f.db);
  t.mock.method(f.db, 'prepare', sql => {
    const statement = prepare(sql);
    if (sql.startsWith('SELECT * FROM orders WHERE purged=2')) {
      return { ...statement, all: async (...args) => {
        const rows = await statement.all(...args);
        await prepare("UPDATE orders SET state='checkout' WHERE id=?").run(advancing.id);
        return rows;
      } };
    }
    return statement;
  });
  await prepare("UPDATE orders SET purged=2, state='expired' WHERE id=?").run(interrupted.id);
  await f.orders.maintenance();
  assert.equal((await f.orders.get(advancing.id)).purged, 0);
  await access(documentDir(f.config, advancing.id));
  assert.equal((await f.orders.get(interrupted.id)).purged, 1);
  assert.equal((await f.orders.get(interrupted.id)).recipient, '{}');
  await assert.rejects(access(documentDir(f.config, interrupted.id)));
});
