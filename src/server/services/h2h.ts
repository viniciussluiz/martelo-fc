import type { DB } from '../db.js';
import { userCrests } from './team-crests.js';

/**
 * Histórico de confrontos entre usuários.
 *
 * Definições (ver docs/REGRAS.md):
 *  - ciclo: cada disputa concluída em comum; vence quem termina melhor no ranking do ciclo.
 *  - liga: posição final na liga da mesma disputa (sem empate).
 *  - copa: fase alcançada na copa, quando os dois a disputaram (mesma fase = empate).
 *  - partida: cada jogo entre os dois times (liga ou copa); pênaltis não alteram o placar.
 *  - eliminatoria: cada mata-mata da copa entre os dois (agregado/pênaltis).
 *  - lance: cada carta disputada pelos dois no leilão em que um deles levou.
 * As modalidades nunca são somadas entre si.
 */

export type ConfrontKind = 'ciclo' | 'liga' | 'copa' | 'partida' | 'eliminatoria' | 'lance';
export const KINDS: ConfrontKind[] = ['ciclo', 'liga', 'copa', 'partida', 'eliminatoria', 'lance'];

export interface Record3 {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  /** Aproveitamento em %: partidas usam (3V+E)/(3J); demais modalidades usam V/J. */
  pct: number;
  goalsFor?: number;
  goalsAgainst?: number;
}

interface ConfRow {
  id: number;
  dispute_id: string;
  kind: ConfrontKind;
  ref: string;
  competition: string | null;
  user_a: string;
  user_b: string;
  outcome: 'a' | 'b' | 'empate';
  score_a: number | null;
  score_b: number | null;
  detail_json: string | null;
  occurred_at: string;
}

export interface H2HFilters {
  periodDays?: number | null;
  competition?: 'liga' | 'copa' | null;
}

function perspective(row: ConfRow, me: string) {
  const iAmA = row.user_a === me;
  const result: 'V' | 'E' | 'D' = row.outcome === 'empate' ? 'E' : (row.outcome === 'a') === iAmA ? 'V' : 'D';
  return {
    result,
    mine: iAmA ? row.score_a : row.score_b,
    theirs: iAmA ? row.score_b : row.score_a,
    opponent: iAmA ? row.user_b : row.user_a,
  };
}

function emptyRecord(): Record3 {
  return { total: 0, wins: 0, draws: 0, losses: 0, pct: 0 };
}

function finishRecord(r: Record3, kind: ConfrontKind): Record3 {
  if (r.total === 0) return r;
  r.pct = kind === 'partida' ? Math.round(((3 * r.wins + r.draws) / (3 * r.total)) * 1000) / 10 : Math.round((r.wins / r.total) * 1000) / 10;
  return r;
}

export class H2HService {
  constructor(private db: DB) {}

  private rows(me: string, opponent: string | null, filters: H2HFilters = {}): ConfRow[] {
    const clauses = ['(c.user_a = ? OR c.user_b = ?)', `d.status = 'finished'`];
    const params: unknown[] = [me, me];
    if (opponent) {
      clauses.push('(c.user_a = ? OR c.user_b = ?)');
      params.push(opponent, opponent);
    }
    if (filters.periodDays) {
      clauses.push('c.occurred_at >= ?');
      params.push(new Date(Date.now() - filters.periodDays * 86_400_000).toISOString());
    }
    if (filters.competition) {
      // Ciclo e lance não pertencem a uma competição: ficam fora quando se filtra liga/copa.
      clauses.push('c.competition = ?');
      params.push(filters.competition);
    }
    return this.db
      .prepare(
        `SELECT c.* FROM confrontations c JOIN disputes d ON d.id = c.dispute_id
          WHERE ${clauses.join(' AND ')} ORDER BY c.occurred_at, c.id`,
      )
      .all(...params) as ConfRow[];
  }

