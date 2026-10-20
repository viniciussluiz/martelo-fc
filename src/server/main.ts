import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT_DIR } from './config.js';

/** Carrega `.env` da raiz, se existir, sem sobrescrever variáveis já definidas. */
function loadDotEnv(path = resolve(ROOT_DIR, '.env')) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, raw] = m;
    const value = raw!.replace(/^["']|["']$/g, '');
    if (process.env[key!] === undefined && value !== '') process.env[key!] = value;
  }
}

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
