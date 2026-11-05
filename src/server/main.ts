import { loadDotEnv } from './config.js';

loadDotEnv();
const { createApp } = await import('./app.js');
const app = await createApp();
const { APP_VERSION } = await import('./config.js');
const port = new URL(app.url).port;
console.log(`\nMartelo FC ${APP_VERSION} no ar: http://localhost:${port}`);
console.log(`Baralho: ${app.deckInfo.name} (${app.deckInfo.total} cartas)\n`);

const shutdown = async (signal: string) => {
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl: 'info', msg: 'encerrando', signal }));
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
