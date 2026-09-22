import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { fixture, input, consent, fakePrepare } from './helpers.js';
import { createOrders } from '../src/orders.js';
import { createApp } from '../src/app.js';
import { createProviders } from '../src/providers.js';
import { readConfig } from '../src/config.js';
import { documentDir } from '../src/documents.js';
import { sha256 } from '../src/approval.js';

test('a boolean alone and stale review or policy fingerprints cannot start checkout', async t => {
  const f = await fixture(t), o = await f.draft();
  await assert.rejects(f.orders.checkout(o.id, o.token, { confirmed: true }), { status: 409 });
  for (const key of ['review_hash', 'terms_version', 'privacy_version']) {
    await assert.rejects(f.orders.checkout(o.id, o.token, { ...consent(o), [key]: 'stale' }), { status: 409 });
  }
  assert.equal(f.counts().checkouts, 0); assert.equal((await f.orders.approvalFor(o.id)), undefined);
});
test('approval preserves exact policy HTML, document hash, address fingerprint, price and timestamp without duplicating PII', async t => {
  const f = await fixture(t), o = await f.draft();
  await f.orders.checkout(o.id, o.token, consent(o));
  const approval = (await f.orders.approvalFor(o.id)), evidence = JSON.parse(approval.evidence);
  assert.equal(evidence.document_sha256, (await f.orders.get(o.id)).document_sha256);
  assert.equal(evidence.amount, o.amount); assert.equal(evidence.addresses_sha256.length, 64);
  assert.equal(approval.accepted_at, (await f.orders.get(o.id)).consent_at);
  assert.ok(!approval.evidence.includes(input.recipient.address_line1));
  const policy = (await f.db.prepare('SELECT html FROM policies WHERE version=?').get(approval.terms_version));
  assert.equal(sha256(policy.html), approval.terms_version);
  await assert.rejects(async () => (await f.db.prepare('UPDATE approvals SET accepted_at=0 WHERE order_id=?').run(o.id)), /immutable/);
  await assert.rejects(async () => (await f.db.prepare("UPDATE policies SET html='changed' WHERE version=?").run(approval.terms_version)), /immutable/);
  f.advance(10000); await f.orders.checkout(o.id, o.token, consent(o));
  assert.deepEqual((await f.orders.approvalFor(o.id)), approval);
});
test('policy changes invalidate unapproved drafts but preserve already accepted versions', async t => {
  const f = await fixture(t), approved = await f.draft(), draft = await f.draft();
  await f.orders.checkout(approved.id, approved.token, consent(approved));
  const changed = await createOrders({ ...f.config, legalBusinessName: 'New operator identity' }, f.db, f.providers);
  assert.notEqual(changed.policies.terms_version, draft.terms_version);
  await assert.rejects(changed.checkout(draft.id, draft.token, consent(draft)), { status: 409 });
  assert.equal((await changed.status(approved.id, approved.token)).terms_version, approved.terms_version);
});
test('changed PDF is blocked before payment and after payment before any provider call', async t => {
  const f = await fixture(t), draft = await f.draft();
  await writeFile(join(documentDir(f.config, draft.id), 'print.pdf'), 'tampered');
  await assert.rejects(f.orders.checkout(draft.id, draft.token, consent(draft)), { status: 409 });
  const paid = await f.paid();
  await writeFile(join(documentDir(f.config, paid.id), 'print.pdf'), 'tampered');
  const real = createProviders({ ...f.config, mode: 'demo' });
  f.providers.sendLetter = real.sendLetter;
  await f.orders.work(); assert.equal((await f.orders.get(paid.id)).state, 'needs_review');
  assert.equal((await f.orders.get(paid.id)).lob_id, null);
});
test('changed address after approval is held even when Stripe confirms the original payment', async t => {
  const f = await fixture(t), o = await f.draft(); await f.orders.checkout(o.id, o.token, consent(o));
  (await f.db.prepare('UPDATE orders SET recipient=? WHERE id=?').run(JSON.stringify({ ...input.recipient, address_line1: 'Different recipient address' }), o.id));
  (await f.orders.recordPayment(await f.payment(o)));
  assert.equal((await f.orders.get(o.id)).state, 'needs_review');
  assert.equal((await f.orders.get(o.id)).payment_id, `pi_${o.id}`);
  await f.orders.work(); assert.equal(f.counts().sends, 0);
});
test('missing Stripe terms acceptance, wrong approval fingerprint and inconsistent totals cannot release mail', async t => {
  const f = await fixture(t), o = await f.draft(); await f.orders.checkout(o.id, o.token, consent(o));
  for (const overrides of [{ consent: null }, { metadata: { order_id: o.id, review_hash: 'wrong' } }, { amount_total: 1 }, { amount_total: o.amount + 1, total_details: { amount_tax: 1 } }]) {
    await assert.rejects(async () => (await f.orders.recordPayment(await f.payment(o, overrides))), { status: 400 });
  }
  await f.orders.work(); assert.equal(f.counts().sends, 0);
});
test('approved tax configuration survives runtime config changes and paid totals are recorded', async t => {
  const f = await fixture(t, { automaticTax: true, taxCode: 'txcd_test' }), o = await f.draft();
  await f.orders.checkout(o.id, o.token, consent(o));
  f.config.automaticTax = false;
  (await f.orders.recordPayment(await f.payment(o, { amount_total: o.amount + 42, total_details: { amount_tax: 42 } })));
  assert.equal((await f.orders.get(o.id)).payment_total, o.amount + 42);
  assert.equal((await f.orders.get(o.id)).payment_tax, 42);
  await f.orders.work(); assert.equal((await f.orders.get(o.id)).state, 'submitted');
});
test('legacy paid orders without evidence are held, never backfilled as if approved', async t => {
  const f = await fixture(t), o = await f.draft();
  (await f.db.prepare("UPDATE orders SET state='paid', document_sha256=NULL WHERE id=?").run(o.id));
  await f.orders.work(); assert.equal((await f.orders.get(o.id)).state, 'needs_review'); assert.equal(f.counts().sends, 0);
});
test('retention removes address/document data first, then resolved approval evidence; unresolved evidence remains', async t => {
  const f = await fixture(t), resolved = await f.paid(); await f.orders.work(); await f.orders.maintenance();
  const unresolved = await f.paid();
  f.advance(31 * 24 * 3600000); await f.orders.maintenance();
  assert.equal((await f.orders.get(resolved.id)).sender, '{}'); assert.ok((await f.orders.approvalFor(resolved.id)));
  f.advance(150 * 24 * 3600000); await f.orders.maintenance();
  assert.equal((await f.orders.approvalFor(resolved.id)), undefined);
  assert.ok((await f.orders.approvalFor(unresolved.id)));
});
test('API discards provider-derived address output even if verification returns it', async t => {
  const f = await fixture(t);
  f.providers.verifyAddress = async () => ({ address_line1: 'PROVIDER-ONLY DATA', confidence: 100 });
  const o = await f.draft(); assert.deepEqual(o.recipient, input.recipient);
  assert.ok(!JSON.stringify(o).includes('PROVIDER-ONLY'));
});
test('live configuration requires real operator details and a Lob authorization reference', () => {
  const env = { APP_MODE: 'live', BASE_URL: 'https://example.com', STRIPE_SECRET_KEY: 'sk_live_example', LOB_API_KEY: 'live_example', STRIPE_WEBHOOK_SECRET: 'whsec_example', SUPPORT_EMAIL: 'help@example.com' };
  assert.throws(() => readConfig(env), /LEGAL_BUSINESS_NAME/);
  env.LEGAL_BUSINESS_NAME = 'Example operator'; assert.throws(() => readConfig(env), /BUSINESS_ADDRESS/);
  env.BUSINESS_ADDRESS = 'Business contact address'; assert.throws(() => readConfig(env), /LOB_AUTHORIZATION_REFERENCE/);
  env.LOB_AUTHORIZATION_REFERENCE = 'Agreement reference'; assert.equal(readConfig(env).mode, 'live');
});
test('policy routes serve escaped operator identity and immutable accepted versions without leaking templates', async t => {
  const f = await fixture(t, { legalBusinessName: '<script>alert(1)</script>', businessAddress: 'Operator contact address', supportEmail: 'help@example.com' });
  const { app, orders } = await createApp(f.config, f.db, f.providers, { noRateLimit: true, prepare: fakePrepare });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const current = await (await fetch(`${origin}/terms.html`)).text();
  assert.ok(current.includes('&lt;script&gt;')); assert.ok(!current.includes('{{OPERATOR}}'));
  const archived = await fetch(`${origin}/policies/terms/${orders.policies.terms_version}`);
  assert.equal(await archived.text(), current); assert.match(archived.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(`${origin}/policies/privacy/${orders.policies.terms_version}`)).status, 404);
});
