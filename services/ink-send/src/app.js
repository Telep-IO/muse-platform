import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { mkdir } from 'node:fs/promises';
import { readConfig } from './config.js';
import { openStore } from './store.js';
import { createLetters, fail, priceForLetter, CARD_OPTIONS } from './letters.js';
import { createProviders } from './providers.js';
import { registerPolicies, CONFIRMATION } from './approval.js';

// Express 4 does not catch async throws: forward them to the error
// middleware instead of crashing the process.
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export async function createApp(config, options = {}) {
  await mkdir(config.dataDir, { recursive: true });
  const store = openStore(config.dataDir);
  const providers = createProviders(config);
  const policies = await registerPolicies(config, store);
  const letters = await createLetters(config, store, providers, { policies, ...options });

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

  app.get('/health', (_req, res) => res.json({ ok: true, mode: config.mode, provider: config.inkProvider || 'unconfigured' }));

  // ---- Stripe webhook (signed) ----
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }), ah(async (req, res) => {
    if (config.mode === 'demo') return res.sendStatus(404);
    let event;
    try {
      event = providers.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret);
    } catch { throw fail(400, 'Invalid webhook signature.'); }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type))
      await letters.recordPayment(event.data.object);
    res.json({ received: true });
  }));

  // ---- Handwriting provider status webhook (STUB — see TERMS-DILIGENCE.md) ----
  // TODO: verify provider signature, map event to sent/failed.
  app.post('/api/webhooks/ink', express.raw({ type: 'application/json', limit: '256kb' }), ah(async (req, res) => {
    await letters.providerWebhook(req.body, req.headers);
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
    mode: config.mode, priceCents: priceForLetter(),
    cardOptions: CARD_OPTIONS, messageMinChars: 10, messageMaxChars: 2000,
    confirmation: CONFIRMATION,
    supportEmail: config.supportEmail, businessName: config.businessName,
  }));

  const createLimit = options.noRateLimit ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 3600000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: 'Letter limit reached. Please try again in an hour.' } });

  // JSON body only: the agent submits the exact message text and recipient.
  app.post('/api/letters', createLimit, ah(async (req, res) => {
    const letter = await letters.create(req.body || {});
    res.status(201).json(letter);
  }));

  const token = req => req.headers.authorization?.replace(/^Bearer /, '') || '';
  app.get('/api/letters/:id', ah(async (req, res) => res.json(letters.view(req.params.id, token(req)))));
  // Human-gated: the website calls this after the reviewer confirms on the
  // review page. It is NOT an autonomous agent action.
  app.post('/api/letters/:id/checkout', ah(async (req, res) => res.json(await letters.checkout(req.params.id, token(req), req.body))));

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

  app.use(express.static(new URL('../public', import.meta.url).pathname, { index: 'index.html', etag: true, maxAge: 0 }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error instanceof ZodError)
      return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
    if (status === 503) console.error(JSON.stringify({ event: 'request_failed', type: error.name }));
    res.status(status).json({ error: status === 503 ? 'Something is temporarily unavailable. Please retry shortly.' : error.message });
  });

  // Background worker: fulfillment + expiry + purge.
  const timer = setInterval(() => letters.maintenance().catch(e =>
    console.error(JSON.stringify({ event: 'maintenance_failed', type: e?.name }))), 60_000);
  timer.unref?.();

  return { app, letters, store, stop: () => { clearInterval(timer); store.close(); } };
}

export { readConfig };
