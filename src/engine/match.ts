import type { Rng } from './rng.js';
import type { Position, Tactic } from './types.js';

/**
 * Simulação de partidas.
 *
 * Decisão de design: o original mostra placares ao vivo, artilharia e táticas
 * (Retranca/Equilíbrio/Ataque), mas a fórmula não é observável. Aqui cada
 * jogador rende um valor sorteado dentro da sua faixa de nível em cada jogo;
 * os setores (ataque/meio/defesa) definem a média de gols de um Poisson.
 */

export interface SquadPlayer {
  cardId: string;
  name: string;
  position: Position;
  levelMin: number;
  levelMax: number;
}

export interface TeamSheet {
  teamId: string;
  name: string;
  squad: SquadPlayer[];
}

export type MatchEventType = 'apito' | 'gol' | 'trave' | 'defesa' | 'chance' | 'fim' | 'penaltis';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: 'home' | 'away' | null;
  cardId?: string;
  text: string;
}

export interface Goal {
  side: 'home' | 'away';
  cardId: string;
  name: string;
  minute: number;
}

export interface MatchResult {
  id: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  goals: Goal[];
  penalties?: { home: number; away: number };
  events?: MatchEvent[];
}

export interface SimulateParams {
  id: string;
  home: TeamSheet;
  away: TeamSheet;
  homeTactic?: Tactic;
  awayTactic?: Tactic;
  neutral?: boolean;
  /** Se verdadeiro e empatar, decide nos pênaltis. */
  needWinner?: boolean;
  withEvents?: boolean;
  rng: Rng;
}

const TACTIC_MOD: Record<Tactic, { att: number; def: number }> = {
  retranca: { att: -4, def: 5 },
  equilibrio: { att: 0, def: 0 },
  ataque: { att: 5, def: -4 },
};

function avg(nums: number[], fallback: number): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : fallback;
}

export interface Sectors {
  att: number;
  mid: number;
  def: number;
  ratings: Map<string, number>;
}

export function rateTeam(team: TeamSheet, rng: Rng, tactic: Tactic = 'equilibrio'): Sectors {
  const ratings = new Map<string, number>();
  for (const p of team.squad) {
    ratings.set(p.cardId, p.levelMin + rng.next() * (p.levelMax - p.levelMin));
  }
  const by = (pos: Position) => team.squad.filter((p) => p.position === pos).map((p) => ratings.get(p.cardId)!);
  const ata = avg(by('ATA'), 55);
  const mei = avg(by('MEI'), 55);
  const zag = avg(by('ZAG'), 55);
  const lat = avg(by('LAT'), 55);
  const gol = avg(by('GOL'), 50);
  const mod = TACTIC_MOD[tactic];
  return {
    att: ata * 0.62 + mei * 0.38 + mod.att,
    mid: mei,
    def: zag * 0.42 + lat * 0.28 + gol * 0.3 + mod.def,
    ratings,
  };
}

const SCORER_WEIGHT: Record<Position, number> = { ATA: 6, MEI: 3, LAT: 1, ZAG: 0.9, GOL: 0.03 };

function pickScorer(team: TeamSheet, ratings: Map<string, number>, rng: Rng): SquadPlayer {
  return rng.weighted(team.squad, (p) => SCORER_WEIGHT[p.position] * Math.pow((ratings.get(p.cardId) ?? 60) / 80, 2));
}

const GOAL_TEXT = [
  '{p} recebe na entrada da área e bate firme no canto!',
  '{p} aparece de cabeça depois do escanteio — rede balançando!',
  'Contra-ataque rápido e {p} toca na saída do goleiro!',
  '{p} arrisca de longe… e acerta o ângulo!',
  'Bate-rebate na área e {p} empurra para dentro!',
];
const POST_TEXT = ['{p} solta a bomba e a bola explode na trave!', '{p} tenta por cobertura e acerta o travessão!'];
const SAVE_TEXT = ['{p} cara a cara… e o goleiro salva com o pé!', 'Que defesa! {p} já comemorava.'];
const CHANCE_TEXT = ['{p} invade a área, mas finaliza para fora.', '{p} cabeceia por cima do gol.'];

function fill(template: string, name: string): string {
  return template.replace('{p}', name);
}

export function expectedGoals(attack: number, defense: number, midDiff: number, homeBoost: number, bothAttack: number): number {
  const lambda = 1.3 * Math.exp((attack - defense) / 15 + midDiff / 30 + homeBoost) * (1 + bothAttack);
  return Math.min(5, Math.max(0.12, lambda));
}

