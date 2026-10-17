import { Auction, lotSizes, type AuctionState } from './auction.js';
import { computePregaoAwards, type PregaoAward } from './awards.js';
import { makeContinentalBots, makeLeagueBots } from './bots.js';
import { Cup, REACH_ORDER, type CupReach, type CupState } from './cup.js';
import { GameRuleError } from './errors.js';
import { aggregateScorers, League, type LeagueState, type LeagueTeam, type StandingRow } from './league.js';
import type { MatchResult, SquadPlayer } from './match.js';
import { Rng } from './rng.js';
import {
  FORMATIONS,
  MAX_PARTICIPANTS,
  POSITIONS,
  type Card,
  type DisputeConfig,
  type Formation,
  type Participant,
  type Position,
  type Tactic,
} from './types.js';

/**
 * Uma “disputa” é um ciclo completo dentro de uma sala:
 * leilão → cerimônia → liga → copa → resultado.
 * A sala (persistente) cria disputas em sequência; cada disputa é independente
 * e serializável (snapshot JSON) para persistência e recuperação.
 */

export type DisputePhase = 'auction' | 'ceremony' | 'league' | 'cup' | 'finished';

export interface SeatInput {
  id: string;
  userId: string | null;
  name: string;
  isCpu: boolean;
  formation: Formation;
  cpuStyle?: Participant['cpuStyle'];
}

export interface DirectMatch {
  matchId: string;
  competition: 'liga' | 'copa';
  stage: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  penalties?: { home: number; away: number };
}

export interface CupDuel {
  tieId: string;
  stage: string;
  aId: string;
  bId: string;
  winnerId: string;
  aggregate?: { a: number; b: number };
  penalties?: { a: number; b: number };
}

export interface ParticipantOutcome {
  participantId: string;
  userId: string | null;
  name: string;
  isCpu: boolean;
  formation: Formation;
  leaguePosition: number;
  leaguePoints: number;
  leagueRecord: { won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number };
  cupReach: CupReach | null;
  titles: Array<'liga' | 'copa'>;
  coinsLeft: number;
  spent: number;
  auctionWins: number;
  squadAverage: number;
  /** Ranking geral do ciclo: nº de títulos, depois posição na liga. */
  rank: number;
}

export interface DisputeResult {
  cupFormat: DisputeConfig['cupFormat'];
  cupName: string | null;
  leagueChampionTeamId: string;
  leagueChampionName: string;
  cupChampionTeamId: string | null;
  cupChampionName: string | null;
  cupRunnerUpTeamId: string | null;
  outcomes: ParticipantOutcome[];
  leagueTable: StandingRow[];
  leagueTopScorers: ReturnType<typeof aggregateScorers>;
  cupTopScorers: ReturnType<typeof aggregateScorers>;
  directMatches: DirectMatch[];
  cupDuels: CupDuel[];
  headline: string;
}

export interface DisputeState {
  version: 1;
  id: string;
  seed: string;
  config: DisputeConfig;
  phase: DisputePhase;
  seats: SeatInput[];
  auction: AuctionState;
  carriedCardIds: string[];
  awards: PregaoAward[] | null;
  league: LeagueState | null;
  cup: CupState | null;
  tactics: Record<string, Tactic>;
  result: DisputeResult | null;
}

export interface CreateDisputeParams {
  id: string;
  seed: string;
  config: DisputeConfig;
  seats: SeatInput[];
  deck: Card[];
  /** Cartas adquiridas no ciclo anterior (voltam todas ao leilão). */
  carried?: Card[];
}

/** Monta o pool do leilão: herdadas do ciclo anterior + sorteio do baralho. */
export function buildAuctionPool(params: {
  seats: Array<Pick<SeatInput, 'formation'>>;
  deck: Card[];
  carried: Card[];
  extra: number;
  seed: string;
}): { pool: Card[]; reserve: Card[] } {
  const rng = new Rng(`pool:${params.seed}`);
  const carriedIds = new Set(params.carried.map((c) => c.id));
  const carriedByPos: Partial<Record<Position, number>> = {};
  for (const c of params.carried) carriedByPos[c.position] = (carriedByPos[c.position] ?? 0) + 1;
  const sizes = lotSizes(params.seats, params.extra, carriedByPos);
  const pool: Card[] = [...params.carried];
  const reserve: Card[] = [];
  for (const pos of POSITIONS) {
    const candidates = rng.shuffle(params.deck.filter((c) => c.position === pos && !carriedIds.has(c.id)));
    const missing = Math.max(0, sizes[pos] - (carriedByPos[pos] ?? 0));
    pool.push(...candidates.slice(0, missing));
    reserve.push(...candidates.slice(missing));
  }
  return { pool, reserve };
}

