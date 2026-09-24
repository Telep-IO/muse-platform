import { randomUUID } from "node:crypto";
import { assertCarrierAllowed, lowestRate, quoteFor, restrictionMessage, uspsRates } from "./pricing.js";

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);
const LEASE_MS = 120_000;

export const fail = (status, message, code = "invalid_request") => Object.assign(new Error(message), { status, code });

function text(value, max) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned.length > max || /[\u0000-\u001f\u007f]/.test(cleaned)) return "";
  return cleaned;
}

function address(value, label) {
  if (!value || typeof value !== "object") throw fail(400, `${label} is required.`);
  const name = text(value.name, 40);
  const address_line1 = text(value.address_line1, 64);
  const address_line2 = value.address_line2 ? text(value.address_line2, 64) : "";
  const address_city = text(value.address_city, 40);
  const address_state = text(value.address_state, 2).toUpperCase();
  const address_zip = text(value.address_zip, 10);
  const country = text(value.address_country || "US", 2).toUpperCase();
  if (!name || !address_line1 || !address_city || !address_state || !address_zip) {
    throw fail(400, `${label} needs name, address_line1, address_city, address_state, and address_zip.`);
  }
  if (value.address_line2 && !address_line2 && String(value.address_line2).trim()) {
    throw fail(400, `${label}.address_line2 has invalid characters.`);
  }
  if (!STATES.has(address_state)) throw fail(400, `${label} needs a US state.`);
  if (!/^\d{5}(-\d{4})?$/.test(address_zip)) throw fail(400, `${label} needs a US ZIP code.`);
  if (country !== "US") throw fail(400, "ShipLabel ships within the United States only.");
  return { name, address_line1, address_line2, address_city, address_state, address_zip, address_country: "US" };
}

function parcel(value) {
  if (!value || typeof value !== "object") throw fail(400, "parcel is required.");
  const weight_oz = Number(value.weight_oz);
  const length_in = Number(value.length_in);
  const width_in = Number(value.width_in);
  const height_in = Number(value.height_in);
  const ok = [weight_oz, length_in, width_in, height_in].every((n) => Number.isFinite(n) && n > 0 && n <= 2000);
  if (!ok) throw fail(400, "parcel needs positive weight_oz, length_in, width_in, and height_in.");
  return { weight_oz, length_in, width_in, height_in };
}

function demoRates(config) {
  const postage = 550;
  return [
    {
      id: "rate_demo_usps_priority",
      carrier: "USPS",
      service: "Priority",
      rate: "5.50",
      currency: "USD",
      postage_cents: postage,
      demo: true,
    },
  ];
}

