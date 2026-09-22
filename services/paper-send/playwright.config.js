import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 45000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3101', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }, screenshot: 'only-on-failure' },
  webServer: { command: 'node src/server.js', url: 'http://127.0.0.1:3101/health', reuseExistingServer: false,
    env: { APP_MODE: 'demo', PORT: '3101', BASE_URL: 'http://127.0.0.1:3101', HOST: '127.0.0.1', DATA_DIR: `/tmp/papersend-browser-${process.pid}` } },
});
