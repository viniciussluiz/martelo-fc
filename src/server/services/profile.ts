import type { DB } from '../db.js';
import { careerLevelFor } from './achievements-catalog.js';
import { computeUserStats } from './stats.js';
import { userCrests } from './team-crests.js';

/** Resumo de perfil: números calculados a partir do histórico persistido. */
export function profileSummary(db: DB, userId: string) {
  const user = db.prepare('SELECT id, display_name, username, is_guest, created_at FROM users WHERE id = ?').get(userId) as
    | { id: string; display_name: string; username: string | null; is_guest: number; created_at: string }
    | undefined;
  if (!user) return null;
  const stats = computeUserStats(db, userId);
  const recent = db
    .prepare(
      `SELECT d.id AS dispute_id, d.seq, d.finished_at, r.code AS room_code, r.mode, dp.team_name, dp.rank, dp.league_position,
              dp.cup_reach, dp.league_title, dp.cup_title, dp.spent, dp.squad_average,
              json_extract(d.result_json, '$.cupName') AS cup_name,
              json_extract(d.result_json, '$.headline') AS headline,
              (SELECT COUNT(*) FROM dispute_participants x WHERE x.dispute_id = d.id) AS participants,
              (SELECT COUNT(*) FROM dispute_participants x WHERE x.dispute_id = d.id AND x.is_cpu = 0) AS humans
         FROM dispute_participants dp
         JOIN disputes d ON d.id = dp.dispute_id
         JOIN rooms r ON r.id = d.room_id
        WHERE dp.user_id = ? AND dp.abandoned = 0 AND d.status = 'finished'
        ORDER BY d.finished_at DESC LIMIT 15`,
    )
    .all(userId);
  const trophies = (db.prepare('SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ?').get(userId) as { n: number }).n;
  return {
    user: {
      id: user.id,
      displayName: user.display_name,
      username: user.username,
      isGuest: !!user.is_guest,
      createdAt: user.created_at,
      crest: userCrests(db, [user.id]).get(user.id)!,
    },
    stats,
    career: careerLevelFor(stats.careerXp),
    winRate: stats.matchesPlayed ? Math.round((stats.matchesWon / stats.matchesPlayed) * 1000) / 10 : 0,
    trophiesUnlocked: trophies,
    recent,
  };
}
