import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { rm, readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { prepareDocument, documentDir } from './documents.js';
import { CONFIRMATION, canonical, sha256, registerPolicies, reviewEvidence, reviewHash } from './approval.js';

const text = (max) => z.string().trim().min(1).max(max).refine(s => !/[\x00-\x1f\x7f]/.test(s), 'Remove control characters.');
const states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const addressSchema = z.object({
  name: text(40), address_line1: text(64), address_line2: z.string().trim().max(64).regex(/^[^\x00-\x1f\x7f]*$/).default(''),
  address_city: text(40), address_state: z.string().trim().toUpperCase().refine(s => states.includes(s), 'Select a US state.'),
  address_zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code.'), address_country: z.literal('US').default('US'),
}).strict();
export const addressesSchema = z.object({ sender: addressSchema, recipient: addressSchema }).strict();
export const priceForPages = pages => 499 + (pages - 1) * 25;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const fail = (status, message) => Object.assign(new Error(message), { status });
const HOUR = 3600000;

export async function createOrders(config, db, providers, { now = Date.now, prepare = prepareDocument } = {}) {
  const policies = await registerPolicies(config, db);
  const get = async id => await db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  const approvalFor = async id => await db.prepare('SELECT * FROM approvals WHERE order_id=?').get(id);
  async function evidenceFor(order) {
    const existing = await approvalFor(order.id);
    return existing ? JSON.parse(existing.evidence) : reviewEvidence(order, config, policies);
  }
  async function intactApproval(order) {
    const approved = await approvalFor(order.id);
    if (!approved || !order.document_sha256) return false;
    const evidence = JSON.parse(approved.evidence);
    const actual = reviewEvidence(order, { automaticTax: evidence.automatic_tax, taxCode: evidence.tax_code },
      { terms_version: approved.terms_version, privacy_version: approved.privacy_version });
    // Preserve the exact accepted wording across application upgrades.
    actual.confirmation_sha256 = sha256(approved.confirmation);
    return reviewHash(actual) === approved.review_hash;
  }
  async function update(id, values) {
    const fields = { ...values, updated_at: now() };
    await db.prepare(`UPDATE orders SET ${Object.keys(fields).map(k => `${k}=?`).join(',')} WHERE id=?`).run(...Object.values(fields), id);
  }
  async function authorized(id, token = '') {
    const order = await get(id);
    if (!order || token.length > 128 || !timingSafeEqual(Buffer.from(order.token_hash, 'hex'), Buffer.from(hashToken(token), 'hex'))) throw fail(404, 'Order not found. Open your private order link.');
    return order;
  }
  async function view(order) {
    const { id, state, pages, amount, filename, lob_id, expected_delivery, purged, created_at } = order;
    const evidence = await evidenceFor(order);
    return { id, state, pages, amount, filename, lob_id, expected_delivery, purged: !!purged, created_at,
      review_hash: reviewHash(evidence), terms_version: evidence.terms_version, privacy_version: evidence.privacy_version,
      payment_total: order.payment_total, payment_tax: order.payment_tax,
      confirmation: (await approvalFor(id))?.confirmation || CONFIRMATION,
      sender: JSON.parse(order.sender), recipient: JSON.parse(order.recipient), mode: config.mode };
  }
  async function create(input, file) {
    const addresses = addressesSchema.parse(input);
    if (!file) throw fail(400, 'Choose a PDF first.');
    if ((await db.prepare('SELECT count(*) AS count FROM orders WHERE purged=0').get()).count >= 500) throw fail(503, 'Upload capacity reached. Please try again later.');
    const id = randomUUID(), token = randomBytes(32).toString('base64url');
    let inserting = false;
    try {
      const pages = await prepare(config, id, file.buffer);
      const documentHash = sha256(await readFile(join(documentDir(config, id), 'print.pdf')));
      await Promise.all([providers.verifyAddress(addresses.sender), providers.verifyAddress(addresses.recipient)]);
      // Store and show only customer-supplied addresses, never verification data.
      const { sender, recipient } = addresses;
      inserting = true;
      await db.prepare(`INSERT INTO orders (id, token_hash, created_at, updated_at, pages, amount, sender, recipient, document_sha256, filename)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, hashToken(token), now(), now(), pages, priceForPages(pages), JSON.stringify(sender), JSON.stringify(recipient), documentHash,
          file.originalname.replace(/[\x00-\x1f\x7f/\\]/g, '').slice(0, 120) || 'document.pdf');
      return { ...await view(await get(id)), token, review_url: `${config.baseUrl}/#order=${id}.${token}` };
    } catch (error) {
      // A remote INSERT can commit even if its response is lost. Keep files for
      // recovery/retention once insertion starts; never strand a committed order.
      if (!inserting) await rm(documentDir(config, id), { recursive: true, force: true });
      throw error;
    }
  }
  async function checkout(id, token, confirmation) {
    const order = await authorized(id, token);
    if (confirmation?.confirmed !== true) throw fail(400, 'Confirm the document and addresses before payment.');
    if (!['draft', 'checkout'].includes(order.state) || order.purged) throw fail(409, 'This order is already paid or closed.');
    if (!order.document_sha256) throw fail(409, 'This draft predates approval verification. Please create a new draft.');
    const evidence = await evidenceFor(order), fingerprint = reviewHash(evidence);
    if (confirmation.review_hash !== fingerprint || confirmation.terms_version !== evidence.terms_version || confirmation.privacy_version !== evidence.privacy_version) throw fail(409, 'The review or policies have changed. Refresh and review this order again.');
    if (await approvalFor(id) && !await intactApproval(order)) throw fail(409, 'The approved order has changed. Contact support before paying.');
    if (sha256(await readFile(join(documentDir(config, id), 'print.pdf'))) !== order.document_sha256) throw fail(409, 'The print document has changed. Please create a new draft.');
    if (now() - order.created_at > 48 * HOUR) throw fail(410, 'This draft has expired. Please start again.');
    if (order.session_id) {
      const session = await providers.stripe.checkout.sessions.retrieve(order.session_id);
      if (session.status !== 'open') { await reconcile(order); throw fail(409, 'Checkout has completed or expired. Refresh the order status.'); }
      return { url: order.checkout_url };
    }
    if (order.checkout_started && now() - order.checkout_started > 30 * 60000) throw fail(409, 'Checkout could not be recovered safely. Please start a new order.');
    await db.transaction(async tx => {
      const claimed = await tx.prepare(`UPDATE orders SET state='checkout', consent_at=COALESCE(consent_at, ?), checkout_started=COALESCE(checkout_started, ?), lease_until=?, updated_at=?
        WHERE id=? AND state IN ('draft','checkout') AND session_id IS NULL AND lease_until<=?`).run(now(), now(), now() + 120000, now(), id, now());
      if (!claimed.changes) throw fail(409, 'Checkout is being prepared. Please try again shortly.');
      await tx.prepare(`INSERT INTO approvals (order_id, accepted_at, terms_version, privacy_version, confirmation, evidence, review_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(id, now(), evidence.terms_version, evidence.privacy_version, CONFIRMATION, canonical(evidence), fingerprint);
    });
    if (config.mode === 'demo') {
      await update(id, { state: 'paid', payment_id: `demo_${id}`, lease_until: 0 });
      await work();
      return { url: `${config.baseUrl}/#order=${id}.${token}` };
    }
    try {
      const session = await providers.checkout(await get(id), token, await approvalFor(id));
      if (!session.id || !session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Unexpected checkout response.');
      await update(id, { session_id: session.id, checkout_url: session.url, lease_until: 0 });
      return { url: session.url };
    } catch {
      await update(id, { lease_until: 0 });
      throw fail(503, 'Payment checkout is temporarily unavailable. Your card has not been charged here. Please retry.');
    }
  }
  async function recordPayment(session) {
    const order = await get(session.metadata?.order_id);
    if (!order || order.session_id !== session.id) throw fail(400, 'Unknown checkout session.');
    if (session.payment_status !== 'paid') return;
    if (session.mode !== 'payment' || session.currency !== 'usd' || session.amount_subtotal !== order.amount ||
      session.livemode !== (config.mode === 'live') || !session.payment_intent || session.client_reference_id !== order.id) throw fail(400, 'Payment details do not match this order.');
    if (order.state !== 'checkout') return;
    const approval = await approvalFor(order.id), tax = session.total_details?.amount_tax ?? 0;
    if (!approval || session.metadata.review_hash !== approval.review_hash || session.consent?.terms_of_service !== 'accepted' ||
      !Number.isSafeInteger(tax) || tax < 0 || session.amount_total !== order.amount + tax || (!JSON.parse(approval.evidence).automatic_tax && tax !== 0)) throw fail(400, 'Payment approval does not match this order.');
    const intact = await intactApproval(order);
    // A concurrent webhook/reconciliation must never regress a worker's state.
    await db.prepare(`UPDATE orders SET state=?, payment_id=?, payment_total=?, payment_tax=?,
      checkout_url=NULL, lease_until=0, error=?, updated_at=? WHERE id=? AND state='checkout'`)
      .run(intact ? 'paid' : 'needs_review', session.payment_intent, session.amount_total, tax,
        intact ? null : 'Paid order differs from its approval; do not send.', now(), order.id);
  }
  async function reconcile(order) {
    if (order.state !== 'checkout' || !order.session_id || config.mode === 'demo') return;
    const session = await providers.stripe.checkout.sessions.retrieve(order.session_id);
    if (session.payment_status === 'paid') await recordPayment(session);
    else if (session.status === 'expired') await db.prepare("UPDATE orders SET state='expired', checkout_url=NULL, updated_at=? WHERE id=? AND state='checkout'").run(now(), order.id);
  }
  async function status(id, token) {
    const order = await authorized(id, token);
    try { await reconcile(order); } catch { /* Webhook/worker will retry; don't hide the order. */ }
    return view(await get(id));
  }
  async function work() {
    // Database compare-and-set is the ownership boundary, even with concurrent ticks.
    const due = await db.prepare(`SELECT id FROM orders WHERE state IN ('paid','sending','refund_pending') AND next_attempt<=? AND lease_until<=? LIMIT 10`).all(now(), now());
    for (const { id } of due) {
      const claimed = await db.prepare(`UPDATE orders SET lease_until=? WHERE id=? AND state IN ('paid','sending','refund_pending') AND lease_until<=?`).run(now() + 120000, id, now());
      if (!claimed.changes) continue;
      let order = await get(id);
      const refund = order.state === 'refund_pending';
      if (!refund && !await intactApproval(order)) {
        await update(id, { state: 'needs_review', error: 'Missing or mismatched approval; do not send.', lease_until: 0 });
        continue;
      }
      const started = refund ? order.refund_started : order.first_attempt;
      // Both providers expire idempotency keys; never retry an ambiguous old send.
      if (started !== null && now() - started > 23 * HOUR) {
        await update(id, { state: 'needs_review', error: refund ? 'Refund outcome needs reconciliation.' : 'Mailing outcome needs reconciliation.', lease_until: 0 });
        continue;
      }
      await update(id, { state: refund ? 'refund_pending' : 'sending',
        ...(refund ? { refund_started: started ?? now() } : { first_attempt: started ?? now() }), attempts: order.attempts + 1 });
      order = await get(id);
      try {
        if (refund) {
          const result = await providers.refund(order);
          if (result.status === 'succeeded') await update(id, { state: 'refunded', refund_id: result.id, lease_until: 0, error: null });
          else if (result.status === 'pending') await update(id, { refund_id: result.id, lease_until: 0, next_attempt: now() + 60000 });
          else await update(id, { state: 'needs_review', lease_until: 0, error: 'Refund requires operator review.' });
        } else {
          const result = await providers.sendLetter(order);
          await update(id, { state: result.status === 'failed' ? 'refund_pending' : 'submitted', lob_id: result.id,
            print_status: result.status || null, expected_delivery: result.expected_delivery_date || null, lease_until: 0,
            error: result.status === 'failed' ? 'Printer rendering failed; refund queued.' : null });
        }
      } catch (error) {
        if (error.integrity) await update(id, { state: 'needs_review', lease_until: 0, error: 'Approved document integrity check failed; do not send.' });
        else if (!refund && error.rejected) await update(id, { state: 'refund_pending', lease_until: 0, next_attempt: now(), error: 'Printer rejected order; refund queued.' });
        else await update(id, { lease_until: 0, next_attempt: now() + Math.min(3600000, 5000 * 2 ** Math.min(order.attempts, 10)), error: refund ? 'Refund response uncertain; retry queued.' : 'Printer response uncertain; retry queued.' });
      }
    }
  }
  async function maintenance() {
    if (config.mode !== 'demo') {
      const pending = await db.prepare("SELECT * FROM orders WHERE state='checkout' AND session_id IS NOT NULL ORDER BY updated_at LIMIT 20").all();
      for (const order of pending) { try { await reconcile(order); await update(order.id, {}); } catch {} }
      const printing = await db.prepare("SELECT * FROM orders WHERE state='submitted' AND (print_status IS NULL OR print_status='processed') AND checked_at<? ORDER BY checked_at LIMIT 20").all(now() - 60000);
      for (const order of printing) {
        try {
          const status = await providers.letterStatus(order);
          if (!['processed', 'rendered', 'failed'].includes(status)) throw new Error('Unknown print status');
          await db.prepare(`UPDATE orders SET print_status=?, checked_at=?,
            state=CASE WHEN ?='failed' THEN 'refund_pending' ELSE state END,
            error=CASE WHEN ?='failed' THEN 'Printer rendering failed; refund queued.' ELSE error END
            WHERE id=? AND state='submitted'`).run(status, now(), status, status, order.id);
          if (status === 'processed' && now() - order.first_attempt > 24 * HOUR) await update(order.id, { state: 'needs_review', error: 'Printer rendering is taking longer than expected.' });
        } catch { await db.prepare('UPDATE orders SET checked_at=?, error=? WHERE id=?').run(now(), 'Unable to confirm printer rendering status.', order.id); }
      }
    }
    await db.prepare("UPDATE orders SET state='expired', updated_at=? WHERE state='checkout' AND session_id IS NULL AND created_at<? AND lease_until<=?").run(now(), now() - 48 * HOUR, now());
    const stale = await db.prepare(`SELECT * FROM orders WHERE purged=2 OR (purged=0 AND (
      (state IN ('draft','expired') AND created_at<?) OR
      ((state='refunded' OR (state='submitted' AND print_status='rendered')) AND updated_at<?)))`).all(now() - 48 * HOUR, now() - 30 * 24 * HOUR);
    for (const order of stale) {
      // Claim deletion before touching files. A checkout that advanced since the
      // SELECT wins; purged=2 resumes deletion after a crash or database outage.
      if (order.purged !== 2) {
        const claimed = await db.prepare(`UPDATE orders SET purged=2,
          state=CASE WHEN state='draft' THEN 'expired' ELSE state END
          WHERE id=? AND purged=0 AND state=? AND updated_at=?`).run(order.id, order.state, order.updated_at);
        if (!claimed.changes) continue;
      }
      await rm(documentDir(config, order.id), { recursive: true, force: true });
      await update(order.id, { purged: 1, sender: '{}', recipient: '{}', filename: 'Document removed', checkout_url: null });
    }
    await db.prepare(`DELETE FROM approvals WHERE order_id IN (SELECT id FROM orders WHERE purged=1 AND state IN ('submitted','refunded','expired') AND created_at<?)`).run(now() - 180 * 24 * HOUR);
    // A process can die after writing files but before inserting its order.
    const root = join(config.dataDir, 'documents');
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name) || await get(entry.name)) continue;
      const dir = join(root, entry.name);
      if ((await stat(dir)).mtimeMs < now() - 48 * HOUR) await rm(dir, { recursive: true, force: true });
    }
  }
  return { get, authorized, create, checkout, status, recordPayment, work, maintenance, policies, approvalFor };
}
