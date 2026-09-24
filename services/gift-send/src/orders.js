import { randomUUID } from "node:crypto";
import {
  MAX_PAYOUT_CENTS,
  MAX_RECIPIENT_DAY_CENTS,
  DAY_MS,
  buildQuote,
  rejectionFor,
} from "./catalog.js";
import { verifyTremendousSignature } from "./providers.js";

const LEASE_MS = 120_000;
const DELIVERY = new Set(["EMAIL", "PHONE", "LINK"]);

export const fail = (status, message, code = "invalid_request") => Object.assign(new Error(message), { status, code });

function text(value, max) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned.length > max || /[\u0000-\u001f\u007f]/.test(cleaned)) return "";
  return cleaned;
}

function money(cents) {
  const [whole, frac] = (cents / 100).toFixed(2).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function recipientOf(input, method) {
  const raw = input?.recipient;
  if (!raw || typeof raw !== "object") throw fail(400, "recipient must include an email or a phone number.", "invalid_recipient");
  const email = raw.email ? text(raw.email, 120) : "";
  const phone = raw.phone ? text(raw.phone, 20) : "";
  const name = raw.name ? text(raw.name, 80) : "Gift recipient";
  if (raw.email && !email) throw fail(400, "recipient.email is invalid.", "invalid_recipient");
  if (raw.phone && !phone) throw fail(400, "recipient.phone is invalid.", "invalid_recipient");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "recipient.email is invalid.", "invalid_recipient");
  if (phone && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) throw fail(400, "recipient.phone is invalid.", "invalid_recipient");
  if (!email && !phone) throw fail(400, "recipient must include an email or a phone number.", "invalid_recipient");
  if (method === "EMAIL" && !email) throw fail(400, "EMAIL delivery requires recipient.email.", "invalid_recipient");
  if (method === "PHONE" && !phone) throw fail(400, "PHONE delivery requires recipient.phone.", "invalid_recipient");
  const key = email ? `email:${email.toLowerCase()}` : `phone:${phone.replace(/\D/g, "")}`;
  return { email: email || null, phone: phone || null, name: name || "Gift recipient", key };
}

function quoteView(row) {
  return buildQuote(row.amount_cents, row.fee_cents);
}