export class Dispute {
  auction: Auction;
  league: League | null;
  cup: Cup | null;

  private constructor(public state: DisputeState) {
    this.auction = Auction.fromJSON(state.auction);
    this.league = state.league ? new League(state.league) : null;
    this.cup = state.cup ? new Cup(state.cup) : null;
  }

  static create(params: CreateDisputeParams): Dispute {
    const seats = params.seats;
    if (seats.length < 1) throw new GameRuleError('sem_tecnicos', 'A disputa precisa de pelo menos um técnico.');
    if (seats.length > MAX_PARTICIPANTS) {
      throw new GameRuleError('lotado', `No máximo ${MAX_PARTICIPANTS} técnicos por disputa.`);
    }
    const carried = params.config.carryOverPreviousCycle ? (params.carried ?? []) : [];
    const { pool, reserve } = buildAuctionPool({
      seats,
      deck: params.deck,
      carried,
      extra: params.config.auction.lotExtra,
      seed: params.seed,
    });
    const participants: Participant[] = seats.map((s) => ({
      id: s.id,
      userId: s.userId,
      name: s.name,
      isCpu: s.isCpu,
      formation: s.formation,
      coins: params.config.auction.startingCoins,
      roster: [],
      ...(s.cpuStyle ? { cpuStyle: s.cpuStyle } : {}),
    }));
    const auction = Auction.create({
      participants,
      pool,
      reserve,
      config: params.config.auction,
      seed: params.seed,
    });
    const state: DisputeState = {
      version: 1,
      id: params.id,
      seed: params.seed,
      config: params.config,
      phase: 'auction',
      seats,
      auction: auction.toJSON(),
      carriedCardIds: carried.map((c) => c.id),
      awards: null,
      league: null,
      cup: null,
      tactics: Object.fromEntries(seats.map((s) => [s.id, 'equilibrio' as Tactic])),
      result: null,
    };
    const d = new Dispute(state);
    d.auction = auction;
    if (auction.done) d.startCeremony();
    return d;
  }

  static fromJSON(state: DisputeState): Dispute {
    return new Dispute(structuredClone(state));
  }

  toJSON(): DisputeState {
    this.state.auction = this.auction.toJSON();
    if (this.league) this.state.league = this.league.state;
    if (this.cup) this.state.cup = this.cup.state;
    return this.state;
  }

  get phase(): DisputePhase {
    return this.state.phase;
  }

  get participants(): Participant[] {
    return this.auction.state.participants;
  }

  get cards(): Record<string, Card> {
    return this.auction.state.cards;
  }

  participant(id: string): Participant {
    return this.auction.participant(id);
  }

  setTactic(participantId: string, tactic: Tactic) {
    if (!['retranca', 'equilibrio', 'ataque'].includes(tactic)) throw new GameRuleError('tatica_invalida', 'Tática inválida.');
    this.participant(participantId);
    this.state.tactics[participantId] = tactic;
  }

  /** Chamar após cada passo do leilão; muda de fase quando o leilão termina. */
  afterAuctionStep(): void {
    if (this.state.phase === 'auction' && this.auction.done) this.startCeremony();
  }

  private startCeremony() {
    this.validateRosters();
    this.state.awards = computePregaoAwards(this.participants, this.cards, this.auction.state.revealLog);
    this.state.phase = 'ceremony';
  }

