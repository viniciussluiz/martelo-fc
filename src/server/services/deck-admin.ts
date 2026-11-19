import { randomUUID } from 'node:crypto';
import { GameRuleError } from '../../engine/errors.js';
import { POSITIONS, tierForLevel, type Card, type Position, type Series, type Tier } from '../../engine/types.js';
import { legendArtFile, legendArtKey } from '../../shared/legend-art.js';
import type { AdminCardView, AdminFaceItem, AdminFaces } from '../../shared/protocol.js';
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
 * O dono também cria jogadores (`custom_cards`): entram no baralho ao subir o servidor e na hora
 * em que são criados, e só esses podem ser excluídos.
 *
 * O baralho em memória é o mesmo array que as salas usam para montar cada disputa nova: a carta
 * ajustada é trocada por um objeto novo (nunca alterada no lugar), então as disputas já em andamento
 * seguem com as cartas com que começaram e as próximas já saem com o ajuste.
 */
export class DeckAdmin {
  private original = new Map<string, Level>();
  private index = new Map<string, number>();
  private custom = new Set<string>();
  /** Chamado quando entra ou sai carta (para atualizar o resumo do baralho que as salas mostram). */
  onDeckChanged: () => void = () => undefined;

  constructor(
    private db: DB,
    private deck: Card[],
  ) {
    // Jogadores criados pelo dono entram no fim do baralho.
    const ids = new Set(deck.map((c) => c.id));
    const customRows = db.prepare('SELECT id, card_json FROM custom_cards ORDER BY created_at').all() as Array<{ id: string; card_json: string }>;
    for (const r of customRows) {
      try {
        const card = JSON.parse(r.card_json) as Card;
        if (card.id !== r.id || ids.has(card.id)) continue;
        deck.push(card);
        ids.add(card.id);
        this.custom.add(card.id);
      } catch {
        // Linha corrompida: fica no banco, só não entra.
      }
    }
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
    const saved = this.put(cardId, next);
    // Marcou como Lenda alguém sem face: entra na lista de faces para gerar.
    if (patch.legend === true) this.queueFace(saved);
    if (saved.tier !== 'lenda') this.unqueueIfNoLegend(saved.id);
    return this.view(saved);
  }

  /**
   * Cria um jogador. Clube que já está no baralho empresta o grupo (Série A, B, Europa, Seleção) e as
   * cores; clube novo precisa do grupo. Entra no baralho na hora (para as próximas disputas).
   */
  create(input: Record<string, unknown>, by: string): AdminCardView {
    const name = text(input.name, 'O nome do jogador', 2, 40);
    const position = input.position as Position;
    if (!POSITIONS.includes(position)) throw new GameRuleError('posicao_invalida', 'Posição inválida.');
    const club = text(input.club, 'O nome do clube', 2, 40);
    const year = Number(input.year);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isInteger(year) || year < 1900 || year > maxYear) throw new GameRuleError('ano_invalido', `Ano inválido: de 1900 a ${maxYear}.`);
    const levelMin = level(input.levelMin, 'mínimo');
    const levelMax = level(input.levelMax, 'máximo');
    if (levelMin > levelMax) throw new GameRuleError('nivel_invalido', 'O nível mínimo não pode passar do máximo.');
    if (typeof input.legend !== 'boolean') throw new GameRuleError('lenda_invalida', 'Lenda inválida.');

