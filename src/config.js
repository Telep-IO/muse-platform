import { resolve } from 'node:path';

export function readConfig(env = process.env) {
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'test', 'live'].includes(mode)) throw new Error('APP_MODE must be demo, test, or live.');
  const baseUrl = new URL(env.BASE_URL || 'http://localhost:3000');
  if (baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password) throw new Error('BASE_URL must be an origin.');
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Invalid BASE_URL protocol.');
  if (mode === 'live' && baseUrl.protocol !== 'https:') throw new Error('Live mode requires HTTPS.');
  if (mode !== 'demo') {
    const prefix = mode === 'live' ? 'live' : 'test';
    if (!env.STRIPE_SECRET_KEY?.startsWith(`sk_${prefix}_`)) throw new Error(`Expected a Stripe ${prefix} secret key.`);
    // TODO(terms-diligence): require the chosen e-signature provider's API key here
    // once a provider with a confirmed white-label/partner track is selected.
    // See TERMS-DILIGENCE.md. Do not invent a provider key shape before then.
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('Set STRIPE_WEBHOOK_SECRET.');
  }
  if (mode === 'live' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || '')) throw new Error('Live mode requires SUPPORT_EMAIL.');
  if (mode === 'live') {
    for (const name of ['LEGAL_BUSINESS_NAME', 'BUSINESS_ADDRESS', 'ESIGN_AUTHORIZATION_REFERENCE']) {
      if (!env[name]?.trim()) throw new Error(`Live mode requires ${name}. See TERMS-DILIGENCE.md.`);
    }
  }
  if (env.STRIPE_AUTOMATIC_TAX === 'true' && !env.STRIPE_TAX_CODE) throw new Error('Automatic tax requires STRIPE_TAX_CODE.');
  if (env.DATABASE_URL) {
    let url;
    try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a PostgreSQL connection URL.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
    // Remote database connections must authenticate the server's certificate.
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local && url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Remote DATABASE_URL requires sslmode=verify-full.');
  }
  return {
    mode, baseUrl: baseUrl.origin, port: Number(env.PORT || 3000), host: env.HOST || '127.0.0.1',
    dataDir: resolve(env.DATA_DIR || './data'), trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
    databaseUrl: env.DATABASE_URL || '',
    stripeKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    supportEmail: env.SUPPORT_EMAIL || '', businessName: env.BUSINESS_NAME || 'SignSend',
    legalBusinessName: env.LEGAL_BUSINESS_NAME?.trim() || '', businessAddress: env.BUSINESS_ADDRESS?.trim() || '',
    esignAuthorizationReference: env.ESIGN_AUTHORIZATION_REFERENCE?.trim() || '',
    automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true', taxCode: env.STRIPE_TAX_CODE,
  };
}
