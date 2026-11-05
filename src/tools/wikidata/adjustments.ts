import { existsSync, readFileSync } from 'node:fs';
import type { Card } from '../../engine/types.js';

/**
 * Correções manuais do baralho (`data/deck-ajustes.json`), para quando o Wikidata erra ou quando a
 * nota calculada não faz justiça a alguém:
 *  - `excluir`: cartas que nunca entram (ex.: passagem sem data de saída que vira carta “de 2026”);
 *  - `nivel`: faixa de nível fixa (ex.: Pelé e Messi 95–100).
 * O `id` casa por prefixo: `wd-<jogador>` pega todas as cartas do jogador, `wd-<jogador>-<clube>`
 * todas daquela passagem, e o id completo só aquela carta.
 */
export interface Exclusion {
  id: string;
  jogador?: string;
  clube?: string;
  motivo?: string;
}

export interface LevelOverride {
  id: string;
  jogador?: string;
  faixa: [number, number];
  motivo?: string;
}

export interface DeckAdjustments {
  excluir: Exclusion[];
  nivel: LevelOverride[];
}

export function loadAdjustments(path: string): DeckAdjustments {
  if (!existsSync(path)) return { excluir: [], nivel: [] };
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<DeckAdjustments>;
  const excluir = (raw.excluir ?? []).filter((e) => typeof e?.id === 'string' && e.id.length > 0);
  const nivel = (raw.nivel ?? []).filter(
    (n) =>
      typeof n?.id === 'string' &&
      n.id.length > 0 &&
      Array.isArray(n.faixa) &&
      Number.isInteger(n.faixa[0]) &&
      Number.isInteger(n.faixa[1]) &&
      n.faixa[0] >= 1 &&
      n.faixa[0] <= n.faixa[1] &&
      n.faixa[1] <= 100,
  );
  return { excluir, nivel };
}

export function matchesId(card: Pick<Card, 'id'>, id: string): boolean {
  return card.id === id || card.id.startsWith(`${id}-`);
}

export function isExcluded(card: Pick<Card, 'id'>, exclusions: Exclusion[]): boolean {
  return exclusions.some((e) => matchesId(card, e.id));
}

/** Aplica as correções: tira as excluídas e fixa as faixas de nível (quem ganha faixa ≥ 86 vira Lenda). */
export function applyAdjustments<T extends Pick<Card, 'id' | 'levelMin' | 'levelMax' | 'tier'>>(
  cards: T[],
  adj: DeckAdjustments,
): { cards: T[]; removed: T[]; leveled: T[] } {
  const removed = cards.filter((c) => isExcluded(c, adj.excluir));
  const kept = cards.filter((c) => !isExcluded(c, adj.excluir));
  const leveled: T[] = [];
  const out = kept.map((c) => {
    const o = adj.nivel.find((n) => matchesId(c, n.id));
    if (!o) return c;
    const next = { ...c, levelMin: o.faixa[0], levelMax: o.faixa[1], ...(o.faixa[0] >= 86 ? { tier: 'lenda' as const } : {}) };
    leveled.push(next);
    return next;
  });
  return { cards: out, removed, leveled };
}
