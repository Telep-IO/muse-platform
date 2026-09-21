import { resolve } from 'node:path';

// Retail price per year, USD cents. WHOIS privacy is included free on every
// registration. Provider wholesale costs are TBD — see TERMS-DILIGENCE.md
// before going live; these retail figures must leave a maintainable margin
// after wholesale + Stripe fees.
export const TLD_PRICES = {
  com: 1499,
  net: 1499,
  org: 1399,
  io: 3999,
  dev: 1499,
  app: 1999,
  tools: 2999,
};
export const SUPPORTED_TLDS = Object.keys(TLD_PRICES);
export const MIN_YEARS = 1;
export const MAX_YEARS = 2;
export const WHOIS_PRIVACY_INCLUDED = true;

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
    // TODO(terms-diligence): require the reseller platform credentials here
    // once OpenSRS (or the chosen platform) onboarding is complete.
    // See TERMS-DILIGENCE.md. Do not invent a credential shape before then.
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('Set STRIPE_WEBHOOK_SECRET.');
  }
  if (mode === 'live' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || '')) throw new Error('Live mode requires SUPPORT_EMAIL.');
  if (mode === 'live') {
    for (const name of ['LEGAL_BUSINESS_NAME', 'BUSINESS_ADDRESS', 'DOMAIN_AUTHORIZATION_REFERENCE']) {
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
    supportEmail: env.SUPPORT_EMAIL || '', businessName: env.BUSINESS_NAME || 'DomainSend',
    legalBusinessName: env.LEGAL_BUSINESS_NAME?.trim() || '', businessAddress: env.BUSINESS_ADDRESS?.trim() || '',
    domainAuthorizationReference: env.DOMAIN_AUTHORIZATION_REFERENCE?.trim() || '',
    automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true', taxCode: env.STRIPE_TAX_CODE,
  };
}
