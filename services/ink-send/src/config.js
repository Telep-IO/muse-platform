import { resolve } from 'node:path';

// Modes: demo (no external calls), test (sandbox provider keys), live.
// Live mode hard-requires HTTPS, real keys, business identity, and a
// recorded handwriting-provider authorization reference — mirroring Paper
// Send's LOB_AUTHORIZATION_REFERENCE gate. Do not launch on a provider's
// self-serve terms; see TERMS-DILIGENCE.md.
export function readConfig(env = process.env) {
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'test', 'live'].includes(mode)) throw new Error('APP_MODE must be demo, test, or live.');

  const baseUrl = new URL(env.BASE_URL || 'http://localhost:3000');
  if (baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password)
    throw new Error('BASE_URL must be an origin.');
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Invalid BASE_URL protocol.');
  if (mode === 'live' && baseUrl.protocol !== 'https:') throw new Error('Live mode requires HTTPS.');

  if (mode !== 'demo') {
    const prefix = mode === 'live' ? 'live' : 'test';
    if (!env.STRIPE_SECRET_KEY?.startsWith(`sk_${prefix}_`)) throw new Error(`Expected a Stripe ${prefix} secret key.`);
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('Set STRIPE_WEBHOOK_SECRET.');
    // TODO: provider key format validation once Handwrytten (or the chosen
    // provider) is confirmed in TERMS-DILIGENCE.md.
    if (!env.INK_PROVIDER) throw new Error('Set INK_PROVIDER (e.g. handwrytten).');
    if (!env.INK_API_KEY) throw new Error('Set INK_API_KEY.');
  }
  if (mode === 'live' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || ''))
    throw new Error('Live mode requires SUPPORT_EMAIL.');
  if (mode === 'live') {
    for (const name of ['LEGAL_BUSINESS_NAME', 'BUSINESS_ADDRESS', 'INK_AUTHORIZATION_REFERENCE']) {
      if (!env[name]?.trim()) throw new Error(`Live mode requires ${name}. See TERMS-DILIGENCE.md.`);
    }
  }

  return {
    mode,
    baseUrl: baseUrl.origin,
    port: Number(env.PORT || 3000),
    host: env.HOST || '127.0.0.1',
    dataDir: resolve(env.DATA_DIR || './data'),
    trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
    stripeKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    inkProvider: env.INK_PROVIDER || '',
    inkKey: env.INK_API_KEY,
    inkSecret: env.INK_API_SECRET,
    inkWebhookSecret: env.INK_WEBHOOK_SECRET,
    inkAuthorizationReference: env.INK_AUTHORIZATION_REFERENCE?.trim() || '',
    supportEmail: env.SUPPORT_EMAIL || '',
    businessName: env.BUSINESS_NAME || 'InkSend',
    legalBusinessName: env.LEGAL_BUSINESS_NAME?.trim() || '',
    businessAddress: env.BUSINESS_ADDRESS?.trim() || '',
  };
}
