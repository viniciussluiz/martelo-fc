import type { CupFormat } from '../../engine/types.js';
import {
  COMPETITION_LABEL,
  ONLINE_MIN_HUMANS,
  RANKING_COMPETITIONS,
  RANKING_FIRST_SEASON,
  RANKING_PAGE_SIZE,
  RANKING_POINTS,
  SEASON_AWARD_RULES,
  disputePoints,
  pointsFromTotals,
  seasonOf,
  type CompetitionRecord,
  type ProfileRanking,
  type RankingCompetition,
  type RankingGain,
  type RankingRow,
  type RankingStanding,
  type RankingView,
  type RoomRankingView,
  type TitleCounts,
} from '../../shared/ranking.js';
import { nowIso, type DB } from '../db.js';
import { userCrests } from './team-crests.js';

/**
 * Ranking dos técnicos, calculado a partir de `ranking_entries` (um registro por humano e disputa).
 * Os pontos saem dos pesos de src/shared/ranking.ts na hora da consulta.
 * Visitantes pontuam, mas só entram na lista depois de criar a conta.
 */

interface Totals {
  userId: string;
  name: string;
  isGuest: boolean;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  disputes: number;
  titles: TitleCounts;
  lastAt: string;
  points: number;
  pointsGames: number;
  pointsTitles: number;
}

interface Standings {
  /** Só contas registradas, já ordenadas (posição = índice + 1). */
  ranked: Totals[];
  byUser: Map<string, Totals>;
  position: Map<string, number>;
}

const bigTitles = (t: Totals) => t.titles.mundial + t.titles.libertadores;
const allTitles = (t: Totals) => RANKING_COMPETITIONS.reduce((s, c) => s + t.titles[c], 0);

/** Pontos, títulos de Mundial e Libertadores, títulos, vitórias, saldo e, por fim, quem chegou antes. */
export function compareTotals(a: Totals, b: Totals): number {
  return (
    b.points - a.points ||
    bigTitles(b) - bigTitles(a) ||
    allTitles(b) - allTitles(a) ||
    b.won - a.won ||
    b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
    a.lastAt.localeCompare(b.lastAt) ||
    a.name.localeCompare(b.name, 'pt')
  );
}

/** Rede de segurança do cache (quem muda os números chama `invalidate`). */
const CACHE_MS = 5 * 60_000;

export class RankingService {
  private cache = new Map<string, Standings & { at: number }>();

  constructor(
    private db: DB,
    /** Conquistas a reavaliar para quem entrou no top 10 de uma temporada que fechou. */
    private achievements?: { evaluate(userId: string, disputeId: string | null): unknown },
  ) {}

  /** Uma disputa terminou, alguém criou a conta ou trocou o nome: os números mudaram. */
  invalidate() {
    this.cache.clear();
  }

  currentSeason(now = Date.now()): string {
    return seasonOf(now);
  }

  /** Soma os fatos de `ranking_entries` por técnico, com o filtro dado (um trecho de WHERE sobre `e`). */
  private aggregate(where: string, params: unknown[]): Totals[] {
    const rows = this.db
      .prepare(
        `SELECT e.user_id, u.display_name, u.is_guest,
                SUM(e.league_won + e.cup_won) AS won, SUM(e.league_drawn + e.cup_drawn) AS drawn, SUM(e.league_lost + e.cup_lost) AS lost,
                SUM(e.goals_for) AS gf, SUM(e.goals_against) AS ga, COUNT(*) AS disputes,
                SUM(e.league_title) AS liga,
                SUM(CASE WHEN e.cup_format = 'mundial' THEN e.cup_title ELSE 0 END) AS mundial,
                SUM(CASE WHEN e.cup_format = 'libertadores' THEN e.cup_title ELSE 0 END) AS libertadores,
                SUM(CASE WHEN e.cup_format = 'copa8' THEN e.cup_title ELSE 0 END) AS copa8,
                MAX(e.finished_at) AS last_at
           FROM ranking_entries e
           JOIN users u ON u.id = e.user_id
          WHERE ${where}
          GROUP BY e.user_id`,
      )
      .all(...params) as Array<{
      user_id: string;
      display_name: string;
      is_guest: number;
      won: number;
      drawn: number;
      lost: number;
      gf: number;
      ga: number;
      disputes: number;
      liga: number;
      mundial: number;
      libertadores: number;
      copa8: number;
      last_at: string;
    }>;
    return rows.map((r) => {
      const titles: TitleCounts = { mundial: r.mundial, libertadores: r.libertadores, liga: r.liga, copa8: r.copa8 };
      const pts = pointsFromTotals({ won: r.won, drawn: r.drawn, titles });
      return {
        userId: r.user_id,
        name: r.display_name,
        isGuest: !!r.is_guest,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        goalsFor: r.gf,
        goalsAgainst: r.ga,
        disputes: r.disputes,
        titles,
        lastAt: r.last_at,
        points: pts.total,
        pointsGames: pts.jogos,
        pointsTitles: pts.titulos,
      };
    });
  }

