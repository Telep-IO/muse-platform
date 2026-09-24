import { randomUUID } from "node:crypto";
import { fail } from "./providers.js";

export const ARTWORK_ATTESTATION =
  "I own or am licensed for this artwork. Telep IO LLC is the merchant of record and is solely responsible to Printify for the design.";

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const HOLD_STATUSES = new Set(["on-hold", "payment-not-received", "pending"]);
const ALREADY_PRODUCING = new Set(["sending-to-production", "in-production", "fulfilled", "partially-fulfilled", "canceled"]);
const CANCELABLE = new Set(["on-hold", "payment-not-received"]);

export function quoteCents(baseCents, shippingCents, bps) {
  if (!Number.isInteger(baseCents) || baseCents < 0) throw fail(400, "invalid_request", "base_cents must be a non-negative integer");
  if (!Number.isInteger(shippingCents) || shippingCents < 0) throw fail(400, "invalid_request", "shipping_cents must be a non-negative integer");
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw fail(400, "invalid_request", "markup basis points must be an integer from 0 to 10000");
  const markup_cents = Math.round(((baseCents + shippingCents) * bps) / 10000);
  return {
    base_cents: baseCents,
    shipping_cents: shippingCents,
    markup_cents,
    markup_bps: bps,
    total_cents: baseCents + shippingCents + markup_cents,
    currency: "usd",
  };
}

function text(value, name, max = 120) {
  if (typeof value !== "string") throw fail(400, "invalid_request", `${name} is required`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw fail(400, "invalid_request", `${name} must be 1–${max} characters without control characters`);
  }
  return trimmed;
}

function integer(value, name) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw fail(400, "invalid_request", `${name} must be an integer`);
  return value;
}

export function parseDraftInput(body) {
  if (!body || typeof body !== "object") throw fail(400, "invalid_request", "JSON body is required");
  if (body.artwork_rights_attested !== true) {
    throw fail(400, "artwork_rights_required", `artwork_rights_attested must be true. ${ARTWORK_ATTESTATION}`);
  }
  const artwork_url = text(body.artwork_url, "artwork_url", 2000);
  let parsed;
  try {
    parsed = new URL(artwork_url);
  } catch {
    throw fail(400, "invalid_request", "artwork_url must be an https URL");
  }
  if (parsed.protocol !== "https:") throw fail(400, "invalid_request", "artwork_url must be an https URL");
  const quantity = integer(body.quantity, "quantity");
  if (quantity < 1 || quantity > 50) throw fail(400, "invalid_request", "quantity must be an integer from 1 to 50");
  const recipient = parseRecipient(body.recipient);
  return {
    blueprint_id: integer(body.blueprint_id, "blueprint_id"),
    print_provider_id: integer(body.print_provider_id, "print_provider_id"),
    variant_id: integer(body.variant_id, "variant_id"),
    artwork_url,
    quantity,
    recipient,
  };
}