  /** Todo elenco precisa fechar exatamente a formação escolhida. */
  validateRosters() {
    for (const p of this.participants) {
      const need = FORMATIONS[p.formation];
      for (const pos of POSITIONS) {
        const have = p.roster.filter((r) => r.position === pos).length;
        if (have !== need[pos]) {
          throw new Error(`Elenco inválido de ${p.name}: ${pos} ${have}/${need[pos]}`);
        }
      }
      const ids = new Set(p.roster.map((r) => r.cardId));
      if (ids.size !== p.roster.length) throw new Error(`Elenco de ${p.name} com carta duplicada`);
      if (p.coins < 0) throw new Error(`Saldo negativo para ${p.name}`);
    }
    const all = this.participants.flatMap((p) => p.roster.map((r) => r.cardId));
    if (new Set(all).size !== all.length) throw new Error('Carta vendida para dois técnicos');
  }

  squadOf(participantId: string): SquadPlayer[] {
    const p = this.participant(participantId);
    return p.roster.map((r) => {
      const c = this.cards[r.cardId]!;
      return { cardId: c.id, name: c.name, position: c.position, levelMin: c.levelMin, levelMax: c.levelMax };
    });
  }

  startLeague(): void {
    if (this.state.phase !== 'ceremony') throw new GameRuleError('fora_de_hora', 'A liga só começa depois da cerimônia.');
    const teams: LeagueTeam[] = this.participants.map((p) => ({
      teamId: p.id,
      name: p.name,
      squad: this.squadOf(p.id),
      participantId: p.id,
      human: !p.isCpu,
    }));
    const botCount = Math.max(0, this.state.config.leagueSize - teams.length);
    for (const b of makeLeagueBots(botCount, this.state.seed)) {
      teams.push({ teamId: b.teamId, name: b.name, squad: b.squad, participantId: null, human: false });
    }
    this.league = League.create(teams, this.state.seed);
    this.state.league = this.league.state;
    this.state.phase = 'league';
  }

  playLeagueRound(): MatchResult[] {
    if (this.state.phase !== 'league' || !this.league) throw new GameRuleError('fora_de_hora', 'A liga não está em andamento.');
    const results = this.league.playRound(this.state.tactics);
    if (this.league.done) {
      if (this.state.config.cupFormat === 'nenhuma') this.finish();
      else this.startCup();
    }
    return results;
  }

  private startCup() {
    const table = this.league!.standings();
    const qualified = table.slice(0, 8).map((r) => this.league!.team(r.teamId));
    const format = this.state.config.cupFormat;
    const extras: LeagueTeam[] =
      format === 'copa8'
        ? []
        : makeContinentalBots(24, this.state.seed).map((b) => ({
            teamId: b.teamId,
            name: b.name,
            squad: b.squad,
            participantId: null,
            human: false,
          }));
    this.cup = Cup.create(format, qualified, extras, this.state.seed);
    this.state.cup = this.cup.state;
    this.state.phase = 'cup';
  }

  playCupMatchday(): MatchResult[] {
    if (this.state.phase !== 'cup' || !this.cup) throw new GameRuleError('fora_de_hora', 'A copa não está em andamento.');
    const results = this.cup.playNextMatchday(this.state.tactics);
    if (this.cup.done) this.finish();
    return results;
  }

  /** Avança uma unidade de jogo (passo de leilão, rodada ou jogo de copa). Útil em testes/CPU. */
  tick(): void {
    switch (this.state.phase) {
      case 'auction':
        this.auction.resolveStep();
        this.afterAuctionStep();
        break;
      case 'ceremony':
        this.startLeague();
        break;
      case 'league':
        this.playLeagueRound();
        break;
      case 'cup':
        this.playCupMatchday();
        break;
      default:
        break;
    }
  }

  runToEnd(maxTicks = 20_000): DisputeResult {
    let guard = 0;
    while (this.state.phase !== 'finished' && guard++ < maxTicks) this.tick();
    if (!this.state.result) throw new Error('Disputa não terminou');
    return this.state.result;
  }

