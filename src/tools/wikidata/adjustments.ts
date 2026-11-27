import { existsSync, readFileSync } from 'node:fs';
import type { Card, Position, Tier } from '../../engine/types.js';

/**
 * Correções manuais do baralho (`data/deck-ajustes.json`), para quando o Wikidata erra ou quando a
 * nota calculada não faz justiça a alguém:
 *  - `excluir`: cartas que nunca entram (ex.: passagem sem data de saída que vira carta “de 2026”);
 *  - `nivel`: faixa de nível fixa (ex.: Pelé e Messi 95–100) e, se quiser, a faixa do jogo (`tier`);
 *  - `incluir`: cartas completas feitas à mão (ex.: Dirceu Lopes e Ronaldo no Cruzeiro), que entram no fim do baralho;
 *  - `posicao`: posição corrigida (o Wikidata marca muito lateral só como “defensor”, que vira zagueiro).
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

/** Posição fixada à mão. Vale por último, então corrige também as cartas de `incluir`. */
export interface PositionOverride {
  id: string;
  jogador?: string;
  clube?: string;
  posicao: Position;
  motivo?: string;
}

/** Jogador pouco conhecido que sai do leilão de jogadores (continua nos pacotes de clubes e de clássicos). */
export interface Hidden {
  id: string;
  jogador?: string;
}

export interface DeckAdjustments {
  excluir: Exclusion[];
  nivel: LevelOverride[];
  incluir?: Inclusion[];
  posicao?: PositionOverride[];
  ocultar?: Hidden[];
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
  const posicao = (raw.posicao ?? []).filter((p) => typeof p?.id === 'string' && p.id.length > 0 && positions.includes(p.posicao));
  const ocultar = (raw.ocultar ?? []).filter((h) => typeof h?.id === 'string' && h.id.length > 0);
  return { excluir, nivel, incluir, posicao, ocultar };
}

export function matchesId(card: Pick<Card, 'id'>, id: string): boolean {
  return card.id === id || card.id.startsWith(`${id}-`);
}

export function isExcluded(card: Pick<Card, 'id'>, exclusions: Exclusion[]): boolean {
  return exclusions.some((e) => matchesId(card, e.id));
}

/**
 * Aplica as correções: tira as excluídas, fixa as faixas de nível (com `tier` vale o que está escrito;
 * sem ele, quem ganha faixa ≥ 86 vira Lenda),
 * põe no fim as cartas feitas à mão (uma com o mesmo id de uma carta do baralho fica no lugar dela)
 * e, por último, corrige as posições.
 */
export function applyAdjustments<T extends Pick<Card, 'id' | 'levelMin' | 'levelMax' | 'tier' | 'position' | 'packagesOnly'>>(
  cards: T[],
  adj: DeckAdjustments,
): { cards: T[]; removed: T[]; leveled: T[]; added: T[]; moved: T[]; hidden: T[] } {
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
  const moved: T[] = [];
  const all = [...out.filter((c) => !addedIds.has(c.id)), ...added].map((c) => {
    const p = (adj.posicao ?? []).find((o) => matchesId(c, o.id));
    if (!p || p.posicao === c.position) return c;
    const next = { ...c, position: p.posicao };
    moved.push(next);
    return next;
  });
  // Pouco conhecidos: saem do leilão de jogadores (a carta segue no baralho, para os pacotes).
  const hidden: T[] = [];
  const cardsOut = all.map((c) => {
    if (!(adj.ocultar ?? []).some((h) => matchesId(c, h.id))) return c;
    const next = { ...c, packagesOnly: true };
    hidden.push(next);
    return next;
  });
  return { cards: cardsOut, removed, leveled, added, moved, hidden };
}