export function createOrders(config, db, providers, { now = Date.now } = {}) {
  const get = async (id) => await db.prepare("SELECT * FROM drafts WHERE id=?").get(id);
  const getByLabel = async (id) => await db.prepare("SELECT * FROM drafts WHERE label_id=?").get(id);

  function publicDraft(row) {
    const rates = JSON.parse(row.rates);
    const selected = rates.find((rate) => rate.id === row.selected_rate_id) || lowestRate(rates);
    return {
      draft_id: row.id,
      status: row.status,
      rates,
      quote: selected
        ? quoteFor(selected.postage_cents, config)
        : quoteFor(0, config),
      mode: config.mode,
      easypost_shipment_id: row.easypost_shipment_id,
      purchased: false,
    };
  }

  function publicLabel(row) {
    return {
      label_id: row.label_id,
      draft_id: row.id,
      label_url: row.label_url,
      tracking_code: row.tracking_code,
      status: row.label_status,
      refund_status: row.refund_status,
      carrier: "USPS",
      purchased: Boolean(row.purchased),
      mode: config.mode,
      easypost_shipment_id: row.easypost_shipment_id,
      note: row.purchased
        ? "Postage was purchased through EasyPost after Stripe reported payment_status paid."
        : "Demo stub. EasyPost was not called and no postage was purchased.",
    };
  }

  async function create(input, ownerKey = "gateway") {
    const carrier = assertCarrierAllowed(input?.carrier_hint);
    const from = address(input?.from, "from");
    const to = address(input?.to, "to");
    const box = parcel(input?.parcel);
    const id = `sd_${randomUUID()}`;
    let shipmentId = null;
    let rates;
    if (config.mode === "demo") {
      rates = demoRates(config);
    } else {
      const shipment = await providers.createShipment({ from, to, parcel: box, carrier });
      shipmentId = shipment.id;
      rates = uspsRates(shipment.rates);
      if (!rates.length) {
        throw fail(400, `EasyPost returned no USPS rates for this parcel. ${restrictionMessage("Other carriers")}`, "no_usps_rates");
      }
    }
    const quote = quoteFor(lowestRate(rates).postage_cents, config);
    const ts = now();
    await db.prepare(
      `INSERT INTO drafts (
        id, owner_key, status, created_at, updated_at, from_address, to_address, parcel, carrier_hint, rates,
        easypost_shipment_id, fee_cents, platform_fee_cents, postage_cents, total_cents
      ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      ownerKey,
      ts,
      ts,
      JSON.stringify(from),
      JSON.stringify(to),
      JSON.stringify(box),
      carrier,
      JSON.stringify(rates),
      shipmentId,
      quote.fee_cents,
      quote.platform_fee_cents,
      quote.postage_cents,
      quote.total_cents,
    );
    return publicDraft(await get(id));
  }

  async function read(id) {
    const row = await get(id);
    if (!row) throw fail(404, "Draft not found.", "not_found");
    return publicDraft(row);
  }

  async function list(ownerKey) {
    const rows = await db.prepare("SELECT * FROM drafts WHERE owner_key=? ORDER BY created_at DESC").all(ownerKey);
    return { drafts: rows.map(publicDraft) };
  }

  function rateFor(row, rateId) {
    const rates = JSON.parse(row.rates);
    const rate = rates.find((item) => item.id === rateId);
    if (!rate || rate.carrier !== "USPS") {
      throw fail(400, restrictionMessage(rate?.carrier || "That carrier"), "carrier_not_allowed");
    }
    return rate;
  }

  async function checkout(id, rateId) {
    const row = await get(id);
    if (!row) throw fail(404, "Draft not found.", "not_found");
    if (row.session_id) throw fail(409, "A checkout session already exists for this draft.", "checkout_exists");
    if (row.status !== "draft") throw fail(409, "This draft is not open for checkout.", "checkout_closed");
    const rate = rateFor(row, rateId);
    const quote = quoteFor(rate.postage_cents, config);
    const claimed = await db.prepare(
      `UPDATE drafts SET status='checkout', selected_rate_id=?, postage_cents=?, fee_cents=?, platform_fee_cents=?, total_cents=?,
        lease_until=?, updated_at=? WHERE id=? AND session_id IS NULL AND status='draft' AND lease_until<=?`,
    ).run(rate.id, quote.postage_cents, quote.fee_cents, quote.platform_fee_cents, quote.total_cents, now() + LEASE_MS, now(), id, now());
    if (!claimed.changes) throw fail(409, "Checkout is already in progress for this draft.", "checkout_exists");

    if (config.mode === "demo") {
      const sessionId = `demo_cs_${id}`;
      const labelId = `lbl_${randomUUID()}`;
      const url = `${config.publicUrl}/demo/checkout/${id}`;
      await db.prepare(
        `UPDATE drafts SET session_id=?, checkout_url=?, lease_until=0, label_id=?, label_status='stub', purchased=0, updated_at=? WHERE id=? AND session_id IS NULL`,
      ).run(sessionId, url, labelId, now(), id);
      return {
        draft_id: id,
        checkout_url: url,
        session_id: sessionId,
        label_id: labelId,
        quote,
        mode: "demo",
        purchased: false,
        note: "Demo checkout does not call Stripe or EasyPost and does not buy postage.",
      };
    }

    try {
      const current = await get(id);
      const session = await providers.checkout(current);
      if (!session?.id || !session.url?.startsWith("https://checkout.stripe.com/")) {
        throw fail(503, "Unexpected checkout response.", "checkout_unavailable");
      }
      await db.prepare(`UPDATE drafts SET session_id=?, checkout_url=?, lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL`).run(
        session.id,
        session.url,
        now(),
        id,
      );
      return {
        draft_id: id,
        checkout_url: session.url,
        session_id: session.id,
        quote,
        mode: config.mode,
        purchased: false,
        note: "Stripe checkout is open. EasyPost buy runs only after a webhook with payment_status paid.",
      };
    } catch (error) {
      await db.prepare(`UPDATE drafts SET status='draft', lease_until=0, updated_at=? WHERE id=? AND session_id IS NULL`).run(now(), id);
      if (error.status) throw error;
      throw fail(503, "Payment checkout is temporarily unavailable. The card has not been charged here.", "checkout_unavailable");
    }
  }

  async function buyClaimed(row) {
    let result = null;
    if (typeof providers.inspectShipment === "function" && row.easypost_shipment_id) {
      result = await providers.inspectShipment(row.easypost_shipment_id);
    }
    if (!result?.label_url) result = await providers.buyShipment(row.easypost_shipment_id, row.selected_rate_id);
    if (!result?.label_url) throw fail(502, "EasyPost did not return a label URL.", "provider_error");
    const labelId = row.label_id || `lbl_${randomUUID()}`;
    await db.prepare(
      `UPDATE drafts SET label_id=?, label_url=?, tracking_code=?, label_status='purchased', purchased=1, status='purchased',
        easypost_shipment_id=?, lease_until=0, error=NULL, updated_at=? WHERE id=?`,
    ).run(labelId, result.label_url, result.tracking_code, result.easypost_shipment_id, now(), row.id);
    await db.prepare(`UPDATE claims SET state='bought', lease_until=0 WHERE draft_id=?`).run(row.id);
    return { fulfilled: true, label: publicLabel(await get(row.id)) };
  }

  async function fulfillPaid(session) {
    if (config.mode === "demo") throw fail(404, "Demo mode does not accept payment webhooks.", "demo_webhook");
    if (!session || session.payment_status !== "paid") return { fulfilled: false, reason: "unpaid" };
    const draftId = session.metadata?.draft_id;
    const row = await get(draftId);
    if (!row) throw fail(400, "Unknown draft.", "unknown_draft");
    if (row.session_id && session.id && session.id !== row.session_id) throw fail(400, "Unknown checkout session.", "unknown_session");
    if (session.metadata?.rate_id !== row.selected_rate_id) throw fail(400, "Payment rate does not match this draft.", "payment_mismatch");
    if (Number(session.metadata?.postage_cents) !== row.postage_cents) throw fail(400, "Payment postage does not match this draft.", "payment_mismatch");
    if (Number(session.metadata?.fee_cents) !== row.fee_cents) throw fail(400, "Payment fee does not match this draft.", "payment_mismatch");
    const expected = row.postage_cents + row.fee_cents;
    if (session.amount_total != null && Number(session.amount_total) !== expected) {
      throw fail(400, "Payment amount does not match this draft.", "payment_mismatch");
    }
    if (typeof session.livemode === "boolean" && session.livemode !== (config.mode === "live")) {
      throw fail(400, "Payment livemode does not match APP_MODE.", "payment_mismatch");
    }
    rateFor(row, row.selected_rate_id);

    const inserted = await db.prepare(
      `INSERT INTO claims (draft_id, claimed_at, lease_until, state) VALUES (?, ?, ?, 'claiming') ON CONFLICT DO NOTHING`,
    ).run(row.id, now(), now() + LEASE_MS);
    if (!inserted.changes) {
      const current = await get(row.id);
      if (current.purchased) return { fulfilled: true, duplicate: true, label: publicLabel(current) };
      const claim = await db.prepare("SELECT * FROM claims WHERE draft_id=?").get(row.id);
      if (claim && claim.state === "claiming" && claim.lease_until > now()) return { fulfilled: false, reason: "in_flight" };
      const took = await db.prepare(
        `UPDATE claims SET lease_until=?, state='claiming' WHERE draft_id=? AND state='claiming' AND lease_until<=?`,
      ).run(now() + LEASE_MS, row.id, now());
      if (!took.changes) {
        const again = await get(row.id);
        if (again.purchased) return { fulfilled: true, duplicate: true, label: publicLabel(again) };
        return { fulfilled: false, reason: "in_flight" };
      }
      return buyClaimed(await get(row.id));
    }

    await db.prepare(`UPDATE drafts SET payment_status='paid', payment_id=?, status='paid', updated_at=? WHERE id=?`).run(
      session.payment_intent || session.id,
      now(),
      row.id,
    );
    try {
      return await buyClaimed(await get(row.id));
    } catch (error) {
      await db.prepare(`UPDATE claims SET lease_until=0 WHERE draft_id=? AND state='claiming'`).run(row.id);
      await db.prepare(`UPDATE drafts SET error=?, lease_until=0, updated_at=? WHERE id=?`).run("Label purchase needs retry.", now(), row.id);
      throw error;
    }
  }

  async function label(id) {
    const row = await getByLabel(id);
    if (!row || !row.label_id) throw fail(404, "Label not found.", "not_found");
    return publicLabel(row);
  }

  async function voidLabel(id) {
    const row = await getByLabel(id);
    if (!row || !row.label_id) throw fail(404, "Label not found.", "not_found");
    if (row.label_status === "voided" || row.label_status === "void_submitted") return publicLabel(row);
    if (config.mode === "demo" || !row.purchased) {
      await db.prepare(`UPDATE drafts SET label_status='voided', refund_status='demo_no_postage', updated_at=? WHERE id=?`).run(now(), row.id);
      return publicLabel(await get(row.id));
    }
    const result = await providers.voidShipment(row.easypost_shipment_id);
    const status = result.refund_status === "refunded" ? "voided" : "void_submitted";
    await db.prepare(`UPDATE drafts SET label_status=?, refund_status=?, updated_at=? WHERE id=?`).run(status, result.refund_status, now(), row.id);
    return publicLabel(await get(row.id));
  }

  return { create, read, list, checkout, fulfillPaid, label, voidLabel, get, publicLabel };
}

