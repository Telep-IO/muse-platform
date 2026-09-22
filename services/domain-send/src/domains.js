import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SUPPORTED_TLDS, TLD_PRICES, MIN_YEARS, MAX_YEARS } from './config.js';
import { CONFIRMATION, canonical, sha256, registerPolicies, reviewEvidence, reviewHash } from './approval.js';

const text = (max, min = 1) => z.string().trim().min(min).max(max).refine(s => !/[\x00-\x1f\x7f]/.test(s), 'Remove control characters.');
export const registrantSchema = z.object({
  name: text(120),
  email: z.string().trim().toLowerCase().max(160).refine(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'Enter a valid email address.'),
  org: text(120, 0).optional().default(''),
}).strict();
export const createSchema = z.object({
  domain: z.string().trim().min(1).max(253),
  years: z.number().int().min(MIN_YEARS, `Term must be ${MIN_YEARS}–${MAX_YEARS} years.`).max(MAX_YEARS, `Term must be ${MIN_YEARS}–${MAX_YEARS} years.`),
  registrant: registrantSchema,
}).strict();
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

// Normalize and validate a domain name. Returns the canonical lowercase form
// and its TLD. Internationalized names are rejected in v1: punycode handling
// is a deliberate later addition, not an oversight.
export function normalizeDomain(input) {
  const domain = String(input ?? '').trim().toLowerCase();
  if (!domain) throw fail(400, 'Enter a domain name, like example.com.');
  if (domain.length > 253) throw fail(400, 'That domain name is too long.');
  if (domain.includes('xn--')) throw fail(400, 'Internationalized domain names are not supported in v1.');
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(l => !LABEL.test(l))) throw fail(400, 'Enter a valid domain name, like example.com.');
  const tld = labels[labels.length - 1];
  if (!SUPPORTED_TLDS.includes(tld)) throw fail(400, `Only these endings are supported in v1: ${SUPPORTED_TLDS.join(', ')}.`);
  return { domain, tld };
}
export const priceFor = (tld, years) => TLD_PRICES[tld] * years;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const fail = (status, message) => Object.assign(new Error(message), { status });
const HOUR = 3600000;
const DAY = 24 * HOUR;
const backoff = record => Math.min(3600000, 5000 * 2 ** Math.min(record.attempts, 10));