export function createOrders(config, db, providers, { now = Date.now } = {}) {
  const get = async (id) => await db.prepare("SELECT * FROM drafts WHERE id=?").get(id);

  function publicDraft(row) {
    return {
      draft_id: row.id,
      gift_id: row.id,
      status: row.status,
      recipient: {
        name: row.recipient_name,
        ...(row.recipient_email ? { email: row.recipient_email } : {}),
        ...(row.recipient_phone ? { phone: row.recipient_phone } : {}),
      },
      reward_id: row.reward_id,
      reward_name: row.reward_name,
      amount_cents: row.amount_cents,
      message: row.message || null,
      delivery_method: row.delivery_method,
      quote: quoteView(row),
      checkout_url: row.checkout_url,
      delivery_state: row.delivery_state || "pending",
      redemption_state: row.redemption_state || "unredeemed",
      tremendous_order_id: row.tremendous_order_id,
      tremendous_reward_id: row.tremendous_reward_id,
      delivery_link: row.delivery_link,
      mode: config.mode,
      ordered: Boolean(row.tremendous_order_id),
    };
  }

  async function resolveProduct(rewardId) {
    let product;
    try {
      product = await providers.getProduct(rewardId);
    } catch (error) {
      if (error.status === 404) throw fail(400, "That reward is not in the Tremendous catalog.", "unknown_reward");
      throw error;
    }
    const rejected = rejectionFor(product);
    if (rejected) throw fail(rejected.status, rejected.message, rejected.code);
    return product;
  }

  async function create(input, ownerKey = "gateway") {
    const method = String(input?.delivery_method || "").trim().toUpperCase();
    if (!DELIVERY.has(method)) throw fail(400, "delivery_method must be EMAIL, PHONE, or LINK.", "invalid_delivery");
    const recipient = recipientOf(input, method);
    const amount = Number(input?.amount_cents);
    if (!Number.isInteger(amount) || amount < 1) throw fail(400, "amount_cents must be a positive integer.", "invalid_amount");
    if (amount > MAX_PAYOUT_CENTS) {
      throw fail(400, `Amount exceeds the ${money(MAX_PAYOUT_CENTS)} maximum per payout.`, "amount_limit");
    }
    const message = input?.message == null || input.message === "" ? null : text(input.message, 500);
    if (input?.message && !message) throw fail(400, "message is invalid.", "invalid_message");
    const product = await resolveProduct(String(input?.reward_id || ""));
    if (amount < product.min_cents || amount > product.max_cents) {
      throw fail(
        400,
        `Amount is outside this reward's range (${money(product.min_cents)}–${money(product.max_cents)}).`,
        "amount_limit",
      );
    }
    const since = now() - DAY_MS;
    const spent = await db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM drafts
         WHERE recipient_key=? AND status!='cancelled' AND created_at>=?`,
      )
      .get(recipient.key, since);
    const already = Number(spent?.total || 0);
    if (already + amount > MAX_RECIPIENT_DAY_CENTS) {
      throw fail(
        400,
        `Amount exceeds the ${money(MAX_RECIPIENT_DAY_CENTS)} maximum per recipient per day.`,
        "recipient_daily_limit",
      );
    }
    const quote = buildQuote(amount, config.serviceFeeCents);
    const id = `gs_${randomUUID()}`;
    const ts = now();
    await db.prepare(
      `INSERT INTO drafts (
        id, owner_key, status, created_at, updated_at, recipient_email, recipient_phone, recipient_name, recipient_key,
        reward_id, reward_name, reward_category, amount_cents, fee_cents, total_cents, message, delivery_method,
        delivery_state, redemption_state
      ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unredeemed')`,
    ).run(
      id,
      ownerKey,
      ts,
      ts,
      recipient.email,
      recipient.phone,
      recipient.name,
      recipient.key,
      product.reward_id,
      product.name,
      product.category,
      amount,
      quote.fee_cents,
      quote.total_cents,
      message,
      method,
    );
    return publicDraft(await get(id));
  }

  async function read(id) {
    const row = await get(id);
    if (!row) throw fail(404, "Gift not found.", "not_found");
    return publicDraft(row);
  }

  async function list(ownerKey) {
    const rows = await db.prepare("SELECT * FROM drafts WHERE owner_key=? ORDER BY created_at DESC").all(ownerKey);
    return { gifts: rows.map(publicDraft) };
  }

  async function listProducts(query) {
    const products = await providers.listProducts(query);
    return {
      products: products
        .filter((product) => !rejectionFor(product))
        .map(({ reward_id, name, brand, min_cents, max_cents, fee_cents }) => ({
          reward_id,
          name,
          brand,
          min_cents,
          max_cents,
          fee_cents,
        })),
    };
  }

  async function reserve(id) {
    const row = await get(id);
    if (!row) throw fail(404, "Gift not found.", "not_found");
    if (row.session_id) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    if (row.status === "checkout") return { draft_id: id, quote: quoteView(row), reserved: true };
    if (row.status !== "draft") throw fail(409, "This draft is not open for checkout.", "checkout_closed");
    const claimed = await db.prepare(
      `UPDATE drafts SET status='checkout', lease_until=?, updated_at=? WHERE id=? AND session_id IS NULL AND status='draft'`,
    ).run(now() + LEASE_MS, now(), id);
    if (!claimed.changes) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    return { draft_id: id, quote: quoteView(row), reserved: true };
  }

  async function attachSession(id, sessionId, checkoutUrl) {
    const row = await get(id);
    if (!row) throw fail(404, "Gift not found.", "not_found");
    if (!sessionId) throw fail(400, "session_id is required.", "invalid_session");
    if (row.session_id === sessionId) return { draft_id: id, session_id: sessionId, checkout_url: row.checkout_url, quote: quoteView(row) };
    if (row.session_id) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    const updated = await db.prepare(
      `UPDATE drafts SET session_id=?, checkout_url=?, lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL AND status='checkout'`,
    ).run(sessionId, checkoutUrl || null, now(), id);
    if (!updated.changes) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    return { draft_id: id, session_id: sessionId, checkout_url: checkoutUrl, quote: quoteView(row) };
  }

  async function releaseReserve(id) {
    await db.prepare(
      `UPDATE drafts SET status='draft', lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL AND status='checkout'`,
    ).run(now(), id);
    return { released: true };
  }

  async function checkout(id) {
    const row = await get(id);
    if (!row) throw fail(404, "Gift not found.", "not_found");
    if (row.session_id) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    if (row.status !== "draft" && row.status !== "checkout") throw fail(409, "This draft is not open for checkout.", "checkout_closed");
    if (row.status === "draft") {
      const claimed = await db.prepare(
        `UPDATE drafts SET status='checkout', lease_until=?, updated_at=? WHERE id=? AND session_id IS NULL AND status='draft' AND lease_until<=?`,
      ).run(now() + LEASE_MS, now(), id, now());
      if (!claimed.changes) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    }
    if (config.mode === "demo") {
      const sessionId = `demo_cs_${id}`;
      const url = `${config.publicUrl}/demo/checkout/${id}`;
      const saved = await db.prepare(
        `UPDATE drafts SET session_id=?, checkout_url=?, lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL`,
      ).run(sessionId, url, now(), id);
      if (!saved.changes) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
      return {
        draft_id: id,
        checkout_url: url,
        session_id: sessionId,
        quote: quoteView(row),
        mode: "demo",
        ordered: false,
        note: "Demo checkout does not call Stripe or Tremendous and does not send a reward.",
      };
    }
    try {
      const session = await providers.checkout(await get(id));
      if (!session?.id || !session.url?.startsWith("https://checkout.stripe.com/")) {
        throw fail(503, "Unexpected checkout response.", "checkout_unavailable");
      }
      const saved = await db.prepare(
        `UPDATE drafts SET session_id=?, checkout_url=?, lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL`,
      ).run(session.id, session.url, now(), id);
      if (!saved.changes) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
      return {
        draft_id: id,
        checkout_url: session.url,
        session_id: session.id,
        quote: quoteView(row),
        mode: config.mode,
        ordered: false,
        note: "Stripe checkout is open. Tremendous sends the reward only after a webhook with payment_status paid.",
      };
    } catch (error) {
      await db.prepare(`UPDATE drafts SET status='draft', lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL`).run(now(), id);
      if (error.status) throw error;
      throw fail(503, "Payment checkout is temporarily unavailable. The card has not been charged here.", "checkout_unavailable");
    }
  }

  async function placeClaimed(row, claimId) {
    const result = await providers.createOrder(row, claimId);
    if (!result?.orderId) throw fail(502, "Tremendous did not return an order id.", "provider_error");
    await db.prepare(
      `UPDATE drafts SET tremendous_order_id=?, tremendous_reward_id=?, delivery_link=?, delivery_state=?, status='sent',
        lease_until=0, error=NULL, updated_at=? WHERE id=?`,
    ).run(result.orderId, result.rewardId, result.deliveryLink, result.deliveryStatus || "PENDING", now(), row.id);
    await db.prepare(`UPDATE claims SET state='ordered', lease_until=0 WHERE draft_id=?`).run(row.id);
    return { fulfilled: true, gift: publicDraft(await get(row.id)) };
  }

  async function fulfillPaid(session) {
    if (config.mode === "demo") throw fail(404, "Demo mode does not accept payment webhooks.", "demo_webhook");
    if (!session || session.payment_status !== "paid") return { fulfilled: false, reason: "unpaid" };
    const draftId = session.metadata?.draft_id || session.metadata?.jobId;
    const row = await get(draftId);
    if (!row) throw fail(400, "Unknown draft.", "unknown_draft");
    if (session.metadata?.connector && session.metadata.connector !== "gift-send") {
      return { fulfilled: false, reason: "ignored" };
    }
    if (row.session_id && session.id && session.id !== row.session_id) throw fail(400, "Unknown checkout session.", "unknown_session");
    if (Number(session.metadata?.face_cents) !== row.amount_cents) throw fail(400, "Payment face value does not match this draft.", "payment_mismatch");
    if (Number(session.metadata?.fee_cents) !== row.fee_cents) throw fail(400, "Payment fee does not match this draft.", "payment_mismatch");
    if (session.amount_total != null && Number(session.amount_total) !== row.total_cents) {
      throw fail(400, "Payment amount does not match this draft.", "payment_mismatch");
    }
    if (typeof session.livemode === "boolean" && session.livemode !== (config.mode === "live")) {
      throw fail(400, "Payment livemode does not match APP_MODE.", "payment_mismatch");
    }
    const claimId = `clm_${row.id}`;
    const inserted = await db.prepare(
      `INSERT INTO claims (id, draft_id, claimed_at, lease_until, state) VALUES (?, ?, ?, ?, 'claiming') ON CONFLICT(draft_id) DO NOTHING`,
    ).run(claimId, row.id, now(), now() + LEASE_MS);
    if (!inserted.changes) {
      const current = await get(row.id);
      if (current.tremendous_order_id) return { fulfilled: true, duplicate: true, gift: publicDraft(current) };
      const claim = await db.prepare("SELECT * FROM claims WHERE draft_id=?").get(row.id);
      if (claim && claim.state === "claiming" && claim.lease_until > now()) return { fulfilled: false, reason: "in_flight" };
      const took = await db.prepare(
        `UPDATE claims SET lease_until=?, state='claiming' WHERE draft_id=? AND state='claiming' AND lease_until<=?`,
      ).run(now() + LEASE_MS, row.id, now());
      if (!took.changes) {
        const again = await get(row.id);
        if (again.tremendous_order_id) return { fulfilled: true, duplicate: true, gift: publicDraft(again) };
        return { fulfilled: false, reason: "in_flight" };
      }
      return placeClaimed(await get(row.id), claim.id || claimId);
    }
    await db.prepare(`UPDATE drafts SET payment_status='paid', payment_id=?, status='paid', updated_at=? WHERE id=?`).run(
      session.payment_intent || session.id,
      now(),
      row.id,
    );
    try {
      return await placeClaimed(await get(row.id), claimId);
    } catch (error) {
      await db.prepare(`UPDATE claims SET lease_until=0 WHERE draft_id=? AND state='claiming'`).run(row.id);
      await db.prepare(`UPDATE drafts SET error=?, lease_until=0, updated_at=? WHERE id=?`).run("Reward order needs retry.", now(), row.id);
      throw error;
    }
  }

  async function cancel(id) {
    const row = await get(id);
    if (!row) throw fail(404, "Gift not found.", "not_found");
    if (row.status === "cancelled") return publicDraft(row);
    if (!row.tremendous_reward_id) {
      if (row.status === "draft" || row.status === "checkout" || row.status === "paid") {
        await db.prepare(`UPDATE drafts SET status='cancelled', updated_at=? WHERE id=?`).run(now(), id);
        return publicDraft(await get(id));
      }
      throw fail(409, "This gift has no Tremendous reward to cancel.", "not_cancellable");
    }
    if (config.mode === "demo") {
      await db.prepare(`UPDATE drafts SET status='cancelled', delivery_state='cancelled', updated_at=? WHERE id=?`).run(now(), id);
      return publicDraft(await get(id));
    }
    try {
      await providers.cancelReward(row.tremendous_reward_id);
    } catch (error) {
      if (error.status === 422) {
        throw fail(422, "This reward was already redeemed and cannot be cancelled.", "already_redeemed");
      }
      throw error;
    }
    await db.prepare(`UPDATE drafts SET status='cancelled', delivery_state='cancelled', updated_at=? WHERE id=?`).run(now(), id);
    return publicDraft(await get(id));
  }

  async function tremendousWebhook(raw, header) {
    verifyTremendousSignature(raw, header, config.tremendousWebhookSecret);
    let event;
    try {
      event = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
    } catch {
      throw fail(400, "Tremendous webhook body must be JSON.", "invalid_json");
    }
    const uuid = String(event?.uuid || "");
    if (uuid) {
      const saved = await db.prepare(`INSERT INTO webhook_events (uuid, received_at) VALUES (?, ?) ON CONFLICT DO NOTHING`).run(uuid, now());
      if (!saved.changes) return { received: true, duplicate: true };
    }
    const rewardId = event?.payload?.resource?.type === "rewards" ? event.payload.resource.id : null;
    if (rewardId && event.event === "REWARDS.DELIVERY.SUCCEEDED") {
      await db.prepare(`UPDATE drafts SET delivery_state='SUCCEEDED', updated_at=? WHERE tremendous_reward_id=?`).run(now(), rewardId);
    }
    if (rewardId && event.event === "REWARDS.CANCELED") {
      await db.prepare(`UPDATE drafts SET status='cancelled', delivery_state='cancelled', updated_at=? WHERE tremendous_reward_id=?`).run(now(), rewardId);
    }
    return { received: true };
  }

  return { create, read, list, listProducts, reserve, attachSession, releaseReserve, checkout, fulfillPaid, cancel, tremendousWebhook, get };
}