  private finish() {
    const league = this.league!;
    const table = league.standings();
    const cup = this.cup;
    const participants = this.participants;
    const pids = new Set(participants.map((p) => p.id));
    const champion = table[0]!;
    const outcomes: ParticipantOutcome[] = participants.map((p) => {
      const row = table.find((r) => r.teamId === p.id)!;
      const reach = cup ? (cup.state.reached[p.id] ?? null) : null;
      const titles: Array<'liga' | 'copa'> = [];
      if (champion.teamId === p.id) titles.push('liga');
      if (cup?.state.championId === p.id) titles.push('copa');
      const squad = this.squadOf(p.id);
      return {
        participantId: p.id,
        userId: p.userId,
        name: p.name,
        isCpu: p.isCpu,
        formation: p.formation,
        leaguePosition: row.position,
        leaguePoints: row.points,
        leagueRecord: { won: row.won, drawn: row.drawn, lost: row.lost, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst },
        cupReach: reach,
        titles,
        coinsLeft: p.coins,
        spent: this.state.config.auction.startingCoins - p.coins,
        auctionWins: p.roster.filter((r) => r.source !== 'monte').length,
        squadAverage: Math.round((squad.reduce((s, x) => s + (x.levelMin + x.levelMax) / 2, 0) / Math.max(1, squad.length)) * 10) / 10,
        rank: 0,
      };
    });
    outcomes
      .sort(
        (a, b) =>
          b.titles.length - a.titles.length ||
          a.leaguePosition - b.leaguePosition ||
          (REACH_ORDER[b.cupReach ?? 'grupos'] ?? 0) - (REACH_ORDER[a.cupReach ?? 'grupos'] ?? 0),
      )
      .forEach((o, i) => (o.rank = i + 1));

    const directMatches: DirectMatch[] = [];
    const collect = (results: MatchResult[], competition: 'liga' | 'copa', stageOf: (id: string) => string) => {
      for (const m of results) {
        if (pids.has(m.homeId) && pids.has(m.awayId)) {
          directMatches.push({
            matchId: m.id,
            competition,
            stage: stageOf(m.id),
            homeId: m.homeId,
            awayId: m.awayId,
            homeGoals: m.homeGoals,
            awayGoals: m.awayGoals,
            ...(m.penalties ? { penalties: m.penalties } : {}),
          });
        }
      }
    };
    collect(Object.values(league.state.results), 'liga', (id) => `rodada ${id.split('-')[0]!.slice(1)}`);
    const cupDuels: CupDuel[] = [];
    if (cup) {
      collect(Object.values(cup.state.results), 'copa', (id) => (id.startsWith('C-G') ? 'grupos' : id.split('-')[1]!));
      for (const t of cup.decidedTies()) {
        if (pids.has(t.aId) && pids.has(t.bId)) {
          cupDuels.push({
            tieId: t.id,
            stage: t.stage,
            aId: t.aId,
            bId: t.bId,
            winnerId: t.winnerId!,
            ...(t.aggregate ? { aggregate: t.aggregate } : {}),
            ...(t.penalties ? { penalties: t.penalties } : {}),
          });
        }
      }
    }
    const cupChampionName = cup?.state.championId ? cup.team(cup.state.championId).name : null;
    const headline =
      cup && cup.state.championId && cup.state.championId !== champion.teamId
        ? `Temporada dividida: ${champion.name} leva a liga, ${cupChampionName} leva a ${cup.state.name}.`
        : cup && cup.state.championId === champion.teamId
          ? `${champion.name} faz a dobradinha: liga e ${cup.state.name}!`
          : `${champion.name} é o campeão da liga!`;

    this.state.result = {
      cupFormat: this.state.config.cupFormat,
      cupName: cup ? cup.state.name : null,
      leagueChampionTeamId: champion.teamId,
      leagueChampionName: champion.name,
      cupChampionTeamId: cup?.state.championId ?? null,
      cupChampionName,
      cupRunnerUpTeamId: cup?.state.runnerUpId ?? null,
      outcomes: outcomes.sort((a, b) => a.rank - b.rank),
      leagueTable: table,
      leagueTopScorers: league.topScorers(10),
      cupTopScorers: cup ? aggregateScorers(Object.values(cup.state.results), 5) : [],
      directMatches,
      cupDuels,
      headline,
    };
    this.state.phase = 'finished';
  }

  /** Todas as cartas adquiridas nesta disputa (voltam ao leilão no próximo ciclo). */
  acquiredCards(): Card[] {
    return this.participants.flatMap((p) => p.roster.map((r) => this.cards[r.cardId]!)).filter((c) => !c.id.startsWith('fill-'));
  }
}
