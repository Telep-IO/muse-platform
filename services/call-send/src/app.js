import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { readConfig } from './config.js';
import { openStore } from './store.js';
import { createCalls, fail, PRICE_CENTS, MIN_SCRIPT_CHARS, MAX_SCRIPT_CHARS, VOICES } from './calls.js';
import { createProviders } from './providers.js';
import { registerPolicies } from './approval.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Express 4 does not catch async throws: forward them to the error
// middleware instead of crashing the process.
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export async function createApp(config, options = {}) {
  await mkdir(config.dataDir, { recursive: true });
  const store = openStore(config.dataDir);
  const providers = createProviders(config);
  const policies = await registerPolicies(config, store);
  const calls = await createCalls(config, store, providers, { policies, ...options });

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

  app.get('/health', (_req, res) => res.json({ ok: true, mode: config.mode, provider: config.callProvider || 'unconfigured' }));

  // ---- Stripe webhook (signed) ----
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }), ah(async (req, res) => {
    if (config.mode === 'demo') return res.sendStatus(404);
    let event;
    try {
      event = providers.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret);
    } catch { throw fail(400, 'Invalid webhook signature.'); }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type))
      await calls.recordPayment(event.data.object);
    res.json({ received: true });
  }));

  // ---- Voice provider status webhook (STUB — see TERMS-DILIGENCE.md) ----
  // TODO: verify the provider signature (Twilio: X-Twilio-Signature with
  // TWILIO_WEBHOOK_SECRET), then map the event to
  // completed/no-answer/failed via providers.normalizeStatus().
  app.post('/api/webhooks/voice', express.raw({ type: 'application/x-www-form-urlencoded', limit: '256kb' }), ah(async (req, res) => {
    await calls.providerWebhook(req.body, req.headers);
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
    mode: config.mode, priceCents: PRICE_CENTS,
    minScriptChars: MIN_SCRIPT_CHARS, maxScriptChars: MAX_SCRIPT_CHARS,
    voices: VOICES, maxCallMinutes: 5,
    supportEmail: config.supportEmail, businessName: config.businessName,
  }));

  // Tighter create limit: placing calls is the highest-abuse surface of any
  // connector in this family. One draft per call, no bulk endpoint.
  const createLimit = options.noRateLimit ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 3600000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: 'Call draft limit reached. Please try again in an hour.' } });

  app.post('/api/calls', createLimit, ah(async (req, res) => {
    res.status(201).json(await calls.create(req.body));
  }));

  const token = req => req.headers.authorization?.replace(/^Bearer /, '') || '';
  app.get('/api/calls/:id', ah(async (req, res) => res.json(calls.view(req.params.id, token(req)))));
  // Human-gated: the website calls this after the reviewer confirms on the
  // review page. It is NOT an autonomous agent action.
  app.post('/api/calls/:id/checkout', ah(async (req, res) => res.json(await calls.checkout(req.params.id, token(req), req.body))));

  // Demo-only: simulate provider events to exercise the state machine.
  app.post('/api/calls/:id/demo-event', ah(async (req, res) => res.json(await calls.demoEvent(req.params.id, token(req), req.body))));

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
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
    if (status === 503) console.error(JSON.stringify({ event: 'request_failed', type: error.name }));
    res.status(status).json({ error: status === 503 ? 'Something is temporarily unavailable. Please retry shortly.' : error.message });
  });

  // Background worker: fulfillment + expiry + purge.
  const timer = setInterval(() => calls.maintenance().catch(e =>
    console.error(JSON.stringify({ event: 'maintenance_failed', type: e?.name }))), 60_000);
  timer.unref?.();

  return { app, calls, store, stop: () => { clearInterval(timer); store.close(); } };
}
