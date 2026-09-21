import { readConfig } from './config.js';
import { createApp } from './app.js';

const config = readConfig();
const { app, stop } = await createApp(config);

const server = app.listen(config.port, config.host, () => {
  console.log(`InkSend (${config.mode}) listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => { stop(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
