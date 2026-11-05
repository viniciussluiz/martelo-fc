import { GameRuleError } from './errors.js';
import { Rng } from './rng.js';
import {
  FORMATIONS,
  POSITIONS,
  QUALITY_BANDS,
  qualityBand,
  type AcquisitionSource,
  type AuctionConfig,
  type AuctionMode,
  type Card,
  type Participant,
  type Position,
  type RosterEntry,
} from './types.js';
import { cpuConvoca, cpuEstimate, cpuMontePick, cpuPlanBids, cpuTiebreak } from './cpu.js';
import { packageLabel, type ClubPackage } from './packages.js';

/**
 * Leilão às cegas (envelope cego), por posição.
 *
 * Regras observadas no original (ver docs/INVESTIGACAO.md):
 *  - ordem GOL → LAT → ZAG → MEI → ATA; cada posição é um “lote”;
 *  - lote = soma das vagas da posição entre os técnicos + 1 carta extra;
 *  - lotes grandes são divididos em “levas” (o original mostra “Leva 1 de 2”);
 *  - lance secreto; cada técnico dá no máximo tantos lances quanto vagas abertas
 *    na posição, e a soma dos lances não pode passar das moedas;
 *  - o maior lance leva e paga o que ofertou; empate → desempate às cegas;
 *  - revelação em “pote crescente” (soma dos lances da carta, do menor ao maior);
 *  - sobras da posição vão para a repescagem (só quem ficou com buraco participa);
 *  - o que sobra vai para o Monte Final, onde cada técnico pega de graça na sua vez.
 *
 * No leilão de clubes (`config.mode = 'clubes'`) o fluxo é o mesmo, mas cada item do lote é um
 * pacote (setor de um clube, ver packages.ts): cada técnico leva no máximo um pacote por setor, o
 * Monte Final distribui de graça os pacotes que sobraram e, no fim, vem a Convocação — cada técnico
 * escolhe, dentro dos próprios pacotes, quem joga; quem não escolhe a tempo recebe o pior do pacote.
 *
 * O estado é um objeto JSON simples para permitir snapshots no servidor.
 */

export type StepKind = 'bid' | 'tiebreak' | 'monte' | 'convocacao';
export type BidRound = 'leva' | 'repescagem';

export interface BidStep {
  kind: 'bid';
  stepId: string;
  position: Position;
  round: BidRound;
  batchIndex: number;
  batchCount: number;
  cardIds: string[];
  mysteryCardIds: string[];
  eligible: string[];
  /** Lances por técnico (rascunho até o fechamento do passo). */
  bids: Record<string, Record<string, number>>;
  /** Técnicos que lacraram o envelope. */
  sealed: string[];
}

export interface TieItem {
  cardId: string;
  tied: string[];
  floor: number;
}

export interface TiebreakStep {
  kind: 'tiebreak';
  stepId: string;
  position: Position;
  round: BidRound;
  items: TieItem[];
  eligible: string[];
  bids: Record<string, Record<string, number>>;
  sealed: string[];
  /** Resolução parcial do passo de lances que originou o desempate. */
  pending: PendingResolution;
}

export interface MonteStep {
  kind: 'monte';
  stepId: string;
  pool: string[];
  queue: string[];
  current: string;
  pickNumber: number;
}

/** Leilão de clubes: cada técnico escolhe quem joga dentro dos pacotes que levou. */
export interface ConvocacaoStep {
  kind: 'convocacao';
  stepId: string;
  eligible: string[];
  /** Convocados por técnico (rascunho até lacrar). */
  picks: Record<string, string[]>;
  sealed: string[];
}

export type AuctionStep = BidStep | TiebreakStep | MonteStep | ConvocacaoStep;

/** Pacote levado por um técnico (leilão de clubes). */
export interface PackageWin {
  packageId: string;
  price: number;
  source: AcquisitionSource;
}

export interface ConvocacaoPick {
  participantId: string;
  cardId: string;
  /** Escolhido pelo sistema (tempo esgotado: o pior do pacote). */
  auto: boolean;
}

export interface BidRecord {
  participantId: string;
  amount: number;
}

export type Decision = 'maior-lance' | 'desempate' | 'sorteio';

export interface RevealItem {
  stepId: string;
  cardId: string;
  position: Position;
  round: BidRound;
  pot: number;
  bids: BidRecord[];
  tiebreakBids?: BidRecord[];
  winnerId: string | null;
  price: number;
  decidedBy: Decision | null;
  /** Diferença para o 2º maior lance (0 quando não há 2º lance). */
  margin: number;
  wasMystery: boolean;
}

interface PendingItem {
  cardId: string;
  bids: BidRecord[];
  winnerId: string | null;
  price: number;
  decidedBy: Decision | null;
  tie?: TieItem;
}

export interface PendingResolution {
  stepId: string;
  position: Position;
  round: BidRound;
  mysteryCardIds: string[];
  items: PendingItem[];
}

export interface MontePick {
  participantId: string;
  cardId: string;
  auto: boolean;
}

interface Cursor {
  p: number;
  round: BidRound;
  batch: number;
}

