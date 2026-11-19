import { GameRuleError } from '../../engine/errors.js';
import { tierForLevel, type Card, type Tier } from '../../engine/types.js';
import type { AdminCardView } from '../../shared/protocol.js';
import { nowIso, type DB } from '../db.js';

type Level = Pick<Card, 'levelMin' | 'levelMax' | 'tier'>;

/** Nível sem ser Lenda: a faixa que o nível dá, nunca acima de Craque (Lenda é escolha do dono). */
export function plainTier(levelMin: number, levelMax: number): Tier {
  const t = tierForLevel((levelMin + levelMax) / 2);
  return t === 'lenda' ? 'craque' : t;
}

/**
 * Ajustes do dono sobre o baralho (página de admin): quem é Lenda e o nível (faixa mínima–máxima) de
 * cada carta. Ficam na tabela `card_overrides` e são aplicados por cima do baralho carregado do arquivo.
 *
 * O baralho em memória é o mesmo array que as salas usam para montar cada disputa nova: a carta
 * ajustada é trocada por um objeto novo (nunca alterada no lugar), então as disputas já em andamento
 * seguem com as cartas com que começaram e as próximas já saem com o ajuste.
 */
export class DeckAdmin {
  private original = new Map<string, Level>();
  private index = new Map<string, number>();

  constructor(
    private db: DB,
    private deck: Card[],
  ) {
    deck.forEach((c, i) => {
      this.original.set(c.id, { levelMin: c.levelMin, levelMax: c.levelMax, tier: c.tier });
      this.index.set(c.id, i);
    });
    const rows = db.prepare('SELECT card_id, level_min, level_max, tier FROM card_overrides').all() as Array<{
      card_id: string;
      level_min: number;
      level_max: number;
      tier: Tier;
    }>;
    // Carta que saiu do baralho (refeito pelos scripts): o ajuste fica guardado, só não vale.
    for (const r of rows) if (this.index.has(r.card_id)) this.put(r.card_id, { levelMin: r.level_min, levelMax: r.level_max, tier: r.tier });
  }

  /** Quantos ajustes estão valendo. */
  get applied(): number {
    return this.deck.filter((c) => this.isEdited(c)).length;
  }

  list(): AdminCardView[] {
    return this.deck.map((c) => this.view(c));
  }

  /**
   * Muda o nível e/ou a Lenda de uma carta. Lenda é a escolha do dono; sem ser Lenda, a faixa
   * (Craque, Titular…) acompanha o nível. Voltar ao que o arquivo tem apaga o ajuste.
   */
  update(cardId: string, patch: { levelMin?: unknown; levelMax?: unknown; legend?: unknown }, by: string): AdminCardView {
    const card = this.card(cardId);
    const levelMin = patch.levelMin === undefined ? card.levelMin : level(patch.levelMin, 'mínimo');
    const levelMax = patch.levelMax === undefined ? card.levelMax : level(patch.levelMax, 'máximo');
    if (levelMin > levelMax) throw new GameRuleError('nivel_invalido', 'O nível mínimo não pode passar do máximo.');
    if (patch.legend !== undefined && typeof patch.legend !== 'boolean') throw new GameRuleError('lenda_invalida', 'Lenda inválida.');
    const legend = patch.legend ?? card.tier === 'lenda';
    const levelChanged = levelMin !== card.levelMin || levelMax !== card.levelMax;
    const tier: Tier = legend ? 'lenda' : card.tier !== 'lenda' && !levelChanged ? card.tier : plainTier(levelMin, levelMax);
    const next = { levelMin, levelMax, tier };
    const orig = this.original.get(cardId)!;
    if (next.levelMin === orig.levelMin && next.levelMax === orig.levelMax && next.tier === orig.tier) {
      this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
    } else {
      this.db
        .prepare(
          `INSERT INTO card_overrides (card_id, level_min, level_max, tier, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (card_id) DO UPDATE SET level_min = excluded.level_min, level_max = excluded.level_max, tier = excluded.tier,
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .run(cardId, levelMin, levelMax, tier, nowIso(), by);
    }
    return this.view(this.put(cardId, next));
  }

  /** Desfaz o ajuste: a carta volta a ser como está no arquivo do baralho. */
  reset(cardId: string): AdminCardView {
    this.card(cardId);
    this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
    return this.view(this.put(cardId, this.original.get(cardId)!));
  }

  private card(cardId: string): Card {
    const i = this.index.get(cardId);
    if (i === undefined) throw new GameRuleError('carta_inexistente', 'Essa carta não está no baralho.');
    return this.deck[i]!;
  }

  private put(cardId: string, level: Level): Card {
    const i = this.index.get(cardId)!;
    const next = { ...this.deck[i]!, ...level };
    this.deck[i] = next;
    return next;
  }

  private isEdited(c: Card): boolean {
    const o = this.original.get(c.id);
    return !!o && (o.levelMin !== c.levelMin || o.levelMax !== c.levelMax || o.tier !== c.tier);
  }

  private view(c: Card): AdminCardView {
    return {
      id: c.id,
      ...(c.personId ? { personId: c.personId } : {}),
      name: c.name,
      position: c.position,
      club: c.club,
      year: c.year,
      ...(c.series ? { series: c.series } : {}),
      levelMin: c.levelMin,
      levelMax: c.levelMax,
      tier: c.tier,
      original: this.isEdited(c) ? this.original.get(c.id)! : null,
    };
  }
}

function level(raw: unknown, label: string): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new GameRuleError('nivel_invalido', `Nível ${label} inválido: de 1 a 100.`);
  return n;
}
