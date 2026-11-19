import { randomBytes, randomUUID } from 'node:crypto';
import { Dispute, type SeatInput } from '../../engine/dispute.js';
import { GameRuleError } from '../../engine/errors.js';
import type { SetPieceTakers } from '../../engine/match.js';
import {
  AUCTION_MODES,
  DEFAULT_AUCTION_CONFIG,
  DEFAULT_DISPUTE_CONFIG,
  MAX_PARTICIPANTS,
  SERIES_SCOPES,
  deckForScope,
  isPackageMode,
  nationalDeck,
  type Card,
  type CpuStyle,
  type DisputeConfig,
  type Formation,
  AUCTION_FORMATIONS,
  FORMATION_LIST,
  type Tactic,
} from '../../engine/types.js';
import type {
  ContinueChoice,
  ContinuationView,
  DeckInfo,
  MemberStatus,
  PublicRoomView,
  RevealView,
  RoomMode,
  RoomSettings,
  RoomStatus,
  RoomView,
  ServerMessage,
} from '../../shared/protocol.js';
import type { ServerConfig } from '../config.js';
import { nowIso, type DB } from '../db.js';
import type { Logger } from '../log.js';
import type { ResultsService } from '../services/results.js';
import { TIMINGS, type Timing } from './timing.js';
import { FAST_MATCH, MATCH_SECONDS, ROOM_PASSWORD_MAX, ROOM_PASSWORD_MIN } from '../../shared/protocol.js';
import { hashPassword, verifyPassword } from '../auth.js';
import { shootoutMs } from '../../shared/shootout.js';
import { buildRoomView } from './views.js';
import { CPU_TEAM_NAMES } from '../../shared/teams.js';
import { userCrests } from '../services/team-crests.js';
import type { CrestConfig } from '../../shared/crest.js';

export interface Conn {
  id: string;
  send(msg: ServerMessage): void;
}

export interface RoomDeps {
  db: DB;
  deck: Card[];
  deckInfo: DeckInfo;
  results: ResultsService;
  config: ServerConfig;
  log: Logger;
  notifyUser(userId: string, msg: ServerMessage): void;
  onClosed(room: RoomActor): void;
}

export interface MemberState {
  userId: string;
  teamName: string;
  formation: Formation;
  seat: number;
  status: MemberStatus;
  joinedAt: string;
}

export interface ContinuationState extends ContinuationView {
  resolved: boolean;
}

export class RoomConflictError extends Error {}

export const DEFAULT_SETTINGS: Record<RoomMode, RoomSettings> = {
  online: {
    auctionMode: 'jogador',
    cupFormat: 'copa8',
    series: 'ALL',
    cpuCount: 0,
    speed: 'normal',
    matchSeconds: 10,
    maxHumans: 20,
    carryOver: true,
    repescagem: true,
    tiebreakRound: true,
    mysteryCards: true,
    continuationTimeoutSec: 60,
    minHumansToContinue: 2,
  },
  solo: {
    auctionMode: 'jogador',
    cupFormat: 'copa8',
    series: 'ALL',
    cpuCount: 3,
    speed: 'normal',
    matchSeconds: 10,
    maxHumans: 1,
    carryOver: true,
    repescagem: true,
    tiebreakRound: true,
    mysteryCards: true,
    continuationTimeoutSec: 120,
    minHumansToContinue: 1,
  },
};

const CPU_NAMES = CPU_TEAM_NAMES;
const CPU_STYLES: CpuStyle[] = ['agressivo', 'equilibrado', 'poupador'];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Normaliza e valida configurações vindas do cliente. */
export function sanitizeSettings(mode: RoomMode, base: RoomSettings, patch: Partial<RoomSettings>): RoomSettings {
  const s = { ...base };
  if (patch.auctionMode !== undefined) {
    if (!AUCTION_MODES.includes(patch.auctionMode)) throw new GameRuleError('config_invalida', 'Tipo de leilão inválido.');
    s.auctionMode = patch.auctionMode;
  }
  if (patch.cupFormat !== undefined) {
    if (!['copa8', 'libertadores', 'mundial', 'nenhuma'].includes(patch.cupFormat)) throw new GameRuleError('config_invalida', 'Formato de copa inválido.');
    s.cupFormat = patch.cupFormat;
  }
  if (patch.skipLeague !== undefined) s.skipLeague = !!patch.skipLeague;
  // “Sem liga” só existe na Libertadores: trocar de formato desliga.
  if (s.cupFormat !== 'libertadores') s.skipLeague = false;
  if (patch.series !== undefined) {
    if (!SERIES_SCOPES.includes(patch.series)) throw new GameRuleError('config_invalida', 'Grupo de clubes inválido.');
    s.series = patch.series;
  }
  if (patch.speed !== undefined) {
    if (!['normal', 'turbo'].includes(patch.speed)) throw new GameRuleError('config_invalida', 'Velocidade inválida.');
    // O ritmo é só o do leilão e da cerimônia; a duração das partidas tem a sua própria escolha ("Partidas").
    s.speed = patch.speed;
  }
  if (patch.matchSeconds !== undefined) {
    if (!MATCH_SECONDS.includes(patch.matchSeconds)) throw new GameRuleError('config_invalida', 'Duração da partida inválida.');
    s.matchSeconds = patch.matchSeconds;
  }
  const int = (v: unknown, min: number, max: number, label: string) => {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) throw new GameRuleError('config_invalida', `${label}: de ${min} a ${max}.`);
    return v as number;
  };
  if (patch.cpuCount !== undefined) s.cpuCount = int(patch.cpuCount, 0, 9, 'CPUs');
  if (patch.maxHumans !== undefined) s.maxHumans = mode === 'solo' ? 1 : int(patch.maxHumans, 2, 20, 'Técnicos');
  if (patch.continuationTimeoutSec !== undefined) s.continuationTimeoutSec = int(patch.continuationTimeoutSec, 15, 600, 'Tempo para continuar');
  if (patch.minHumansToContinue !== undefined) s.minHumansToContinue = int(patch.minHumansToContinue, 1, 20, 'Mínimo para continuar');
  for (const k of ['carryOver', 'repescagem', 'tiebreakRound', 'mysteryCards'] as const) {
    if (patch[k] !== undefined) s[k] = !!patch[k];
  }
  // Sala oculta só faz sentido na sala com amigos (a de um jogador nunca aparece na lista).
  if (patch.hidden !== undefined) s.hidden = mode === 'online' && !!patch.hidden;
  // O limite total (humanos + CPUs ≤ 20) é aplicado ao iniciar cada disputa.
  return s;
}

const PASSWORD_MAX_TRIES = 8;
const PASSWORD_WINDOW_MS = 10 * 60_000;

