import { existsSync, readFileSync } from 'node:fs';
import type { Card } from '../../engine/types.js';

/**
 * Cartas que o baralho nunca usa (`data/deck-exclusoes.json`): jogadores com dados errados ou
 * desatualizados no Wikidata — ex.: passagem sem data de saída que vira carta “de 2026”.
 * `id` sem o ano (wd-<jogador>-<clube>) tira todas as versões daquela passagem.
 */
export interface Exclusion {
  id: string;
  jogador?: string;
  clube?: string;
  motivo?: string;
}

export function loadExclusions(path: string): Exclusion[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { excluir?: Exclusion[] };
  return (raw.excluir ?? []).filter((e) => typeof e?.id === 'string' && e.id.length > 0);
}

export function isExcluded(card: Pick<Card, 'id'>, exclusions: Exclusion[]): boolean {
  return exclusions.some((e) => card.id === e.id || card.id.startsWith(`${e.id}-`));
}

export function applyExclusions<T extends Pick<Card, 'id'>>(cards: T[], exclusions: Exclusion[]): { cards: T[]; removed: T[] } {
  const removed = cards.filter((c) => isExcluded(c, exclusions));
  return { cards: cards.filter((c) => !isExcluded(c, exclusions)), removed };
}
