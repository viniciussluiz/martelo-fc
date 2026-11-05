import { Rng } from './rng.js';
import { simulateMatch, type Goal, type MatchResult, type TeamSheet } from './match.js';
import type { Tactic } from './types.js';

/**
 * Liga em pontos corridos, turno e returno (20 times → 38 rodadas, como no original).
 * Vitória 3, empate 1. Critérios: pontos, vitórias, saldo, gols pró e sorteio prévio.
 */

export interface LeagueTeam extends TeamSheet {
  participantId: string | null;
  /** Times de técnicos humanos recebem eventos detalhados para o “ao vivo”. */
  human: boolean;
}

export interface Fixture {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
}

export interface StandingRow {
  teamId: string;
  name: string;
  participantId: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  position: number;
}

export interface LeagueState {
  teams: LeagueTeam[];
  fixtures: Fixture[][];
  currentRound: number;
  results: Record<string, MatchResult>;
  drawOrder: string[];
  seed: string;
}

/** Tabela de confrontos pelo método do círculo, com returno espelhado. */
export function doubleRoundRobin(teamIds: string[], rng: Rng): Fixture[][] {
  const ids = rng.shuffle(teamIds);
  if (ids.length % 2 === 1) ids.push('__folga__');
  const n = ids.length;
  const firstHalf: Array<Array<[string, string]>> = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      // Alterna mando para equilibrar casa/fora.
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    firstHalf.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  const rounds: Fixture[][] = [];
  const all = [...firstHalf, ...firstHalf.map((rd) => rd.map(([h, a]) => [a, h] as [string, string]))];
  all.forEach((pairs, idx) => {
    rounds.push(
      pairs
        .filter(([h, a]) => h !== '__folga__' && a !== '__folga__')
        .map(([homeId, awayId], k) => ({ id: `L${idx + 1}-${k + 1}`, round: idx + 1, homeId, awayId })),
    );
  });
  return rounds;
}

export class League {
  constructor(public state: LeagueState) {}

  static create(teams: LeagueTeam[], seed: string): League {
    const rng = new Rng(`league:${seed}`);
    const fixtures = doubleRoundRobin(
      teams.map((t) => t.teamId),
      rng,
    );
    const drawOrder = rng.shuffle(teams.map((t) => t.teamId));
    return new League({ teams, fixtures, currentRound: 0, results: {}, drawOrder, seed });
  }

  get totalRounds(): number {
    return this.state.fixtures.length;
  }

  get done(): boolean {
    return this.state.currentRound >= this.totalRounds;
  }

  team(id: string): LeagueTeam {
    const t = this.state.teams.find((x) => x.teamId === id);
    if (!t) throw new Error(`Time ${id} não está na liga`);
    return t;
  }

  /** Joga a próxima rodada. As táticas são as escolhidas pelos técnicos até aqui. */
  playRound(tactics: Record<string, Tactic> = {}): MatchResult[] {
    if (this.done) return [];
    const roundIdx = this.state.currentRound;
    const fixtures = this.state.fixtures[roundIdx]!;
    const out: MatchResult[] = [];
    for (const f of fixtures) {
      const home = this.team(f.homeId);
      const away = this.team(f.awayId);
      const result = simulateMatch({
        id: f.id,
        home,
        away,
        homeTactic: home.participantId ? tactics[home.participantId] : 'equilibrio',
        awayTactic: away.participantId ? tactics[away.participantId] : 'equilibrio',
        withEvents: home.human || away.human,
        rng: new Rng(`${this.state.seed}:${f.id}`),
      });
      this.state.results[f.id] = result;
      out.push(result);
    }
    this.state.currentRound++;
    return out;
  }

  standings(): StandingRow[] {
    return computeStandings(this.state.teams, Object.values(this.state.results), this.state.drawOrder);
  }

  /** Artilharia agregada a partir dos resultados persistidos no estado. */
  topScorers(limit = 10): Array<{ cardId: string; name: string; teamId: string; goals: number }> {
    return aggregateScorers(Object.values(this.state.results), limit);
  }

