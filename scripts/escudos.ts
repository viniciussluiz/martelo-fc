/**
 * npm run escudos — busca os escudos dos clubes do baralho e grava em data/escudos/.
 *
 *   API_FUTEBOL_KEY=live_...   (no .env) usa a API Futebol primeiro; o que faltar vem do TheSportsDB.
 *   --sem-baixar               só atualiza data/escudos/fontes.json (o navegador carrega direto da fonte).
 *
 * Reinicie o servidor depois para ele ler os escudos novos.
 */
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { Card } from '../src/engine/types.js';
import { loadConfig, loadDotEnv, ROOT_DIR } from '../src/server/config.js';
import { clubGroup } from '../src/tools/escudos/clubs.js';
import { syncCrests } from '../src/tools/escudos/sync.js';

loadDotEnv();
const config = loadConfig();
const download = !process.argv.includes('--sem-baixar');
const deck = JSON.parse(readFileSync(config.deckPath, 'utf8')) as { name?: string; cards: Card[] };
const clubs = [...new Map(deck.cards.map((c) => [c.club, c])).values()].map((c) => ({
  name: c.club,
  group: c.series === 'EU' ? ('EU' as const) : c.series === 'A' || c.series === 'B' ? ('BR' as const) : clubGroup(c.club),
}));

const key = process.env.API_FUTEBOL_KEY?.trim();
console.log(`Escudos para ${clubs.length} clubes do baralho “${deck.name ?? 'Baralho'}”.`);
if (!key) console.log('Sem API_FUTEBOL_KEY no .env: usando só o TheSportsDB. Coloque sua chave da API Futebol para usá-la primeiro.');

const report = await syncCrests({
  clubs,
  dir: config.crestsDir,
  apiFutebolKey: key,
  theSportsDbKey: process.env.THESPORTSDB_KEY?.trim(),
  download,
  log: (m) => console.log(m),
});

const line = (label: string, list: string[]) => list.length && console.log(`${label} (${list.length}): ${list.join(', ')}`);
console.log('');
line('API Futebol', report.apiFutebol);
line('TheSportsDB', report.theSportsDb);
line('Mantidos como estavam', report.kept);
line('Arquivo manual mantido', report.manual);
line('Sem escudo (selo genérico)', report.missing);
line('Download falhou (usa o endereço)', report.failedDownloads);
if (report.apiFutebolError) console.log(`API Futebol: ${report.apiFutebolError}`);
console.log(`\n${download ? `${report.downloaded.length} arquivo(s) baixado(s); ` : ''}fontes em ${relative(ROOT_DIR, config.crestsDir) || '.'}/fontes.json.`);
console.log('Reinicie o servidor (npm start) para usar os escudos novos.');