export interface AuctionState {
  version: 1;
  config: AuctionConfig;
  seed: string;
  rngState: number;
  participants: Participant[];
  cards: Record<string, Card>;
  levas: Record<Position, string[][]>;
  repescagem: Record<Position, string[][]>;
  unsold: Record<Position, string[]>;
  montePool: string[];
  reserve: string[];
  cursor: Cursor;
  step: AuctionStep | null;
  revealLog: RevealItem[];
  monteLog: MontePick[];
  done: boolean;
  stepCounter: number;
  /** Leilão de clubes (ausente = leilão de jogadores). */
  mode?: AuctionMode;
  packages?: Record<string, ClubPackage>;
  /** Pacotes levados, por técnico e setor. */
  packs?: Record<string, Partial<Record<Position, PackageWin>>>;
  convocacaoLog?: ConvocacaoPick[];
}

export interface CreateAuctionParams {
  participants: Participant[];
  pool: Card[];
  reserve: Card[];
  config: AuctionConfig;
  seed: string;
  /** Leilão de clubes: os pacotes (as cartas deles vêm em `pool`). */
  packages?: ClubPackage[];
}

export interface ResolveOutcome {
  kind: 'revealed' | 'tiebreak' | 'monte-pick' | 'convocacao' | 'skipped';
  reveals: RevealItem[];
  picks: MontePick[];
}

function emptyByPos<T>(make: () => T): Record<Position, T> {
  return { GOL: make(), LAT: make(), ZAG: make(), MEI: make(), ATA: make() };
}

function emptyByPosWith<T>(make: (pos: Position) => T): Record<Position, T> {
  return { GOL: make('GOL'), LAT: make('LAT'), ZAG: make('ZAG'), MEI: make('MEI'), ATA: make('ATA') };
}

/**
 * Divide o lote em levas do mesmo tamanho (diferença máxima de 1, nenhuma maior que `size`)
 * e distribui bons, médios e ruins por igual entre elas; a ordem dentro de cada leva é sorteada.
 */
