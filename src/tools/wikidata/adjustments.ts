import { existsSync, readFileSync } from 'node:fs';
import type { Card, Tier } from '../../engine/types.js';

/**
 * Correções manuais do baralho (`data/deck-ajustes.json`), para quando o Wikidata erra ou quando a
 * nota calculada não faz justiça a alguém:
 *  - `excluir`: cartas que nunca entram (ex.: passagem sem data de saída que vira carta “de 2026”);
 *  - `nivel`: faixa de nível fixa (ex.: Pelé e Messi 95–100) e, se quiser, a faixa do jogo (`tier`);
 *  - `incluir`: cartas completas feitas à mão (ex.: Dirceu Lopes e Ronaldo no Cruzeiro), que entram no fim do baralho.
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
  /** Faixa do jogo fixada à mão (ex.: rebaixar uma Lenda para Craque). Sem ela, faixa ≥ 86 vira Lenda. */
  tier?: Tier;
  motivo?: string;
}

/** Carta feita à mão: os campos da carta e, se quiser, o motivo. */
export type Inclusion = Card & { motivo?: string };

export interface DeckAdjustments {
  excluir: Exclusion[];
  nivel: LevelOverride[];
  incluir?: Inclusion[];
}

const TIERS: Tier[] = ['lenda', 'craque', 'titular', 'operario', 'perna'];

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
  const positions = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'];
  const tiers = ['lenda', 'craque', 'titular', 'operario', 'perna'];
  const incluir = (raw.incluir ?? []).filter(
    (c) =>
      typeof c?.id === 'string' &&
      c.id.length > 0 &&
      typeof c.name === 'string' &&
      c.name.length > 0 &&
      typeof c.club === 'string' &&
      positions.includes(c.position) &&
      tiers.includes(c.tier) &&
      Number.isInteger(c.year) &&
      Number.isInteger(c.levelMin) &&
      Number.isInteger(c.levelMax) &&
      c.levelMin >= 1 &&
      c.levelMin <= c.levelMax &&
      c.levelMax <= 100,
  );
  return { excluir, nivel, incluir };
}

export function matchesId(card: Pick<Card, 'id'>, id: string): boolean {
  return card.id === id || card.id.startsWith(`${id}-`);
}

export function isExcluded(card: Pick<Card, 'id'>, exclusions: Exclusion[]): boolean {
  return exclusions.some((e) => matchesId(card, e.id));
}

/**
 * Aplica as correções: tira as excluídas, fixa as faixas de nível (com `tier` vale o que está escrito;
 * sem ele, quem ganha faixa ≥ 86 vira Lenda) e
 * põe no fim as cartas feitas à mão (uma com o mesmo id de uma carta do baralho fica no lugar dela).
 */
export function applyAdjustments<T extends Pick<Card, 'id' | 'levelMin' | 'levelMax' | 'tier'>>(
  cards: T[],
  adj: DeckAdjustments,
): { cards: T[]; removed: T[]; leveled: T[]; added: T[] } {
  const removed = cards.filter((c) => isExcluded(c, adj.excluir));
  const kept = cards.filter((c) => !isExcluded(c, adj.excluir));
  const leveled: T[] = [];
  const out = kept.map((c) => {
    const o = adj.nivel.find((n) => matchesId(c, n.id));
    if (!o) return c;
    const tier = o.tier && TIERS.includes(o.tier) ? o.tier : o.faixa[0] >= 86 ? ('lenda' as const) : undefined;
    const next = { ...c, levelMin: o.faixa[0], levelMax: o.faixa[1], ...(tier ? { tier } : {}) };
    leveled.push(next);
    return next;
  });
  const added = (adj.incluir ?? []).map(({ motivo: _motivo, ...card }) => card as unknown as T);
  const addedIds = new Set(added.map((c) => c.id));
  return { cards: [...out.filter((c) => !addedIds.has(c.id)), ...added], removed, leveled, added };
}
