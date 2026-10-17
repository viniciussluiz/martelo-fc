import type { DB } from '../db.js';
import { careerLevelFor, type UserStats } from './achievements-catalog.js';

/**
 * Estatísticas de um usuário calculadas exclusivamente a partir dos resultados
 * persistidos (nunca a partir de números enviados pelo cliente).
 * Só contam disputas concluídas em que o técnico não abandonou a sala.
 */

const REACH_XP: Record<string, number> = { grupos: 2, oitavas: 5, quartas: 8, semi: 12, final: 18, campeao: 18 };

interface DpRow {
  dispute_id: string;
  participant_id: string;
  seq: number;
  finished_at: string;
  league_position: number;
  league_title: number;
  cup_title: number;
  cup_reach: string | null;
  lost: number;
  squad_average: number;
  min_avg: number;
  humans: number;
  monte_count: number;
}

export function xpForDispute(r: Pick<DpRow, 'league_position' | 'league_title' | 'cup_title' | 'cup_reach'>): number {
  return 20 + Math.max(0, 21 - r.league_position) * 2 + r.league_title * 40 + r.cup_title * 30 + (r.cup_reach ? (REACH_XP[r.cup_reach] ?? 0) : 0);
}

export function computeUserStats(db: DB, userId: string): UserStats {
  const rows = db
    .prepare(
      `SELECT dp.dispute_id, dp.participant_id, d.seq, d.finished_at, dp.league_position, dp.league_title, dp.cup_title,
              dp.cup_reach, dp.lost, dp.squad_average,
              (SELECT MIN(x.squad_average) FROM dispute_participants x WHERE x.dispute_id = dp.dispute_id) AS min_avg,
              (SELECT COUNT(*) FROM dispute_participants x WHERE x.dispute_id = dp.dispute_id AND x.is_cpu = 0) AS humans,
              (SELECT COUNT(*) FROM dispute_rosters r WHERE r.dispute_id = dp.dispute_id AND r.participant_id = dp.participant_id AND r.source = 'monte') AS monte_count
         FROM dispute_participants dp
         JOIN disputes d ON d.id = dp.dispute_id
        WHERE dp.user_id = ? AND dp.abandoned = 0 AND d.status = 'finished'
        ORDER BY d.finished_at, d.seq`,
    )
    .all(userId) as DpRow[];

  const stats: UserStats = {
    disputes: rows.length,
    leagueTitles: 0,
    cupTitles: 0,
    titles: 0,
    doubles: 0,
    cupFinals: 0,
    podiums: 0,
    cardsWon: 0,
    legendsBought: 0,
    bargainLegends: 0,
    maxWinStreak: 0,
    currentWinStreak: 0,
    maxLossStreak: 0,
    bigWins: 0,
    unbeatenLeagues: 0,
    distinctOpponentsBeaten: 0,
    onlineDisputes: 0,
    continuedCycles: 0,
    careerXp: 0,
    careerLevel: 0,
    underdogTitles: 0,
    monteChampions: 0,
    matchesPlayed: 0,
    matchesWon: 0,
  };

  for (const r of rows) {
    stats.leagueTitles += r.league_title;
    stats.cupTitles += r.cup_title;
    if (r.league_title && r.cup_title) stats.doubles++;
    if (r.cup_reach === 'final' || r.cup_reach === 'campeao') stats.cupFinals++;
    if (r.league_position <= 3) stats.podiums++;
    if (r.lost === 0) stats.unbeatenLeagues++;
    if (r.humans >= 2) stats.onlineDisputes++;
    if (r.seq > 1) stats.continuedCycles++;
    if ((r.league_title || r.cup_title) && r.squad_average <= r.min_avg) stats.underdogTitles++;
    if (r.league_title && r.monte_count >= 4) stats.monteChampions++;
    stats.careerXp += xpForDispute(r);
  }
  stats.titles = stats.leagueTitles + stats.cupTitles;
  stats.careerLevel = careerLevelFor(stats.careerXp).level;

  const auction = db
    .prepare(
      `SELECT COUNT(*) AS won,
              SUM(CASE WHEN json_extract(r.card_json, '$.tier') = 'lenda' THEN 1 ELSE 0 END) AS legends,
              SUM(CASE WHEN json_extract(r.card_json, '$.tier') = 'lenda' AND r.price <= 5 THEN 1 ELSE 0 END) AS bargains
         FROM dispute_rosters r
         JOIN dispute_participants dp ON dp.dispute_id = r.dispute_id AND dp.participant_id = r.participant_id
         JOIN disputes d ON d.id = r.dispute_id
        WHERE dp.user_id = ? AND dp.abandoned = 0 AND d.status = 'finished' AND r.source <> 'monte'`,
    )
    .get(userId) as { won: number; legends: number | null; bargains: number | null };
  stats.cardsWon = auction.won;
  stats.legendsBought = auction.legends ?? 0;
  stats.bargainLegends = auction.bargains ?? 0;

  // Sequências: todas as partidas do técnico, em ordem cronológica.
  const matches = db
    .prepare(
      `SELECT m.home_user_id, m.away_user_id, m.home_goals, m.away_goals
         FROM matches m
         JOIN disputes d ON d.id = m.dispute_id
         JOIN dispute_participants dp ON dp.dispute_id = m.dispute_id AND dp.user_id = ? AND dp.abandoned = 0
        WHERE d.status = 'finished' AND (m.home_user_id = ? OR m.away_user_id = ?)
        ORDER BY d.finished_at, d.seq, m.seq`,
    )
    .all(userId, userId, userId) as Array<{ home_user_id: string | null; away_user_id: string | null; home_goals: number; away_goals: number }>;
  let win = 0;
  let loss = 0;
  for (const m of matches) {
    const mine = m.home_user_id === userId ? m.home_goals : m.away_goals;
    const theirs = m.home_user_id === userId ? m.away_goals : m.home_goals;
    stats.matchesPlayed++;
    if (mine > theirs) {
      stats.matchesWon++;
      win++;
      loss = 0;
      if (mine - theirs >= 4) stats.bigWins++;
    } else if (mine < theirs) {
      loss++;
      win = 0;
    } else {
      win = 0;
      loss = 0;
    }
    stats.maxWinStreak = Math.max(stats.maxWinStreak, win);
    stats.maxLossStreak = Math.max(stats.maxLossStreak, loss);
  }
  stats.currentWinStreak = win;

  stats.distinctOpponentsBeaten = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT opp) AS n FROM (
           SELECT user_b AS opp FROM confrontations WHERE kind = 'partida' AND user_a = ? AND outcome = 'a'
           UNION
           SELECT user_a AS opp FROM confrontations WHERE kind = 'partida' AND user_b = ? AND outcome = 'b')`,
      )
      .get(userId, userId) as { n: number }
  ).n;

  return stats;
}