    const same = this.deck.filter((c) => c.club.toLowerCase() === club.toLowerCase());
    let series: Series | undefined;
    let kit: [string, string] | undefined;
    let clubName = club;
    if (same.length) {
      // Clube conhecido: o nome escrito como no baralho, o grupo e as cores mais comuns dele.
      clubName = same[0]!.club;
      series = mostCommon(same.map((c) => c.series).filter((x): x is Series => !!x));
      const k = mostCommon(same.map((c) => (c.kit ? c.kit.join(',') : '')).filter(Boolean));
      kit = k ? (k.split(',') as [string, string]) : undefined;
    } else {
      const nc = (input.newClub ?? {}) as { series?: unknown; kit?: unknown };
      if (!['A', 'B', 'EU', 'SEL'].includes(nc.series as string)) throw new GameRuleError('grupo_invalido', 'Clube novo: escolha o grupo (Série A, Série B, Europa ou Seleção).');
      series = nc.series as Series;
      if (nc.kit !== undefined) {
        if (!Array.isArray(nc.kit) || nc.kit.length !== 2 || !nc.kit.every((h) => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h))) {
          throw new GameRuleError('cores_invalidas', 'Cores do clube inválidas.');
        }
        kit = [String(nc.kit[0]).toUpperCase(), String(nc.kit[1]).toUpperCase()];
      }
    }
    if (this.deck.some((c) => c.club === clubName && c.year === year && c.name.toLowerCase() === name.toLowerCase())) {
      throw new GameRuleError('carta_repetida', `Já existe ${name} no ${clubName} em ${year}.`);
    }
    let id = `adm-${randomUUID().slice(0, 8)}`;
    while (this.index.has(id)) id = `adm-${randomUUID().slice(0, 8)}`;
    const card: Card = {
      id,
      name,
      position,
      club: clubName,
      year,
      levelMin,
      levelMax,
      tier: input.legend ? 'lenda' : plainTier(levelMin, levelMax),
      hint: `${clubName} (${year}).`,
      ...(kit ? { kit } : {}),
      ...(series ? { series } : {}),
    };
    this.db.prepare('INSERT INTO custom_cards (id, card_json, created_at, created_by) VALUES (?, ?, ?, ?)').run(id, JSON.stringify(card), nowIso(), by);
    this.deck.push(card);
    this.index.set(id, this.deck.length - 1);
    this.original.set(id, { levelMin, levelMax, tier: card.tier });
    this.custom.add(id);
    this.onDeckChanged();
    if (card.tier === 'lenda') this.queueFace(card);
    return this.view(card);
  }

  /** Exclui um jogador criado pelo dono (as cartas do arquivo do baralho não se excluem). */
  remove(cardId: string): void {
    this.card(cardId);
    if (!this.custom.has(cardId)) throw new GameRuleError('carta_do_baralho', 'Só dá para excluir jogador criado por você.');
    this.db.prepare('DELETE FROM custom_cards WHERE id = ?').run(cardId);
    this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
    this.deck.splice(this.index.get(cardId)!, 1);
    this.custom.delete(cardId);
    this.original.delete(cardId);
    this.index.clear();
    this.deck.forEach((c, i) => this.index.set(c.id, i));
    this.onDeckChanged();
    this.unqueueIfNoLegend(cardId);
  }

  // -------------------------------------------------------------------------
  // Faces para gerar
  // -------------------------------------------------------------------------

  /**
   * A lista de faces para gerar, na ordem em que entraram. Quem já ganhou retrato (arte nova no site)
   * sai sozinho.
   */
  faces(): AdminFaces {
    const rows = this.db.prepare('SELECT * FROM face_queue ORDER BY created_at, rowid').all() as Array<{
      art_key: string;
      card_id: string;
      name: string;
      club: string;
      year: number;
      position: AdminFaceItem['position'];
      created_at: string;
    }>;
    const items: AdminFaceItem[] = [];
    for (const r of rows) {
      if (legendArtFile(r.card_id)) {
        this.db.prepare('DELETE FROM face_queue WHERE art_key = ?').run(r.art_key);
        continue;
      }
      items.push({ key: r.art_key, cardId: r.card_id, name: r.name, club: r.club, year: r.year, position: r.position, createdAt: r.created_at });
    }
    const queued = new Set(items.map((i) => i.key));
    const missing = new Set(this.deck.filter((c) => c.tier === 'lenda' && !legendArtFile(c.id) && !queued.has(legendArtKey(c.id))).map((c) => legendArtKey(c.id))).size;
    return { items, missing };
  }

  /** Tira uma pessoa da lista (a face já foi feita, ou não precisa). */
  dismissFace(key: string): AdminFaces {
    this.db.prepare('DELETE FROM face_queue WHERE art_key = ?').run(key);
    return this.faces();
  }

  /** Põe na lista todas as Lendas do baralho que estão sem face. */
  queueAllMissingFaces(): AdminFaces {
    for (const c of this.deck) if (c.tier === 'lenda') this.queueFace(c);
    return this.faces();
  }

  private queueFace(card: Card) {
    if (card.tier !== 'lenda' || legendArtFile(card.id)) return;
    this.db
      .prepare('INSERT OR IGNORE INTO face_queue (art_key, card_id, name, club, year, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(legendArtKey(card.id), card.id, card.name, card.club, card.year, card.position, nowIso());
  }

  /** Deixou de ser Lenda: sai da lista, a não ser que outra carta da mesma pessoa continue Lenda. */
  private unqueueIfNoLegend(cardId: string) {
    const key = legendArtKey(cardId);
    if (this.deck.some((c) => c.tier === 'lenda' && legendArtKey(c.id) === key)) return;
    this.db.prepare('DELETE FROM face_queue WHERE art_key = ?').run(key);
  }

  /** Desfaz o ajuste: a carta volta a ser como está no arquivo do baralho. */
  reset(cardId: string): AdminCardView {
    this.card(cardId);
    this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
    const back = this.put(cardId, this.original.get(cardId)!);
    if (back.tier !== 'lenda') this.unqueueIfNoLegend(back.id);
    return this.view(back);
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
      ...(this.custom.has(c.id) ? { custom: true } : {}),
    };
  }
}

function text(raw: unknown, label: string, min: number, max: number): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < min || s.length > max) throw new GameRuleError('texto_invalido', `${label} precisa ter de ${min} a ${max} caracteres.`);
  return s;
}

function mostCommon<T>(list: T[]): T | undefined {
  const count = new Map<T, number>();
  for (const x of list) count.set(x, (count.get(x) ?? 0) + 1);
  let best: T | undefined;
  for (const [x, n] of count) if (best === undefined || n > count.get(best)!) best = x;
  return best;
}

function level(raw: unknown, label: string): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new GameRuleError('nivel_invalido', `Nível ${label} inválido: de 1 a 100.`);
  return n;
}
