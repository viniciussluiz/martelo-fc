import type { Dispute } from '../../engine/dispute.js';
import { REACH_ORDER } from '../../engine/cup.js';
import type { MatchResult } from '../../engine/match.js';
import { nowIso, type DB } from '../db.js';
import type { AchievementDef } from './achievements-catalog.js';
import type { AchievementService } from './achievements.js';

/**
 * Finalização de disputa — o ponto onde o resultado vira histórico.
 *
 * Em UMA transação:
 *  1. marca o evento como processado (idempotência contra reconexões/retentativas);
 *  2. fecha a disputa (CAS: só se ainda estiver ativa) e descarta o snapshot operacional;
 *  3. grava participantes, elencos e partidas;
 *  4. grava confrontos entre usuários (um registro por disputa/modalidade/referência/par);
 *  5. avalia e registra conquistas.
 */

export interface FinalizeInput {
  disputeId: string;
  dispute: Dispute;
  abandoned: Set<string>;
}

export interface FinalizeOutput {
  alreadyProcessed: boolean;
  unlocked: Map<string, AchievementDef[]>;
}

export class ResultsService {
  constructor(
    private db: DB,
    private achievements: AchievementService,
  ) {}

  finalizeDispute(input: FinalizeInput): FinalizeOutput {
    const { disputeId, dispute, abandoned } = input;
    const result = dispute.state.result;
    if (!result) throw new Error('Disputa sem resultado não pode ser finalizada');
    const db = this.db;
    const run = db.transaction((): FinalizeOutput => {
      const ev = db.prepare('INSERT OR IGNORE INTO processed_events (event_key, processed_at) VALUES (?, ?)').run(`finalize:${disputeId}`, nowIso());
      if (ev.changes === 0) return { alreadyProcessed: true, unlocked: new Map() };

      const at = nowIso();
      const upd = db
        .prepare(
          `UPDATE disputes SET status = 'finished', phase = 'finished', result_json = ?, state_json = NULL, finished_at = ?
            WHERE id = ? AND status = 'active'`,
        )
        .run(JSON.stringify(result), at, disputeId);
      if (upd.changes !== 1) throw new Error(`Disputa ${disputeId} não está ativa`);

      const participants = dispute.participants;
      const userOf = new Map(participants.map((p) => [p.id, p.userId] as const));
      const nameOf = new Map<string, string>();
      for (const t of dispute.league?.state.teams ?? []) nameOf.set(t.teamId, t.name);
      for (const t of dispute.cup?.state.teams ?? []) nameOf.set(t.teamId, t.name);

      const insP = db.prepare(
        `INSERT INTO dispute_participants (dispute_id, participant_id, user_id, team_name, is_cpu, formation, abandoned,
           league_position, league_points, won, drawn, lost, goals_for, goals_against, cup_reach, league_title, cup_title,
           rank, coins_left, spent, auction_wins, squad_average)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const o of result.outcomes) {
        insP.run(
          disputeId,
          o.participantId,
          o.userId,
          o.name,
          o.isCpu ? 1 : 0,
          o.formation,
          abandoned.has(o.participantId) ? 1 : 0,
          o.leaguePosition,
          o.leaguePoints,
          o.leagueRecord.won,
          o.leagueRecord.drawn,
          o.leagueRecord.lost,
          o.leagueRecord.goalsFor,
          o.leagueRecord.goalsAgainst,
          o.cupReach,
          o.titles.includes('liga') ? 1 : 0,
          o.titles.includes('copa') ? 1 : 0,
          o.rank,
          o.coinsLeft,
          o.spent,
          o.auctionWins,
          o.squadAverage,
        );
      }

      const insR = db.prepare(
        'INSERT INTO dispute_rosters (dispute_id, participant_id, card_id, position, price, source, card_json) VALUES (?,?,?,?,?,?,?)',
      );
      for (const p of participants) {
        for (const r of p.roster) insR.run(disputeId, p.id, r.cardId, r.position, r.price, r.source, JSON.stringify(dispute.cards[r.cardId]));
      }

      // Partidas com pelo menos um humano (base para sequências e confrontos diretos).
      const insM = db.prepare(
        `INSERT INTO matches (dispute_id, match_id, seq, competition, stage, home_team_id, away_team_id, home_name, away_name,
           home_user_id, away_user_id, home_goals, away_goals, pen_home, pen_away) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const humanTeams = new Set(participants.filter((p) => !p.isCpu && !abandoned.has(p.id)).map((p) => p.id));
      let seq = 0;
      const store = (m: MatchResult, competition: 'liga' | 'copa', stage: string) => {
        seq++;
        if (!humanTeams.has(m.homeId) && !humanTeams.has(m.awayId)) return;
        insM.run(
          disputeId,
          m.id,
          seq,
          competition,
          stage,
          m.homeId,
          m.awayId,
          nameOf.get(m.homeId) ?? m.homeId,
          nameOf.get(m.awayId) ?? m.awayId,
          humanTeams.has(m.homeId) ? userOf.get(m.homeId) : null,
          humanTeams.has(m.awayId) ? userOf.get(m.awayId) : null,
          m.homeGoals,
          m.awayGoals,
          m.penalties?.home ?? null,
          m.penalties?.away ?? null,
        );
      };
      for (const round of dispute.league?.state.fixtures ?? []) {
        for (const f of round) {
          const m = dispute.league!.state.results[f.id];
          if (m) store(m, 'liga', `rodada ${f.round}`);
        }
      }
      for (const m of Object.values(dispute.cup?.state.results ?? {})) {
        store(m, 'copa', m.id.startsWith('C-G') ? 'grupos' : (m.id.split('-')[1] ?? 'copa'));
      }

      this.storeConfrontations(disputeId, dispute, humanTeams, at);

      const unlocked = new Map<string, AchievementDef[]>();
      for (const pid of humanTeams) {
        const userId = userOf.get(pid);
        if (!userId) continue;
        unlocked.set(userId, this.achievements.evaluate(userId, disputeId));
      }
      return { alreadyProcessed: false, unlocked };
    });
    return run();
  }

  private storeConfrontations(disputeId: string, dispute: Dispute, humanTeams: Set<string>, at: string) {
    const result = dispute.state.result!;
    const db = this.db;
    const ins = db.prepare(
      `INSERT OR IGNORE INTO confrontations (dispute_id, kind, ref, competition, user_a, user_b, outcome, score_a, score_b, detail_json, occurred_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const userOf = new Map(dispute.participants.map((p) => [p.id, p.userId!] as const));
    const humans = [...humanTeams];
    const outcomeOf = new Map(result.outcomes.map((o) => [o.participantId, o] as const));

    /** Ordena o par (a < b) e converte o vencedor em 'a' | 'b' | 'empate'. */
    const put = (
      kind: string,
      ref: string,
      competition: string | null,
      p1: string,
      p2: string,
      winner: string | null,
      s1: number | null,
      s2: number | null,
      detail: Record<string, unknown> | null,
    ) => {
      const u1 = userOf.get(p1)!;
      const u2 = userOf.get(p2)!;
      if (!u1 || !u2 || u1 === u2) return;
      const swap = u1 > u2;
      const [ua, ub] = swap ? [u2, u1] : [u1, u2];
      const [sa, sb] = swap ? [s2, s1] : [s1, s2];
      const outcome = winner === null ? 'empate' : (winner === p1) !== swap ? 'a' : 'b';
      ins.run(disputeId, kind, ref, competition, ua, ub, outcome, sa, sb, detail ? JSON.stringify({ ...detail, swapped: swap }) : null, at);
    };

    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) {
        const a = humans[i]!;
        const b = humans[j]!;
        const oa = outcomeOf.get(a)!;
        const ob = outcomeOf.get(b)!;
        // Ciclo completo: ranking geral da disputa.
        put('ciclo', 'ciclo', null, a, b, oa.rank < ob.rank ? a : b, oa.rank, ob.rank, {
          titlesA: oa.titles,
          titlesB: ob.titles,
        });
        // Liga: posição final na tabela (não existe empate de posição).
        put('liga', 'liga', 'liga', a, b, oa.leaguePosition < ob.leaguePosition ? a : b, oa.leaguePosition, ob.leaguePosition, null);
        // Copa: só se os dois disputaram; melhor fase alcançada vence; mesma fase = empate.
        if (oa.cupReach && ob.cupReach) {
          const ra = REACH_ORDER[oa.cupReach];
          const rb = REACH_ORDER[ob.cupReach];
          put('copa', 'copa', 'copa', a, b, ra === rb ? null : ra > rb ? a : b, ra, rb, { reachA: oa.cupReach, reachB: ob.cupReach });
        }
      }
    }
    // Partidas diretas (liga e copa). Pênaltis não mudam o resultado da partida (empate).
    for (const m of result.directMatches) {
      if (!humanTeams.has(m.homeId) || !humanTeams.has(m.awayId)) continue;
      const winner = m.homeGoals > m.awayGoals ? m.homeId : m.awayGoals > m.homeGoals ? m.awayId : null;
      put('partida', m.matchId, m.competition, m.homeId, m.awayId, winner, m.homeGoals, m.awayGoals, {
        stage: m.stage,
        homeTeam: m.homeId,
        penalties: m.penalties ?? null,
      });
    }
    // Eliminatórias da copa entre os dois (agregado + pênaltis).
    for (const d of result.cupDuels) {
      if (!humanTeams.has(d.aId) || !humanTeams.has(d.bId)) continue;
      put('eliminatoria', d.tieId, 'copa', d.aId, d.bId, d.winnerId, d.aggregate?.a ?? null, d.aggregate?.b ?? null, {
        stage: d.stage,
        penalties: d.penalties ?? null,
      });
    }
    // Disputas de lance: cartas em que os dois deram lance e um deles levou.
    for (const rv of dispute.auction.state.revealLog) {
      if (!rv.winnerId || !humanTeams.has(rv.winnerId)) continue;
      const bidders = rv.bids.map((b) => b.participantId).filter((pid) => humanTeams.has(pid));
      for (const other of bidders) {
        if (other === rv.winnerId) continue;
        const wb = rv.bids.find((b) => b.participantId === rv.winnerId)!.amount;
        const ob = rv.bids.find((b) => b.participantId === other)!.amount;
        put('lance', rv.cardId, null, rv.winnerId, other, rv.winnerId, wb, ob, {
          card: dispute.cards[rv.cardId]?.name ?? rv.cardId,
          price: rv.price,
        });
      }
    }
  }

  /** Cartas adquiridas na disputa (para o próximo leilão da sala), lidas do histórico persistido. */
  acquiredCards(disputeId: string) {
    return (this.db.prepare('SELECT card_json FROM dispute_rosters WHERE dispute_id = ? ORDER BY card_id').pluck().all(disputeId) as string[])
      .map((j) => JSON.parse(j))
      .filter((c) => !String(c.id).startsWith('fill-'));
  }
}