  /** Ranking de um período (temporada ou geral; todas as disputas ou só as online), em cache. */
  private standings(season: string | null, online = false): Standings {
    const key = `${season ?? 'geral'}:${online ? 'online' : 'todas'}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const all = this.aggregate('(? IS NULL OR e.season = ?) AND (? = 0 OR e.humans >= ?)', [season, season, online ? 1 : 0, ONLINE_MIN_HUMANS]);
    const ranked = all.filter((t) => !t.isGuest).sort(compareTotals);
    const st = {
      at: Date.now(),
      ranked,
      byUser: new Map(all.map((t) => [t.userId, t])),
      position: new Map(ranked.map((t, i) => [t.userId, i + 1])),
    };
    this.cache.set(key, st);
    return st;
  }

  private rowsWithCrests(list: Array<{ t: Totals; position: number }>): RankingRow[] {
    const crests = userCrests(
      this.db,
      list.map((x) => x.t.userId),
    );
    return list.map(({ t, position }) => ({
      position,
      userId: t.userId,
      name: t.name,
      crest: crests.get(t.userId)!,
      points: t.points,
      pointsGames: t.pointsGames,
      pointsTitles: t.pointsTitles,
      titles: t.titles,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      disputes: t.disputes,
    }));
  }

  /** Temporadas com pontos (contas registradas), da mais recente; sempre inclui a atual. */
  seasons(now = Date.now()): string[] {
    const list = this.db
      .prepare(
        `SELECT DISTINCT e.season FROM ranking_entries e JOIN users u ON u.id = e.user_id WHERE u.is_guest = 0 ORDER BY e.season DESC`,
      )
      .pluck()
      .all() as string[];
    const current = this.currentSeason(now);
    return [...new Set([current, ...list])].sort().reverse();
  }

  /** A página do ranking: os primeiros do período (até 100) e a linha de quem pediu. */
  view(
    season: string | null,
    viewerId: string | null,
    opts: { online?: boolean; limit?: number } = {},
    now = Date.now(),
  ): RankingView {
    const online = !!opts.online;
    const st = this.standings(season, online);
    const limit = Math.max(1, Math.min(RANKING_PAGE_SIZE, Math.floor(opts.limit ?? RANKING_PAGE_SIZE)));
    const top = st.ranked.slice(0, limit);
    const mine = viewerId ? st.byUser.get(viewerId) : undefined;
    const rows = this.rowsWithCrests([
      ...top.map((t, i) => ({ t, position: i + 1 })),
      ...(mine ? [{ t: mine, position: st.position.get(mine.userId) ?? 0 }] : []),
    ]);
    const current = this.currentSeason(now);
    return {
      season,
      closed: season !== null && season < current,
      online,
      current,
      seasons: this.seasons(now),
      weights: RANKING_POINTS,
      total: st.ranked.length,
      rows: rows.slice(0, top.length),
      me: mine ? rows.at(-1)! : null,
    };
  }

  /** Ranking de uma sala: só os ciclos dela, com visitantes, porque ali todo mundo se conhece. */
  room(roomId: string): RoomRankingView {
    const all = this.aggregate('e.room_id = ?', [roomId]).sort(compareTotals);
    const cycles = (this.db.prepare('SELECT COUNT(DISTINCT dispute_id) FROM ranking_entries WHERE room_id = ?').pluck().get(roomId) as number) ?? 0;
    const rows = this.rowsWithCrests(all.map((t, i) => ({ t, position: i + 1 })));
    return { cycles, rows: rows.map((r, i) => ({ ...r, guest: all[i]!.isGuest })) };
  }

  /** Posição e pontos de um técnico num período (`null` = sem pontos nele). */
  standing(userId: string, season: string | null): RankingStanding | null {
    const st = this.standings(season);
    const t = st.byUser.get(userId);
    if (!t) return null;
    return { position: st.position.get(userId) ?? null, points: t.points, total: st.ranked.length };
  }

  profile(userId: string, now = Date.now()): ProfileRanking {
    const season = this.currentSeason(now);
    return { season, seasonStanding: this.standing(userId, season), overall: this.standing(userId, null) };
  }

  /**
   * Fecha as temporadas que já acabaram (uma vez só cada): grava quem terminou entre os 10 primeiros
   * e reavalia as conquistas dessas pessoas. Temporadas antes da primeira com prêmio ficam de fora.
   * Devolve o que fechou agora.
   */
  closeSeasons(now = Date.now()): Array<{ season: string; technicians: number; top: Array<{ userId: string; position: number; points: number }> }> {
    const current = this.currentSeason(now);
    const pending = this.db
      .prepare(
        `SELECT DISTINCT season FROM ranking_entries
          WHERE season < ? AND season >= ? AND season NOT IN (SELECT season FROM season_closures)
          ORDER BY season`,
      )
      .pluck()
      .all(current, RANKING_FIRST_SEASON) as string[];
    const closed: ReturnType<RankingService['closeSeasons']> = [];
    for (const season of pending) {
      const run = this.db.transaction(() => {
        this.cache.clear();
        const st = this.standings(season);
        const ins = this.db
          .prepare('INSERT OR IGNORE INTO season_closures (season, technicians, closed_at) VALUES (?, ?, ?)')
          .run(season, st.ranked.length, nowIso());
        if (ins.changes === 0) return null;
        const top = st.ranked.slice(0, SEASON_AWARD_RULES.top).map((t, i) => ({ userId: t.userId, position: i + 1, points: t.points }));
        const award = this.db.prepare('INSERT INTO season_awards (season, user_id, position, points) VALUES (?, ?, ?, ?)');
        for (const a of top) award.run(season, a.userId, a.position, a.points);
        for (const a of top) this.achievements?.evaluate(a.userId, null);
        return { season, technicians: st.ranked.length, top };
      });
      const done = run();
      if (done) closed.push(done);
    }
    return closed;
  }

  /** Títulos e V/E/D de cada competição que o técnico já jogou (Só Libertadores entra na Libertadores). */
  byCompetition(userId: string): CompetitionRecord[] {
    const league = this.db
      .prepare(
        `SELECT COUNT(*) AS editions, COALESCE(SUM(league_title), 0) AS titles, COALESCE(SUM(league_won), 0) AS won,
                COALESCE(SUM(league_drawn), 0) AS drawn, COALESCE(SUM(league_lost), 0) AS lost
           FROM ranking_entries WHERE user_id = ? AND skip_league = 0`,
      )
      .get(userId) as { editions: number; titles: number; won: number; drawn: number; lost: number };
    const cups = this.db
      .prepare(
        `SELECT cup_format, SUM(cup_won + cup_drawn + cup_lost > 0) AS editions, SUM(cup_title) AS titles,
                SUM(cup_won) AS won, SUM(cup_drawn) AS drawn, SUM(cup_lost) AS lost
           FROM ranking_entries WHERE user_id = ? AND cup_format <> 'nenhuma'
          GROUP BY cup_format`,
      )
      .all(userId) as Array<{ cup_format: CupFormat; editions: number; titles: number; won: number; drawn: number; lost: number }>;
    const rec = (competition: RankingCompetition, r: { editions: number; titles: number; won: number; drawn: number; lost: number }): CompetitionRecord => ({
      competition,
      label: COMPETITION_LABEL[competition],
      editions: r.editions,
      titles: r.titles,
      played: r.won + r.drawn + r.lost,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
    });
    const out: CompetitionRecord[] = [rec('liga', league)];
    for (const c of ['libertadores', 'mundial', 'copa8'] as const) {
      const r = cups.find((x) => x.cup_format === c);
      if (r) out.push(rec(c, r));
    }
    return out.filter((r) => r.played > 0);
  }

  /** O que uma disputa rendeu para um técnico (null: não pontuou nela, por ser CPU ou ter saído). */
  gain(disputeId: string, userId: string): RankingGain | null {
    const e = this.db
      .prepare(
        `SELECT e.*, u.is_guest FROM ranking_entries e JOIN users u ON u.id = e.user_id WHERE e.dispute_id = ? AND e.user_id = ?`,
      )
      .get(disputeId, userId) as
      | {
          season: string;
          cup_format: CupFormat;
          league_won: number;
          league_drawn: number;
          league_lost: number;
          cup_won: number;
          cup_drawn: number;
          cup_lost: number;
          league_title: number;
          cup_title: number;
          is_guest: number;
        }
      | undefined;
    if (!e) return null;
    const points = disputePoints({
      cupFormat: e.cup_format,
      leagueWon: e.league_won,
      leagueDrawn: e.league_drawn,
      cupWon: e.cup_won,
      cupDrawn: e.cup_drawn,
      leagueTitle: !!e.league_title,
      cupTitle: !!e.cup_title,
    });
    const titles: RankingCompetition[] = [];
    if (e.cup_title && e.cup_format !== 'nenhuma') titles.push(e.cup_format);
    if (e.league_title) titles.push('liga');
    return {
      disputeId,
      points,
      won: e.league_won + e.cup_won,
      drawn: e.league_drawn + e.cup_drawn,
      lost: e.league_lost + e.cup_lost,
      titles,
      season: e.season,
      position: this.standing(userId, e.season)?.position ?? null,
      guest: !!e.is_guest,
    };
  }
}
