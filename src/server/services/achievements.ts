import { nowIso, type DB } from '../db.js';
import {
  ACHIEVEMENTS,
  CATEGORY_LABEL,
  RARITY_LABEL,
  careerLevelFor,
  type AchievementDef,
  type UserStats,
} from './achievements-catalog.js';
import { computeUserStats } from './stats.js';

export interface TrophyView {
  id: string;
  name: string;
  description: string;
  criteria: string;
  icon: string;
  category: string;
  categoryLabel: string;
  rarity: string;
  rarityLabel: string;
  secret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  disputeId: string | null;
  progress: { current: number; target: number; ratio: number };
}

export interface TrophyRoom {
  userId: string;
  stats: UserStats;
  career: ReturnType<typeof careerLevelFor>;
  totals: { unlocked: number; total: number; byRarity: Record<string, { unlocked: number; total: number }> };
  trophies: TrophyView[];
}

export class AchievementService {
  constructor(
    private db: DB,
    private catalog: AchievementDef[] = ACHIEVEMENTS,
  ) {
    const ids = new Set<string>();
    for (const a of catalog) {
      if (ids.has(a.id)) throw new Error(`Conquista duplicada no catálogo: ${a.id}`);
      ids.add(a.id);
    }
  }

  /**
   * Avalia o catálogo para o usuário e registra o que foi desbloqueado.
   * Idempotente: reavaliar não duplica (PRIMARY KEY + INSERT OR IGNORE).
   * Deve ser chamado dentro da transação de finalização da disputa.
   */
  evaluate(userId: string, disputeId: string | null): AchievementDef[] {
    const stats = computeUserStats(this.db, userId);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at, dispute_id) VALUES (?, ?, ?, ?)',
    );
    const unlockedNow: AchievementDef[] = [];
    const at = nowIso();
    for (const a of this.catalog) {
      if ((stats[a.metric] ?? 0) >= a.target) {
        const r = insert.run(userId, a.id, at, disputeId);
        if (r.changes === 1) unlockedNow.push(a);
      }
    }
    return unlockedNow;
  }

  trophyRoom(userId: string): TrophyRoom {
    const stats = computeUserStats(this.db, userId);
    const rows = this.db
      .prepare('SELECT achievement_id, unlocked_at, dispute_id FROM user_achievements WHERE user_id = ?')
      .all(userId) as Array<{ achievement_id: string; unlocked_at: string; dispute_id: string | null }>;
    const unlocked = new Map(rows.map((r) => [r.achievement_id, r]));
    const byRarity: Record<string, { unlocked: number; total: number }> = {};
    const trophies: TrophyView[] = this.catalog.map((a) => {
      const u = unlocked.get(a.id);
      const current = Math.min(stats[a.metric] ?? 0, a.target);
      const hidden = !!a.secret && !u;
      byRarity[a.rarity] ??= { unlocked: 0, total: 0 };
      byRarity[a.rarity]!.total++;
      if (u) byRarity[a.rarity]!.unlocked++;
      return {
        id: a.id,
        name: hidden ? 'Conquista secreta' : a.name,
        description: hidden ? 'Continue jogando para descobrir.' : a.description,
        criteria: hidden ? '???' : a.criteria,
        icon: hidden ? 'segredo' : a.icon,
        category: a.category,
        categoryLabel: CATEGORY_LABEL[a.category],
        rarity: a.rarity,
        rarityLabel: RARITY_LABEL[a.rarity],
        secret: !!a.secret,
        unlocked: !!u,
        unlockedAt: u?.unlocked_at ?? null,
        disputeId: u?.dispute_id ?? null,
        progress: hidden ? { current: 0, target: 1, ratio: 0 } : { current, target: a.target, ratio: current / a.target },
      };
    });
    return {
      userId,
      stats,
      career: careerLevelFor(stats.careerXp),
      totals: { unlocked: unlocked.size, total: this.catalog.length, byRarity },
      trophies,
    };
  }
}
