const publicCheck = process.argv.includes('--public');
const url = publicCheck ? process.env.BASE_URL : 'http://127.0.0.1:3000';
let ok = false;
for (let attempt = 0; attempt < (publicCheck ? 12 : 1); attempt++) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    const health = await response.json();
    if (response.ok && health.ok && health.mode === process.env.APP_MODE) { ok = true; break; }
  } catch { /* DNS and TLS can take a moment on the first deployment. */ }
  if (publicCheck) await new Promise(resolve => setTimeout(resolve, 5000));
}
if (!ok) process.exitCode = 1;
