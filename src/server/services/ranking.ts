import type { CupFormat } from '../../engine/types.js';
import {
  COMPETITION_LABEL,
  RANKING_COMPETITIONS,
  RANKING_PAGE_SIZE,
  RANKING_POINTS,
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
  type TitleCounts,
} from '../../shared/ranking.js';
import type { DB } from '../db.js';
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

  constructor(private db: DB) {}

  /** Uma disputa terminou, alguém criou a conta ou trocou o nome: os números mudaram. */
  invalidate() {
    this.cache.clear();
  }

  currentSeason(now = Date.now()): string {
    return seasonOf(now);
  }

  private standings(season: string | null): Standings {
    const key = season ?? 'geral';
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
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
          WHERE (? IS NULL OR e.season = ?)
          GROUP BY e.user_id`,
      )
      .all(season, season) as Array<{
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
    const all: Totals[] = rows.map((r) => {
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

  /** A página do ranking: top 100 do período e a linha de quem pediu. */
  view(season: string | null, viewerId: string | null, now = Date.now()): RankingView {
    const st = this.standings(season);
    const top = st.ranked.slice(0, RANKING_PAGE_SIZE);
    const mine = viewerId ? st.byUser.get(viewerId) : undefined;
    const ids = [...top.map((t) => t.userId), ...(mine ? [mine.userId] : [])];
    const crests = userCrests(this.db, ids);
    const row = (t: Totals, position: number): RankingRow => ({
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
    });
    return {
      season,
      current: this.currentSeason(now),
      seasons: this.seasons(now),
      weights: RANKING_POINTS,
      total: st.ranked.length,
      rows: top.map((t, i) => row(t, i + 1)),
      me: mine ? row(mine, st.position.get(mine.userId) ?? 0) : null,
    };
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
