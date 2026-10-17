import { Rng } from './rng.js';
import { computeStandings, type LeagueTeam, type StandingRow } from './league.js';
import { matchWinner, penaltyShootout, simulateMatch, type MatchResult } from './match.js';
import type { CupFormat, Tactic } from './types.js';

/**
 * Copas pós-liga.
 *  - copa8: observada no original — G8 da liga, 1×8, 2×7, 3×6, 4×5, ida e volta,
 *    semifinal ida e volta e final em jogo único.
 *  - libertadores (“Taça Continental”): observada como opção no original — G8 +
 *    24 clubes do continente, 8 grupos de 4, passam 2, mata-mata até a final única.
 *    Ida e volta no mata-mata é decisão própria.
 *  - mundial (“Torneio Mundial”): formato próprio — 32 times, grupos em turno único e
 *    mata-mata em jogo único.
 */

export type CupStageId = 'grupos' | 'oitavas' | 'quartas' | 'semi' | 'final';
export type CupReach = CupStageId | 'campeao';

export const REACH_ORDER: Record<CupReach, number> = { grupos: 1, oitavas: 2, quartas: 3, semi: 4, final: 5, campeao: 6 };
export const REACH_LABEL: Record<CupReach, string> = {
  grupos: 'Fase de grupos',
  oitavas: 'Oitavas de final',
  quartas: 'Quartas de final',
  semi: 'Semifinal',
  final: 'Vice-campeão',
  campeao: 'Campeão',
};

export const CUP_NAME: Record<CupFormat, string> = {
  copa8: 'Copa dos 8',
  libertadores: 'Taça Continental',
  mundial: 'Torneio Mundial',
  nenhuma: '—',
};

export interface CupTie {
  id: string;
  stage: CupStageId;
  /** `b` é o mais bem colocado: decide em casa (ou campo neutro na final). */
  aId: string;
  bId: string;
  legs: string[];
  twoLegs: boolean;
  winnerId: string | null;
  aggregate?: { a: number; b: number };
  penalties?: { a: number; b: number };
}

export interface CupGroup {
  id: string;
  teamIds: string[];
}

interface ScheduledMatch {
  id: string;
  stage: CupStageId;
  homeId: string;
  awayId: string;
  neutral: boolean;
  tieId?: string;
  leg?: number;
  groupId?: string;
}

export interface CupState {
  format: CupFormat;
  name: string;
  seed: string;
  teams: LeagueTeam[];
  seedRank: Record<string, number>;
  groups: CupGroup[];
  groupDoubleRound: boolean;
  knockoutTwoLegs: boolean;
  stages: CupStageId[];
  stageIndex: number;
  matchdays: ScheduledMatch[][];
  matchdayIndex: number;
  ties: CupTie[];
  results: Record<string, MatchResult>;
  reached: Record<string, CupReach>;
  championId: string | null;
  runnerUpId: string | null;
  done: boolean;
  /** Times da fase de grupos que avançaram (para relatório). */
  groupTables?: Record<string, StandingRow[]>;
}

