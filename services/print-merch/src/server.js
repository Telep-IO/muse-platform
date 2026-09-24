import express from "express";
import { timingSafeEqual } from "node:crypto";
import { readConfig } from "./config.js";
import { createOrders } from "./orders.js";
import { createPrintify, createStripe, demoPrintify, verifyPrintifySignature } from "./providers.js";
import { openStore } from "./store.js";

function sameSecret(expected, got) {
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(config, orders) {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "print-merch", mode: config.mode });
  });

  app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const event = await orders.stripeEvent(raw, req.get("stripe-signature"));
      const result = await orders.fulfillPaid(event);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/webhooks/printify", express.raw({ type: "application/json" }), async (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      if (config.mode === "demo") throw Object.assign(new Error("Demo mode does not accept Printify webhooks."), { status: 400, code: "demo" });
      if (!verifyPrintifySignature(raw, req.get("x-pfy-signature"), config.printifyWebhookSecret)) {
        throw Object.assign(new Error("Invalid Printify signature."), { status: 401, code: "invalid_signature" });
      }
      const payload = raw ? JSON.parse(raw) : {};
      res.json(await orders.applyPrintifyEvent(payload));
    } catch (error) {
      next(error);
    }
  });

  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    if (!config.serviceToken) return next();
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!sameSecret(config.serviceToken, token)) {
      return res.status(401).json({ error: { code: "unauthorized", message: "Bearer service token is required." } });
    }
    next();
  });

  function owner(req) {
    const id = req.get("x-owner-key-id");
    if (!id) throw Object.assign(new Error("X-Owner-Key-Id is required."), { status: 401, code: "unauthorized" });
    return id;
  }

  const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  app.post("/drafts", route(async (req, res) => {
    res.status(201).json(await orders.createDraft(req.body, owner(req)));
  }));

  app.post("/drafts/:id/checkout", route(async (req, res) => {
    res.json(await orders.checkout(req.params.id, owner(req), req.body || {}));
  }));

  app.get("/orders", route(async (req, res) => {
    res.json(await orders.list(owner(req)));
  }));

  app.get("/orders/:id", route(async (req, res) => {
    res.json(await orders.get(req.params.id, owner(req)));
  }));

  app.post("/orders/:id/cancel", route(async (req, res) => {
    res.json(await orders.cancel(req.params.id, owner(req)));
  }));

  app.post("/mockups", route(async (req, res) => {
    const body = req.body || {};
    owner(req);
    const id = `mock_${Date.now()}`;
    const artwork = typeof body.artwork_url === "string" ? body.artwork_url : "";
    if (!artwork.startsWith("https://")) throw Object.assign(new Error("artwork_url must be an https URL"), { status: 400, code: "invalid_request" });
    const produced = await orders.createMockup({
      blueprint_id: body.blueprint_id,
      print_provider_id: body.print_provider_id,
      variant_id: body.variant_id,
      artwork_url: artwork,
      quantity: 1,
      mockupOnly: true,
      draftId: id,
    });
    res.json({ mockup_urls: produced.mockupUrls, printify_product_id: produced.productId, note: produced.note || "Mockup only. No production order was submitted." });
  }));

  app.get("/check", route(async (_req, res) => {
    if (config.mode === "demo") {
      return res.json({ ok: true, mode: "demo", printify: "skipped", order_approval: "not_checked", spend: "none" });
    }
    await orders.preflight();
    res.json({ ok: true, mode: config.mode, printify: "ok", order_approval: "manual", production: false, spend: "none" });
  }));

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ error: { code: error.code || "error", message: error.message || "Request failed" } });
  });

  return app;
}

export async function buildApp(env = process.env, overrides = {}) {
  const config = overrides.config || readConfig(env);
  const printify = overrides.printify || (config.mode === "demo" ? demoPrintify() : createPrintify(config, overrides.fetchImpl));
  if (config.mode !== "demo" && !overrides.skipPreflight) await printify.preflight();
  const store = overrides.store || (await openStore(config));
  const stripe = overrides.stripe || createStripe(config);
  const orders = createOrders(config, store, { printify, stripe });
  const api = {
    ...orders,
    preflight: () => printify.preflight(),
    createMockup: (input) => printify.createProduct(input),
    stripeEvent: (raw, signature) => stripe.constructEvent(raw, signature),
  };
  return { app: createApp(config, api), store, orders: api, config };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain && process.argv[1].endsWith("server.js")) {
  const started = await buildApp();
  started.app.listen(started.config.port, started.config.host);
}
