import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { fileURLToPath } from 'node:url';
import { createDomains, fail } from './domains.js';
import { SUPPORTED_TLDS, TLD_PRICES, MAX_YEARS, WHOIS_PRIVACY_INCLUDED } from './config.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
export async function createApp(config, db, providers, options = {}) {
  const app = express();
  const domains = await createDomains(config, db, providers, options);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameSrc: ["'none'"],
    formAction: ["'self'"], upgradeInsecureRequests: config.baseUrl.startsWith('https:') ? [] : null } },
    referrerPolicy: { policy: 'no-referrer' }, strictTransportSecurity: config.baseUrl.startsWith('https:') ? undefined : false }));
  app.get('/health', async (_req, res) => { await db.prepare('SELECT 1').get(); res.json({ ok: true, mode: config.mode }); });
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }), async (req, res) => {
    if (config.mode === 'demo') return res.sendStatus(404);
    let event;
    try { event = providers.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret); }
    catch { throw fail(400, 'Invalid webhook signature.'); }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) await domains.recordPayment(event.data.object);
    res.json({ received: true });
  });
  // Note: reseller registry APIs (e.g. OpenSRS) are poll-based — registration
  // results come back from the API call itself, so v1 needs no provider
  // webhook. If a future provider pushes async order events, verify the
  // provider's event signature before trusting anything.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && origin !== config.baseUrl) return res.status(403).json({ error: 'Cross-site request blocked.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request blocked.' });
    next();
  });
  if (!options.noRateLimit) app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute.' } }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/config', (_req, res) => res.json({ mode: config.mode, tlds: SUPPORTED_TLDS, prices: TLD_PRICES,
    maxYears: MAX_YEARS, whoisPrivacyIncluded: WHOIS_PRIVACY_INCLUDED,
    supportEmail: config.supportEmail, businessName: config.businessName, automaticTax: config.automaticTax }));
  // Availability probes are provider calls in live mode; rate-limit tightly.
  const checkLimit = options.noRateLimit ? (_req, _res, next) => next() : rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many availability checks. Please wait a minute.' } });
  app.post('/api/domains/check', checkLimit, async (req, res) => res.json(await domains.check(req.body)));
  const createLimit = options.noRateLimit ? (_req, _res, next) => next() : rateLimit({ windowMs: 3600000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Draft limit reached. Please try again in an hour.' } });
  app.post('/api/domains', createLimit, async (req, res) => res.status(201).json(await domains.create(req.body)));
  const token = req => req.headers.authorization?.replace(/^Bearer /, '') || '';
  app.get('/api/domains/:id', async (req, res) => res.json(await domains.status(req.params.id, token(req))));
  app.post('/api/domains/:id/checkout', async (req, res) => res.json(await domains.checkout(req.params.id, token(req), req.body)));
  for (const kind of ['terms', 'privacy']) app.get(`/${kind}.html`, async (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send((await db.prepare('SELECT html FROM policies WHERE version=?').get(domains.policies[`${kind}_version`])).html);
  });
  app.get('/policies/:kind/:version', async (req, res) => {
    const policy = await db.prepare('SELECT html FROM policies WHERE kind=? AND version=?').get(req.params.kind, req.params.version);
    if (!policy) throw fail(404, 'Policy version not found.');
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type('html').send(policy.html);
  });
  app.use(express.static(publicDir, { index: 'index.html', etag: true, maxAge: 0 }));
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
    if (status === 503) console.error(JSON.stringify({ event: 'request_failed', type: error.name }));
    res.status(status).json({ error: status === 503 ? 'Something is temporarily unavailable. Please retry shortly.' : error.message });
  });
  return { app, domains };
}