export function simulateMatch(params: SimulateParams): MatchResult {
  const { rng, home, away } = params;
  const homeTactic = params.homeTactic ?? 'equilibrio';
  const awayTactic = params.awayTactic ?? 'equilibrio';
  const h = rateTeam(home, rng, homeTactic);
  const a = rateTeam(away, rng, awayTactic);
  const openness = (homeTactic === 'ataque' ? 0.08 : 0) + (awayTactic === 'ataque' ? 0.08 : 0);
  const homeBoost = params.neutral ? 0 : 0.12;
  const lh = expectedGoals(h.att, a.def, h.mid - a.mid, homeBoost, openness);
  const la = expectedGoals(a.att, h.def, a.mid - h.mid, 0, openness);
  const homeGoals = rng.poisson(lh);
  const awayGoals = rng.poisson(la);

  const goals: Goal[] = [];
  const minutes = (n: number) =>
    Array.from({ length: n }, () => rng.int(1, 90)).sort((x, y) => x - y);
  for (const minute of minutes(homeGoals)) {
    const p = pickScorer(home, h.ratings, rng);
    goals.push({ side: 'home', cardId: p.cardId, name: p.name, minute });
  }
  for (const minute of minutes(awayGoals)) {
    const p = pickScorer(away, a.ratings, rng);
    goals.push({ side: 'away', cardId: p.cardId, name: p.name, minute });
  }
  goals.sort((x, y) => x.minute - y.minute);

  const result: MatchResult = { id: params.id, homeId: home.teamId, awayId: away.teamId, homeGoals, awayGoals, goals };

  if (params.needWinner && homeGoals === awayGoals) {
    result.penalties = shootout(rng, h, a);
  }

  if (params.withEvents) {
    const events: MatchEvent[] = [{ minute: 0, type: 'apito', side: null, text: 'Apita o árbitro: bola rolando!' }];
    for (const g of goals) {
      events.push({ minute: g.minute, type: 'gol', side: g.side, cardId: g.cardId, text: fill(rng.pick(GOAL_TEXT), g.name) });
    }
    const extras = rng.int(2, 5);
    for (let i = 0; i < extras; i++) {
      const side = rng.next() < lh / (lh + la) ? 'home' : 'away';
      const team = side === 'home' ? home : away;
      const ratings = side === 'home' ? h.ratings : a.ratings;
      const p = pickScorer(team, ratings, rng);
      const kind = rng.pick(['trave', 'defesa', 'chance'] as const);
      const text = fill(rng.pick(kind === 'trave' ? POST_TEXT : kind === 'defesa' ? SAVE_TEXT : CHANCE_TEXT), p.name);
      events.push({ minute: rng.int(3, 88), type: kind, side, cardId: p.cardId, text });
    }
    events.sort((x, y) => x.minute - y.minute);
    events.push({ minute: 90, type: 'fim', side: null, text: `Fim de jogo: ${home.name} ${homeGoals} × ${awayGoals} ${away.name}.` });
    if (result.penalties) {
      const winner = result.penalties.home > result.penalties.away ? home.name : away.name;
      events.push({
        minute: 90,
        type: 'penaltis',
        side: result.penalties.home > result.penalties.away ? 'home' : 'away',
        text: `Nos pênaltis, ${result.penalties.home} × ${result.penalties.away} — classificado: ${winner}!`,
      });
    }
    result.events = events;
  }
  return result;
}

/** Disputa de pênaltis isolada (usada no fim de confrontos de ida e volta). */
export function penaltyShootout(rng: Rng, home: TeamSheet, away: TeamSheet): { home: number; away: number } {
  return shootout(rng, rateTeam(home, rng), rateTeam(away, rng));
}

function shootout(rng: Rng, h: Sectors, a: Sectors): { home: number; away: number } {
  const pHome = Math.min(0.88, Math.max(0.6, 0.75 + (h.att - a.def) / 200));
  const pAway = Math.min(0.88, Math.max(0.6, 0.75 + (a.att - h.def) / 200));
  let home = 0;
  let away = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.next() < pHome) home++;
    if (rng.next() < pAway) away++;
  }
  let guard = 0;
  while (home === away && guard++ < 30) {
    const hs = rng.next() < pHome;
    const as = rng.next() < pAway;
    if (hs) home++;
    if (as) away++;
  }
  if (home === away) home++;
  return { home, away };
}

/** Vencedor de um jogo único (considerando pênaltis). */
export function matchWinner(m: MatchResult): string | null {
  if (m.homeGoals > m.awayGoals) return m.homeId;
  if (m.awayGoals > m.homeGoals) return m.awayId;
  if (m.penalties) return m.penalties.home > m.penalties.away ? m.homeId : m.awayId;
  return null;
}
