/**
 * npm run deck:selecoes — monta data/deck-selecoes.json, as cartas do modo “Seleções”.
 *
 * Usa os dados do Wikidata já baixados (data/wikidata-raw.json) e as notas do baralho de clubes
 * (data/deck-wikidata.json): rode depois de `npm run deck:wikidata`. Reinicie o servidor para usar.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateDeck } from '../src/engine/deck-generator.js';
import type { Card } from '../src/engine/types.js';
import { ROOT_DIR } from '../src/server/config.js';
import { buildNationalDeck } from '../src/tools/wikidata/national.js';
import type { RawDump } from '../src/tools/wikidata/types.js';

const raw = JSON.parse(readFileSync(resolve(ROOT_DIR, 'data/wikidata-raw.json'), 'utf8')) as RawDump;
const clubs = JSON.parse(readFileSync(resolve(ROOT_DIR, 'data/deck-wikidata.json'), 'utf8')) as { cards: Card[] };
const { cards, report } = buildNationalDeck(raw, clubs.cards);
validateDeck(cards);
const out = resolve(ROOT_DIR, 'data/deck-selecoes.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      id: 'selecoes-wikidata',
      name: 'Seleções',
      version: 1,
      source: 'Wikidata (https://www.wikidata.org) — dados estruturados sob CC0. Notas calculadas pelo Leilão FC.',
      license: 'CC0-1.0 (dados de origem)',
      generatedAt: new Date().toISOString(),
      fetchedAt: raw.fetchedAt,
      cards,
    },
    null,
    1,
  ) + '\n',
);
console.log(`Seleções salvas em ${out}: ${cards.length} cartas de ${report.teams.length} seleções.`);
console.log(report.teams.map((t) => `${t.name} ${t.cards} (${t.legends} Lendas)`).join(' · '));
console.log(`Nota do baralho de clubes: ${report.fromClubDeck}; estimada: ${report.estimated}. Candidatos: ${report.candidates}.`);
if (report.dropped.length) console.log(`Sem jogadores para fechar todos os setores: ${report.dropped.join(', ')}.`);