/** Senha de sala vinda do cliente: `null` (ou vazia) = sem senha; fora do tamanho, erro. */
export function cleanRoomPassword(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new GameRuleError('senha_invalida', 'Senha inválida.');
  const password = raw.trim();
  if (password.length === 0) return null;
  if (password.length < ROOM_PASSWORD_MIN || password.length > ROOM_PASSWORD_MAX) {
    throw new GameRuleError('senha_invalida', `A senha da sala tem de ${ROOM_PASSWORD_MIN} a ${ROOM_PASSWORD_MAX} caracteres.`);
  }
  return password;
}

export class RoomActor {
  id: string;
  code: string;
  mode: RoomMode;
  hostUserId: string;
  status: RoomStatus;
  settings: RoomSettings;
  cycle: number;
  members = new Map<string, MemberState>();
  private conns = new Map<string, Set<Conn>>();
  /** Sala fechada: hash da senha (nunca a senha). `null` = sala aberta. */
  private passwordHash: string | null = null;
  /** Senhas erradas por usuário, para frear quem tenta adivinhar. */
  private wrongPasswords = new Map<string, { count: number; since: number }>();

  dispute: Dispute | null = null;
  disputeId: string | null = null;
  disputeSeq = 0;
  abandoned = new Set<string>();
  continuation: ContinuationState | null = null;
  lastResult: RoomView['lastResult'] = null;

  // Ritmo
  private timer: NodeJS.Timeout | null = null;
  private timerGen = 0;
  stepDeadline: number | null = null;
  private trackedStepId: string | null = null;
  reveal: RevealView | null = null;
  ceremony: { deadline: number; ready: Set<string> } | null = null;
  tickStartedAt = 0;
  nextTickAt = 0;
  /** Partidas jogadas na última rodada/jornada (para a transmissão “ao vivo”). */
  lastTickMatchIds: string[] = [];
  /** Intervalo entre a liga e a copa: a sala mostra o campeão da liga e conta o tempo até o 1º jogo da copa. */
  cupIntro = false;
  /** Cobranças da disputa de pênaltis mais longa da última rodada da copa (0 = nenhuma). */
  lastShootoutKicks = 0;
  paused = false;
  private pausedAt = 0;
  private abandonTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private finalizing = false;
  closed = false;

  constructor(
    private deps: RoomDeps,
    init: { id: string; code: string; mode: RoomMode; hostUserId: string; status: RoomStatus; settings: RoomSettings; cycle: number; passwordHash?: string | null },
  ) {
    this.id = init.id;
    this.code = init.code;
    this.mode = init.mode;
    this.hostUserId = init.hostUserId;
    this.status = init.status;
    this.settings = init.settings;
    this.cycle = init.cycle;
    this.passwordHash = init.passwordHash ?? null;
  }

  /** Sala fechada (com senha). */
  get locked(): boolean {
    return !!this.passwordHash;
  }

  get timing(): Timing {
    const forced = this.deps.config.forceSpeed;
    const base = TIMINGS[forced ?? this.settings.speed];
    // Testes automatizados usam o ritmo deles; nas salas, a partida dura o que o anfitrião escolheu.
    if (forced) return base;
    // Sala antiga sem a escolha gravada: jogo rápido, o padrão.
    const seconds = this.settings.matchSeconds ?? 10;
    if (seconds === 10) return { ...base, leagueRoundMs: this.fastLeagueRoundMs(), cupMatchdayMs: this.fastCupMatchdayMs() };
    const matchMs = seconds * 1000;
    return base.leagueRoundMs === matchMs && base.cupMatchdayMs === matchMs ? base : { ...base, leagueRoundMs: matchMs, cupMatchdayMs: matchMs };
  }

  /** Jogo rápido, liga: a rodada que está na tela (a última jogada) dura mais se for uma das 5 últimas. */
  private fastLeagueRoundMs(): number {
    const league = this.dispute?.league;
    if (!league) return FAST_MATCH.baseMs;
    return league.state.currentRound > league.totalRounds - FAST_MATCH.lastLeagueRounds ? FAST_MATCH.decisiveMs : FAST_MATCH.baseMs;
  }

  /** Jogo rápido, copa: fase de grupos no tempo curto, mata-mata no tempo dos jogos decisivos. */
  private fastCupMatchdayMs(): number {
    const cup = this.dispute?.cup;
    if (!cup) return FAST_MATCH.baseMs;
    // Vale a rodada que está na tela; a fase atual da copa já pode ser a seguinte.
    const onScreen = this.lastTickMatchIds.filter((id) => id.startsWith('C-') || id.startsWith('T-'));
    const groups = onScreen.length ? onScreen.some((id) => id.startsWith('C-G')) : cup.currentStage === 'grupos';
    return groups ? FAST_MATCH.baseMs : FAST_MATCH.decisiveMs;
  }

  get log() {
    return this.deps.log;
  }

  // ---------------------------------------------------------------------------
  // Criação, restauração e persistência
  // ---------------------------------------------------------------------------

