import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnvelopes, fail } from './envelopes.js';
import { MAX_BYTES, MAX_PAGES, envelopeDir } from './documents.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
export async function createApp(config, db, providers, options = {}) {
  const app = express();
  const envelopes = await createEnvelopes(config, db, providers, options);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameSrc: ["'none'"],
    formAction: ["'self'"], upgradeInsecureRequests: config.baseUrl.startsWith('https:') ? [] : null } },
    referrerPolicy: { policy: 'no-referrer' }, strictTransportSecurity: config.baseUrl.startsWith('https:') ? undefined : false }));
  app.get('/health', async (_req, res) => { await db.prepare('SELECT 1').get(); res.json({ ok: true, mode: config.mode }); });
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '512kb' }), async (req, res) => {
    if (config.mode === 'demo') return res.sendStatus(404);
    let event;
    try { event = providers.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret); }
    catch { throw fail(400, 'Invalid webhook signature.'); }
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) await envelopes.recordPayment(event.data.object);
    res.json({ received: true });
  });
  // TODO(provider): provider signer-event webhook. When a real e-signature
  // provider is integrated (see TERMS-DILIGENCE.md), verify the provider's
  // event signature here and route signer signed/declined events through
  // envelopes.applySignerEvent(). Never trust an unsigned event.
  app.post('/api/webhooks/esign', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    if (config.mode === 'demo') return res.sendStatus(404);
    throw fail(501, 'The e-signature provider webhook is not implemented in this scaffold.');
  });
  // Demo-only: simulate a provider signer event ('signed' | 'declined') so the
  // full sent -> signed/declined state machine can be exercised end to end.
  // Not reachable outside demo mode. The real provider webhook replaces this.
  app.post('/api/envelopes/:id/demo-event', express.json({ limit: '16kb' }), async (req, res) => {
    if (config.mode !== 'demo') return res.sendStatus(404);
    const envelope = await envelopes.authorized(req.params.id, (req.headers.authorization || '').replace(/^Bearer /, ''));
    res.json(await envelopes.applySignerEvent(envelope.id, req.body?.email, req.body?.event));
  });
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
  app.get('/api/config', (_req, res) => res.json({ mode: config.mode, maxPages: MAX_PAGES, maxBytes: MAX_BYTES,
    maxSigners: 5, priceCents: 299, supportEmail: config.supportEmail, businessName: config.businessName, automaticTax: config.automaticTax }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 10240 } });
  let processing = 0;
  const createLimit = options.noRateLimit ? (_req, _res, next) => next() : rateLimit({ windowMs: 3600000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Upload limit reached. Please try again in an hour.' } });
  // Reserve capacity before Multer buffers a file. Always release on close/error.
  app.post('/api/envelopes', createLimit, (req, res, next) => {
    if (processing >= 2) return res.status(503).json({ error: 'We are preparing other envelopes. Please try again shortly.' });
    processing++;
    let released = false, handling = false;
    const release = () => { if (!released) { released = true; processing--; } };
    res.on('close', () => { if (!handling) release(); });
    upload.single('document')(req, res, async error => {
      handling = true;
      try {
        if (error) throw error;
        let input;
        try { input = JSON.parse(req.body.signers); } catch { throw fail(400, 'Provide the signer list: names and email addresses.'); }
        const envelope = await envelopes.create(input, req.file);
        res.status(201).json(envelope);
      } catch (error) { next(error); } finally { release(); }
    });
  });
  const token = req => req.headers.authorization?.replace(/^Bearer /, '') || '';
  app.get('/api/envelopes/:id', async (req, res) => res.json(await envelopes.status(req.params.id, token(req))));
  app.post('/api/envelopes/:id/checkout', async (req, res) => res.json(await envelopes.checkout(req.params.id, token(req), req.body)));
  app.get('/api/envelopes/:id/document', async (req, res) => {
    const envelope = await envelopes.authorized(req.params.id, token(req));
    if (envelope.purged) throw fail(410, 'This document has been removed.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="signsend-document.pdf"' });
    res.sendFile(resolve(envelopeDir(config, envelope.id), 'upload.pdf'));
  });
  app.get('/api/envelopes/:id/pages/:page', async (req, res) => {
    const envelope = await envelopes.authorized(req.params.id, token(req));
    const page = Number(req.params.page);
    if (envelope.purged || !Number.isInteger(page) || page < 1 || page > envelope.pages) throw fail(404, 'Page not found.');
    res.sendFile(resolve(envelopeDir(config, envelope.id), `page-${page}.png`));
  });
  for (const kind of ['terms', 'privacy']) app.get(`/${kind}.html`, async (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send((await db.prepare('SELECT html FROM policies WHERE version=?').get(envelopes.policies[`${kind}_version`])).html);
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
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'PDF must be 10 MB or smaller.' : 'Upload one PDF and the signer list.' });
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
    if (status === 503) console.error(JSON.stringify({ event: 'request_failed', type: error.name }));
    res.status(status).json({ error: status === 503 ? 'Something is temporarily unavailable. Please retry shortly.' : error.message });
  });
  return { app, envelopes };
}
