/**
 * Contrato entre servidor e cliente (tipos apenas).
 * O servidor é a autoridade: o cliente envia intenções e recebe visões
 * personalizadas — sem lances alheios antes da revelação e sem níveis antes
 * da Cerimônia.
 */
import type { RevealItem } from '../engine/auction.js';
import type { PregaoAward } from '../engine/awards.js';
import type { CupReach, CupTie } from '../engine/cup.js';
import type { DisputePhase, DisputeResult } from '../engine/dispute.js';
import type { StandingRow } from '../engine/league.js';
import type { MatchEvent, Goal } from '../engine/match.js';
import type { AcquisitionSource, CupFormat, Formation, Position, Tactic, Tier } from '../engine/types.js';

export type RoomMode = 'online' | 'solo';
export type RoomStatus = 'lobby' | 'in_dispute' | 'post_dispute' | 'closed';
export type SpeedSetting = 'normal' | 'turbo';
export type MemberStatus = 'active' | 'inactive' | 'left';
export type ContinueChoice = 'continue' | 'leave';

export interface RoomSettings {
  cupFormat: CupFormat;
  cpuCount: number;
  speed: SpeedSetting;
  maxHumans: number;
  carryOver: boolean;
  repescagem: boolean;
  tiebreakRound: boolean;
  mysteryCards: boolean;
  /** Tempo para cada técnico responder se continua na sala (segundos). */
  continuationTimeoutSec: number;
  /** Mínimo de humanos que aceitaram para iniciar o próximo ciclo automaticamente. */
  minHumansToContinue: number;
}

export interface PublicUserView {
  id: string;
  displayName: string;
  username: string | null;
  isGuest: boolean;
}

export interface MemberView {
  userId: string;
  teamName: string;
  formation: Formation;
  seat: number;
  status: MemberStatus;
  connected: boolean;
  isHost: boolean;
  /** Participa da disputa em andamento (falso para quem entrou no meio). */
  inDispute: boolean;
}

export interface ContinuationView {
  disputeId: string;
  cycle: number;
  deadline: number;
  eligible: string[];
  responses: Record<string, ContinueChoice>;
  minHumans: number;
}

export interface HistoryEntry {
  disputeId: string;
  seq: number;
  status: 'active' | 'finished' | 'aborted';
  startedAt: string;
  finishedAt: string | null;
  headline: string | null;
  leagueChampion: string | null;
  cupChampion: string | null;
  cupName: string | null;
  carriedCardCount: number;
  participants: Array<{ name: string; userId: string | null; rank: number; isCpu: boolean }>;
}

export interface CardView {
  id: string;
  name: string;
  position: Position;
  club: string;
  year: number;
  hint: string;
  /** Semente estável da figurinha ilustrada (mesmo jogador = mesmo desenho). */
  seed: string;
  /** Cores do uniforme do clube, quando o baralho as tem. */
  kit?: [string, string];
  mystery?: boolean;
  /** Revelado no martelo (carta vendida) ou na Cerimônia. */
  tier?: Tier;
  /** Revelados apenas na Cerimônia da Revelação. */
  levelMin?: number;
  levelMax?: number;
}

export interface RosterView {
  cardId: string;
  position: Position;
  price: number;
  source: AcquisitionSource;
}

export interface ParticipantView {
  id: string;
  userId: string | null;
  name: string;
  isCpu: boolean;
  formation: Formation;
  coins: number;
  roster: RosterView[];
  connected: boolean;
  abandoned: boolean;
}

export interface BidStepView {
  kind: 'bid';
  stepId: string;
  position: Position;
  round: 'leva' | 'repescagem';
  batchIndex: number;
  batchCount: number;
  cardIds: string[];
  deadline: number;
  eligible: string[];
  sealed: string[];
  youAreEligible: boolean;
  myBids: Record<string, number>;
  mySealed: boolean;
  myOpenSlots: number;
  myCoins: number;
}

export interface TiebreakStepView {
  kind: 'tiebreak';
  stepId: string;
  position: Position;
  deadline: number;
  eligible: string[];
  sealed: string[];
  myItems: Array<{ cardId: string; floor: number; rivals: string[] }>;
  myBids: Record<string, number>;
  mySealed: boolean;
  myFreeCoins: number;
}

export interface MonteStepView {
  kind: 'monte';
  stepId: string;
  pool: string[];
  current: string;
  queue: string[];
  deadline: number;
  myOptions: string[];
  pickNumber: number;
}

