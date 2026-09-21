import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { rm, readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { prepareDocument, envelopeDir } from './documents.js';
import { CONFIRMATION, canonical, sha256, registerPolicies, reviewEvidence, reviewHash } from './approval.js';

const text = (max, min = 1) => z.string().trim().min(min).max(max).refine(s => !/[\x00-\x1f\x7f]/.test(s), 'Remove control characters.');
export const signerSchema = z.object({
  name: text(80),
  email: z.string().trim().toLowerCase().max(120).refine(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'Enter a valid email address.'),
}).strict();
export const signersSchema = z.array(signerSchema).min(1, 'Add at least one signer.').max(5, 'No more than five signers per envelope.');
export const priceForEnvelope = () => 299;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const fail = (status, message) => Object.assign(new Error(message), { status });
const HOUR = 3600000;

export async function createEnvelopes(config, db, providers, { now = Date.now, prepare = prepareDocument } = {}) {
  const policies = await registerPolicies(config, db);
  const get = async id => await db.prepare('SELECT * FROM envelopes WHERE id=?').get(id);
  const approvalFor = async id => await db.prepare('SELECT * FROM approvals WHERE envelope_id=?').get(id);
  async function evidenceFor(envelope) {
    const existing = await approvalFor(envelope.id);
    return existing ? JSON.parse(existing.evidence) : reviewEvidence(envelope, config, policies);
  }
  async function intactApproval(envelope) {
    const approved = await approvalFor(envelope.id);
    if (!approved || !envelope.document_sha256) return false;
    const evidence = JSON.parse(approved.evidence);
    const actual = reviewEvidence(envelope, { automaticTax: evidence.automatic_tax, taxCode: evidence.tax_code },
      { terms_version: approved.terms_version, privacy_version: approved.privacy_version });
    // Preserve the exact accepted wording across application upgrades.
    actual.confirmation_sha256 = sha256(approved.confirmation);
    return reviewHash(actual) === approved.review_hash;
  }
  async function update(id, values) {
    const fields = { ...values, updated_at: now() };
    await db.prepare(`UPDATE envelopes SET ${Object.keys(fields).map(k => `${k}=?`).join(',')} WHERE id=?`).run(...Object.values(fields), id);
  }
  async function authorized(id, token = '') {
    const envelope = await get(id);
    if (!envelope || token.length > 128 || !timingSafeEqual(Buffer.from(envelope.token_hash, 'hex'), Buffer.from(hashToken(token), 'hex'))) throw fail(404, 'Envelope not found. Open your private envelope link.');
    return envelope;
  }
  async function view(envelope) {
    const { id, state, pages, amount, filename, provider_envelope_id, purged, created_at } = envelope;
    const evidence = await evidenceFor(envelope);
    const signers = JSON.parse(envelope.signers);
    return { id, state, pages, amount, filename, provider_envelope_id, purged: !!purged, created_at,
      review_hash: reviewHash(evidence), terms_version: evidence.terms_version, privacy_version: evidence.privacy_version,
      payment_total: envelope.payment_total, payment_tax: envelope.payment_tax,
      confirmation: (await approvalFor(id))?.confirmation || CONFIRMATION,
      signers, signed_count: signers.filter(s => s.status === 'signed').length, mode: config.mode };
  }
  async function create(input, file) {
    const signers = signersSchema.parse(input);
    if (!file) throw fail(400, 'Choose a PDF first.');
    if ((await db.prepare('SELECT count(*) AS count FROM envelopes WHERE purged=0').get()).count >= 500) throw fail(503, 'Envelope capacity reached. Please try again later.');
    const id = randomUUID(), token = randomBytes(32).toString('base64url');
    let inserting = false;
    try {
      const pages = await prepare(config, id, file.buffer);
      const documentHash = sha256(await readFile(join(envelopeDir(config, id), 'upload.pdf')));
      // TODO(provider): some e-signature APIs validate recipients at draft time.
      // Until a provider is integrated, only format validation applies.
      const stored = signers.map(({ name, email }) => ({ name, email, status: 'pending', updated_at: now() }));
      inserting = true;
      await db.prepare(`INSERT INTO envelopes (id, token_hash, created_at, updated_at, pages, amount, signers, document_sha256, filename)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, hashToken(token), now(), now(), pages, priceForEnvelope(), JSON.stringify(stored), documentHash,
          file.originalname.replace(/[\x00-\x1f\x7f/\\]/g, '').slice(0, 120) || 'document.pdf');
      return { ...await view(await get(id)), token, review_url: `${config.baseUrl}/#envelope=${id}.${token}` };
    } catch (error) {
      // A remote INSERT can commit even if its response is lost. Keep files for
      // recovery/retention once insertion starts; never strand a committed envelope.
      if (!inserting) await rm(envelopeDir(config, id), { recursive: true, force: true });
      throw error;
    }
  }
  async function checkout(id, token, confirmation) {
    const envelope = await authorized(id, token);
    if (confirmation?.confirmed !== true) throw fail(400, 'Confirm the document and signers before payment.');
    if (!['draft', 'checkout'].includes(envelope.state) || envelope.purged) throw fail(409, 'This envelope is already paid or closed.');
    if (!envelope.document_sha256) throw fail(409, 'This draft predates approval verification. Please create a new draft.');
    const evidence = await evidenceFor(envelope), fingerprint = reviewHash(evidence);
    if (confirmation.review_hash !== fingerprint || confirmation.terms_version !== evidence.terms_version || confirmation.privacy_version !== evidence.privacy_version) throw fail(409, 'The review or policies have changed. Refresh and review this envelope again.');
    if (await approvalFor(id) && !await intactApproval(envelope)) throw fail(409, 'The approved envelope has changed. Contact support before paying.');
    if (sha256(await readFile(join(envelopeDir(config, id), 'upload.pdf'))) !== envelope.document_sha256) throw fail(409, 'The document has changed. Please create a new draft.');
    if (now() - envelope.created_at > 48 * HOUR) throw fail(410, 'This draft has expired. Please start again.');
    if (envelope.session_id) {
      const session = await providers.stripe.checkout.sessions.retrieve(envelope.session_id);
      if (session.status !== 'open') { await reconcile(envelope); throw fail(409, 'Checkout has completed or expired. Refresh the envelope status.'); }
      return { url: envelope.checkout_url };
    }
    if (envelope.checkout_started && now() - envelope.checkout_started > 30 * 60000) throw fail(409, 'Checkout could not be recovered safely. Please start a new envelope.');
    await db.transaction(async tx => {
      const claimed = await tx.prepare(`UPDATE envelopes SET state='checkout', consent_at=COALESCE(consent_at, ?), checkout_started=COALESCE(checkout_started, ?), lease_until=?, updated_at=?
        WHERE id=? AND state IN ('draft','checkout') AND session_id IS NULL AND lease_until<=?`).run(now(), now(), now() + 120000, now(), id, now());
      if (!claimed.changes) throw fail(409, 'Checkout is being prepared. Please try again shortly.');
      await tx.prepare(`INSERT INTO approvals (envelope_id, accepted_at, terms_version, privacy_version, confirmation, evidence, review_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(id, now(), evidence.terms_version, evidence.privacy_version, CONFIRMATION, canonical(evidence), fingerprint);
    });
    if (config.mode === 'demo') {
      await update(id, { state: 'paid', payment_id: `demo_${id}`, lease_until: 0 });
      await work();
      return { url: `${config.baseUrl}/#envelope=${id}.${token}` };
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
    const envelope = await get(session.metadata?.envelope_id);
    if (!envelope || envelope.session_id !== session.id) throw fail(400, 'Unknown checkout session.');
    if (session.payment_status !== 'paid') return;
    if (session.mode !== 'payment' || session.currency !== 'usd' || session.amount_subtotal !== envelope.amount ||
      session.livemode !== (config.mode === 'live') || !session.payment_intent || session.client_reference_id !== envelope.id) throw fail(400, 'Payment details do not match this envelope.');
    if (envelope.state !== 'checkout') return;
    const approval = await approvalFor(envelope.id), tax = session.total_details?.amount_tax ?? 0;
    if (!approval || session.metadata.review_hash !== approval.review_hash || session.consent?.terms_of_service !== 'accepted' ||
      !Number.isSafeInteger(tax) || tax < 0 || session.amount_total !== envelope.amount + tax || (!JSON.parse(approval.evidence).automatic_tax && tax !== 0)) throw fail(400, 'Payment approval does not match this envelope.');
    const intact = await intactApproval(envelope);
    // A concurrent webhook/reconciliation must never regress a worker's state.
    await db.prepare(`UPDATE envelopes SET state=?, payment_id=?, payment_total=?, payment_tax=?,
      checkout_url=NULL, lease_until=0, error=?, updated_at=? WHERE id=? AND state='checkout'`)
      .run(intact ? 'paid' : 'needs_review', session.payment_intent, session.amount_total, tax,
        intact ? null : 'Paid envelope differs from its approval; do not send.', now(), envelope.id);
  }
  async function reconcile(envelope) {
    if (envelope.state !== 'checkout' || !envelope.session_id || config.mode === 'demo') return;
    const session = await providers.stripe.checkout.sessions.retrieve(envelope.session_id);
    if (session.payment_status === 'paid') await recordPayment(session);
    else if (session.status === 'expired') await db.prepare("UPDATE envelopes SET state='expired', checkout_url=NULL, updated_at=? WHERE id=? AND state='checkout'").run(now(), envelope.id);
  }
  async function status(id, token) {
    const envelope = await authorized(id, token);
    try { await reconcile(envelope); } catch { /* Webhook/worker will retry; don't hide the envelope. */ }
    return view(await get(id));
  }
  // Apply a signer event ('signed' | 'declined') for one signer, identified by
  // email. Idempotent: repeated or out-of-order events never regress state.
  // Shared by the demo simulation route and (later) the real provider webhook.
  async function applySignerEvent(id, email, event) {
    const envelope = await get(id);
    if (!envelope) throw fail(404, 'Envelope not found.');
    if (!['sent'].includes(envelope.state)) throw fail(409, `Envelope is ${envelope.state}; signer events no longer apply.`);
    if (!['signed', 'declined'].includes(event)) throw fail(400, 'Unknown signer event.');
    const signers = JSON.parse(envelope.signers);
    const signer = signers.find(s => s.email === String(email).toLowerCase());
    if (!signer) throw fail(404, 'Signer not found on this envelope.');
    if (signer.status !== 'pending') return view(await get(id)); // already terminal; idempotent
    signer.status = event; signer.updated_at = now();
    if (event === 'declined') {
      // A declined envelope can never complete. Business decision: automatic
      // refund, since no signing value was delivered. The worker processes it.
      await update(id, { signers: JSON.stringify(signers), state: 'declined', next_attempt: now(),
        error: 'A signer declined; automatic refund queued.', lease_until: 0 });
    } else if (signers.every(s => s.status === 'signed')) {
      await update(id, { signers: JSON.stringify(signers), state: 'signed', error: null });
    } else {
      await update(id, { signers: JSON.stringify(signers) });
    }
    return view(await get(id));
  }
  async function work() {
    // Database compare-and-set is the ownership boundary, even with concurrent ticks.
    const due = await db.prepare(`SELECT id FROM envelopes WHERE state IN ('paid','sending','declined','refund_pending') AND next_attempt<=? AND lease_until<=? LIMIT 10`).all(now(), now());
    for (const { id } of due) {
      const claimed = await db.prepare(`UPDATE envelopes SET lease_until=? WHERE id=? AND state IN ('paid','sending','declined','refund_pending') AND lease_until<=?`).run(now() + 120000, id, now());
      if (!claimed.changes) continue;
      let envelope = await get(id);
      const refund = envelope.state === 'declined' || envelope.state === 'refund_pending';
      if (refund && envelope.state === 'declined') { await update(id, { state: 'refund_pending' }); envelope = await get(id); }
      if (!refund && !await intactApproval(envelope)) {
        await update(id, { state: 'needs_review', error: 'Missing or mismatched approval; do not send.', lease_until: 0 });
        continue;
      }
      const started = refund ? envelope.refund_started : envelope.first_attempt;
      // Provider idempotency keys expire; never retry an ambiguous old send.
      if (started !== null && now() - started > 23 * HOUR) {
        await update(id, { state: 'needs_review', error: refund ? 'Refund outcome needs reconciliation.' : 'Submission outcome needs reconciliation.', lease_until: 0 });
        continue;
      }
      await update(id, { state: refund ? 'refund_pending' : 'sending',
        ...(refund ? { refund_started: started ?? now() } : { first_attempt: started ?? now() }), attempts: envelope.attempts + 1 });
      envelope = await get(id);
      try {
        if (refund) {
          const result = await providers.refund(envelope);
          if (result.status === 'succeeded') await update(id, { state: 'refunded', refund_id: result.id, lease_until: 0, error: null });
          else if (result.status === 'pending') await update(id, { refund_id: result.id, lease_until: 0, next_attempt: now() + 60000 });
          else await update(id, { state: 'needs_review', lease_until: 0, error: 'Refund requires operator review.' });
        } else {
          const result = await providers.submitEnvelope(envelope);
          await update(id, { state: result.status === 'failed' ? 'refund_pending' : 'sent', provider_envelope_id: result.id,
            lease_until: 0, error: result.status === 'failed' ? 'Provider rejected the envelope; refund queued.' : null });
        }
      } catch (error) {
        if (error.integrity) await update(id, { state: 'needs_review', lease_until: 0, error: 'Approved document integrity check failed; do not send.' });
        else if (!refund && error.rejected) await update(id, { state: 'refund_pending', lease_until: 0, next_attempt: now(), error: 'Provider rejected envelope; refund queued.' });
        else await update(id, { lease_until: 0, next_attempt: now() + Math.min(3600000, 5000 * 2 ** Math.min(envelope.attempts, 10)), error: refund ? 'Refund response uncertain; retry queued.' : 'Provider response uncertain; retry queued.' });
      }
    }
  }
  async function maintenance() {
    if (config.mode !== 'demo') {
      const pending = await db.prepare("SELECT * FROM envelopes WHERE state='checkout' AND session_id IS NOT NULL ORDER BY updated_at LIMIT 20").all();
      for (const envelope of pending) { try { await reconcile(envelope); await update(envelope.id, {}); } catch {} }
      // TODO(provider): poll the provider for 'sent' envelopes until all
      // signers are signed/declined, via providers.envelopeStatus() and
      // applySignerEvent(). Until a provider is integrated, signer events
      // arrive only through the provider webhook stub.
    }
    await db.prepare("UPDATE envelopes SET state='expired', updated_at=? WHERE state='checkout' AND session_id IS NULL AND created_at<? AND lease_until<=?").run(now(), now() - 48 * HOUR, now());
    const stale = await db.prepare(`SELECT * FROM envelopes WHERE purged=2 OR (purged=0 AND (
      (state IN ('draft','expired') AND created_at<?) OR
      (state IN ('sent','signed','refunded') AND updated_at<?)))`).all(now() - 48 * HOUR, now() - 30 * 24 * HOUR);
    for (const envelope of stale) {
      // Claim deletion before touching files. A checkout that advanced since the
      // SELECT wins; purged=2 resumes deletion after a crash or database outage.
      if (envelope.purged !== 2) {
        const claimed = await db.prepare(`UPDATE envelopes SET purged=2,
          state=CASE WHEN state='draft' THEN 'expired' ELSE state END
          WHERE id=? AND purged=0 AND state=? AND updated_at=?`).run(envelope.id, envelope.state, envelope.updated_at);
        if (!claimed.changes) continue;
      }
      await rm(envelopeDir(config, envelope.id), { recursive: true, force: true });
      await update(envelope.id, { purged: 1, signers: '[]', filename: 'Document removed', checkout_url: null });
    }
    await db.prepare(`DELETE FROM approvals WHERE envelope_id IN (SELECT id FROM envelopes WHERE purged=1 AND state IN ('signed','refunded','expired') AND created_at<?)`).run(now() - 180 * 24 * HOUR);
    // A process can die after writing files but before inserting its envelope.
    const root = join(config.dataDir, 'envelopes');
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name) || await get(entry.name)) continue;
      const dir = join(root, entry.name);
      if ((await stat(dir)).mtimeMs < now() - 48 * HOUR) await rm(dir, { recursive: true, force: true });
    }
  }
  return { get, authorized, create, checkout, status, recordPayment, applySignerEvent, work, maintenance, policies, approvalFor };
}