  /** Lista de adversários com o resumo por modalidade. */
  opponents(me: string) {
    const rows = this.rows(me, null);
    const map = new Map<string, { userId: string; lastAt: string; records: Record<ConfrontKind, Record3> }>();
    for (const row of rows) {
      const p = perspective(row, me);
      const entry = map.get(p.opponent) ?? {
        userId: p.opponent,
        lastAt: row.occurred_at,
        records: Object.fromEntries(KINDS.map((k) => [k, emptyRecord()])) as Record<ConfrontKind, Record3>,
      };
      const rec = entry.records[row.kind];
      rec.total++;
      if (p.result === 'V') rec.wins++;
      else if (p.result === 'E') rec.draws++;
      else rec.losses++;
      if (row.occurred_at > entry.lastAt) entry.lastAt = row.occurred_at;
      map.set(p.opponent, entry);
    }
    const names = this.names([...map.keys()]);
    const crests = userCrests(this.db, map.keys());
    return [...map.values()]
      .map((e) => ({
        userId: e.userId,
        displayName: names.get(e.userId) ?? 'Técnico',
        crest: crests.get(e.userId) ?? null,
        lastAt: e.lastAt,
        records: Object.fromEntries(KINDS.map((k) => [k, finishRecord(e.records[k], k)])) as Record<ConfrontKind, Record3>,
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  /** Visão detalhada de um adversário. */
  detail(me: string, opponent: string, filters: H2HFilters = {}) {
    const rows = this.rows(me, opponent, filters).filter((r) => (r.user_a === me && r.user_b === opponent) || (r.user_b === me && r.user_a === opponent));
    const records = Object.fromEntries(KINDS.map((k) => [k, emptyRecord()])) as Record<ConfrontKind, Record3>;
    const partidas: Array<{
      disputeId: string;
      matchId: string;
      at: string;
      competition: string | null;
      stage: string | null;
      result: 'V' | 'E' | 'D';
      mine: number | null;
      theirs: number | null;
      penalties: { mine: number; theirs: number } | null;
    }> = [];
    const finals: Array<{ disputeId: string; at: string; result: 'V' | 'D'; mine: number | null; theirs: number | null }> = [];
    for (const row of rows) {
      const p = perspective(row, me);
      const rec = records[row.kind];
      rec.total++;
      if (p.result === 'V') rec.wins++;
      else if (p.result === 'E') rec.draws++;
      else rec.losses++;
      const detail = row.detail_json ? (JSON.parse(row.detail_json) as Record<string, unknown>) : {};
      if (row.kind === 'partida') {
        rec.goalsFor = (rec.goalsFor ?? 0) + (p.mine ?? 0);
        rec.goalsAgainst = (rec.goalsAgainst ?? 0) + (p.theirs ?? 0);
        const pens = detail.penalties as { home: number; away: number } | null;
        const iAmHome = (detail.homeTeam as string | undefined)?.endsWith(me) ?? false;
        partidas.push({
          disputeId: row.dispute_id,
          matchId: row.ref,
          at: row.occurred_at,
          competition: row.competition,
          stage: (detail.stage as string) ?? null,
          result: p.result,
          mine: p.mine,
          theirs: p.theirs,
          penalties: pens ? (iAmHome ? { mine: pens.home, theirs: pens.away } : { mine: pens.away, theirs: pens.home }) : null,
        });
      }
      if (row.kind === 'eliminatoria' && detail.stage === 'final') {
        finals.push({ disputeId: row.dispute_id, at: row.occurred_at, result: p.result === 'V' ? 'V' : 'D', mine: p.mine, theirs: p.theirs });
      }
    }
    for (const k of KINDS) finishRecord(records[k], k);

    // Sequências nas partidas diretas (ordem cronológica).
    let cur: { type: 'V' | 'E' | 'D' | null; len: number } = { type: null, len: 0 };
    let bestWin = 0;
    let bestLoss = 0;
    for (const m of partidas) {
      cur = cur.type === m.result ? { type: m.result, len: cur.len + 1 } : { type: m.result, len: 1 };
      if (cur.type === 'V') bestWin = Math.max(bestWin, cur.len);
      if (cur.type === 'D') bestLoss = Math.max(bestLoss, cur.len);
    }

    const timeline = this.commonDisputes(me, opponent, filters);
    const titlesInCommon = timeline.flatMap((t) => [
      ...t.me.titles.map((title) => ({ disputeId: t.disputeId, at: t.finishedAt, who: 'eu' as const, title })),
      ...t.them.titles.map((title) => ({ disputeId: t.disputeId, at: t.finishedAt, who: 'adversario' as const, title })),
    ]);
    const names = this.names([me, opponent]);
    const crests = userCrests(this.db, [me, opponent]);
    return {
      me: { userId: me, displayName: names.get(me) ?? 'Você', crest: crests.get(me) ?? null },
      opponent: { userId: opponent, displayName: names.get(opponent) ?? 'Técnico', crest: crests.get(opponent) ?? null },
      filters,
      records,
      streaks: {
        current: cur.type ? { type: cur.type, length: cur.len } : null,
        longestWin: bestWin,
        longestLoss: bestLoss,
      },
      lastResults: partidas.slice(-10).reverse(),
      matches: partidas.slice().reverse(),
      finals: finals.reverse(),
      titlesInCommon: titlesInCommon.reverse(),
      timeline,
    };
  }

  /** Disputas concluídas em comum, com elencos e leilão de cada lado. */
  private commonDisputes(me: string, opponent: string, filters: H2HFilters) {
    const params: unknown[] = [me, opponent];
    let period = '';
    if (filters.periodDays) {
      period = 'AND d.finished_at >= ?';
      params.push(new Date(Date.now() - filters.periodDays * 86_400_000).toISOString());
    }
    const rows = this.db
      .prepare(
        `SELECT d.id AS dispute_id, d.seq, d.finished_at, r.code AS room_code, json_extract(d.result_json, '$.cupName') AS cup_name,
                a.participant_id AS a_pid, a.team_name AS a_team, a.rank AS a_rank, a.league_position AS a_pos, a.cup_reach AS a_reach,
                a.league_title AS a_lt, a.cup_title AS a_ct, a.squad_average AS a_avg, a.spent AS a_spent,
                b.participant_id AS b_pid, b.team_name AS b_team, b.rank AS b_rank, b.league_position AS b_pos, b.cup_reach AS b_reach,
                b.league_title AS b_lt, b.cup_title AS b_ct, b.squad_average AS b_avg, b.spent AS b_spent
           FROM disputes d
           JOIN rooms r ON r.id = d.room_id
           JOIN dispute_participants a ON a.dispute_id = d.id AND a.user_id = ? AND a.abandoned = 0
           JOIN dispute_participants b ON b.dispute_id = d.id AND b.user_id = ? AND b.abandoned = 0
          WHERE d.status = 'finished' ${period}
          ORDER BY d.finished_at DESC`,
      )
      .all(...params) as Array<Record<string, unknown>>;
    const topBuy = this.db.prepare(
      `SELECT json_extract(card_json, '$.name') AS name, price, json_extract(card_json, '$.tier') AS tier
         FROM dispute_rosters WHERE dispute_id = ? AND participant_id = ? ORDER BY price DESC, card_id LIMIT 1`,
    );
    const lances = this.db.prepare(
      `SELECT outcome, user_a FROM confrontations WHERE dispute_id = ? AND kind = 'lance' AND
         ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))`,
    );
    return rows.map((r) => {
      const side = (prefix: 'a' | 'b') => {
        const titles: Array<'liga' | 'copa'> = [];
        if (r[`${prefix}_lt`]) titles.push('liga');
        if (r[`${prefix}_ct`]) titles.push('copa');
        const best = topBuy.get(r.dispute_id, r[`${prefix}_pid`]) as { name: string; price: number; tier: string } | undefined;
        return {
          teamName: r[`${prefix}_team`] as string,
          rank: r[`${prefix}_rank`] as number,
          leaguePosition: r[`${prefix}_pos`] as number,
          cupReach: (r[`${prefix}_reach`] as string | null) ?? null,
          titles,
          squadAverage: r[`${prefix}_avg`] as number,
          spent: r[`${prefix}_spent`] as number,
          topBuy: best ?? null,
        };
      };
      const lr = lances.all(r.dispute_id, me, opponent, opponent, me) as Array<{ outcome: string; user_a: string }>;
      let mine = 0;
      let theirs = 0;
      for (const l of lr) {
        const winnerIsA = l.outcome === 'a';
        const iAmA = l.user_a === me;
        if (winnerIsA === iAmA) mine++;
        else theirs++;
      }
      return {
        disputeId: r.dispute_id as string,
        seq: r.seq as number,
        roomCode: r.room_code as string,
        cupName: (r.cup_name as string | null) ?? null,
        finishedAt: r.finished_at as string,
        me: side('a'),
        them: side('b'),
        auctionDuels: { mine, theirs },
      };
    });
  }

  private names(ids: string[]): Map<string, string> {
    if (ids.length === 0) return new Map();
    const rows = this.db
      .prepare(`SELECT id, display_name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as Array<{ id: string; display_name: string }>;
    return new Map(rows.map((r) => [r.id, r.display_name]));
  }
}