  static create(
    deps: RoomDeps,
    params: { mode: RoomMode; host: { id: string; displayName: string }; settings?: Partial<RoomSettings>; password?: unknown },
  ): RoomActor {
    const settings = sanitizeSettings(params.mode, DEFAULT_SETTINGS[params.mode], params.settings ?? {});
    const password = params.mode === 'online' ? cleanRoomPassword(params.password) : null;
    const passwordHash = password ? hashPassword(password) : null;
    const now = nowIso();
    let code = makeRoomCode();
    for (let i = 0; i < 10 && deps.db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code); i++) code = makeRoomCode();
    const actor = new RoomActor(deps, {
      id: randomUUID(),
      code,
      mode: params.mode,
      hostUserId: params.host.id,
      status: 'lobby',
      settings,
      cycle: 0,
      passwordHash,
    });
    deps.db
      .prepare(
        `INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at, password_hash)
         VALUES (?, ?, ?, ?, 'lobby', ?, 0, ?, ?, ?)`,
      )
      .run(actor.id, actor.code, actor.mode, actor.hostUserId, JSON.stringify(settings), now, now, passwordHash);
    actor.addMember(params.host.id, params.host.displayName);
    return actor;
  }

  static restore(deps: RoomDeps, row: Record<string, unknown>): RoomActor {
    const actor = new RoomActor(deps, {
      id: row.id as string,
      code: row.code as string,
      mode: row.mode as RoomMode,
      hostUserId: row.host_user_id as string,
      status: row.status as RoomStatus,
      settings: { ...DEFAULT_SETTINGS[row.mode as RoomMode], ...JSON.parse(row.settings_json as string) },
      cycle: row.cycle as number,
      passwordHash: (row.password_hash as string | null) ?? null,
    });
    const members = deps.db.prepare('SELECT * FROM room_members WHERE room_id = ? ORDER BY seat').all(actor.id) as Array<Record<string, unknown>>;
    for (const m of members) {
      actor.members.set(m.user_id as string, {
        userId: m.user_id as string,
        teamName: m.team_name as string,
        formation: m.formation as Formation,
        seat: m.seat as number,
        status: m.status as MemberStatus,
        joinedAt: m.joined_at as string,
      });
    }
    actor.loadLastResult();
    if (actor.status === 'in_dispute' && row.current_dispute_id) {
      const d = deps.db.prepare('SELECT * FROM disputes WHERE id = ?').get(row.current_dispute_id) as Record<string, unknown> | undefined;
      if (d && d.status === 'active' && d.state_json) {
        const snap = JSON.parse(d.state_json as string);
        actor.dispute = Dispute.fromJSON(snap.dispute);
        actor.disputeId = d.id as string;
        actor.disputeSeq = d.seq as number;
        actor.abandoned = new Set(snap.abandoned ?? []);
        // Ninguém está conectado logo após reiniciar: a disputa começa pausada.
        actor.paused = true;
        actor.pausedAt = Date.now();
        actor.nextTickAt = Date.now() + actor.timing.leagueRoundMs;
        actor.scheduleAbandonCheck();
      } else {
        actor.status = actor.activeMembers().length ? 'lobby' : 'closed';
        actor.persistRoom();
      }
    }
    if (actor.status === 'post_dispute' && row.continuation_json) {
      actor.continuation = JSON.parse(row.continuation_json as string);
      actor.drive();
    }
    return actor;
  }

  private loadLastResult() {
    const d = this.deps.db
      .prepare(`SELECT id, seq, result_json FROM disputes WHERE room_id = ? AND status = 'finished' ORDER BY seq DESC LIMIT 1`)
      .get(this.id) as { id: string; seq: number; result_json: string } | undefined;
    this.lastResult = d ? { ...JSON.parse(d.result_json), disputeId: d.id, seq: d.seq } : null;
  }

  private persistRoom() {
    this.deps.db
      .prepare(
        `UPDATE rooms SET status = ?, host_user_id = ?, settings_json = ?, continuation_json = ?, cycle = ?,
           current_dispute_id = ?, version = version + 1, updated_at = ?, closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END
         WHERE id = ?`,
      )
      .run(
        this.status,
        this.hostUserId,
        JSON.stringify(this.settings),
        this.continuation ? JSON.stringify(this.continuation) : null,
        this.cycle,
        this.disputeId,
        nowIso(),
        this.status,
        nowIso(),
        this.id,
      );
  }

  private persistMember(m: MemberState) {
    this.deps.db
      .prepare(
        `INSERT INTO room_members (room_id, user_id, team_name, formation, seat, status, joined_at, left_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (room_id, user_id) DO UPDATE SET team_name = excluded.team_name, formation = excluded.formation,
           status = excluded.status, left_at = excluded.left_at`,
      )
      .run(this.id, m.userId, m.teamName, m.formation, m.seat, m.status, m.joinedAt, m.status === 'left' ? nowIso() : null);
  }

  /** Grava o snapshot operacional da disputa (no máximo ~1×/s, ou imediatamente). */
  private persistDispute(immediate = false) {
    if (!this.dispute || !this.disputeId || this.dispute.phase === 'finished') return;
    const write = () => {
      this.persistTimer = null;
      if (!this.dispute || !this.disputeId || this.dispute.phase === 'finished') return;
      const snap = { dispute: this.dispute.toJSON(), abandoned: [...this.abandoned] };
      this.deps.db
        .prepare(`UPDATE disputes SET state_json = ?, phase = ? WHERE id = ? AND status = 'active'`)
        .run(JSON.stringify(snap), this.dispute.phase, this.disputeId);
    };
    if (immediate) {
      if (this.persistTimer) clearTimeout(this.persistTimer);
      write();
      return;
    }
    if (!this.persistTimer) this.persistTimer = setTimeout(write, 1000);
  }

  // ---------------------------------------------------------------------------
  // Membros e conexões
  // ---------------------------------------------------------------------------

  activeMembers(): MemberState[] {
    return [...this.members.values()].filter((m) => m.status === 'active').sort((a, b) => a.seat - b.seat);
  }

  isConnected(userId: string | null): boolean {
    return !!userId && (this.conns.get(userId)?.size ?? 0) > 0;
  }

  isParticipant(userId: string): boolean {
    return !!this.dispute?.participants.some((p) => p.userId === userId);
  }

  private addMember(userId: string, displayName: string): MemberState {
    const seat = Math.max(0, ...[...this.members.values()].map((m) => m.seat)) + 1;
    const m: MemberState = { userId, teamName: displayName, formation: '4-3-3', seat, status: 'active', joinedAt: nowIso() };
    this.members.set(userId, m);
    this.persistMember(m);
    return m;
  }

  join(user: { id: string; displayName: string }, password?: unknown): void {
    if (this.status === 'closed') throw new GameRuleError('sala_fechada', 'Esta sala foi encerrada.');
    const existing = this.members.get(user.id);
    if (existing && existing.status === 'active') return; // idempotente
    const humansActive = this.activeMembers().length;
    if (this.mode === 'solo' && user.id !== this.hostUserId) throw new GameRuleError('sala_solo', 'Esta é uma sala single player, de um jogador só.');
    // Sala fechada: quem já foi da sala (ou é o anfitrião) volta sem senha; os outros precisam dela.
    if (this.passwordHash && !existing && user.id !== this.hostUserId) this.checkPassword(user.id, password);
    if (humansActive >= this.settings.maxHumans) throw new GameRuleError('sala_lotada', 'A sala está lotada.');
    if (humansActive + this.settings.cpuCount >= MAX_PARTICIPANTS && this.status === 'lobby') {
      throw new GameRuleError('sala_lotada', `A sala já tem ${MAX_PARTICIPANTS} técnicos contando as CPUs.`);
    }
    if (existing) {
      existing.status = 'active';
      this.persistMember(existing);
    } else {
      this.addMember(user.id, user.displayName);
    }
    // Quem volta para uma disputa em andamento retoma o controle do próprio time.
    const pid = `u:${user.id}`;
    if (this.abandoned.has(pid)) this.abandoned.delete(pid);
    if (this.status === 'post_dispute' && this.continuation && !this.continuation.eligible.includes(user.id)) {
      this.continuation.eligible.push(user.id);
      this.persistRoom();
    }
    this.broadcast();
  }

  connect(userId: string, conn: Conn) {
    let set = this.conns.get(userId);
    if (!set) {
      set = new Set();
      this.conns.set(userId, set);
    }
    set.add(conn);
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.updatePause();
    this.broadcast();
  }

  disconnect(userId: string, conn: Conn) {
    const set = this.conns.get(userId);
    set?.delete(conn);
    if (set && set.size === 0) this.conns.delete(userId);
    this.updatePause();
    if (this.conns.size === 0 && this.status === 'lobby' && !this.idleTimer) {
      this.idleTimer = setTimeout(() => this.close('Sala fechada por inatividade.'), this.deps.config.idleRoomCloseMin * 60_000);
    }
    this.broadcast();
  }

  leave(userId: string): void {
    const m = this.members.get(userId);
    if (!m || m.status === 'left') return;
    if (this.status === 'post_dispute' && this.continuation && !this.continuation.resolved) {
      this.vote(userId, this.continuation.disputeId, 'leave');
      return;
    }
    m.status = 'left';
    this.persistMember(m);
    for (const c of this.conns.get(userId) ?? []) c.send({ t: 'room:left', reason: 'Você saiu da sala.' });
    this.conns.delete(userId);
    if (this.status === 'in_dispute' && this.dispute) {
      const pid = `u:${userId}`;
      if (this.dispute.participants.some((p) => p.id === pid)) this.abandoned.add(pid);
      const stillPlaying = this.dispute.participants.some((p) => !p.isCpu && !this.abandoned.has(p.id));
      if (!stillPlaying) {
        this.abortDispute('Todos os técnicos saíram da disputa.');
        return;
      }
      this.persistDispute(true);
    }
    this.ensureHost();
    if (this.activeMembers().length === 0 && this.status !== 'in_dispute') {
      this.close('Todos saíram da sala.');
      return;
    }
    this.updatePause();
    this.broadcast();
  }

  private ensureHost() {
    const host = this.members.get(this.hostUserId);
    if (host && host.status === 'active') return;
    const next = this.activeMembers()[0];
    if (next) {
      this.hostUserId = next.userId;
      this.persistRoom();
    }
  }

  updateMember(userId: string, patch: { formation?: Formation; teamName?: string }) {
    const m = this.members.get(userId);
    if (!m || m.status !== 'active') throw new GameRuleError('nao_membro', 'Você não está nesta sala.');
    if (patch.formation !== undefined) {
      if (!AUCTION_FORMATIONS.includes(patch.formation)) throw new GameRuleError('formacao_invalida', 'Formação inválida.');
      m.formation = patch.formation;
    }
    if (patch.teamName !== undefined) {
      const name = String(patch.teamName).replace(/[\u0000-\u001f<>]/g, '').trim();
      if (name.length < 2 || name.length > 28) throw new GameRuleError('nome_invalido', 'O nome do time deve ter entre 2 e 28 caracteres.');
      m.teamName = name;
    }
    this.persistMember(m);
    this.broadcast();
  }

  updateSettings(userId: string, patch: Partial<RoomSettings>) {
    this.requireHost(userId);
    // Ocultar ou mostrar a sala na lista vale a qualquer hora; as regras do jogo, só entre disputas.
    const onlyVisibility = Object.keys(patch).every((k) => k === 'hidden');
    if (!onlyVisibility && this.status !== 'lobby' && this.status !== 'post_dispute') {
      throw new GameRuleError('fora_de_hora', 'As regras só mudam entre disputas.');
    }
    this.settings = sanitizeSettings(this.mode, this.settings, patch);
    this.persistRoom();
    this.broadcast();
  }

  get deckInfo(): DeckInfo {
    return this.deps.deckInfo;
  }

  /** Confere a senha de quem quer entrar; depois de muitas erradas, faz esperar. */
  private checkPassword(userId: string, password: unknown) {
    const now = Date.now();
    const tries = this.wrongPasswords.get(userId);
    if (tries && now - tries.since > PASSWORD_WINDOW_MS) this.wrongPasswords.delete(userId);
    if ((this.wrongPasswords.get(userId)?.count ?? 0) >= PASSWORD_MAX_TRIES) {
      throw new GameRuleError('senha_bloqueada', 'Muitas senhas erradas. Espere alguns minutos e tente de novo.');
    }
    if (typeof password !== 'string' || password.length === 0) throw new GameRuleError('senha_necessaria', 'Esta sala é fechada: peça a senha a quem criou.');
    if (!verifyPassword(password.trim().slice(0, ROOM_PASSWORD_MAX), this.passwordHash!)) {
      const cur = this.wrongPasswords.get(userId) ?? { count: 0, since: now };
      this.wrongPasswords.set(userId, { count: cur.count + 1, since: cur.since });
      throw new GameRuleError('senha_incorreta', 'Senha incorreta.');
    }
    this.wrongPasswords.delete(userId);
  }

  /** Como a sala aparece na lista de salas em andamento. */
  publicView(): PublicRoomView {
    const host = this.members.get(this.hostUserId);
    return {
      code: this.code,
      hostUserId: this.hostUserId,
      hostName: host?.teamName ?? 'Sala',
      hostCrest: this.crestsFor([this.hostUserId])[this.hostUserId] ?? null,
      status: this.status,
      phase: this.status === 'in_dispute' ? (this.dispute?.phase ?? null) : null,
      cycle: this.cycle,
      humans: this.activeMembers().length,
      maxHumans: Math.min(this.settings.maxHumans, MAX_PARTICIPANTS - this.settings.cpuCount),
      cpuCount: this.settings.cpuCount,
      locked: this.locked,
      auctionMode: this.settings.auctionMode,
      cupFormat: this.settings.cupFormat,
      skipLeague: this.settings.cupFormat === 'libertadores' && !!this.settings.skipLeague,
    };
  }

  /** O anfitrião põe, troca ou tira a senha (sem senha, a sala é aberta). Quem já está na sala continua. */
  setPassword(userId: string, raw: unknown) {
    this.requireHost(userId);
    if (this.mode !== 'online') throw new GameRuleError('config_invalida', 'Só a sala com amigos tem senha.');
    const password = cleanRoomPassword(raw);
    this.passwordHash = password ? hashPassword(password) : null;
    this.wrongPasswords.clear();
    this.deps.db.prepare('UPDATE rooms SET password_hash = ?, updated_at = ? WHERE id = ?').run(this.passwordHash, nowIso(), this.id);
    this.broadcast();
  }

  private requireHost(userId: string) {
    if (userId !== this.hostUserId) throw new GameRuleError('so_anfitriao', 'Só o anfitrião da sala pode fazer isso.');
  }

  // ---------------------------------------------------------------------------
  // Ciclo de disputas
  // ---------------------------------------------------------------------------

  start(userId: string) {
    this.requireHost(userId);
    if (this.status !== 'lobby') throw new GameRuleError('fora_de_hora', 'A disputa já começou.');
    const humans = this.activeMembers().map((m) => m.userId);
    if (this.settings.auctionMode === 'selecoes' && nationalDeck(this.deps.deck).length === 0) {
      throw new GameRuleError('config_invalida', 'Este baralho não tem cartas de seleção. Escolha outro tipo de leilão.');
    }
    if (humans.length + this.settings.cpuCount < 2) {
      throw new GameRuleError('poucos_tecnicos', 'Chame mais alguém ou adicione CPUs: são pelo menos 2 técnicos.');
    }
    this.startDispute(humans);
  }

  private get clubsMode(): boolean {
    return isPackageMode(this.settings.auctionMode);
  }

  private disputeConfig(): DisputeConfig {
    const clubs = this.clubsMode;
    return {
      ...DEFAULT_DISPUTE_CONFIG,
      cupFormat: this.settings.cupFormat,
      skipLeague: this.settings.cupFormat === 'libertadores' && !!this.settings.skipLeague,
      // Leilão de clubes: os pacotes são sorteados de novo a cada ciclo.
      carryOverPreviousCycle: this.settings.carryOver && !clubs,
      auction: {
        ...DEFAULT_AUCTION_CONFIG,
        mode: this.settings.auctionMode,
        repescagem: this.settings.repescagem,
        tiebreakRound: this.settings.tiebreakRound,
        mysteryChance: this.settings.mysteryCards && !clubs ? DEFAULT_AUCTION_CONFIG.mysteryChance : 0,
      },
    };
  }

  /**
   * Cria a próxima disputa da sala. Protegido contra início duplicado:
   * o UPDATE só passa se o ciclo ainda for o esperado (compare-and-set) e
   * a tabela de disputas tem UNIQUE (room_id, seq).
   */
  private startDispute(humanIds: string[]) {
    const expectedCycle = this.cycle;
    const seq = expectedCycle + 1;
    const prev = this.deps.db
      .prepare(`SELECT id FROM disputes WHERE room_id = ? AND status = 'finished' ORDER BY seq DESC LIMIT 1`)
      .get(this.id) as { id: string } | undefined;
    // As herdadas voltam como estão hoje no baralho (o dono pode ter ajustado o nível ou a Lenda).
    const current = new Map(this.deps.deck.map((c) => [c.id, c]));
    const carried: Card[] = (this.settings.carryOver && !this.clubsMode && prev ? this.deps.results.acquiredCards(prev.id) : []).map(
      (c) => current.get(c.id) ?? c,
    );
    const humans = humanIds
      .map((id) => this.members.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.seat - b.seat);
    const cpuCount = Math.min(this.settings.cpuCount, MAX_PARTICIPANTS - humans.length);
    const seats: SeatInput[] = [
      ...humans.map((m) => ({ id: `u:${m.userId}`, userId: m.userId, name: m.teamName, isCpu: false, formation: m.formation })),
      ...Array.from({ length: cpuCount }, (_, i) => ({
        id: `cpu:${i + 1}`,
        userId: null,
        name: CPU_NAMES[i % CPU_NAMES.length]!,
        isCpu: true,
        formation: (i % 2 ? '4-4-2' : '4-3-3') as Formation,
        cpuStyle: CPU_STYLES[i % CPU_STYLES.length]!,
      })),
    ];
    const id = randomUUID();
    const seed = randomBytes(8).toString('hex');
    const config = this.disputeConfig();
    // Só as cartas dos clubes escolhidos para a sala (as herdadas do ciclo anterior voltam todas).
    // O leilão de clubes usa o baralho inteiro: é o que dá clube suficiente para cada setor.
    // O de seleções usa só as cartas de seleção (os melhores de cada país).
    const deck =
      this.settings.auctionMode === 'selecoes'
        ? nationalDeck(this.deps.deck)
        : deckForScope(this.deps.deck, this.clubsMode ? 'ALL' : (this.settings.series ?? 'ALL'));
    const dispute = Dispute.create({ id, seed, config, seats, deck, carried });
    const now = nowIso();
    const tx = this.deps.db.transaction(() => {
      const upd = this.deps.db
        .prepare(
          `UPDATE rooms SET status = 'in_dispute', cycle = ?, current_dispute_id = ?, continuation_json = NULL, version = version + 1, updated_at = ?
            WHERE id = ? AND cycle = ? AND status IN ('lobby', 'post_dispute')`,
        )
        .run(seq, id, now, this.id, expectedCycle);
      if (upd.changes !== 1) throw new RoomConflictError('Ciclo já iniciado por outra solicitação');
      this.deps.db
        .prepare(
          `INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, state_json, previous_dispute_id, carried_card_count, started_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, this.id, seq, dispute.phase, seed, JSON.stringify(config), JSON.stringify({ dispute: dispute.toJSON(), abandoned: [] }), prev?.id ?? null, carried.length, now);
    });
    tx();
    this.status = 'in_dispute';
    this.cycle = seq;
    this.dispute = dispute;
    this.disputeId = id;
    this.disputeSeq = seq;
    this.abandoned = new Set();
    this.continuation = null;
    this.reveal = null;
    this.ceremony = null;
    this.trackedStepId = null;
    this.stepDeadline = null;
    this.paused = false;
    this.log.info('disputa iniciada', { room: this.code, dispute: id, seq, humans: humans.length, cpus: cpuCount, carried: carried.length });
    this.updatePause();
    this.drive();
    this.broadcast();
  }

  private abortDispute(reason: string) {
    if (this.disputeId) {
      this.deps.db.prepare(`UPDATE disputes SET status = 'aborted', state_json = NULL, finished_at = ? WHERE id = ? AND status = 'active'`).run(nowIso(), this.disputeId);
    }
    this.log.info('disputa encerrada sem resultado', { room: this.code, dispute: this.disputeId, reason });
    this.clearTimer();
    this.dispute = null;
    this.disputeId = null;
    this.reveal = null;
    this.ceremony = null;
    this.paused = false;
    if (this.abandonTimer) clearTimeout(this.abandonTimer);
    this.ensureHost();
    if (this.activeMembers().length === 0) {
      this.close(reason);
      return;
    }
    this.status = 'lobby';
    this.persistRoom();
    this.broadcast();
  }

  close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    for (const t of [this.abandonTimer, this.idleTimer, this.persistTimer]) if (t) clearTimeout(t);
    if (this.dispute && this.disputeId && this.dispute.phase !== 'finished') {
      this.deps.db.prepare(`UPDATE disputes SET status = 'aborted', state_json = NULL, finished_at = ? WHERE id = ? AND status = 'active'`).run(nowIso(), this.disputeId);
    }
    this.status = 'closed';
    this.continuation = null;
    this.persistRoom();
    for (const set of this.conns.values()) for (const c of set) c.send({ t: 'room:left', reason });
    this.conns.clear();
    this.deps.onClosed(this);
  }

  // ---------------------------------------------------------------------------
  // Ações durante a disputa
  // ---------------------------------------------------------------------------

  private requireParticipant(userId: string): string {
    if (this.status !== 'in_dispute' || !this.dispute) throw new GameRuleError('fora_de_hora', 'Não há disputa em andamento.');
    const pid = `u:${userId}`;
    if (!this.dispute.participants.some((p) => p.id === pid)) throw new GameRuleError('nao_participante', 'Você está assistindo esta disputa.');
    if (this.abandoned.has(pid)) throw new GameRuleError('abandonou', 'Você saiu desta disputa.');
    return pid;
  }

  private requireStep(stepId: string) {
    const step = this.dispute?.auction.step;
    if (!step || step.stepId !== stepId) throw new GameRuleError('passo_encerrado', 'Esse envelope já foi fechado.');
    if (this.reveal) throw new GameRuleError('revelando', 'Aguarde a revelação terminar.');
  }

  bid(userId: string, stepId: string, bids: Record<string, number>, seal: boolean) {
    const pid = this.requireParticipant(userId);
    this.requireStep(stepId);
    if (!bids || typeof bids !== 'object') throw new GameRuleError('lance_invalido', 'Envelope inválido.');
    this.dispute!.auction.submitBids(pid, bids, seal);
    this.afterAction();
  }

  tiebreak(userId: string, stepId: string, amounts: Record<string, number>) {
    const pid = this.requireParticipant(userId);
    this.requireStep(stepId);
    this.dispute!.auction.submitTiebreak(pid, amounts ?? {}, true);
    this.afterAction();
  }

  montePick(userId: string, stepId: string, cardId: string) {
    const pid = this.requireParticipant(userId);
    this.requireStep(stepId);
    this.dispute!.auction.pickMonte(pid, cardId);
    this.dispute!.afterAuctionStep();
    this.afterAction(true);
  }

  convoca(userId: string, stepId: string, cardIds: string[], seal: boolean) {
    const pid = this.requireParticipant(userId);
    this.requireStep(stepId);
    if (!Array.isArray(cardIds) || cardIds.length > 30) throw new GameRuleError('convocacao_invalida', 'Convocação inválida.');
    this.dispute!.auction.submitConvocacao(pid, cardIds.map(String), seal);
    this.afterAction();
  }

  /**
   * Leilão de clubes: o técnico troca a formação na hora de convocar. Vale para esta disputa; a
   * formação com que ele entra no próximo pregão só muda se a escolhida for uma das do leilão.
   */
  convocaFormation(userId: string, stepId: string, formation: Formation) {
    const pid = this.requireParticipant(userId);
    this.requireStep(stepId);
    if (!FORMATION_LIST.includes(formation)) throw new GameRuleError('formacao_invalida', 'Formação inválida.');
    const d = this.dispute!;
    d.auction.setConvocaFormation(pid, formation);
    const seat = d.state.seats.find((s) => s.id === pid);
    if (seat) seat.formation = formation;
    const m = this.members.get(userId);
    if (m && AUCTION_FORMATIONS.includes(formation)) {
      m.formation = formation;
      this.persistMember(m);
    }
    this.afterAction();
  }

  ceremonyReady(userId: string) {
    this.requireParticipant(userId);
    if (this.dispute!.phase !== 'ceremony' || !this.ceremony) throw new GameRuleError('fora_de_hora', 'A cerimônia não está aberta.');
    this.ceremony.ready.add(userId);
    const humans = this.dispute!.participants.filter((p) => !p.isCpu && !this.abandoned.has(p.id) && this.isConnected(p.userId));
    if (humans.every((p) => this.ceremony!.ready.has(p.userId!))) this.ceremony.deadline = Date.now();
    this.afterAction();
  }

  /** O anfitrião encerra a festa do campeão da liga e começa a copa já (depois que a última rodada passou na tela). */
  startCupNow(userId: string) {
    this.requireHost(userId);
    const d = this.dispute;
    if (!d || d.phase !== 'cup' || !this.cupIntro) throw new GameRuleError('fora_de_hora', 'A copa já começou (ou ainda não é hora).');
    const now = Date.now();
    const lastRoundOver = this.tickStartedAt + Math.round(this.timing.leagueRoundMs * 0.85);
    this.nextTickAt = Math.max(now, lastRoundOver);
    this.drive();
    this.broadcast();
  }

  setSetPieces(userId: string, takers: SetPieceTakers) {
    const pid = this.requireParticipant(userId);
    if (!takers || typeof takers !== 'object') throw new GameRuleError('batedor_invalido', 'Batedores inválidos.');
    this.dispute!.setSetPieces(pid, takers);
    this.persistDispute();
    this.sendState(userId);
  }

  setTactic(userId: string, tactic: Tactic) {
    const pid = this.requireParticipant(userId);
    this.dispute!.setTactic(pid, tactic);
    this.persistDispute();
    this.sendState(userId);
  }

  private afterAction(immediatePersist = false) {
    this.persistDispute(immediatePersist);
    this.drive();
    this.broadcast();
  }

  // ---------------------------------------------------------------------------
  // Motor de ritmo (timers)
  // ---------------------------------------------------------------------------

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.timerGen++;
  }

  private schedule(ms: number, fn: () => void) {
    this.clearTimer();
    const gen = this.timerGen;
    this.timer = setTimeout(() => {
      if (gen !== this.timerGen || this.closed) return;
      this.timer = null;
      try {
        fn();
      } catch (err) {
        this.log.error('erro no ritmo da sala', { room: this.code, err: String((err as Error)?.stack ?? err) });
      }
    }, Math.max(0, ms));
  }

  private revealEndsAt(): number {
    if (!this.reveal) return 0;
    return this.reveal.startedAt + this.reveal.items.length * this.reveal.itemMs + this.timing.revealTailMs;
  }

  /** Decide o próximo evento temporizado a partir do estado atual. */
  drive() {
    if (this.closed) return;
    const now = Date.now();
    if (this.status === 'post_dispute' && this.continuation && !this.continuation.resolved) {
      this.schedule(this.continuation.deadline - now, () => this.resolveContinuation('prazo'));
      return;
    }
    if (this.status !== 'in_dispute' || !this.dispute) {
      this.clearTimer();
      return;
    }
    if (this.paused) {
      this.clearTimer();
      return;
    }
    const d = this.dispute;
    const t = this.timing;
    if (this.reveal && (d.phase === 'auction' || d.phase === 'ceremony')) {
      const end = this.revealEndsAt();
      if (end > now) {
        this.schedule(end - now, () => {
          this.reveal = null;
          this.drive();
          this.broadcast();
        });
        return;
      }
      this.reveal = null;
    }
    switch (d.phase) {
      case 'auction': {
        const step = d.auction.step;
        if (!step) {
          d.afterAuctionStep();
          this.drive();
          return;
        }
        const pending = this.pendingHumans(step);
        if (step.stepId !== this.trackedStepId) {
          this.trackedStepId = step.stepId;
          const ms = step.kind === 'bid' ? t.bidMs : step.kind === 'tiebreak' ? t.tiebreakMs : step.kind === 'convocacao' ? t.convocacaoMs : t.monteMs;
          this.stepDeadline = now + (pending.length ? ms : t.cpuStepMs);
        }
        const ready = pending.length === 0;
        const at = ready ? Math.min(this.stepDeadline ?? now, now + t.cpuStepMs) : (this.stepDeadline ?? now);
        this.schedule(at - now, () => this.resolveAuctionStep());
        return;
      }
      case 'ceremony': {
        if (!this.ceremony) this.ceremony = { deadline: now + t.ceremonyMs, ready: new Set() };
        this.schedule(this.ceremony.deadline - now, () => this.startLeague());
        return;
      }
      case 'league':
      case 'cup': {
        this.schedule(this.nextTickAt - now, () => this.playTick());
        return;
      }
      case 'finished':
        this.finalize();
        return;
    }
  }

  /**
   * Técnicos humanos (que não abandonaram) dos quais o passo ainda depende.
   * Lista vazia → o passo pode fechar já (CPUs decidem na hora; quem saiu da
   * sala não segura o jogo: no Monte, a escolha dele é automática).
   */
  private pendingHumans(step: NonNullable<Dispute['auction']['step']>): string[] {
    const d = this.dispute!;
    if (step.kind === 'monte') {
      const p = d.participant(step.current);
      return p.isCpu || this.abandoned.has(p.id) ? [] : [p.id];
    }
    return step.eligible.filter((pid) => !d.participant(pid).isCpu && !step.sealed.includes(pid) && !this.abandoned.has(pid));
  }

  private resolveAuctionStep() {
    const d = this.dispute;
    if (!d || d.phase !== 'auction') return;
    const step = d.auction.step;
    const out = d.auction.resolveStep();
    d.afterAuctionStep();
    if (out.reveals.length > 0 && step) {
      this.reveal = { stepId: step.stepId, startedAt: Date.now(), itemMs: this.timing.revealItemMs, items: out.reveals };
    }
    this.persistDispute(true);
    this.drive();
    this.broadcast();
  }

  /** Quanto a rodada atual da copa se alonga para a disputa de pênaltis passar na tela. */
  shootoutExtraMs(): number {
    return this.dispute?.cup && this.dispute.phase !== 'league' ? shootoutMs(this.lastShootoutKicks, this.timing.cupMatchdayMs) : 0;
  }

  private startLeague() {
    const d = this.dispute;
    if (!d || d.phase !== 'ceremony') return;
    d.startLeague();
    this.ceremony = null;
    const now = Date.now();
    this.tickStartedAt = now;
    this.lastTickMatchIds = [];
    this.lastShootoutKicks = 0;
    this.cupIntro = false;
    // A 1ª rodada começa logo (as seguintes esperam o jogo anterior acabar na tela).
    this.nextTickAt = now + Math.min(this.timing.leagueRoundMs, 3_000);
    this.persistDispute(true);
    this.drive();
    this.broadcast();
  }

  private playTick() {
    const d = this.dispute;
    if (!d) return;
    const now = Date.now();
    if (d.phase === 'league') {
      this.lastTickMatchIds = d.playLeagueRound().map((m) => m.id);
      this.tickStartedAt = now;
      // Acabou a liga e vem a copa: a última rodada passa na tela e depois fica a festa do campeão.
      this.cupIntro = (d.phase as string) === 'cup';
      this.nextTickAt = now + (this.cupIntro ? this.timing.leagueRoundMs + this.timing.cupIntroMs : this.timing.leagueRoundMs);
    } else if (d.phase === 'cup') {
      this.cupIntro = false;
      const played = d.playCupMatchday();
      this.lastTickMatchIds = played.map((m) => m.id);
      this.tickStartedAt = now;
      // Jogo decidido nos pênaltis: a rodada espera a disputa passar na tela, cobrança por cobrança.
      this.lastShootoutKicks = Math.max(0, ...played.map((m) => m.penaltyKicks?.length ?? 0));
      this.nextTickAt = now + this.timing.cupMatchdayMs + this.shootoutExtraMs();
    }
    if (d.phase === 'finished') {
      // Deixa o último jogo “acontecer” na tela antes do resumo.
      this.persistDispute(true);
      this.broadcast();
      this.schedule(this.timing.cupMatchdayMs + this.shootoutExtraMs(), () => this.finalize());
      return;
    }
    this.persistDispute();
    this.drive();
    this.broadcast();
  }

  private finalize() {
    const d = this.dispute;
    if (!d || d.phase !== 'finished' || this.finalizing || !this.disputeId) return;
    if (this.status !== 'in_dispute') return;
    this.finalizing = true;
    try {
      const out = this.deps.results.finalizeDispute({ disputeId: this.disputeId, dispute: d, abandoned: this.abandoned });
      for (const [userId, defs] of out.unlocked) {
        if (defs.length === 0) continue;
        this.deps.notifyUser(userId, {
          t: 'achievements:unlocked',
          items: defs.map((a) => ({ id: a.id, name: a.name, icon: a.icon, rarity: a.rarity })),
        });
      }
      this.lastResult = { ...d.state.result!, disputeId: this.disputeId, seq: this.disputeSeq };
      this.log.info('disputa concluída', { room: this.code, dispute: this.disputeId, headline: d.state.result!.headline });
      this.openContinuation();
    } catch (err) {
      this.log.error('falha ao finalizar disputa', { room: this.code, err: String((err as Error)?.stack ?? err) });
      // Nova tentativa em instantes; a finalização é idempotente.
      this.schedule(2000, () => this.finalize());
    } finally {
      this.finalizing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Continuidade da sala
  // ---------------------------------------------------------------------------

  private openContinuation() {
    const finishedId = this.disputeId!;
    this.status = 'post_dispute';
    // Quem saiu durante a disputa não é chamado para continuar.
    const eligible = this.activeMembers()
      .filter((m) => !this.abandoned.has(`u:${m.userId}`))
      .map((m) => m.userId);
    this.continuation = {
      disputeId: finishedId,
      cycle: this.cycle,
      deadline: Date.now() + Math.round(this.settings.continuationTimeoutSec * 1000 * this.timing.continuationScale),
      eligible,
      responses: {},
      minHumans: this.mode === 'solo' ? 1 : this.settings.minHumansToContinue,
      resolved: false,
    };
    this.dispute = null;
    this.reveal = null;
    this.ceremony = null;
    this.ensureHost();
    this.persistRoom();
    this.drive();
    this.broadcast();
  }

  vote(userId: string, disputeId: string, choice: ContinueChoice) {
    const c = this.continuation;
    if (this.status !== 'post_dispute' || !c || c.resolved || c.disputeId !== disputeId) {
      throw new GameRuleError('votacao_encerrada', 'Essa votação já foi encerrada.');
    }
    if (!c.eligible.includes(userId)) throw new GameRuleError('nao_elegivel', 'Você não está nesta votação.');
    if (choice !== 'continue' && choice !== 'leave') throw new GameRuleError('voto_invalido', 'Voto inválido.');
    c.responses[userId] = choice;
    if (choice === 'leave') {
      const m = this.members.get(userId);
      if (m) {
        m.status = 'left';
        this.persistMember(m);
        for (const conn of this.conns.get(userId) ?? []) conn.send({ t: 'room:left', reason: 'Você saiu da sala.' });
        this.conns.delete(userId);
      }
    }
    this.persistRoom();
    if (c.eligible.every((u) => c.responses[u])) {
      this.resolveContinuation('todos responderam');
      return;
    }
    this.broadcast();
  }

  /** O anfitrião pode iniciar sem esperar quem ainda não respondeu. */
  startNow(userId: string, disputeId: string) {
    this.requireHost(userId);
    const c = this.continuation;
    if (this.status !== 'post_dispute' || !c || c.resolved || c.disputeId !== disputeId) {
      throw new GameRuleError('votacao_encerrada', 'Essa votação já foi encerrada.');
    }
    if (c.responses[userId] !== 'continue') c.responses[userId] = 'continue';
    const yes = c.eligible.filter((u) => c.responses[u] === 'continue');
    if (yes.length < c.minHumans) {
      throw new GameRuleError('poucos_tecnicos', `São necessários ${c.minHumans} técnicos confirmados para continuar.`);
    }
    this.resolveContinuation('anfitrião iniciou');
  }

  /**
   * Política de continuidade (configurável por sala):
   *  - quem respondeu “continuar” entra no próximo ciclo;
   *  - quem não respondeu até o prazo fica inativo (pode voltar depois pelo código);
   *  - ≥ mínimo de humanos → nova disputa automática;
   *  - entre 1 e o mínimo → a sala volta ao lobby (história preservada) esperando gente;
   *  - ninguém → sala encerrada.
   */
  private resolveContinuation(reason: string) {
    const c = this.continuation;
    if (!c || c.resolved || this.status !== 'post_dispute') return;
    c.resolved = true;
    const yes = c.eligible.filter((u) => c.responses[u] === 'continue' && this.members.get(u)?.status === 'active');
    for (const u of c.eligible) {
      if (!c.responses[u]) {
        const m = this.members.get(u);
        if (m && m.status === 'active') {
          m.status = 'inactive';
          this.persistMember(m);
          for (const conn of this.conns.get(u) ?? []) conn.send({ t: 'room:left', reason: 'Tempo esgotado para continuar na sala.' });
          this.conns.delete(u);
        }
      }
    }
    this.log.info('continuidade resolvida', { room: this.code, reason, yes: yes.length, eligible: c.eligible.length });
    if (yes.length === 0) {
      this.close('A sala foi encerrada: ninguém continuou.');
      return;
    }
    if (!yes.includes(this.hostUserId)) this.hostUserId = yes[0]!;
    if (yes.length < c.minHumans) {
      this.status = 'lobby';
      this.continuation = null;
      this.persistRoom();
      this.broadcast();
      return;
    }
    try {
      this.startDispute(yes);
    } catch (err) {
      if (err instanceof RoomConflictError) {
        this.log.warn('início duplicado bloqueado', { room: this.code });
        return;
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Pausa por desconexão
  // ---------------------------------------------------------------------------

  private updatePause() {
    if (this.status !== 'in_dispute' || !this.dispute) {
      this.paused = false;
      return;
    }
    const anyHuman = this.dispute.participants.some((p) => !p.isCpu && !this.abandoned.has(p.id) && this.isConnected(p.userId));
    const now = Date.now();
    if (!anyHuman && !this.paused) {
      this.paused = true;
      this.pausedAt = now;
      this.clearTimer();
      this.persistDispute(true);
      this.scheduleAbandonCheck();
      this.log.info('disputa pausada (ninguém conectado)', { room: this.code });
    } else if (anyHuman && this.paused) {
      const delta = now - this.pausedAt;
      this.paused = false;
      if (this.stepDeadline) this.stepDeadline = Math.max(this.stepDeadline + delta, now + 5000);
      this.nextTickAt = Math.max(this.nextTickAt + delta, now + this.timing.leagueRoundMs);
      this.tickStartedAt += delta;
      if (this.ceremony) this.ceremony.deadline += delta;
      if (this.reveal) this.reveal = { ...this.reveal, startedAt: this.reveal.startedAt + delta };
      if (this.abandonTimer) clearTimeout(this.abandonTimer);
      this.abandonTimer = null;
      this.log.info('disputa retomada', { room: this.code, pausedMs: delta });
      this.drive();
    }
  }

  private scheduleAbandonCheck() {
    if (this.abandonTimer) clearTimeout(this.abandonTimer);
    this.abandonTimer = setTimeout(() => {
      if (this.paused && this.status === 'in_dispute') this.abortDispute('Disputa abandonada: ninguém voltou a tempo.');
    }, this.deps.config.abandonAfterMin * 60_000);
  }

  // ---------------------------------------------------------------------------
  // Visões
  // ---------------------------------------------------------------------------

  history() {
    const rows = this.deps.db
      .prepare(`SELECT id, seq, status, started_at, finished_at, result_json, carried_card_count FROM disputes WHERE room_id = ? ORDER BY seq DESC LIMIT 30`)
      .all(this.id) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const res = r.result_json ? JSON.parse(r.result_json as string) : null;
      return {
        disputeId: r.id as string,
        seq: r.seq as number,
        status: r.status as 'active' | 'finished' | 'aborted',
        startedAt: r.started_at as string,
        finishedAt: (r.finished_at as string | null) ?? null,
        headline: res?.headline ?? null,
        leagueChampion: res?.leagueChampionName ?? null,
        cupChampion: res?.cupChampionName ?? null,
        cupName: res?.cupName ?? null,
        carriedCardCount: r.carried_card_count as number,
        participants: res
          ? (res.outcomes as Array<{ name: string; userId: string | null; rank: number; isCpu: boolean }>).map((o) => ({
              name: o.name,
              userId: o.userId,
              rank: o.rank,
              isCpu: o.isCpu,
            }))
          : [],
      };
    });
  }

  private crestCache = new Map<string, CrestConfig>();

  /** Escudos dos técnicos (por id de usuário), lidos do banco uma vez e guardados até mudarem. */
  crestsFor(userIds: Iterable<string>): Record<string, CrestConfig> {
    const missing = [...new Set(userIds)].filter((id) => id && !this.crestCache.has(id));
    if (missing.length) for (const [id, crest] of userCrests(this.deps.db, missing)) this.crestCache.set(id, crest);
    const out: Record<string, CrestConfig> = {};
    for (const id of new Set(userIds)) {
      const c = this.crestCache.get(id);
      if (c) out[id] = c;
    }
    return out;
  }

  /** Esquece o escudo guardado de um técnico; diz se ele aparece nesta sala. */
  forgetUserCrest(userId: string): boolean {
    const had = this.crestCache.delete(userId);
    return had || this.members.has(userId);
  }

  private historyCache: { at: number; data: ReturnType<RoomActor['history']> } | null = null;

  cachedHistory() {
    const key = this.cycle * 10 + (this.status === 'post_dispute' ? 1 : 0);
    if (!this.historyCache || this.historyCache.at !== key) this.historyCache = { at: key, data: this.history() };
    return this.historyCache.data;
  }

  view(userId: string): RoomView {
    return buildRoomView(this, userId);
  }

  sendState(userId: string) {
    const set = this.conns.get(userId);
    if (!set || set.size === 0) return;
    const room = this.view(userId);
    for (const c of set) c.send({ t: 'room:state', room });
  }

  broadcast() {
    if (this.closed) return;
    for (const userId of this.conns.keys()) this.sendState(userId);
  }

  connectedUserIds(): string[] {
    return [...this.conns.keys()];
  }

  /** Encerra timers (desligamento do servidor) gravando o snapshot pendente. */
  dispose() {
    if (this.persistTimer) this.persistDispute(true);
    this.clearTimer();
    for (const t of [this.abandonTimer, this.idleTimer, this.persistTimer]) if (t) clearTimeout(t);
  }
}
