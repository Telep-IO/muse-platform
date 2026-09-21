import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { readConfig } from './config.js';
import { openStore } from './store.js';
import { createFaxes, fail } from './faxes.js';
import { createProviders } from './providers.js';
import { registerPolicies } from './approval.js';
import { MAX_BYTES, MAX_PAGES, documentDir } from './documents.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Express 4 does not catch async throws: forward them to the error
// middleware instead of crashing the process.
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export async function createApp(config, options = {}) {
  await mkdir(config.dataDir, { recursive: true });
  const store = openStore(config.dataDir);
  const providers = createProviders(config);
  const policies = await registerPolicies(config, store);
  const faxes = await createFaxes(config, store, providers, { policies, ...options });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
      imgSrc: ["'self'", 'blob:'], connectSrc: ["'self'"],
      objectSrc: ["'none'"], frameSrc: ["'none'"], formAction: ["'self'"],
      upgradeInsecureRequests: config.baseUrl.startsWith('https:') ? [] : null,
    } },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.baseUrl.startsWith('https:') ? undefined : false,
  }));

  app.get('/health', (_req, res) => res.json({ ok: true, mode: config.mode, provider: config.faxProvider || 'unconfigured' }));

  // ---- Stripe webhook (signed) ----
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }), ah(async (req, res) => {
    if (config.mode === 'demo') return res.sendStatus(404);
    let event;
    try {
      event = providers.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret);
    } catch { throw fail(400, 'Invalid webhook signature.'); }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type))
      await faxes.recordPayment(event.data.object);
    res.json({ received: true });
  }));

  // ---- Fax provider delivery webhook (STUB — see TERMS-DILIGENCE.md) ----
  // TODO: verify provider signature, map event to delivered/failed.
  app.post('/api/webhooks/fax', express.raw({ type: 'application/json', limit: '256kb' }), ah(async (req, res) => {
    await faxes.providerWebhook(req.body, req.headers);
    res.json({ received: true });
  }));

  // ---- API hardening: no-store + same-origin ----
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && origin !== config.baseUrl) return res.status(403).json({ error: 'Cross-site request blocked.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request blocked.' });
    next();
  });
  if (!options.noRateLimit)
    app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a minute.' } }));
  app.use(express.json({ limit: '16kb' }));

  // Public pricing so agents can quote without creating a draft.
  app.get('/api/config', (_req, res) => res.json({
    mode: config.mode, maxPages: MAX_PAGES, maxBytes: MAX_BYTES,
    pricePerPageCents: 99, coverPageCountsAsPage: true,
    supportEmail: config.supportEmail, businessName: config.businessName,
  }));

  const upload = multer({ storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 4096 } });
  let processing = 0;
  const createLimit = options.noRateLimit ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 3600000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: 'Upload limit reached. Please try again in an hour.' } });

  // Reserve capacity before Multer buffers a file. Always release on close/error.
  app.post('/api/faxes', createLimit, (req, res, next) => {
    if (processing >= 2) return res.status(503).json({ error: 'We are preparing other faxes. Please try again shortly.' });
    processing++;
    let released = false, handling = false;
    const release = () => { if (!released) { released = true; processing--; } };
    res.on('close', () => { if (!handling) release(); });
    upload.single('document')(req, res, async error => {
      handling = true;
      try {
        if (error) throw error;
        let input;
        try { input = JSON.parse(req.body.to); } catch { throw fail(400, 'Enter the destination fax number.'); }
        const fax = await faxes.create(input, req.file);
        res.status(201).json(fax);
      } catch (error) { next(error); } finally { release(); }
    });
  });

  const token = req => req.headers.authorization?.replace(/^Bearer /, '') || '';
  app.get('/api/faxes/:id', ah(async (req, res) => res.json(faxes.view(req.params.id, token(req)))));
  // Human-gated: the website calls this after the reviewer confirms on the
  // review page. It is NOT an autonomous agent action.
  app.post('/api/faxes/:id/checkout', ah(async (req, res) => res.json(await faxes.checkout(req.params.id, token(req), req.body))));

  // Token-gated previews of exactly what will transmit.
  app.get('/api/faxes/:id/document', ah(async (req, res) => {
    const fax = faxes.authorized(req.params.id);
    faxes.checkToken(fax, token(req));
    if (fax.purged) throw fail(410, 'This document has been removed.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="faxsend-fax.pdf"' });
    res.sendFile(resolve(documentDir(config, fax.id), 'print.pdf'));
  }));
  app.get('/api/faxes/:id/pages/:page', ah(async (req, res) => {
    const fax = faxes.authorized(req.params.id);
    faxes.checkToken(fax, token(req));
    const page = Number(req.params.page);
    if (fax.purged || !Number.isInteger(page) || page < 1 || page > fax.pages) throw fail(404, 'Page not found.');
    res.sendFile(resolve(documentDir(config, fax.id), `page-${page}.png`));
  }));

  for (const kind of ['terms', 'privacy'])
    app.get(`/${kind}.html`, ah(async (_req, res) => {
      const policy = store.policy(policies[`${kind}_version`]);
      res.set('Cache-Control', 'no-store').type('html').send(policy.html);
    }));
  app.get('/policies/:kind/:version', ah(async (req, res) => {
    const policy = await store.policy(req.params.version);
    if (!policy || policy.kind !== req.params.kind) throw fail(404, 'Policy version not found.');
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type('html').send(policy.html);
  }));

  app.use(express.static(publicDir, { index: 'index.html', etag: true, maxAge: 0 }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error instanceof ZodError)
      return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (error instanceof multer.MulterError)
      return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'PDF must be 10 MB or smaller.' : 'Upload one PDF and the destination details.' });
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
    if (status === 503) console.error(JSON.stringify({ event: 'request_failed', type: error.name }));
    res.status(status).json({ error: status === 503 ? 'Something is temporarily unavailable. Please retry shortly.' : error.message });
  });

  // Background worker: fulfillment + expiry + purge.
  const timer = setInterval(() => faxes.maintenance().catch(e =>
    console.error(JSON.stringify({ event: 'maintenance_failed', type: e?.name }))), 60_000);
  timer.unref?.();

  return { app, faxes, store, stop: () => { clearInterval(timer); store.close(); } };
}