export async function createDomains(config, db, providers, { now = Date.now } = {}) {
  const policies = await registerPolicies(config, db);
  const get = async id => await db.prepare('SELECT * FROM domains WHERE id=?').get(id);
  const approvalFor = async id => await db.prepare('SELECT * FROM approvals WHERE domain_id=?').get(id);
  async function evidenceFor(record) {
    const existing = await approvalFor(record.id);
    return existing ? JSON.parse(existing.evidence) : reviewEvidence(record, config, policies);
  }
  async function intactApproval(record) {
    const approved = await approvalFor(record.id);
    if (!approved) return false;
    const evidence = JSON.parse(approved.evidence);
    const actual = reviewEvidence(record, { automaticTax: evidence.automatic_tax, taxCode: evidence.tax_code },
      { terms_version: approved.terms_version, privacy_version: approved.privacy_version });
    // Preserve the exact accepted wording across application upgrades.
    actual.confirmation_sha256 = sha256(approved.confirmation);
    return reviewHash(actual) === approved.review_hash;
  }
  async function update(id, values) {
    const fields = { ...values, updated_at: now() };
    await db.prepare(`UPDATE domains SET ${Object.keys(fields).map(k => `${k}=?`).join(',')} WHERE id=?`).run(...Object.values(fields), id);
  }
  async function authorized(id, token = '') {
    const record = await get(id);
    if (!record || token.length > 128 || !timingSafeEqual(Buffer.from(record.token_hash, 'hex'), Buffer.from(hashToken(token), 'hex'))) throw fail(404, 'Registration not found. Open your private registration link.');
    return record;
  }
  async function view(record) {
    const { id, state, domain, tld, years, price_per_year, amount, purged, created_at, registered_at, expires_at, provider_domain_id } = record;
    const evidence = await evidenceFor(record);
    return { id, state, domain, tld, years, price_per_year_cents: price_per_year, amount, whois_privacy_included: true,
      registrant: record.purged ? null : JSON.parse(record.registrant || '{}'),
      registered_at, expires_at, provider_domain_id, purged: !!purged, created_at,
      review_hash: reviewHash(evidence), terms_version: evidence.terms_version, privacy_version: evidence.privacy_version,
      payment_total: record.payment_total, payment_tax: record.payment_tax,
      confirmation: (await approvalFor(id))?.confirmation || CONFIRMATION, mode: config.mode };
  }
  // Availability probe. Does not create anything. The agent should call this
  // while brainstorming names with the user, before creating a draft.
  async function check(input) {
    const { domain, tld } = normalizeDomain(input?.domain);
    const available = await providers.checkAvailability(domain);
    return { domain, tld, available, price_per_year_cents: TLD_PRICES[tld], whois_privacy_included: true, mode: config.mode };
  }
  // Create a draft registration. Only succeeds when the domain is currently
  // available; availability is re-checked at checkout, and the registry has
  // the final word at registration time (a late failure refunds).
  async function create(input) {
    const parsed = createSchema.parse(input);
    const { domain, tld } = normalizeDomain(parsed.domain);
    if ((await db.prepare('SELECT count(*) AS count FROM domains WHERE purged=0').get()).count >= 500) throw fail(503, 'Registration capacity reached. Please try again later.');
    const open = await db.prepare('SELECT id, state FROM domains WHERE domain=? AND purged=0').get(domain);
    if (open && !['failed', 'refunded', 'expired'].includes(open.state)) throw fail(409, 'There is already an open registration for this domain.');
    let available = false;
    try { available = await providers.checkAvailability(domain); }
    catch { throw fail(503, 'Availability lookup is temporarily unavailable. Please retry shortly.'); }
    if (!available) throw fail(409, 'That domain is already registered. Try another name.');
    const id = randomUUID(), token = randomBytes(32).toString('base64url');
    const price = TLD_PRICES[tld];
    try {
      await db.prepare(`INSERT INTO domains (id, token_hash, created_at, updated_at, domain, tld, years, price_per_year, amount, registrant, checked_at, available_at_check)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, hashToken(token), now(), now(), domain, tld, parsed.years, price, price * parsed.years,
          JSON.stringify({ name: parsed.registrant.name, email: parsed.registrant.email, org: parsed.registrant.org || '' }), now(), 1);
    } catch (error) {
      // A concurrent draft for the same domain won the race (partial unique
      // index on unpurged domains). Report it as a conflict, not a crash.
      if (/UNIQUE|unique|constraint/i.test(error.message || '')) throw fail(409, 'There is already an open registration for this domain.');
      throw error;
    }
    return { ...await view(await get(id)), token, review_url: `${config.baseUrl}/#domain=${id}.${token}` };
  }
  async function checkout(id, token, confirmation) {
    const record = await authorized(id, token);
    if (confirmation?.confirmed !== true) throw fail(400, 'Confirm the domain, term, registrant, and price before payment.');
    if (!['draft', 'checkout'].includes(record.state) || record.purged) throw fail(409, 'This registration is already paid or closed.');
    const evidence = await evidenceFor(record), fingerprint = reviewHash(evidence);
    if (confirmation.review_hash !== fingerprint || confirmation.terms_version !== evidence.terms_version || confirmation.privacy_version !== evidence.privacy_version) throw fail(409, 'The review or policies have changed. Refresh and review this registration again.');
    if (await approvalFor(id) && !await intactApproval(record)) throw fail(409, 'The approved registration has changed. Contact support before paying.');
    if (now() - record.created_at > 48 * HOUR) throw fail(410, 'This draft has expired. Please start again.');
    // Re-check availability at checkout time: domains can be taken between
    // draft creation and payment. A domain lost here never reaches Stripe.
    let available = false;
    try { available = await providers.checkAvailability(record.domain); }
    catch { throw fail(503, 'Availability lookup is temporarily unavailable. Your card has not been charged. Please retry.'); }
    if (!available) {
      await update(id, { state: 'failed', error: 'The domain was registered by someone else before payment. No charge was made.', lease_until: 0 });
      throw fail(409, 'That domain was just registered by someone else. No charge was made — try another name.');
    }
    if (record.session_id) {
      const session = await providers.stripe.checkout.sessions.retrieve(record.session_id);
      if (session.status !== 'open') { await reconcile(record); throw fail(409, 'Checkout has completed or expired. Refresh the registration status.'); }
      return { url: record.checkout_url };
    }
    if (record.checkout_started && now() - record.checkout_started > 30 * 60000) throw fail(409, 'Checkout could not be recovered safely. Please start a new registration.');
    await db.transaction(async tx => {
      const claimed = await tx.prepare(`UPDATE domains SET state='checkout', consent_at=COALESCE(consent_at, ?), checkout_started=COALESCE(checkout_started, ?), lease_until=?, updated_at=?
        WHERE id=? AND state IN ('draft','checkout') AND session_id IS NULL AND lease_until<=?`).run(now(), now(), now() + 120000, now(), id, now());
      if (!claimed.changes) throw fail(409, 'Checkout is being prepared. Please try again shortly.');
      await tx.prepare(`INSERT INTO approvals (domain_id, accepted_at, terms_version, privacy_version, confirmation, evidence, review_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(id, now(), evidence.terms_version, evidence.privacy_version, CONFIRMATION, canonical(evidence), fingerprint);
    });
    if (config.mode === 'demo') {
      await update(id, { state: 'paid', payment_id: `demo_${id}`, lease_until: 0 });
      await work();
      return { url: `${config.baseUrl}/#domain=${id}.${token}` };
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
    const record = await get(session.metadata?.domain_id);
    if (!record || record.session_id !== session.id) throw fail(400, 'Unknown checkout session.');
    if (session.payment_status !== 'paid') return;
    if (session.mode !== 'payment' || session.currency !== 'usd' || session.amount_subtotal !== record.amount ||
      session.livemode !== (config.mode === 'live') || !session.payment_intent || session.client_reference_id !== record.id) throw fail(400, 'Payment details do not match this registration.');
    if (record.state !== 'checkout') return;
    const approval = await approvalFor(record.id), tax = session.total_details?.amount_tax ?? 0;
    if (!approval || session.metadata.review_hash !== approval.review_hash || session.consent?.terms_of_service !== 'accepted' ||
      !Number.isSafeInteger(tax) || tax < 0 || session.amount_total !== record.amount + tax || (!JSON.parse(approval.evidence).automatic_tax && tax !== 0)) throw fail(400, 'Payment approval does not match this registration.');
    const intact = await intactApproval(record);
    // A concurrent webhook/reconciliation must never regress a worker's state.
    await db.prepare(`UPDATE domains SET state=?, payment_id=?, payment_total=?, payment_tax=?,
      checkout_url=NULL, lease_until=0, error=?, updated_at=? WHERE id=? AND state='checkout'`)
      .run(intact ? 'paid' : 'needs_review', session.payment_intent, session.amount_total, tax,
        intact ? null : 'Paid registration differs from its approval; do not register.', now(), record.id);
  }
  async function reconcile(record) {
    if (record.state !== 'checkout' || !record.session_id || config.mode === 'demo') return;
    const session = await providers.stripe.checkout.sessions.retrieve(record.session_id);
    if (session.payment_status === 'paid') await recordPayment(session);
    else if (session.status === 'expired') await db.prepare("UPDATE domains SET state='expired', checkout_url=NULL, updated_at=? WHERE id=? AND state='checkout'").run(now(), record.id);
  }
  async function status(id, token) {
    const record = await authorized(id, token);
    try { await reconcile(record); } catch { /* Webhook/worker will retry; don't hide the registration. */ }
    return view(await get(id));
  }
  async function work() {
    // Database compare-and-set is the ownership boundary, even with concurrent ticks.
    const due = await db.prepare(`SELECT id FROM domains WHERE state IN ('paid','registering','refund_pending') AND next_attempt<=? AND lease_until<=? LIMIT 10`).all(now(), now());
    for (const { id } of due) {
      const claimed = await db.prepare(`UPDATE domains SET lease_until=? WHERE id=? AND state IN ('paid','registering','refund_pending') AND lease_until<=?`).run(now() + 120000, id, now());
      if (!claimed.changes) continue;
      let record = await get(id);
      if (record.state === 'refund_pending') {
        await update(id, { refund_started: record.refund_started ?? now(), attempts: record.attempts + 1 });
        try {
          const result = await providers.refund(record);
          if (result.status === 'succeeded') await update(id, { state: 'refunded', refund_id: result.id, lease_until: 0, error: null });
          else if (result.status === 'pending') await update(id, { refund_id: result.id, lease_until: 0, next_attempt: now() + 60000 });
          else await update(id, { state: 'needs_review', lease_until: 0, error: 'Refund requires operator review.' });
        } catch {
          await update(id, { lease_until: 0, next_attempt: now() + backoff(record), error: 'Refund response uncertain; retry queued.' });
        }
        continue;
      }
      if (!await intactApproval(record)) {
        await update(id, { state: 'needs_review', error: 'Missing or mismatched approval; do not register.', lease_until: 0 });
        continue;
      }
      const started = record.first_attempt;
      // Registry idempotency keys expire; never retry an ambiguous old registration.
      if (started !== null && now() - started > 23 * HOUR) {
        await update(id, { state: 'needs_review', error: 'Registration outcome needs reconciliation.', lease_until: 0 });
        continue;
      }
      await update(id, { state: 'registering', first_attempt: started ?? now(), attempts: record.attempts + 1 });
      record = await get(id);
      try {
        // If a previous tick submitted but died before recording the result,
        // poll the registry instead of submitting twice.
        const result = record.provider_domain_id ? await providers.registrationStatus(record) : await providers.registerDomain(record);
        if (result.status === 'active') {
          await update(id, { state: 'active', provider_domain_id: result.id, registered_at: result.registered_at ?? now(),
            expires_at: result.expires_at ?? now() + record.years * 365 * DAY, lease_until: 0, error: null });
        } else if (result.status === 'pending') {
          await update(id, { provider_domain_id: result.id, lease_until: 0, next_attempt: now() + 60000 });
        } else {
          // The registry could not complete this registration (e.g. the name
          // was taken in the race window). Nothing of value was delivered, so
          // the payment is refunded automatically.
          await update(id, { state: 'refund_pending', lease_until: 0, next_attempt: now(),
            error: 'The registry could not register this domain; refund queued.' });
        }
      } catch (error) {
        if (error.rejected) await update(id, { state: 'refund_pending', lease_until: 0, next_attempt: now(),
          error: 'The registry rejected this registration; refund queued.' });
        else await update(id, { lease_until: 0, next_attempt: now() + backoff(record), error: 'Registry response uncertain; retry queued.' });
      }
    }
  }
  async function maintenance() {
    if (config.mode !== 'demo') {
      const pending = await db.prepare("SELECT * FROM domains WHERE state='checkout' AND session_id IS NOT NULL ORDER BY updated_at LIMIT 20").all();
      for (const record of pending) { try { await reconcile(record); await update(record.id, {}); } catch {} }
    }
    await db.prepare("UPDATE domains SET state='expired', updated_at=? WHERE state='checkout' AND session_id IS NULL AND created_at<? AND lease_until<=?").run(now(), now() - 48 * HOUR, now());
    const stale = await db.prepare(`SELECT * FROM domains WHERE purged=0 AND (
      (state IN ('draft','expired') AND created_at<?) OR
      (state IN ('failed','refunded','needs_review') AND updated_at<?) OR
      (state='active' AND expires_at IS NOT NULL AND expires_at<?))`).all(now() - 48 * HOUR, now() - 30 * DAY, now() - 90 * DAY);
    for (const record of stale) {
      // Claim the purge before scrubbing. A checkout that advanced since the
      // SELECT wins the compare-and-set below.
      const claimed = await db.prepare(`UPDATE domains SET purged=1, registrant='{}', checkout_url=NULL,
        state=CASE WHEN state='draft' THEN 'expired' ELSE state END, updated_at=?
        WHERE id=? AND purged=0 AND state=? AND updated_at=?`).run(now(), record.id, record.state, record.updated_at);
      if (!claimed.changes) continue;
    }
    await db.prepare(`DELETE FROM approvals WHERE domain_id IN (SELECT id FROM domains WHERE purged=1 AND state IN ('failed','refunded','expired') AND created_at<?)`).run(now() - 180 * DAY);
  }
  return { get, authorized, check, create, checkout, status, recordPayment, work, maintenance, policies, approvalFor };
}