function parseRecipient(value) {
  if (!value || typeof value !== "object") throw fail(400, "invalid_request", "recipient is required");
  const country = text(value.country, "recipient.country", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw fail(400, "invalid_request", "recipient.country must be a 2-letter code");
  const region = value.region == null || value.region === "" ? undefined : text(value.region, "recipient.region", 64);
  if (country === "US" && !region) throw fail(400, "invalid_request", "recipient.region is required for US addresses");
  const email = text(value.email, "recipient.email", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "invalid_request", "recipient.email is invalid");
  return {
    first_name: text(value.first_name, "recipient.first_name", 40),
    last_name: text(value.last_name, "recipient.last_name", 40),
    email,
    phone: text(value.phone, "recipient.phone", 32),
    country,
    ...(region ? { region } : {}),
    address1: text(value.address1, "recipient.address1", 80),
    ...(value.address2 == null || value.address2 === "" ? {} : { address2: text(value.address2, "recipient.address2", 80) }),
    city: text(value.city, "recipient.city", 64),
    zip: text(value.zip, "recipient.zip", 16),
  };
}

async function run(tx, sql, args) {
  return await tx.prepare(sql).run(...args);
}

async function one(tx, sql, args) {
  return await tx.prepare(sql).get(...args);
}

export function createOrders(config, store, providers, now = () => Date.now()) {
  function view(row) {
    return {
      id: row.id,
      order_id: row.id,
      draft_id: row.id,
      status: row.status,
      blueprint_id: row.blueprint_id,
      print_provider_id: row.print_provider_id,
      variant_id: row.variant_id,
      quantity: row.quantity,
      artwork_url: row.artwork_url,
      artwork_attestation: ARTWORK_ATTESTATION,
      recipient: JSON.parse(row.recipient),
      quote: JSON.parse(row.quote),
      mockup_urls: JSON.parse(row.mockup_urls),
      printify_product_id: row.printify_product_id,
      checkout_url: row.checkout_url,
      printify_order_id: row.printify_order_id,
      printify_status: row.printify_status,
      tracking: row.tracking,
      note: row.note,
    };
  }

  async function getRow(id) {
    return store.prepare("SELECT * FROM drafts WHERE id=?").get(id);
  }

  async function requireOwner(id, ownerKeyId) {
    const row = await getRow(id);
    if (!row || row.owner_key_id !== ownerKeyId) throw fail(404, "not_found", "Order not found");
    return row;
  }

  return {
    async createDraft(body, ownerKeyId) {
      const input = parseDraftInput(body);
      const id = `pm_${randomUUID()}`;
      const produced = await providers.printify.createProduct({ ...input, draftId: id });
      const quote = quoteCents(produced.baseCents, produced.shippingCents, config.markupBps);
      const note =
        config.mode === "demo"
          ? "Demo fixture quote. Printify was not contacted. Review the mockup, then pay. Nothing is produced before payment."
          : "Live Printify cost plus shipping plus the configured markup. Review the mockups. Production starts only after Stripe reports payment_status paid.";
      const timestamp = now();
      await store
        .prepare(
          `INSERT INTO drafts (
            id, owner_key_id, status, blueprint_id, print_provider_id, variant_id, quantity,
            artwork_url, artwork_attested, recipient, quote, mockup_urls, printify_product_id,
            checkout_lock, note, created_at, updated_at
          ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?, ?, ?)`,
        )
        .run(
          id,
          ownerKeyId,
          input.blueprint_id,
          input.print_provider_id,
          input.variant_id,
          input.quantity,
          input.artwork_url,
          JSON.stringify(input.recipient),
          JSON.stringify(quote),
          JSON.stringify(produced.mockupUrls),
          produced.productId,
          note,
          timestamp,
          timestamp,
        );
      return view(await getRow(id));
    },

    async list(ownerKeyId) {
      const rows = await store.prepare("SELECT * FROM drafts WHERE owner_key_id=? ORDER BY created_at").all(ownerKeyId);
      return { orders: rows.map(view) };
    },

    async get(id, ownerKeyId) {
      return view(await requireOwner(id, ownerKeyId));
    },

    async checkout(id, ownerKeyId, body = {}) {
      const phase = body.phase || "create";
      if (phase === "release") {
        await requireOwner(id, ownerKeyId);
        await store.prepare("UPDATE drafts SET checkout_lock=0, updated_at=? WHERE id=? AND session_id IS NULL").run(now(), id);
        return view(await getRow(id));
      }
      if (phase === "commit") {
        const sessionId = text(body.session_id, "session_id", 200);
        const checkoutUrl = text(body.checkout_url, "checkout_url", 2000);
        return store.transaction(async (tx) => {
          const row = await one(tx, "SELECT * FROM drafts WHERE id=? AND owner_key_id=?", [id, ownerKeyId]);
          if (!row) throw fail(404, "not_found", "Order not found");
          if (row.session_id === sessionId) return view(row);
          if (row.session_id) throw fail(409, "conflict", "A checkout session already exists for this draft");
          const updated = await run(
            tx,
            "UPDATE drafts SET session_id=?, checkout_url=?, status='checkout', checkout_lock=0, updated_at=? WHERE id=? AND session_id IS NULL",
            [sessionId, checkoutUrl, now(), id],
          );
          if (!updated.changes) throw fail(409, "conflict", "A checkout session already exists for this draft");
          return view(await one(tx, "SELECT * FROM drafts WHERE id=?", [id]));
        });
      }

      const locked = await store.transaction(async (tx) => {
        const row = await one(tx, "SELECT * FROM drafts WHERE id=? AND owner_key_id=?", [id, ownerKeyId]);
        if (!row) throw fail(404, "not_found", "Order not found");
        if (!row.artwork_attested) throw fail(400, "artwork_rights_required", ARTWORK_ATTESTATION);
        if (row.session_id) throw fail(409, "conflict", "A checkout session already exists for this draft");
        if (row.status !== "draft") throw fail(409, "conflict", `Order is ${row.status}; checkout only from draft`);
        if (row.checkout_lock > now()) throw fail(409, "conflict", "Checkout is already in progress for this draft");
        const updated = await run(
          tx,
          "UPDATE drafts SET checkout_lock=?, updated_at=? WHERE id=? AND session_id IS NULL AND checkout_lock<=?",
          [now() + 60_000, now(), id, now()],
        );
        if (!updated.changes) throw fail(409, "conflict", "A checkout session already exists for this draft");
        return row;
      });

      if (phase === "reserve") return view(await getRow(id));

      try {
        const session = await providers.stripe.create(view(locked));
        return await store.transaction(async (tx) => {
          const row = await one(tx, "SELECT * FROM drafts WHERE id=?", [id]);
          if (row.session_id === session.id) return view(row);
          if (row.session_id) throw fail(409, "conflict", "A checkout session already exists for this draft");
          const updated = await run(
            tx,
            "UPDATE drafts SET session_id=?, checkout_url=?, status='checkout', checkout_lock=0, updated_at=? WHERE id=? AND session_id IS NULL",
            [session.id, session.url, now(), id],
          );
          if (!updated.changes) throw fail(409, "conflict", "A checkout session already exists for this draft");
          return view(await one(tx, "SELECT * FROM drafts WHERE id=?", [id]));
        });
      } catch (error) {
        await store.prepare("UPDATE drafts SET checkout_lock=0, updated_at=? WHERE id=? AND session_id IS NULL").run(now(), id);
        throw error;
      }
    },

    async cancel(id, ownerKeyId) {
      const row = await requireOwner(id, ownerKeyId);
      if (!row.printify_order_id) {
        await store
          .prepare("UPDATE drafts SET status='canceled', note=?, updated_at=? WHERE id=?")
          .run("Canceled locally. No Printify order existed, so nothing was sent to production.", now(), id);
        return view(await getRow(id));
      }
      if (config.mode === "demo") throw fail(500, "demo_egress", "Demo mode cannot cancel a Printify order.");
      const remote = await providers.printify.getOrder(row.printify_order_id);
      if (!CANCELABLE.has(remote.status)) {
        throw fail(
          409,
          "not_cancelable",
          `Printify only cancels orders that are still on-hold or payment-not-received. Current status is ${remote.status}.`,
        );
      }
      const canceled = await providers.printify.cancelOrder(row.printify_order_id);
      await store
        .prepare("UPDATE drafts SET status='canceled', printify_status=?, note=?, updated_at=? WHERE id=?")
        .run(canceled.status, "Canceled with Printify while the order was still on hold.", now(), id);
      return view(await getRow(id));
    },

    async fulfillPaid(event) {
      if (!PAID_EVENTS.has(event?.type)) return { received: true, fulfilled: false, reason: "ignored_event" };
      const session = event.data?.object;
      if (session?.payment_status !== "paid") return { received: true, fulfilled: false, reason: "unpaid" };
      const draftId = session.metadata?.draft_id || session.metadata?.jobId;
      if (!draftId) return { received: true, fulfilled: false, reason: "missing_draft" };
      const row = await getRow(draftId);
      if (!row) return { received: true, fulfilled: false, reason: "missing_draft" };
      const quote = JSON.parse(row.quote);
      if (typeof session.amount_total === "number" && session.amount_total !== quote.total_cents) {
        return { received: true, fulfilled: false, reason: "amount_mismatch" };
      }
      if (config.mode === "demo") {
        await store
          .prepare("UPDATE drafts SET status='paid', note=?, updated_at=? WHERE id=? AND printify_order_id IS NULL")
          .run("Demo payment recorded locally. Printify was not contacted.", now(), draftId);
        return { received: true, fulfilled: true, demo: true };
      }

      const claim = await store.transaction(async (tx) => {
        const id = `clm_${randomUUID()}`;
        const inserted = await run(tx, "INSERT INTO claims (id, draft_id, status, created_at) VALUES (?, ?, 'pending', ?) ON CONFLICT(draft_id) DO NOTHING", [
          id,
          draftId,
          now(),
        ]);
        if (inserted.changes === 1) {
          await run(tx, "UPDATE claims SET status='submitting' WHERE id=? AND status='pending'", [id]);
          return { owner: true, id };
        }
        const existing = await one(tx, "SELECT * FROM claims WHERE draft_id=?", [draftId]);
        if (!existing) throw fail(500, "claim_failed", "Could not read the fulfillment claim.");
        if (existing.status === "pending") {
          const taken = await run(tx, "UPDATE claims SET status='submitting' WHERE id=? AND status='pending'", [existing.id]);
          return { owner: taken.changes === 1, id: existing.id, resume: taken.changes !== 1 };
        }
        if (existing.status === "submitting") return { owner: false, id: existing.id, resume: true };
        return { owner: false, id: existing.id, printifyOrderId: existing.printify_order_id };
      });

      if (!claim.owner) {
        if (claim.resume) {
          const existing = await providers.printify.findByExternalId(claim.id);
          if (existing) await recordOrder(draftId, claim.id, existing);
        }
        const current = await getRow(draftId);
        return { received: true, fulfilled: true, duplicate: true, printify_order_id: current.printify_order_id, external_id: claim.id };
      }

      let submitted;
      try {
        submitted = await providers.printify.submitOrder({
          externalId: claim.id,
          productId: row.printify_product_id,
          variantId: row.variant_id,
          quantity: row.quantity,
          recipient: JSON.parse(row.recipient),
        });
        await store.prepare("UPDATE claims SET printify_order_id=? WHERE id=?").run(submitted.id, claim.id);
      } catch (error) {
        await store.prepare("UPDATE claims SET status='pending' WHERE id=? AND printify_order_id IS NULL").run(claim.id);
        throw error;
      }
      let finalOrder = submitted;
      if (HOLD_STATUSES.has(submitted.status)) {
        finalOrder = await providers.printify.sendToProduction(submitted.id);
      }
      await recordOrder(draftId, claim.id, finalOrder);
      return { received: true, fulfilled: true, printify_order_id: finalOrder.id, external_id: claim.id };
    },

    async applyPrintifyEvent(payload) {
      const data = payload?.resource?.data || payload?.resource || payload || {};
      const external = data.external_id || data.metadata?.shop_order_id;
      const printifyId = data.id;
      const row = external
        ? await store.prepare("SELECT drafts.* FROM drafts JOIN claims ON claims.draft_id=drafts.id WHERE claims.id=?").get(external)
        : printifyId
          ? await store.prepare("SELECT * FROM drafts WHERE printify_order_id=?").get(String(printifyId))
          : undefined;
      if (!row) return { received: true, updated: false };
      const shipment = data.shipments?.[0];
      const tracking = shipment?.number || shipment?.tracking_number || row.tracking || null;
      const status = data.status || row.printify_status;
      await store
        .prepare("UPDATE drafts SET printify_status=?, tracking=?, status=?, updated_at=? WHERE id=?")
        .run(status, tracking, status || row.status, now(), row.id);
      return { received: true, updated: true };
    },
  };

  async function recordOrder(draftId, claimId, order) {
    await store.transaction(async (tx) => {
      await run(tx, "UPDATE claims SET status='submitted', printify_order_id=? WHERE id=?", [order.id, claimId]);
      await run(
        tx,
        "UPDATE drafts SET printify_order_id=?, printify_status=?, tracking=?, status=?, note=?, updated_at=? WHERE id=?",
        [
          order.id,
          order.status,
          order.tracking ?? null,
          order.status || "submitted",
          "Paid. Submitted to Printify with external_id on the claim. White-label shipping notification to the buyer is off.",
          now(),
          draftId,
        ],
      );
    });
  }
}