  /** Maiores garçons (assistências) da liga. */
  topAssists(limit = 10): Array<{ cardId: string; name: string; teamId: string; assists: number }> {
    return aggregateAssists(Object.values(this.state.results), limit);
  }

  roundFixtures(round: number): Fixture[] {
    return this.state.fixtures[round - 1] ?? [];
  }
}

export function computeStandings(
  teams: Array<Pick<LeagueTeam, 'teamId' | 'name' | 'participantId'>>,
  results: MatchResult[],
  draw: string[],
): StandingRow[] {
  {
    const rows = new Map<string, StandingRow>();
    for (const t of teams) {
      rows.set(t.teamId, {
        teamId: t.teamId,
        name: t.name,
        participantId: t.participantId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        position: 0,
      });
    }
    for (const m of results) {
      const h = rows.get(m.homeId);
      const a = rows.get(m.awayId);
      if (!h || !a) continue;
      h.played++;
      a.played++;
      h.goalsFor += m.homeGoals;
      h.goalsAgainst += m.awayGoals;
      a.goalsFor += m.awayGoals;
      a.goalsAgainst += m.homeGoals;
      if (m.homeGoals > m.awayGoals) {
        h.won++;
        a.lost++;
        h.points += 3;
      } else if (m.homeGoals < m.awayGoals) {
        a.won++;
        h.lost++;
        a.points += 3;
      } else {
        h.drawn++;
        a.drawn++;
        h.points++;
        a.points++;
      }
    }
    const list = [...rows.values()].map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
    list.sort(
      (x, y) =>
        y.points - x.points ||
        y.won - x.won ||
        y.goalDiff - x.goalDiff ||
        y.goalsFor - x.goalsFor ||
        draw.indexOf(x.teamId) - draw.indexOf(y.teamId),
    );
    list.forEach((r, i) => (r.position = i + 1));
    return list;
  }
}

export function aggregateScorers(results: MatchResult[], limit = 10) {
  const map = new Map<string, { cardId: string; name: string; teamId: string; goals: number }>();
  const add = (g: Goal, teamId: string) => {
    const key = `${teamId}:${g.cardId}`;
    const cur = map.get(key) ?? { cardId: g.cardId, name: g.name, teamId, goals: 0 };
    cur.goals++;
    map.set(key, cur);
  };
  for (const m of results) {
    for (const g of m.goals) add(g, g.side === 'home' ? m.homeId : m.awayId);
  }
  return [...map.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, limit);
}

export function aggregateAssists(results: MatchResult[], limit = 10) {
  const map = new Map<string, { cardId: string; name: string; teamId: string; assists: number }>();
  for (const m of results) {
    for (const g of m.goals) {
      if (!g.assistCardId) continue;
      const teamId = g.side === 'home' ? m.homeId : m.awayId;
      const key = `${teamId}:${g.assistCardId}`;
      const cur = map.get(key) ?? { cardId: g.assistCardId, name: g.assistName ?? g.assistCardId, teamId, assists: 0 };
      cur.assists++;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Gols e assistências de cada jogador dos times pedidos (time → carta → [gols, assistências]). */
export function playerStats(results: MatchResult[], teamIds: ReadonlySet<string>): Record<string, Record<string, [number, number]>> {
  const out: Record<string, Record<string, [number, number]>> = {};
  const bump = (teamId: string, cardId: string, k: 0 | 1) => {
    if (!teamIds.has(teamId)) return;
    const team = (out[teamId] ??= {});
    const cur = (team[cardId] ??= [0, 0]);
    cur[k]++;
  };
  for (const m of results) {
    for (const g of m.goals) {
      const teamId = g.side === 'home' ? m.homeId : m.awayId;
      bump(teamId, g.cardId, 0);
      if (g.assistCardId) bump(teamId, g.assistCardId, 1);
    }
  }
  return out;
}
