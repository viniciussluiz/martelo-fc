/**
 * Baralho de jogadores reais a partir do Wikidata (dados CC0, sem fotos).
 *
 *   npm run deck:wikidata                 # busca no Wikidata e monta o baralho
 *   npm run deck:wikidata -- --build      # só monta, a partir de data/wikidata-raw.json
 *   npm run deck:wikidata -- --fetch      # só busca e salva data/wikidata-raw.json
 *
 * Os clubes ficam em src/tools/wikidata/series.ts (Série A e B do ano + grandes da Europa).
 * Opções: --raw caminho.json · --out caminho.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateDeck } from '../src/engine/deck-generator.js';
import { buildDeck } from '../src/tools/wikidata/build.js';
import { applyAdjustments, loadAdjustments } from '../src/tools/wikidata/adjustments.js';
import { fetchRawDump, nodeSparql } from '../src/tools/wikidata/fetch.js';
import { MIN_SITELINKS, SERIES_CLUBS } from '../src/tools/wikidata/series.js';
import type { RawDump } from '../src/tools/wikidata/types.js';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    fetch: { type: 'boolean', default: false },
    build: { type: 'boolean', default: false },
    raw: { type: 'string', default: resolve(root, 'data/wikidata-raw.json') },
    out: { type: 'string', default: resolve(root, 'data/deck-wikidata.json') },
  },
});
const doFetch = values.fetch || !values.build;
const doBuild = values.build || !values.fetch;

if (doFetch) {
  console.log('Buscando no Wikidata (isso leva alguns minutos)…');
  const europe = new Set(SERIES_CLUBS.filter((c) => c.series === 'EU').map((c) => c.qid));
  const raw = await fetchRawDump(nodeSparql(), {
    country: 'Q155',
    clubCount: SERIES_CLUBS.length,
    clubIds: SERIES_CLUBS.map((c) => c.qid),
    minSitelinks: MIN_SITELINKS.brBig,
    minSitelinksFor: (club) => (europe.has(club.qid) ? MIN_SITELINKS.europe : club.sitelinks < 40 ? MIN_SITELINKS.brSmall : MIN_SITELINKS.brBig),
    log: (m) => console.log(m),
  });
  writeFileSync(values.raw!, JSON.stringify(raw));
  console.log(`Dados brutos salvos em ${values.raw} (${raw.clubs.length} clubes, ${Object.keys(raw.people).length} jogadores, ${raw.stints.length} passagens).`);
}

if (doBuild) {
  const raw = JSON.parse(readFileSync(values.raw!, 'utf8')) as RawDump;
  const { deck, report } = buildDeck(raw);
  // Correções manuais (data/deck-ajustes.json): cartas com dados errados saem, faixas fixadas à mão.
  const adjusted = applyAdjustments(deck.cards, loadAdjustments(resolve(root, 'data/deck-ajustes.json')));
  deck.cards = adjusted.cards;
  if (adjusted.removed.length) console.log(`Excluídas: ${adjusted.removed.map((c) => `${c.name} (${c.club} ${c.year})`).join(', ')}`);
  if (adjusted.leveled.length) console.log(`Faixa ajustada: ${adjusted.leveled.map((c) => `${c.name} (${c.club} ${c.year}) ${c.levelMin}–${c.levelMax}`).join(', ')}`);
  validateDeck(deck.cards);
  writeFileSync(values.out!, JSON.stringify(deck, null, 1) + '\n');
  console.log(`Baralho salvo em ${values.out}: ${deck.cards.length} cartas.`);
  console.log('Por grupo:', report.bySeries);
  console.log('Por posição:', report.byPosition);
  console.log('Por faixa:', report.byTier);
  console.log(`Candidatos: ${report.candidates} versões de ${report.people} jogadores. Descartados:`, report.skipped);
  const legends = deck.cards.filter((c) => c.tier === 'lenda').slice(0, 25);
  console.log('Algumas Lendas:', legends.map((c) => `${c.name} (${c.club} ${c.year}, ${c.levelMin}–${c.levelMax})`).join('; '));
}
