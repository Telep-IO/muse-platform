import { resolve } from 'node:path';

// Modes: demo (no external calls), test (sandbox provider keys), live.
// Live mode hard-requires HTTPS, real keys, business identity, and a
// recorded voice-provider authorization reference — mirroring Paper Send's
// LOB_AUTHORIZATION_REFERENCE gate. Do not launch on a provider's
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
    if (!env.CALL_PROVIDER) throw new Error('Set CALL_PROVIDER (e.g. twilio).');
    if (!env.TWILIO_ACCOUNT_SID) throw new Error('Set TWILIO_ACCOUNT_SID.');
    if (!env.TWILIO_AUTH_TOKEN) throw new Error('Set TWILIO_AUTH_TOKEN.');
    if (!env.TWILIO_FROM_NUMBER) throw new Error('Set TWILIO_FROM_NUMBER.');
  }
  if (mode === 'live' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || ''))
    throw new Error('Live mode requires SUPPORT_EMAIL.');
  if (mode === 'live') {
    for (const name of ['LEGAL_BUSINESS_NAME', 'BUSINESS_ADDRESS', 'CALL_AUTHORIZATION_REFERENCE']) {
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
    callProvider: env.CALL_PROVIDER || 'twilio',
    twilioSid: env.TWILIO_ACCOUNT_SID,
    twilioToken: env.TWILIO_AUTH_TOKEN,
    twilioFrom: env.TWILIO_FROM_NUMBER,
    twilioWebhookSecret: env.TWILIO_WEBHOOK_SECRET,
    callAuthorizationReference: env.CALL_AUTHORIZATION_REFERENCE?.trim() || '',
    supportEmail: env.SUPPORT_EMAIL || '',
    businessName: env.BUSINESS_NAME || 'CallSend',
    legalBusinessName: env.LEGAL_BUSINESS_NAME?.trim() || '',
    businessAddress: env.BUSINESS_ADDRESS?.trim() || '',
  };
}
