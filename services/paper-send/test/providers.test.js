import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, address, pdfBytes, consent } from './helpers.js';
import { createProviders } from '../src/providers.js';
import { documentDir } from '../src/documents.js';
import { sha256 } from '../src/approval.js';

test('Lob requests use real multipart content, stable idempotency, cover sheet, and internal-only verification', async t => {
  const f = await fixture(t, { stripeKey: 'sk_test_dummy', lobKey: 'test_dummy' }), o = await f.draft();
  const order = (await f.orders.get(o.id)), dir = documentDir(f.config, o.id);
  await mkdir(dir, { recursive: true }); const bytes = await pdfBytes(); await writeFile(join(dir, 'print.pdf'), bytes); order.document_sha256 = sha256(bytes);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('us_verifications')) return Response.json({ deliverability: 'deliverable', primary_line: '185 BERRY ST', secondary_line: 'STE 6600', components: { city: 'SAN FRANCISCO', state: 'CA', zip_code: '94107', zip_code_plus_4: '1234' } });
    return Response.json({ id: 'ltr_test123', expected_delivery_date: '2026-09-25' });
  });
  const provider = createProviders(f.config);
  const verified = await provider.verifyAddress(address);
  assert.deepEqual(verified, address); // No standardized address or provider report leaks to callers.
  await provider.sendLetter(order); await provider.sendLetter(order);
  for (const call of calls.slice(1)) {
    assert.equal(call.url, 'https://api.lob.com/v1/letters');
    assert.equal(call.options.headers['Idempotency-Key'], `letter-${order.id}`);
    assert.equal(call.options.body.get('address_placement'), 'insert_blank_page');
    assert.equal(call.options.body.get('double_sided'), 'false');
    assert.equal(call.options.body.get('color'), 'false');
    assert.equal(call.options.body.get('to[name]'), address.name);
    assert.equal(call.options.body.get('metadata[order_id]'), order.id);
    assert.ok(call.options.body.get('file') instanceof Blob);
  }
});
test('Lob undeliverable addresses cannot authorize fulfillment', async t => {
  const f = await fixture(t, { stripeKey: 'sk_test_dummy', lobKey: 'test_dummy' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ deliverability: 'deliverable_missing_unit' }));
  const provider = createProviders(f.config);
  await assert.rejects(provider.verifyAddress(address), /could not be verified/);
});
test('Stripe session request preserves approved price and order; retries share an idempotency key', async t => {
  const f = await fixture(t, { stripeKey: 'sk_test_dummy', lobKey: 'test_dummy' }), o = await f.draft();
  const provider = createProviders(f.config), row = { ...(await f.orders.get(o.id)), checkout_started: Date.now() };
  await f.orders.checkout(o.id, o.token, consent(o)); const approval = (await f.orders.approvalFor(o.id));
  const calls = [];
  t.mock.method(provider.stripe.checkout.sessions, 'create', async (...args) => { calls.push(args); return { id: 'cs_test' }; });
  await provider.checkout(row, o.token, approval); await provider.checkout(row, o.token, approval);
  assert.deepEqual(calls[0], calls[1]);
  const [request, options] = calls[0];
  assert.equal(request.line_items[0].price_data.unit_amount, o.amount);
  assert.equal(request.line_items[0].price_data.currency, 'usd');
  assert.equal(request.metadata.order_id, o.id);
  assert.equal(request.metadata.review_hash, approval.review_hash);
  assert.deepEqual(request.consent_collection, { terms_of_service: 'required' });
  assert.equal(request.client_reference_id, o.id);
  assert.equal(request.success_url, `${f.config.baseUrl}/#order=${o.id}.${o.token}`);
  assert.equal(options.idempotencyKey, `checkout-${o.id}`);
});
test('pending refunds are retrieved rather than replaying an eternally cached pending response', async t => {
  const f = await fixture(t, { stripeKey: 'sk_test_dummy', lobKey: 'test_dummy' }), provider = createProviders(f.config);
  t.mock.method(provider.stripe.refunds, 'create', async () => { throw new Error('Must retrieve existing refund'); });
  t.mock.method(provider.stripe.refunds, 'retrieve', async id => ({ id, status: 'succeeded' }));
  assert.equal((await provider.refund({ refund_id: 're_pending' })).status, 'succeeded');
});
