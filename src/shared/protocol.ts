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
import type { CrestConfig } from './crest.js';
import type { AcquisitionSource, AuctionMode, CupFormat, Formation, Position, Series, SeriesScope, Tactic, Tier } from '../engine/types.js';

export type RoomMode = 'online' | 'solo';
export type RoomStatus = 'lobby' | 'in_dispute' | 'post_dispute' | 'closed';
export type SpeedSetting = 'normal' | 'turbo';
export type MemberStatus = 'active' | 'inactive' | 'left';
export type ContinueChoice = 'continue' | 'leave';

export interface RoomSettings {
  /** Tipo de leilão: um jogador por lance (padrão) ou setores de clubes (pacotes + convocação). */
  auctionMode: AuctionMode;
  cupFormat: CupFormat;
  /** Clubes das cartas do leilão: tudo, Séries A e B, só A, só B ou grandes da Europa. */
  series: SeriesScope;
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
  /** Escudo do time do técnico. */
  crest: CrestConfig;
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
  /** Cores do uniforme do clube, quando o baralho as tem (selo genérico e figura da Lenda). */
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
  /** Leilão de clubes: pacotes levados (a revelação ainda pode estar mostrando os últimos). */
  packs?: Array<{ packageId: string; position: Position; price: number; source: AcquisitionSource }>;
  connected: boolean;
  abandoned: boolean;
}

/** Pacote do leilão de clubes: um setor de um clube. Os nomes só aparecem para o dono, na convocação. */
export interface PackageView {
  id: string;
  club: string;
  position: Position;
  size: number;
  label: string;
  mixed?: boolean;
  /** Jogadores do pacote: só nos seus, a partir da convocação. */
  cardIds?: string[];
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

export interface ConvocacaoStepView {
  kind: 'convocacao';
  stepId: string;
  deadline: number;
  eligible: string[];
  sealed: string[];
  /** Quantos a sua formação pede em cada setor. */
  need: Record<Position, number>;
  /** Seus pacotes por setor (os jogadores vêm em `packages[id].cardIds`). */
  myPackages: Partial<Record<Position, string>>;
  myPicks: string[];
  mySealed: boolean;
}

export type StepView = BidStepView | TiebreakStepView | MonteStepView | ConvocacaoStepView;

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
  /** Maiores garçons: quem mais deu assistências. */
  topAssists: Array<{ cardId: string; name: string; teamId: string; assists: number }>;
  /** Gols e assistências dos jogadores dos técnicos da sala: time → carta → [gols, assistências]. */
  playerStats: Record<string, Record<string, [number, number]>>;
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
  topScorers: Array<{ cardId: string; name: string; teamId: string; goals: number }>;
  topAssists: Array<{ cardId: string; name: string; teamId: string; assists: number }>;
  playerStats: Record<string, Record<string, [number, number]>>;
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
  /** Tipo de leilão desta disputa. */
  auctionMode: AuctionMode;
  /** Leilão de clubes: os pacotes do pregão. */
  packages: Record<string, PackageView>;
  auction: AuctionView | null;
  ceremony: CeremonyView | null;
  league: LeagueView | null;
  cup: CupView | null;
  tactic: Tactic | null;
  result: DisputeResult | null;
}

/** Baralho carregado no servidor: nome e quantas cartas há em cada grupo de clubes (vazio = baralho sem grupos). */
export interface DeckInfo {
  name: string;
  total: number;
  groups: Partial<Record<Series, number>>;
  /** Clubes de cada grupo, em ordem alfabética. */
  clubs: Partial<Record<Series, string[]>>;
  /**
   * Escudos dos clubes: nome do clube → URL (arquivo em `data/escudos/` ou endereço de `data/escudos/fontes.json`).
   * Clube ausente = selo genérico do jogo.
   */
  crests: Record<string, string>;
}

export interface RoomView {
  id: string;
  code: string;
  mode: RoomMode;
  status: RoomStatus;
  settings: RoomSettings;
  deck: DeckInfo;
  hostUserId: string;
  cycle: number;
  you: string;
  members: MemberView[];
  dispute: DisputeView | null;
  continuation: ContinuationView | null;
  /** Resumo da última disputa concluída (dado histórico; não é usado pelo próximo leilão). */
  lastResult: (DisputeResult & { disputeId: string; seq: number }) | null;
  history: HistoryEntry[];
  /**
   * Escudos dos times dos técnicos que aparecem nesta sala (membros, disputa, resumo e histórico),
   * por id de usuário. Times da CPU e clubes do jogo não entram: o escudo deles sai do nome.
   */
  crests: Record<string, CrestConfig>;
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
  | { t: 'convoca:set'; stepId: string; cardIds: string[]; seal?: boolean; reqId?: string }
  | { t: 'ceremony:ready'; reqId?: string }
  | { t: 'tactic'; tactic: Tactic; reqId?: string }
  | { t: 'continue:vote'; disputeId: string; choice: ContinueChoice; reqId?: string }
  | { t: 'continue:start-now'; disputeId: string; reqId?: string }
  | { t: 'ping'; reqId?: string };

export type ServerMessage =
  /** `build`: script principal do site que o servidor entrega agora (aba com outro build se recarrega). */
  | { t: 'hello:ok'; user: PublicUserView; build?: string }
  | { t: 'room:state'; room: RoomView }
  | { t: 'room:left'; reason: string }
  | { t: 'ack'; reqId: string }
  | { t: 'error'; code: string; message: string; reqId?: string }
  | { t: 'achievements:unlocked'; items: AchievementUnlock[] }
  | { t: 'pong'; serverTime: number };
