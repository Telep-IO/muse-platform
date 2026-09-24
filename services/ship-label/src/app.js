import express from "express";
import { readFile } from "node:fs/promises";
import { createOrders, fail } from "./orders.js";

async function policy(kind) {
  return readFile(new URL(`../policies/${kind}.html`, import.meta.url), "utf8");
}

export async function createApp(config, db, providers, options = {}) {
  const app = express();
  const orders = createOrders(config, db, providers, options);
  app.disable("x-powered-by");
  app.get("/health", async (_req, res) => {
    await db.prepare("SELECT 1").get();
    res.json({ ok: true, mode: config.mode, carriers: ["USPS"] });
  });

  app.post("/webhooks/stripe", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    if (config.mode === "demo") throw fail(404, "Demo mode does not accept payment webhooks.", "demo_webhook");
    let event;
    try {
      event = providers.stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], config.webhookSecret);
    } catch {
      throw fail(400, "Invalid webhook signature.", "invalid_signature");
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const result = await orders.fulfillPaid(event.data.object);
      return res.json({ received: true, ...result });
    }
    return res.json({ received: true, fulfilled: false, reason: "ignored" });
  });

  app.use(express.json({ limit: "32kb" }));

  if (config.serviceToken) {
    app.use((req, res, next) => {
      if (req.path === "/health" || req.path.startsWith("/policies") || req.path.endsWith(".html")) return next();
      const header = req.headers.authorization || "";
      if (header !== `Bearer ${config.serviceToken}`) return res.status(401).json({ error: "Unauthorized." });
      next();
    });
  }

  app.post("/drafts", async (req, res) => {
    const draft = await orders.create(req.body, req.headers["x-owner-key"] || "gateway");
    res.status(201).json(draft);
  });
  app.get("/drafts/:id", async (req, res) => {
    res.json(await orders.read(req.params.id));
  });
  app.get("/drafts", async (req, res) => {
    res.json(await orders.list(req.headers["x-owner-key"] || "gateway"));
  });
  app.post("/drafts/:id/checkout", async (req, res) => {
    const result = await orders.checkout(req.params.id, req.body?.rate_id);
    res.status(201).json(result);
  });
  app.get("/labels/:id", async (req, res) => {
    res.json(await orders.label(req.params.id));
  });
  app.post("/labels/:id/void", async (req, res) => {
    res.json(await orders.voidLabel(req.params.id));
  });

  app.get("/policies/privacy.html", async (_req, res) => {
    res.type("html").send(await policy("privacy"));
  });
  app.get("/policies/terms.html", async (_req, res) => {
    res.type("html").send(await policy("terms"));
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 503;
    if (status >= 500) console.error(JSON.stringify({ event: "request_failed", code: error.code || error.name }));
    res.status(status).json({
      error: status >= 500 && !error.status ? "Something is temporarily unavailable. Please retry shortly." : error.message,
      code: error.code || (status >= 500 ? "unavailable" : "invalid_request"),
    });
  });
  return { app, orders };
}
