import { randomUUID } from 'node:crypto';
import { GameRuleError } from '../../engine/errors.js';
import { POSITIONS, tierForLevel, type Card, type Position, type Series, type Tier } from '../../engine/types.js';
import { legendArtFile, legendArtKey } from '../../shared/legend-art.js';
import type { AdminCardView, AdminFaceItem, AdminFaces } from '../../shared/protocol.js';
import { nowIso, type DB } from '../db.js';

type Level = Pick<Card, 'levelMin' | 'levelMax' | 'tier'>;
/** O resto do que o dono edita: nome, posição, clube (com o grupo e as cores dele) e ano. */
type Info = Pick<Card, 'name' | 'position' | 'club' | 'year' | 'hint' | 'series' | 'kit'>;
type Snapshot = Level & Info;
type ClubInfo = Pick<Info, 'club' | 'series' | 'kit'>;

/** Nível sem ser Lenda: a faixa que o nível dá, nunca acima de Craque (Lenda é escolha do dono). */
export function plainTier(levelMin: number, levelMax: number): Tier {
  const t = tierForLevel((levelMin + levelMax) / 2);
  return t === 'lenda' ? 'craque' : t;
}

/**
 * Ajustes do dono sobre o baralho (página de admin): quem é Lenda, o nível (faixa mínima–máxima) e as
 * informações (nome, posição, clube, ano) de cada carta. Ficam na tabela `card_overrides` e são
 * aplicados por cima do baralho carregado do arquivo.
 *
 * O dono também cria jogadores (`custom_cards`): entram no baralho ao subir o servidor e na hora
 * em que são criados, e só esses podem ser excluídos. Editar um jogador criado muda o próprio jogador.
 *
 * O baralho em memória é o mesmo array que as salas usam para montar cada disputa nova: a carta
 * ajustada é trocada por um objeto novo (nunca alterada no lugar), então as disputas já em andamento
 * seguem com as cartas com que começaram e as próximas já saem com o ajuste.
 */