export function balancedLevas(cards: Card[], size: number, rng: Rng): string[][] {
  if (cards.length === 0) return [];
  const count = Math.ceil(cards.length / size);
  const ordered = QUALITY_BANDS.flatMap((band) => rng.shuffle(cards.filter((c) => qualityBand(c.tier) === band)));
  const levas: string[][] = Array.from({ length: count }, () => []);
  ordered.forEach((c, i) => levas[i % count]!.push(c.id));
  return levas.map((l) => rng.shuffle(l));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Calcula o tamanho do lote de cada posição.
 * Lote = Σ vagas da posição + extra, e nunca menor que o número de cartas
 * herdadas do ciclo anterior (para que todas voltem ao leilão).
 */
export function lotSizes(
  participants: Pick<Participant, 'formation'>[],
  extra: number,
  carriedByPos: Partial<Record<Position, number>> = {},
  extraRatio = 0,
): Record<Position, number> {
  const sizes = emptyByPos(() => 0);
  for (const pos of POSITIONS) {
    const slots = participants.reduce((s, p) => s + FORMATIONS[p.formation][pos], 0);
    const spare = Math.max(extra, Math.ceil(slots * extraRatio));
    sizes[pos] = Math.max(slots + spare, carriedByPos[pos] ?? 0);
  }
  return sizes;
}

export class Auction {
  private rng: Rng;

  private constructor(public state: AuctionState) {
    this.rng = Rng.fromSnapshot(state.rngState);
  }

  static create(params: CreateAuctionParams): Auction {
    const rng = new Rng(`auction:${params.seed}`);
    const cards: Record<string, Card> = {};
    for (const c of [...params.pool, ...params.reserve]) cards[c.id] = c;
    const levas = emptyByPos<string[][]>(() => []);
    const clubs = params.config.mode === 'clubes';
    for (const pos of POSITIONS) {
      if (clubs) {
        // Um lote por setor com todos os pacotes (o tamanho já é técnicos + 1).
        const ids = (params.packages ?? []).filter((p) => p.position === pos).map((p) => p.id);
        levas[pos] = ids.length ? [rng.shuffle(ids)] : [];
        continue;
      }
      levas[pos] = balancedLevas(
        params.pool.filter((c) => c.position === pos),
        Math.max(1, params.config.batchSize),
        rng,
      );
    }
    const state: AuctionState = {
      version: 1,
      config: params.config,
      seed: params.seed,
      rngState: rng.snapshot,
      participants: params.participants.map((p) => ({ ...p, coins: params.config.startingCoins, roster: [] })),
      cards,
      levas,
      repescagem: emptyByPos(() => []),
      unsold: emptyByPos(() => []),
      montePool: [],
      reserve: rng.shuffle(params.reserve.map((c) => c.id)),
      cursor: { p: 0, round: 'leva', batch: 0 },
      step: null,
      revealLog: [],
      monteLog: [],
      done: false,
      stepCounter: 0,
      ...(clubs
        ? {
            mode: 'clubes' as const,
            packages: Object.fromEntries((params.packages ?? []).map((p) => [p.id, p])),
            packs: Object.fromEntries(params.participants.map((p) => [p.id, {}])),
            convocacaoLog: [],
          }
        : {}),
    };
    const auction = new Auction(state);
    auction.advance();
    return auction;
  }

  static fromJSON(state: AuctionState): Auction {
    return new Auction(structuredClone(state));
  }

  toJSON(): AuctionState {
    this.state.rngState = this.rng.snapshot;
    return this.state;
  }

  get step(): AuctionStep | null {
    return this.state.step;
  }

  get done(): boolean {
    return this.state.done;
  }

  participant(id: string): Participant {
    const p = this.state.participants.find((x) => x.id === id);
    if (!p) throw new GameRuleError('participante_desconhecido', 'Técnico não participa desta disputa.');
    return p;
  }

  openSlots(participantId: string): Record<Position, number> {
    const p = this.participant(participantId);
    const need = { ...FORMATIONS[p.formation] };
    for (const r of p.roster) need[r.position]--;
    return need;
  }

  totalOpenSlots(participantId: string): number {
    const o = this.openSlots(participantId);
    return POSITIONS.reduce((s, pos) => s + Math.max(0, o[pos]), 0);
  }

  get isClubs(): boolean {
    return this.state.mode === 'clubes';
  }

  /** Posição de um item do leilão (carta ou pacote). */
  positionOf(itemId: string): Position {
    const pack = this.state.packages?.[itemId];
    if (pack) return pack.position;
    const card = this.state.cards[itemId];
    if (!card) throw new GameRuleError('carta_invalida', 'Item desconhecido.');
    return card.position;
  }

  /** Nome de um item do leilão (para históricos): nome do jogador ou “Clube · setor”. */
  itemLabel(itemId: string): string {
    const pack = this.state.packages?.[itemId];
    if (pack) return packageLabel(pack);
    return this.state.cards[itemId]?.name ?? itemId;
  }

  /**
   * Vagas que ainda dá para disputar no leilão, por posição: no de jogadores, as vagas do elenco;
   * no de clubes, 1 por setor ainda sem pacote.
   */
  vacancies(participantId: string): Record<Position, number> {
    if (!this.isClubs) return this.openSlots(participantId);
    const packs = this.state.packs?.[participantId] ?? {};
    return emptyByPosWith((pos) => (packs[pos] ? 0 : 1));
  }

  totalVacancies(participantId: string): number {
    const v = this.vacancies(participantId);
    return POSITIONS.reduce((s, pos) => s + Math.max(0, v[pos]), 0);
  }

  /** Pacotes levados pelo técnico (leilão de clubes). */
  packagesOf(participantId: string): Partial<Record<Position, PackageWin>> {
    return this.state.packs?.[participantId] ?? {};
  }

  private eligibleFor(pos: Position): string[] {
    return this.state.participants.filter((p) => p.coins > 0 && this.vacancies(p.id)[pos] > 0).map((p) => p.id);
  }

  private nextStepId(base: string): string {
    this.state.stepCounter++;
    return `${base}#${this.state.stepCounter}`;
  }

  // ---------------------------------------------------------------------------
  // Fluxo de passos
  // ---------------------------------------------------------------------------

  /** Avança o cursor até o próximo passo que exige decisão (ou conclui o leilão). */
  private advance(): void {
    const s = this.state;
    s.step = null;
    for (;;) {
      const pos = POSITIONS[s.cursor.p];
      if (!pos) {
        this.startMonte();
        return;
      }
      if (s.cursor.round === 'leva') {
        const batches = s.levas[pos];
        if (s.cursor.batch < batches.length) {
          const cardIds = batches[s.cursor.batch]!;
          const eligible = this.eligibleFor(pos);
          if (eligible.length === 0) {
            s.unsold[pos].push(...cardIds);
            s.cursor.batch++;
            continue;
          }
          this.openBidStep(pos, 'leva', cardIds, eligible, s.cursor.batch, batches.length);
          return;
        }
        s.cursor = { p: s.cursor.p, round: 'repescagem', batch: 0 };
        const leftovers = s.unsold[pos];
        s.unsold[pos] = [];
        if (s.config.repescagem) {
          s.repescagem[pos] = chunk(leftovers, Math.max(1, s.config.batchSize));
        } else {
          s.montePool.push(...leftovers);
          s.repescagem[pos] = [];
        }
        continue;
      }
      // repescagem
      const rep = s.repescagem[pos];
      if (s.cursor.batch < rep.length) {
        const cardIds = rep[s.cursor.batch]!;
        const eligible = this.eligibleFor(pos);
        if (eligible.length === 0) {
          s.montePool.push(...cardIds);
          s.cursor.batch++;
          continue;
        }
        this.openBidStep(pos, 'repescagem', cardIds, eligible, s.cursor.batch, rep.length);
        return;
      }
      s.cursor = { p: s.cursor.p + 1, round: 'leva', batch: 0 };
    }
  }

  private openBidStep(pos: Position, round: BidRound, cardIds: string[], eligible: string[], batchIndex: number, batchCount: number) {
    const mystery: string[] = [];
    if (!this.isClubs && round === 'leva' && cardIds.length > 2 && this.rng.next() < this.state.config.mysteryChance) {
      mystery.push(this.rng.pick(cardIds));
    }
    const step: BidStep = {
      kind: 'bid',
      stepId: this.nextStepId(`${pos}:${round}:${batchIndex + 1}`),
      position: pos,
      round,
      batchIndex,
      batchCount,
      cardIds: cardIds.slice(),
      mysteryCardIds: mystery,
      eligible,
      bids: {},
      sealed: [],
    };
    this.state.step = step;
    // CPUs decidem na abertura do passo (lance lacrado imediatamente).
    for (const pid of eligible) {
      const p = this.participant(pid);
      if (!p.isCpu) continue;
      const plan = cpuPlanBids({
        rng: this.rng.fork(`${step.stepId}:${pid}`),
        participant: p,
        cards: cardIds.map((id) => this.cpuView(id, p)),
        mysteryCardIds: mystery,
        openInPosition: this.vacancies(pid)[pos],
        // Clubes: o orçamento é por jogador que falta; o pacote vale pelos que ele rende no setor.
        totalOpenSlots: this.isClubs
          ? POSITIONS.reduce((n, x) => n + (this.vacancies(pid)[x] > 0 ? FORMATIONS[p.formation][x] : 0), 0)
          : this.totalVacancies(pid),
        ...(this.isClubs ? { playersPerItem: FORMATIONS[p.formation][pos] } : {}),
        round,
      });
      step.bids[pid] = plan;
      step.sealed.push(pid);
    }
  }

  // ---------------------------------------------------------------------------
  // Ações dos técnicos
  // ---------------------------------------------------------------------------

  /** Valida um conjunto de lances sem alterar o estado. */
  validateBids(participantId: string, bids: Record<string, number>): Record<string, number> {
    const step = this.state.step;
    if (!step || step.kind !== 'bid') throw new GameRuleError('fora_de_hora', 'Não há envelope aberto agora.');
    if (!step.eligible.includes(participantId)) {
      throw new GameRuleError('nao_elegivel', 'Você não tem vaga aberta nesta posição.');
    }
    const p = this.participant(participantId);
    const clean: Record<string, number> = {};
    let total = 0;
    for (const [cardId, raw] of Object.entries(bids)) {
      if (!step.cardIds.includes(cardId)) {
        throw new GameRuleError('carta_invalida', this.isClubs ? 'Esse pacote não está neste lote.' : 'Essa carta não está nesta leva.');
      }
      if (raw === 0 || raw === null || raw === undefined) continue;
      if (!Number.isInteger(raw) || raw < 1) throw new GameRuleError('lance_invalido', 'Lances são inteiros a partir de 1 moeda.');
      clean[cardId] = raw;
      total += raw;
    }
    const open = this.vacancies(participantId)[step.position];
    if (Object.keys(clean).length > open) {
      throw new GameRuleError(
        'lances_demais',
        this.isClubs
          ? 'Você só pode dar lance em um pacote por setor.'
          : `Você só pode dar lance em ${open} ${open === 1 ? 'jogador' : 'jogadores'} desta posição (vagas abertas).`,
      );
    }
    if (total > p.coins) throw new GameRuleError('sem_moedas', `O envelope passa das suas ${p.coins} moedas.`);
    return clean;
  }

  submitBids(participantId: string, bids: Record<string, number>, seal = false): void {
    const step = this.state.step as BidStep;
    if (step?.kind === 'bid' && step.sealed.includes(participantId)) {
      throw new GameRuleError('envelope_lacrado', 'Seu envelope já foi lacrado.');
    }
    const clean = this.validateBids(participantId, bids);
    step.bids[participantId] = clean;
    if (seal && !step.sealed.includes(participantId)) step.sealed.push(participantId);
  }

  submitTiebreak(participantId: string, amounts: Record<string, number>, seal = true): void {
    const step = this.state.step;
    if (!step || step.kind !== 'tiebreak') throw new GameRuleError('fora_de_hora', 'Não há desempate em andamento.');
    if (!step.eligible.includes(participantId)) throw new GameRuleError('nao_elegivel', 'Você não está neste desempate.');
    if (step.sealed.includes(participantId)) throw new GameRuleError('envelope_lacrado', 'Seu desempate já foi lacrado.');
    const clean: Record<string, number> = {};
    for (const item of step.items) {
      if (!item.tied.includes(participantId)) continue;
      const raw = amounts[item.cardId];
      const value = raw === undefined ? item.floor : raw;
      if (!Number.isInteger(value) || value < item.floor) {
        throw new GameRuleError('lance_invalido', `O desempate precisa ser de pelo menos ${item.floor} moedas.`);
      }
      clean[item.cardId] = value;
    }
    for (const cardId of Object.keys(amounts)) {
      if (!step.items.some((i) => i.cardId === cardId && i.tied.includes(participantId))) {
        throw new GameRuleError('carta_invalida', 'Você não está empatado nessa carta.');
      }
    }
    const committed = this.committedOutsideTies(step.pending, participantId);
    const total = Object.values(clean).reduce((a, b) => a + b, 0);
    const p = this.participant(participantId);
    if (committed + total > p.coins) {
      throw new GameRuleError('sem_moedas', `Você tem ${p.coins - committed} moedas livres para o desempate.`);
    }
    step.bids[participantId] = clean;
    if (seal) step.sealed.push(participantId);
  }

  pickMonte(participantId: string, cardId: string): MontePick {
    const step = this.state.step;
    if (!step || step.kind !== 'monte') throw new GameRuleError('fora_de_hora', 'O Monte Final não está aberto.');
    if (step.current !== participantId) throw new GameRuleError('nao_e_sua_vez', 'Ainda não é a sua vez no Monte.');
    if (!step.pool.includes(cardId)) throw new GameRuleError('carta_invalida', this.isClubs ? 'Esse pacote não está no Monte.' : 'Essa carta não está no Monte.');
    if (this.vacancies(participantId)[this.positionOf(cardId)] <= 0) {
      throw new GameRuleError('posicao_cheia', this.isClubs ? 'Você já tem pacote nesse setor.' : 'Você já completou essa posição.');
    }
    return this.applyMontePick(participantId, cardId, false);
  }

  /** Itens do Monte (cartas, ou pacotes no leilão de clubes) que o técnico da vez pode escolher. */
  monteOptionsFor(participantId: string): string[] {
    const step = this.state.step;
    if (!step || step.kind !== 'monte') return [];
    const open = this.vacancies(participantId);
    return step.pool.filter((id) => open[this.positionOf(id)] > 0);
  }

  // ---------------------------------------------------------------------------
  // Convocação (leilão de clubes)
  // ---------------------------------------------------------------------------

  /** Jogadores que o técnico pode convocar, por setor (os dos pacotes que levou). */
  convocaOptions(participantId: string): Record<Position, string[]> {
    const packs = this.packagesOf(participantId);
    return emptyByPosWith((pos) => {
      const win = packs[pos];
      return win ? (this.state.packages?.[win.packageId]?.cardIds.slice() ?? []) : [];
    });
  }

  /**
   * Guarda (e opcionalmente lacra) a convocação: só jogadores dos próprios pacotes, no máximo o que
   * a formação pede em cada setor; para lacrar, o time precisa estar completo.
   */
  submitConvocacao(participantId: string, cardIds: string[], seal = false): void {
    const step = this.state.step;
    if (!step || step.kind !== 'convocacao') throw new GameRuleError('fora_de_hora', 'A convocação não está aberta.');
    if (!step.eligible.includes(participantId)) throw new GameRuleError('nao_elegivel', 'Você não está nesta convocação.');
    if (step.sealed.includes(participantId)) throw new GameRuleError('envelope_lacrado', 'Sua convocação já foi fechada.');
    if (!Array.isArray(cardIds)) throw new GameRuleError('convocacao_invalida', 'Convocação inválida.');
    const p = this.participant(participantId);
    const options = this.convocaOptions(participantId);
    const need = FORMATIONS[p.formation];
    const clean: string[] = [];
    const count = emptyByPosWith(() => 0);
    for (const raw of cardIds) {
      const id = String(raw);
      if (clean.includes(id)) continue;
      const pos = POSITIONS.find((x) => options[x].includes(id));
      if (!pos) throw new GameRuleError('carta_invalida', 'Esse jogador não está nos seus pacotes.');
      if (++count[pos] > need[pos]) {
        throw new GameRuleError('convocados_demais', `A sua formação leva ${need[pos]} no setor ${pos}.`);
      }
      clean.push(id);
    }
    if (seal) {
      const missing = POSITIONS.filter((pos) => count[pos] < need[pos]);
      if (missing.length) throw new GameRuleError('convocacao_incompleta', `Ainda falta convocar: ${missing.join(', ')}.`);
    }
    step.picks[participantId] = clean;
    if (seal) step.sealed.push(participantId);
  }

  private startConvocacao(): void {
    const s = this.state;
    const step: ConvocacaoStep = {
      kind: 'convocacao',
      stepId: this.nextStepId('convocacao'),
      eligible: s.participants.map((p) => p.id),
      picks: {},
      sealed: [],
    };
    s.step = step;
    // CPUs convocam na hora (os que acham melhores, com o mesmo “olho” do leilão).
    for (const p of s.participants) {
      if (!p.isCpu) continue;
      const options = this.convocaOptions(p.id);
      step.picks[p.id] = cpuConvoca(
        this.rng.fork(`${step.stepId}:${p.id}`),
        POSITIONS.map((pos) => ({ need: FORMATIONS[p.formation][pos], cards: options[pos].map((id) => s.cards[id]!) })),
      );
      step.sealed.push(p.id);
    }
  }

  /**
   * Fecha a convocação: quem não completou recebe o PIOR do pacote em cada vaga que faltou.
   * O preço de cada pacote é dividido entre os convocados dele (a sobra da divisão vai para os primeiros).
   */
  private resolveConvocacao(step: ConvocacaoStep): ResolveOutcome {
    const s = this.state;
    const mid = (c: Card) => (c.levelMin + c.levelMax) / 2;
    for (const p of s.participants) {
      const options = this.convocaOptions(p.id);
      const picked = new Set(step.picks[p.id] ?? []);
      const packs = this.packagesOf(p.id);
      const entries: RosterEntry[] = [];
      for (const pos of POSITIONS) {
        const need = FORMATIONS[p.formation][pos];
        const chosen = (step.picks[p.id] ?? []).filter((id) => options[pos].includes(id)).slice(0, need);
        for (const id of chosen) s.convocacaoLog!.push({ participantId: p.id, cardId: id, auto: false });
        const worstFirst = options[pos]
          .filter((id) => !picked.has(id))
          .sort((a, b) => mid(s.cards[a]!) - mid(s.cards[b]!) || s.cards[a]!.levelMax - s.cards[b]!.levelMax);
        while (chosen.length < need && worstFirst.length) {
          const id = worstFirst.shift()!;
          chosen.push(id);
          s.convocacaoLog!.push({ participantId: p.id, cardId: id, auto: true });
        }
        if (chosen.length < need) throw new Error(`Pacote de ${pos} de ${p.name} sem jogadores suficientes`);
        const win = packs[pos]!;
        const base = Math.floor(win.price / chosen.length);
        let extra = win.price - base * chosen.length;
        for (const id of chosen) {
          const price = base + (extra > 0 ? 1 : 0);
          if (extra > 0) extra--;
          entries.push({ cardId: id, position: pos, price, source: win.source });
        }
      }
      p.roster = entries;
    }
    s.step = null;
    s.done = true;
    return { kind: 'convocacao', reveals: [], picks: [] };
  }

  /**
   * Como a CPU enxerga um item na hora do lance: a carta, ou — no leilão de clubes — o pacote
   * como se fosse uma carta com a faixa média dos melhores que ela escalaria.
   */
  private cpuView(itemId: string, p: Participant): Card {
    const pack = this.state.packages?.[itemId];
    if (!pack) return this.state.cards[itemId]!;
    const need = FORMATIONS[p.formation][pack.position];
    const best = pack.cardIds
      .map((id) => this.state.cards[id]!)
      .sort((a, b) => b.levelMin + b.levelMax - (a.levelMin + a.levelMax))
      .slice(0, need);
    const avg = (f: (c: Card) => number) => Math.round(best.reduce((s, c) => s + f(c), 0) / Math.max(1, best.length));
    return { ...best[0]!, id: pack.id, name: packageLabel(pack), club: pack.club, levelMin: avg((c) => c.levelMin), levelMax: avg((c) => c.levelMax) };
  }

  // ---------------------------------------------------------------------------
  // Resolução
  // ---------------------------------------------------------------------------

  /** Verdadeiro quando todos os técnicos humanos elegíveis já fecharam o passo. */
  isStepReady(): boolean {
    const step = this.state.step;
    if (!step) return true;
    if (step.kind === 'monte') return this.participant(step.current).isCpu;
    return step.eligible.every((pid) => step.sealed.includes(pid));
  }

  humanEligible(): string[] {
    const step = this.state.step;
    if (!step) return [];
    if (step.kind === 'monte') return this.participant(step.current).isCpu ? [] : [step.current];
    return step.eligible.filter((pid) => !this.participant(pid).isCpu);
  }

  /**
   * Fecha o passo atual (chamado quando todos lacraram ou o tempo acabou).
   * Envelopes não lacrados valem como estão; no Monte, a escolha é automática.
   */
  resolveStep(): ResolveOutcome {
    const step = this.state.step;
    if (!step) return { kind: 'skipped', reveals: [], picks: [] };
    if (step.kind === 'bid') return this.resolveBidStep(step);
    if (step.kind === 'tiebreak') return this.resolveTiebreak(step);
    if (step.kind === 'convocacao') return this.resolveConvocacao(step);
    const pick = this.autoPickMonte();
    return { kind: 'monte-pick', reveals: [], picks: pick ? [pick] : [] };
  }

  private resolveBidStep(step: BidStep): ResolveOutcome {
    const items: PendingItem[] = [];
    const ties: TieItem[] = [];
    for (const cardId of step.cardIds) {
      const bids: BidRecord[] = [];
      for (const pid of step.eligible) {
        const amount = step.bids[pid]?.[cardId];
        if (amount && amount > 0) bids.push({ participantId: pid, amount });
      }
      bids.sort((a, b) => b.amount - a.amount);
      const item: PendingItem = { cardId, bids, winnerId: null, price: 0, decidedBy: null };
      if (bids.length > 0) {
        const top = bids[0]!.amount;
        const tied = bids.filter((b) => b.amount === top).map((b) => b.participantId);
        if (tied.length === 1) {
          item.winnerId = tied[0]!;
          item.price = top;
          item.decidedBy = 'maior-lance';
        } else {
          item.tie = { cardId, tied, floor: top };
          ties.push(item.tie);
        }
      }
      items.push(item);
    }
    const pending: PendingResolution = {
      stepId: step.stepId,
      position: step.position,
      round: step.round,
      mysteryCardIds: step.mysteryCardIds,
      items,
    };
    if (ties.length > 0 && this.state.config.tiebreakRound) {
      const eligible = [...new Set(ties.flatMap((t) => t.tied))];
      const tb: TiebreakStep = {
        kind: 'tiebreak',
        stepId: this.nextStepId(`${step.position}:${step.round}:desempate`),
        position: step.position,
        round: step.round,
        items: ties,
        eligible,
        bids: {},
        sealed: [],
        pending,
      };
      this.state.step = tb;
      for (const pid of eligible) {
        const p = this.participant(pid);
        if (!p.isCpu) continue;
        const free = p.coins - this.committedOutsideTies(pending, pid);
        tb.bids[pid] = cpuTiebreak(this.rng.fork(`${tb.stepId}:${pid}`), ties.filter((t) => t.tied.includes(pid)), free, p);
        tb.sealed.push(pid);
      }
      return { kind: 'tiebreak', reveals: [], picks: [] };
    }
    // Sem rodada de desempate: sorteio direto.
    for (const it of items) {
      if (it.tie) this.drawTie(it, it.tie.tied, it.tie.floor);
    }
    return { kind: 'revealed', reveals: this.finalize(pending), picks: [] };
  }

  private resolveTiebreak(step: TiebreakStep): ResolveOutcome {
    const pending = step.pending;
    for (const it of pending.items) {
      if (!it.tie) continue;
      const tb: BidRecord[] = it.tie.tied.map((pid) => ({
        participantId: pid,
        amount: step.bids[pid]?.[it.cardId] ?? it.tie!.floor,
      }));
      tb.sort((a, b) => b.amount - a.amount);
      (it as PendingItem & { tiebreakBids?: BidRecord[] }).tiebreakBids = tb;
      const top = tb[0]!.amount;
      const leaders = tb.filter((b) => b.amount === top).map((b) => b.participantId);
      if (leaders.length === 1) {
        it.winnerId = leaders[0]!;
        it.price = top;
        it.decidedBy = 'desempate';
      } else {
        this.drawTie(it, leaders, top);
      }
    }
    return { kind: 'revealed', reveals: this.finalize(pending), picks: [] };
  }

  private drawTie(item: PendingItem, leaders: string[], price: number) {
    item.winnerId = this.rng.pick(leaders);
    item.price = price;
    item.decidedBy = 'sorteio';
  }

  /** Moedas comprometidas pelo técnico na leva, fora dos itens empatados. */
  private committedOutsideTies(pending: PendingResolution, pid: string): number {
    return pending.items.filter((i) => !i.tie && i.winnerId === pid).reduce((s, i) => s + i.price, 0);
  }

  private finalize(pending: PendingResolution): RevealItem[] {
    const reveals: RevealItem[] = [];
    for (const it of pending.items) {
      const pot = it.bids.reduce((s, b) => s + b.amount, 0);
      const second = it.bids.find((b) => b.participantId !== it.winnerId)?.amount ?? 0;
      const reveal: RevealItem = {
        stepId: pending.stepId,
        cardId: it.cardId,
        position: pending.position,
        round: pending.round,
        pot,
        bids: it.bids,
        winnerId: it.winnerId,
        price: it.winnerId ? it.price : 0,
        decidedBy: it.winnerId ? it.decidedBy : null,
        margin: it.winnerId ? it.price - second : 0,
        wasMystery: pending.mysteryCardIds.includes(it.cardId),
      };
      const tbBids = (it as PendingItem & { tiebreakBids?: BidRecord[] }).tiebreakBids;
      if (tbBids) reveal.tiebreakBids = tbBids;
      reveals.push(reveal);
      if (it.winnerId) {
        const winner = this.participant(it.winnerId);
        const source: AcquisitionSource =
          it.decidedBy === 'desempate' || it.decidedBy === 'sorteio' ? 'desempate' : pending.round === 'repescagem' ? 'repescagem' : 'leilao';
        // Proteção extra: nunca deixa o saldo negativo nem ultrapassa vagas.
        if (winner.coins < it.price || this.vacancies(winner.id)[pending.position] <= 0) {
          throw new Error(`Invariante violada ao fechar ${it.cardId} para ${winner.id}`);
        }
        winner.coins -= it.price;
        if (this.isClubs) this.awardPackage(winner.id, it.cardId, it.price, source);
        else winner.roster.push({ cardId: it.cardId, position: pending.position, price: it.price, source });
      } else if (pending.round === 'leva') {
        this.state.unsold[pending.position].push(it.cardId);
      } else {
        this.state.montePool.push(it.cardId);
      }
    }
    // Revelação em “pote crescente”: soma dos lances, do menor para o maior.
    const order = pending.items.map((i) => i.cardId);
    reveals.sort((a, b) => a.pot - b.pot || order.indexOf(a.cardId) - order.indexOf(b.cardId));
    this.state.revealLog.push(...reveals);
    this.state.cursor.batch++;
    this.advance();
    return reveals;
  }

  // ---------------------------------------------------------------------------
  // Monte Final
  // ---------------------------------------------------------------------------

  private startMonte(): void {
    const s = this.state;
    const needers = s.participants.filter((p) => this.totalVacancies(p.id) > 0);
    if (needers.length === 0) {
      if (this.isClubs) {
        this.startConvocacao();
        return;
      }
      s.step = null;
      s.done = true;
      return;
    }
    if (this.isClubs) {
      // Sobra sempre pelo menos um pacote por setor (técnicos + 1); por garantia, completa com
      // pacotes de “reservas” genéricas se faltar.
      for (const pos of POSITIONS) {
        const need = needers.filter((p) => this.vacancies(p.id)[pos] > 0).length;
        let have = s.montePool.filter((id) => this.positionOf(id) === pos).length;
        while (have < need) {
          s.montePool.push(this.makeFillerPackage(pos).id);
          have++;
        }
      }
    }
    // Garante cartas suficientes por posição (completa com a reserva do baralho
    // e, em último caso, com “reservas” genéricas).
    for (const pos of this.isClubs ? [] : POSITIONS) {
      const need = needers.reduce((sum, p) => sum + Math.max(0, this.openSlots(p.id)[pos]), 0);
      let have = s.montePool.filter((id) => s.cards[id]!.position === pos).length;
      const extra = need > 0 ? 1 : 0;
      while (have < need + extra) {
        const idx = s.reserve.findIndex((id) => s.cards[id]!.position === pos);
        if (idx >= 0) {
          s.montePool.push(s.reserve.splice(idx, 1)[0]!);
        } else {
          const filler = makeFillerCard(pos, Object.keys(s.cards).length + 1, this.rng);
          s.cards[filler.id] = filler;
          s.montePool.push(filler.id);
        }
        have++;
      }
    }
    // Ordem: quem tem mais vagas abertas escolhe primeiro; empate pela ordem dos assentos.
    const seats = s.participants.map((p) => p.id);
    const queue = needers
      .map((p) => p.id)
      .sort((a, b) => this.totalVacancies(b) - this.totalVacancies(a) || seats.indexOf(a) - seats.indexOf(b));
    s.step = {
      kind: 'monte',
      stepId: this.nextStepId('monte'),
      pool: s.montePool.slice(),
      queue,
      current: queue[0]!,
      pickNumber: 1,
    };
  }

  autoPickMonte(): MontePick | null {
    const step = this.state.step;
    if (!step || step.kind !== 'monte') return null;
    const options = this.monteOptionsFor(step.current);
    const p = this.participant(step.current);
    const cardId = p.isCpu
      ? cpuMontePick(this.rng.fork(`${step.stepId}:${step.pickNumber}`), options.map((id) => this.cpuView(id, p)), p)
      : this.rng.pick(options);
    return this.applyMontePick(step.current, cardId, true);
  }

  private applyMontePick(pid: string, cardId: string, auto: boolean): MontePick {
    const step = this.state.step as MonteStep;
    const p = this.participant(pid);
    if (this.isClubs) this.awardPackage(pid, cardId, 0, 'monte');
    else p.roster.push({ cardId, position: this.positionOf(cardId), price: 0, source: 'monte' });
    step.pool = step.pool.filter((id) => id !== cardId);
    this.state.montePool = this.state.montePool.filter((id) => id !== cardId);
    const pick: MontePick = { participantId: pid, cardId, auto };
    this.state.monteLog.push(pick);
    // Gira a fila: quem completou sai; os demais voltam para o fim.
    const queue = step.queue.filter((id) => id !== pid);
    if (this.totalVacancies(pid) > 0) queue.push(pid);
    if (queue.length === 0) {
      if (this.isClubs) {
        this.startConvocacao();
        return pick;
      }
      this.state.step = null;
      this.state.done = true;
      return pick;
    }
    step.queue = queue;
    step.current = queue[0]!;
    step.pickNumber++;
    step.stepId = this.nextStepId('monte');
    return pick;
  }

  private awardPackage(pid: string, packageId: string, price: number, source: AcquisitionSource) {
    const s = this.state;
    const pos = this.positionOf(packageId);
    s.packs ??= {};
    const mine = (s.packs[pid] ??= {});
    if (mine[pos]) throw new Error(`Invariante violada: ${pid} já tem pacote de ${pos}`);
    mine[pos] = { packageId, price, source };
  }

  private makeFillerPackage(pos: Position): ClubPackage {
    const s = this.state;
    const n = Object.keys(s.packages ?? {}).length + 1;
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const filler = makeFillerCard(pos, Object.keys(s.cards).length + 1, this.rng);
      s.cards[filler.id] = filler;
      ids.push(filler.id);
    }
    const pack: ClubPackage = { id: `pk:${pos}:reservas-${n}`, club: 'Sem clube', position: pos, cardIds: ids, mixed: true };
    s.packages = { ...(s.packages ?? {}), [pack.id]: pack };
    return pack;
  }

  /** Avança automaticamente todos os passos (útil para CPUs e testes). */
  runToEnd(maxSteps = 10_000): void {
    let guard = 0;
    while (!this.done && guard++ < maxSteps) this.resolveStep();
    if (!this.done) throw new Error('Leilão não terminou dentro do limite de passos');
  }

  /** Estimativa de valor usada pela CPU (exposta para testes). */
  static estimate(card: Card, seed: string): number {
    return cpuEstimate(card, new Rng(seed), false);
  }
}

const FILLER_NAMES = ['Reserva da Base', 'Garoto do Juvenil', 'Veterano Emprestado', 'Coringa do Elenco'];

export function makeFillerCard(position: Position, n: number, rng: Rng): Card {
  const levelMin = rng.int(48, 56);
  return {
    id: `fill-${position}-${n}`,
    name: `${rng.pick(FILLER_NAMES)} ${n}`,
    position,
    club: 'Sem clube',
    year: 2026,
    levelMin,
    levelMax: levelMin + rng.int(6, 10),
    tier: 'perna',
    hint: 'Completou o elenco quando não sobrou mais ninguém.',
  };
}