const GROUP_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export class Cup {
  constructor(public state: CupState) {}

  /**
   * @param qualified times classificados em ordem de semente (1º da liga primeiro).
   * @param extraTeams clubes adicionais (continentais) para formatos com grupos.
   */
  static create(format: CupFormat, qualified: LeagueTeam[], extraTeams: LeagueTeam[], seed: string): Cup {
    if (format === 'nenhuma') throw new Error('Formato sem copa');
    const rng = new Rng(`cup:${seed}`);
    const seedRank: Record<string, number> = {};
    qualified.forEach((t, i) => (seedRank[t.teamId] = i + 1));
    const state: CupState = {
      format,
      name: CUP_NAME[format],
      seed,
      teams: [...qualified, ...extraTeams],
      seedRank,
      groups: [],
      groupDoubleRound: format === 'libertadores',
      knockoutTwoLegs: format !== 'mundial',
      stages: [],
      stageIndex: 0,
      matchdays: [],
      matchdayIndex: 0,
      ties: [],
      results: {},
      reached: {},
      championId: null,
      runnerUpId: null,
      done: false,
    };
    const cup = new Cup(state);
    if (format === 'copa8') {
      state.stages = ['quartas', 'semi', 'final'];
      const s = qualified.map((t) => t.teamId);
      for (const id of s) state.reached[id] = 'quartas';
      const pairs: Array<[number, number]> = [
        [0, 7],
        [3, 4],
        [1, 6],
        [2, 5],
      ];
      cup.buildKnockout(
        'quartas',
        pairs.map(([b, a]) => [s[a]!, s[b]!] as [string, string]),
      );
    } else {
      state.stages = ['grupos', 'oitavas', 'quartas', 'semi', 'final'];
      extraTeams.forEach((t, i) => (seedRank[t.teamId] = 100 + i));
      const pot1 = qualified.map((t) => t.teamId);
      const others = rng.shuffle(extraTeams.map((t) => t.teamId));
      state.groups = GROUP_IDS.map((gid, i) => ({ id: gid, teamIds: [pot1[i]!, ...others.slice(i * 3, i * 3 + 3)] }));
      for (const t of state.teams) state.reached[t.teamId] = 'grupos';
      cup.buildGroups();
    }
    return cup;
  }

  get done(): boolean {
    return this.state.done;
  }

  get currentStage(): CupStageId | null {
    return this.state.stages[this.state.stageIndex] ?? null;
  }

  team(id: string): LeagueTeam {
    const t = this.state.teams.find((x) => x.teamId === id);
    if (!t) throw new Error(`Time ${id} não está na copa`);
    return t;
  }

  /** Próxima rodada (sem jogar) — útil para mostrar “próximo jogo”. */
  peekMatchday(): ScheduledMatch[] {
    return this.state.matchdays[this.state.matchdayIndex] ?? [];
  }

  private buildGroups() {
    const s = this.state;
    s.matchdays = [];
    const single: Array<Array<[number, number]>> = [
      [
        [0, 3],
        [1, 2],
      ],
      [
        [3, 1],
        [2, 0],
      ],
      [
        [0, 1],
        [2, 3],
      ],
    ];
    const rounds = s.groupDoubleRound ? [...single, ...single.map((r) => r.map(([h, a]) => [a, h] as [number, number]))] : single;
    rounds.forEach((pairs, r) => {
      const day: ScheduledMatch[] = [];
      for (const g of s.groups) {
        pairs.forEach(([h, a], k) => {
          day.push({
            id: `C-G${g.id}-${r + 1}-${k + 1}`,
            stage: 'grupos',
            homeId: g.teamIds[h]!,
            awayId: g.teamIds[a]!,
            neutral: false,
            groupId: g.id,
          });
        });
      }
      s.matchdays.push(day);
    });
    s.matchdayIndex = 0;
  }

  /** pares: [a, b] onde b é o mais bem colocado (decide em casa). */
  private buildKnockout(stage: CupStageId, pairs: Array<[string, string]>) {
    const s = this.state;
    const twoLegs = stage !== 'final' && s.knockoutTwoLegs;
    s.matchdays = twoLegs ? [[], []] : [[]];
    pairs.forEach(([aId, bId], i) => {
      const tie: CupTie = { id: `T-${stage}-${i + 1}`, stage, aId, bId, legs: [], twoLegs, winnerId: null };
      s.ties.push(tie);
      if (twoLegs) {
        const leg1 = { id: `${tie.id}-ida`, stage, homeId: aId, awayId: bId, neutral: false, tieId: tie.id, leg: 1 };
        const leg2 = { id: `${tie.id}-volta`, stage, homeId: bId, awayId: aId, neutral: false, tieId: tie.id, leg: 2 };
        tie.legs.push(leg1.id, leg2.id);
        s.matchdays[0]!.push(leg1);
        s.matchdays[1]!.push(leg2);
      } else {
        const only = { id: `${tie.id}-unico`, stage, homeId: bId, awayId: aId, neutral: stage === 'final', tieId: tie.id, leg: 1 };
        tie.legs.push(only.id);
        s.matchdays[0]!.push(only);
      }
      s.reached[aId] = stage;
      s.reached[bId] = stage;
    });
    s.matchdayIndex = 0;
  }

  playNextMatchday(tactics: Record<string, Tactic> = {}): MatchResult[] {
    const s = this.state;
    if (s.done) return [];
    const day = s.matchdays[s.matchdayIndex] ?? [];
    const out: MatchResult[] = [];
    for (const m of day) {
      const home = this.team(m.homeId);
      const away = this.team(m.awayId);
      const tie = m.tieId ? s.ties.find((t) => t.id === m.tieId) : undefined;
      const singleKnockout = !!tie && !tie.twoLegs;
      const result = simulateMatch({
        id: m.id,
        home,
        away,
        homeTactic: home.participantId ? tactics[home.participantId] : 'equilibrio',
        awayTactic: away.participantId ? tactics[away.participantId] : 'equilibrio',
        neutral: m.neutral,
        needWinner: singleKnockout,
        withEvents: home.human || away.human,
        rng: new Rng(`${s.seed}:${m.id}`),
      });
      if (tie && tie.twoLegs && m.leg === 2) this.settleTwoLegTie(tie, result);
      s.results[m.id] = result;
      if (tie && !tie.twoLegs) {
        tie.winnerId = matchWinner(result);
        tie.aggregate = {
          a: tie.aId === result.homeId ? result.homeGoals : result.awayGoals,
          b: tie.bId === result.homeId ? result.homeGoals : result.awayGoals,
        };
        if (result.penalties) {
          tie.penalties = {
            a: tie.aId === result.homeId ? result.penalties.home : result.penalties.away,
            b: tie.bId === result.homeId ? result.penalties.home : result.penalties.away,
          };
        }
      }
      out.push(result);
    }
    s.matchdayIndex++;
    if (s.matchdayIndex >= s.matchdays.length) this.closeStage();
    return out;
  }

  private settleTwoLegTie(tie: CupTie, leg2: MatchResult) {
    const leg1 = this.state.results[tie.legs[0]!]!;
    // Ida: a em casa. Volta: b em casa.
    const aGoals = leg1.homeGoals + leg2.awayGoals;
    const bGoals = leg1.awayGoals + leg2.homeGoals;
    tie.aggregate = { a: aGoals, b: bGoals };
    if (aGoals > bGoals) tie.winnerId = tie.aId;
    else if (bGoals > aGoals) tie.winnerId = tie.bId;
    else {
      const pens = penaltyShootout(new Rng(`${this.state.seed}:${tie.id}:pen`), this.team(leg2.homeId), this.team(leg2.awayId));
      leg2.penalties = pens;
      // leg2: home = b
      tie.penalties = { a: pens.away, b: pens.home };
      tie.winnerId = pens.home > pens.away ? tie.bId : tie.aId;
    }
  }

  groupStandings(): Record<string, StandingRow[]> {
    const s = this.state;
    const out: Record<string, StandingRow[]> = {};
    const results = Object.values(s.results);
    for (const g of s.groups) {
      const teams = g.teamIds.map((id) => this.team(id));
      const draw = [...g.teamIds].sort((a, b) => (s.seedRank[a] ?? 999) - (s.seedRank[b] ?? 999));
      out[g.id] = computeStandings(
        teams,
        results.filter((r) => g.teamIds.includes(r.homeId) && g.teamIds.includes(r.awayId)),
        draw,
      );
    }
    return out;
  }

  private closeStage() {
    const s = this.state;
    const stage = this.currentStage!;
    if (stage === 'grupos') {
      const tables = this.groupStandings();
      s.groupTables = tables;
      const first = (g: string) => tables[g]![0]!.teamId;
      const second = (g: string) => tables[g]![1]!.teamId;
      // Melhor campanha na fase de grupos vira critério de mando no mata-mata.
      for (const g of GROUP_IDS) {
        s.seedRank[first(g)] = Math.min(s.seedRank[first(g)] ?? 999, 50 + GROUP_IDS.indexOf(g));
      }
      const order: Array<[string, string]> = [
        ['A', 'B'],
        ['C', 'D'],
        ['E', 'F'],
        ['G', 'H'],
        ['B', 'A'],
        ['D', 'C'],
        ['F', 'E'],
        ['H', 'G'],
      ];
      s.stageIndex++;
      this.buildKnockout(
        'oitavas',
        order.map(([w, r]) => [second(r), first(w)] as [string, string]),
      );
      return;
    }
    const winners = s.ties.filter((t) => t.stage === stage).map((t) => t.winnerId!);
    if (stage === 'final') {
      const final = s.ties.find((t) => t.stage === 'final')!;
      s.championId = final.winnerId;
      s.runnerUpId = final.winnerId === final.aId ? final.bId : final.aId;
      s.reached[s.championId!] = 'campeao';
      s.reached[s.runnerUpId] = 'final';
      s.done = true;
      s.matchdays = [];
      return;
    }
    s.stageIndex++;
    const next = this.currentStage!;
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < winners.length; i += 2) {
      const x = winners[i]!;
      const y = winners[i + 1]!;
      const better = (s.seedRank[x] ?? 999) <= (s.seedRank[y] ?? 999) ? x : y;
      const worse = better === x ? y : x;
      pairs.push([worse, better]);
    }
    this.buildKnockout(next, pairs);
  }

  /** Lista de confrontos de mata-mata já decididos. */
  decidedTies(): CupTie[] {
    return this.state.ties.filter((t) => t.winnerId);
  }
}