export type StepView = BidStepView | TiebreakStepView | MonteStepView;

export interface RevealView {
  stepId: string;
  startedAt: number;
  itemMs: number;
  items: RevealItem[];
}

export interface AuctionView {
  step: StepView | null;
  reveal: RevealView | null;
  /** Andamento por posição: 'feito' | 'agora' | 'depois'. */
  progress: Array<{ position: Position; state: 'feito' | 'agora' | 'depois' }>;
  monteLog: Array<{ participantId: string; cardId: string; auto: boolean }>;
}

export interface MatchView {
  id: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  penalties?: { home: number; away: number };
  goals: Goal[];
  events?: MatchEvent[];
  stage?: string;
}

export interface FixtureView {
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  label: string;
}

export interface LeagueView {
  round: number;
  totalRounds: number;
  table: StandingRow[];
  lastResults: MatchView[];
  myLastMatch: MatchView | null;
  myNextFixture: FixtureView | null;
  topScorers: Array<{ cardId: string; name: string; teamId: string; goals: number }>;
  tickStartedAt: number;
  tickMs: number;
}

export interface CupView {
  name: string;
  format: CupFormat;
  stage: string | null;
  matchdayIndex: number;
  ties: CupTie[];
  groupTables: Record<string, StandingRow[]> | null;
  groups: Array<{ id: string; teamIds: string[] }>;
  lastResults: MatchView[];
  myLastMatch: MatchView | null;
  myNextFixture: FixtureView | null;
  reached: Record<string, CupReach>;
  championId: string | null;
  tickStartedAt: number;
  tickMs: number;
}

export interface CeremonyView {
  awards: PregaoAward[];
  deadline: number;
  ready: string[];
}

export interface DisputeView {
  id: string;
  seq: number;
  phase: DisputePhase;
  paused: boolean;
  you: string | null;
  participants: ParticipantView[];
  cards: Record<string, CardView>;
  teamNames: Record<string, string>;
  carriedCount: number;
  auction: AuctionView | null;
  ceremony: CeremonyView | null;
  league: LeagueView | null;
  cup: CupView | null;
  tactic: Tactic | null;
  result: DisputeResult | null;
}

export interface RoomView {
  id: string;
  code: string;
  mode: RoomMode;
  status: RoomStatus;
  settings: RoomSettings;
  hostUserId: string;
  cycle: number;
  you: string;
  members: MemberView[];
  dispute: DisputeView | null;
  continuation: ContinuationView | null;
  /** Resumo da última disputa concluída (dado histórico; não é usado pelo próximo leilão). */
  lastResult: (DisputeResult & { disputeId: string; seq: number }) | null;
  history: HistoryEntry[];
  serverTime: number;
}

export interface AchievementUnlock {
  id: string;
  name: string;
  icon: string;
  rarity: string;
}

// ---------------------------------------------------------------------------
// Mensagens WebSocket
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { t: 'hello'; token: string; reqId?: string }
  | { t: 'room:join'; code: string; reqId?: string }
  | { t: 'room:leave'; reqId?: string }
  | { t: 'room:settings'; settings: Partial<RoomSettings>; reqId?: string }
  | { t: 'room:member'; formation?: Formation; teamName?: string; reqId?: string }
  | { t: 'room:start'; reqId?: string }
  | { t: 'bid:set'; stepId: string; bids: Record<string, number>; seal?: boolean; reqId?: string }
  | { t: 'tiebreak:set'; stepId: string; amounts: Record<string, number>; reqId?: string }
  | { t: 'monte:pick'; stepId: string; cardId: string; reqId?: string }
  | { t: 'ceremony:ready'; reqId?: string }
  | { t: 'tactic'; tactic: Tactic; reqId?: string }
  | { t: 'continue:vote'; disputeId: string; choice: ContinueChoice; reqId?: string }
  | { t: 'continue:start-now'; disputeId: string; reqId?: string }
  | { t: 'ping'; reqId?: string };

export type ServerMessage =
  | { t: 'hello:ok'; user: PublicUserView }
  | { t: 'room:state'; room: RoomView }
  | { t: 'room:left'; reason: string }
  | { t: 'ack'; reqId: string }
  | { t: 'error'; code: string; message: string; reqId?: string }
  | { t: 'achievements:unlocked'; items: AchievementUnlock[] }
  | { t: 'pong'; serverTime: number };
