/**
 * Gera data/deck.json (baralho padrão fictício, determinístico).
 * Uso: npm run deck:generate
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateDeck, validateDeck } from '../src/engine/deck-generator.js';

const cards = generateDeck();
validateDeck(cards);
const out = resolve(import.meta.dirname, '../data/deck.json');
writeFileSync(
  out,
  JSON.stringify({ id: 'lendas-ficticias-v1', name: 'Lendas Fictícias', version: 1, cards }, null, 2) + '\n',
);
const byTier = cards.reduce<Record<string, number>>((acc, c) => ((acc[c.tier] = (acc[c.tier] ?? 0) + 1), acc), {});
console.log(`Baralho gerado com ${cards.length} cartas em ${out}`, byTier);