export class DeckAdmin {
  /** Como cada carta está no arquivo (ou, no jogador criado, como ficou da última vez que foi salvo). */
  private original = new Map<string, Snapshot>();
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
      this.original.set(c.id, snapshot(c));
      this.index.set(c.id, i);
    });
    const rows = db.prepare('SELECT card_id, level_min, level_max, tier, info FROM card_overrides').all() as Array<{
      card_id: string;
      level_min: number;
      level_max: number;
      tier: Tier;
      info: string | null;
    }>;
    // Carta que saiu do baralho (refeito pelos scripts): o ajuste fica guardado, só não vale.
    for (const r of rows) {
      if (!this.index.has(r.card_id)) continue;
      const card = this.card(r.card_id);
      const leveled = { ...card, levelMin: r.level_min, levelMax: r.level_max, tier: r.tier };
      const info = parseInfo(r.info);
      this.put(info ? withInfo(leveled, info) : leveled);
    }
  }

  /** Quantos ajustes estão valendo. */
  get applied(): number {
    return this.deck.filter((c) => this.isEdited(c)).length;
  }

  list(): AdminCardView[] {
    return this.deck.map((c) => this.view(c));
  }

  /**
   * Edita uma carta: nível, Lenda e as informações (nome, posição, clube, ano). Lenda é a escolha do
   * dono; sem ser Lenda, a faixa (Craque, Titular…) acompanha o nível. Trocar de clube leva o grupo
   * (Série A, B, Europa, Seleção) e as cores do clube novo; clube que não está no baralho precisa do grupo.
   * Na carta do arquivo, voltar ao que o arquivo tem apaga o ajuste; no jogador criado, muda o jogador.
   */
  update(cardId: string, patch: Record<string, unknown>, by: string): AdminCardView {
    const card = this.card(cardId);
    const levelMin = patch.levelMin === undefined ? card.levelMin : level(patch.levelMin, 'mínimo');
    const levelMax = patch.levelMax === undefined ? card.levelMax : level(patch.levelMax, 'máximo');
    if (levelMin > levelMax) throw new GameRuleError('nivel_invalido', 'O nível mínimo não pode passar do máximo.');
    if (patch.legend !== undefined && typeof patch.legend !== 'boolean') throw new GameRuleError('lenda_invalida', 'Lenda inválida.');
    const wasLegend = card.tier === 'lenda';
    const legend = (patch.legend as boolean | undefined) ?? wasLegend;
    const levelChanged = levelMin !== card.levelMin || levelMax !== card.levelMax;
    const tier: Tier = legend ? 'lenda' : !wasLegend && !levelChanged ? card.tier : plainTier(levelMin, levelMax);

    const name = patch.name === undefined ? card.name : playerName(patch.name);
    const position = patch.position === undefined ? card.position : positionOf(patch.position);
    const year = patch.year === undefined ? card.year : yearOf(patch.year);
    const club: ClubInfo = patch.club === undefined ? { club: card.club, series: card.series, kit: card.kit } : this.resolveClub(patch.club, patch.newClub, card);
    this.assertUnique(name, club.club, year, cardId);
    const orig = this.original.get(cardId)!;
    // A dica da carta fala do clube e do ano: troca junto (e volta à do arquivo se eles voltarem).
    const hint = club.club === orig.club && year === orig.year ? orig.hint : club.club === card.club && year === card.year ? card.hint : `${club.club} (${year}).`;
    const next = withInfo({ ...card, levelMin, levelMax, tier }, { name, position, year, hint, ...club });

    if (this.custom.has(cardId)) {
      // Jogador criado: a edição muda o próprio jogador (e absorve ajuste antigo que estivesse à parte).
      this.db.prepare('UPDATE custom_cards SET card_json = ? WHERE id = ?').run(JSON.stringify(next), cardId);
      this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
      this.original.set(cardId, snapshot(next));
    } else {
      const now = snapshot(next);
      if (sameSnapshot(now, orig)) {
        this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
      } else {
        const info = sameInfo(now, orig) ? null : JSON.stringify(infoOf(next));
        this.db
          .prepare(
            `INSERT INTO card_overrides (card_id, level_min, level_max, tier, info, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (card_id) DO UPDATE SET level_min = excluded.level_min, level_max = excluded.level_max, tier = excluded.tier,
               info = excluded.info, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          )
          .run(cardId, levelMin, levelMax, tier, info, nowIso(), by);
      }
    }
    const saved = this.put(next);
    if (!sameInfo(snapshot(card), snapshot(saved))) this.onDeckChanged();
    // Virou Lenda e não tem face: entra na lista de faces para gerar.
    if (saved.tier === 'lenda' && !wasLegend) this.queueFace(saved);
    if (saved.tier !== 'lenda') this.unqueueIfNoLegend(saved.id);
    return this.view(saved);
  }

  /**
   * Cria um jogador. Clube que já está no baralho empresta o grupo (Série A, B, Europa, Seleção) e as
   * cores; clube novo precisa do grupo. Entra no baralho na hora (para as próximas disputas).
   */
  create(input: Record<string, unknown>, by: string): AdminCardView {
    const name = playerName(input.name);
    const position = positionOf(input.position);
    const year = yearOf(input.year);
    const levelMin = level(input.levelMin, 'mínimo');
    const levelMax = level(input.levelMax, 'máximo');
    if (levelMin > levelMax) throw new GameRuleError('nivel_invalido', 'O nível mínimo não pode passar do máximo.');
    if (typeof input.legend !== 'boolean') throw new GameRuleError('lenda_invalida', 'Lenda inválida.');

    const { club: clubName, series, kit } = this.resolveClub(input.club, input.newClub);
    this.assertUnique(name, clubName, year);
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
    this.original.set(id, snapshot(card));
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
      // Os dados de agora da carta (o dono pode ter editado nome, clube, ano ou posição depois).
      const i = this.index.get(r.card_id);
      const c = i === undefined ? r : this.deck[i]!;
      items.push({ key: r.art_key, cardId: r.card_id, name: c.name, club: c.club, year: c.year, position: c.position, createdAt: r.created_at });
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

  /** Desfaz o ajuste: a carta volta a ser como está no arquivo do baralho (nível, Lenda e informações). */
  reset(cardId: string): AdminCardView {
    const card = this.card(cardId);
    this.db.prepare('DELETE FROM card_overrides WHERE card_id = ?').run(cardId);
    const back = this.put(withInfo(card, this.original.get(cardId)!));
    if (!sameInfo(snapshot(card), snapshot(back))) this.onDeckChanged();
    if (back.tier !== 'lenda') this.unqueueIfNoLegend(back.id);
    return this.view(back);
  }

  /**
   * O clube escrito no formulário. O clube atual da carta (ou o do arquivo) fica com o grupo e as cores
   * dela; um clube do baralho empresta o nome como está no baralho, o grupo e as cores mais comuns;
   * clube novo precisa do grupo (e pode trazer as cores).
   */
  private resolveClub(raw: unknown, newClub: unknown, current?: Card): ClubInfo {
    const name = text(raw, 'O nome do clube', 2, 40);
    const lower = name.toLowerCase();
    const others = this.deck.filter((c) => c.id !== current?.id && c.club.toLowerCase() === lower);
    if (current && current.club.toLowerCase() === lower) return { club: others.length ? current.club : name, series: current.series, kit: current.kit };
    const orig = current && this.original.get(current.id);
    if (orig && orig.club.toLowerCase() === lower) return { club: orig.club, series: orig.series, kit: orig.kit };
    if (others.length) {
      const k = mostCommon(others.map((c) => (c.kit ? c.kit.join(',') : '')).filter(Boolean));
      return {
        club: others[0]!.club,
        series: mostCommon(others.map((c) => c.series).filter((x): x is Series => !!x)),
        kit: k ? (k.split(',') as [string, string]) : undefined,
      };
    }
    const nc = (newClub ?? {}) as { series?: unknown; kit?: unknown };
    if (!['A', 'B', 'EU', 'SEL'].includes(nc.series as string)) throw new GameRuleError('grupo_invalido', 'Clube novo: escolha o grupo (Série A, Série B, Europa ou Seleção).');
    let kit: [string, string] | undefined;
    if (nc.kit !== undefined) {
      if (!Array.isArray(nc.kit) || nc.kit.length !== 2 || !nc.kit.every((h) => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h))) {
        throw new GameRuleError('cores_invalidas', 'Cores do clube inválidas.');
      }
      kit = [String(nc.kit[0]).toUpperCase(), String(nc.kit[1]).toUpperCase()];
    }
    return { club: name, series: nc.series as Series, kit };
  }

  /** O mesmo jogador no mesmo clube e ano já está no baralho (fora a própria carta, na edição). */
  private assertUnique(name: string, club: string, year: number, exceptId?: string) {
    const lower = name.toLowerCase();
    if (this.deck.some((c) => c.id !== exceptId && c.club === club && c.year === year && c.name.toLowerCase() === lower)) {
      throw new GameRuleError('carta_repetida', `Já existe ${name} no ${club} em ${year}.`);
    }
  }

  private card(cardId: string): Card {
    const i = this.index.get(cardId);
    if (i === undefined) throw new GameRuleError('carta_inexistente', 'Essa carta não está no baralho.');
    return this.deck[i]!;
  }

  /** Troca a carta no baralho por um objeto novo (nunca altera a antiga: disputa em andamento segue com ela). */
  private put(next: Card): Card {
    this.deck[this.index.get(next.id)!] = next;
    return next;
  }

  private isEdited(c: Card): boolean {
    const o = this.original.get(c.id);
    return !!o && !sameSnapshot(o, snapshot(c));
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
      original: this.isEdited(c) ? pickOriginal(this.original.get(c.id)!) : null,
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

function playerName(raw: unknown): string {
  return text(raw, 'O nome do jogador', 2, 40);
}

function positionOf(raw: unknown): Position {
  if (!POSITIONS.includes(raw as Position)) throw new GameRuleError('posicao_invalida', 'Posição inválida.');
  return raw as Position;
}

function yearOf(raw: unknown): number {
  const year = typeof raw === 'number' ? raw : Number(raw);
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1900 || year > maxYear) throw new GameRuleError('ano_invalido', `Ano inválido: de 1900 a ${maxYear}.`);
  return year;
}

function infoOf(c: Info): Info {
  return {
    name: c.name,
    position: c.position,
    club: c.club,
    year: c.year,
    hint: c.hint,
    ...(c.series ? { series: c.series } : {}),
    ...(c.kit ? { kit: [c.kit[0], c.kit[1]] as [string, string] } : {}),
  };
}

function snapshot(c: Card): Snapshot {
  return { ...infoOf(c), levelMin: c.levelMin, levelMax: c.levelMax, tier: c.tier };
}

/** A carta com as informações (e, se vierem, o nível) trocadas; grupo e cores saem quando a informação não tem. */
function withInfo(card: Card, info: Info & Partial<Level>): Card {
  const next: Card = { ...card };
  delete next.series;
  delete next.kit;
  return { ...next, ...infoOf(info), ...(info.levelMin !== undefined ? { levelMin: info.levelMin, levelMax: info.levelMax!, tier: info.tier! } : {}) };
}

function sameInfo(a: Info, b: Info): boolean {
  return (
    a.name === b.name &&
    a.position === b.position &&
    a.club === b.club &&
    a.year === b.year &&
    a.hint === b.hint &&
    (a.series ?? null) === (b.series ?? null) &&
    (a.kit?.join(',') ?? '') === (b.kit?.join(',') ?? '')
  );
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.levelMin === b.levelMin && a.levelMax === b.levelMax && a.tier === b.tier && sameInfo(a, b);
}

function pickOriginal(o: Snapshot): NonNullable<AdminCardView['original']> {
  return { levelMin: o.levelMin, levelMax: o.levelMax, tier: o.tier, name: o.name, position: o.position, club: o.club, year: o.year };
}

/** As informações guardadas no ajuste (JSON); null quando não há, ou quando a linha não serve. */
function parseInfo(raw: string | null): Info | null {
  if (!raw) return null;
  try {
    const i = JSON.parse(raw) as Info;
    if (typeof i.name !== 'string' || typeof i.club !== 'string' || typeof i.year !== 'number' || !POSITIONS.includes(i.position) || typeof i.hint !== 'string') return null;
    return infoOf(i);
  } catch {
    return null;
  }
}
