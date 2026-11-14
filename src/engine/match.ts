import { Rng } from './rng.js';
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

/** Lances de bola parada. */
export type SetPiece = 'penalti' | 'falta' | 'escanteio';
export const SET_PIECES: readonly SetPiece[] = ['penalti', 'falta', 'escanteio'];

/** Papéis que o técnico distribui no time: os batedores de bola parada e o capitão. */
export type TeamRole = SetPiece | 'capitao';
export const TEAM_ROLES: readonly TeamRole[] = [...SET_PIECES, 'capitao'];

/**
 * Quem bate cada bola parada e quem é o capitão (id da carta). Sem escolha, o jogo usa o mais indicado do elenco.
 * O capitão usa a braçadeira (aparece com o “C” no campinho); não muda o resultado dos jogos.
 */
export type SetPieceTakers = Partial<Record<TeamRole, string>>;

/**
 * Lances narrados. `gol`, `trave`, `defesa` e `chance` (para fora) são o desfecho de uma finalização —
 * com `setPiece`, ela nasceu de um pênalti, de uma falta na entrada da área ou de um escanteio.
 * `bloqueio`: a bola para na barreira (falta) ou a zaga afasta (escanteio). `impedimento`: ataque anulado.
 * `expulsao`: cartão vermelho (`side` é o time que perde o jogador, `cardId` o expulso).
 */
export type MatchEventType = 'apito' | 'gol' | 'trave' | 'defesa' | 'chance' | 'bloqueio' | 'impedimento' | 'expulsao' | 'fim' | 'penaltis';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  side: 'home' | 'away' | null;
  /** Quem finaliza (no pênalti e na falta, o batedor). */
  cardId?: string;
  /** Lance de bola parada que originou a jogada. */
  setPiece?: SetPiece;
  /** Escanteio: quem cobrou. */
  takerId?: string;
  text: string;
}

export interface Goal {
  side: 'home' | 'away';
  cardId: string;
  name: string;
  minute: number;
  /** Gol de bola parada: pênalti, falta direta ou escanteio (cabeçada depois da cobrança). */
  kind?: SetPiece;
  /** Quem deu o passe (nem todo gol tem assistência). */
  assistCardId?: string;
  assistName?: string;
}

/** Cartão vermelho: o jogador sai e o time joga com um a menos até o fim. */
export interface RedCard {
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
  /** Expulsões do jogo (raras; ausente quando não houve). */
  redCards?: RedCard[];
  penalties?: { home: number; away: number };
  events?: MatchEvent[];
}

export interface SimulateParams {
  id: string;
  home: TeamSheet;
  away: TeamSheet;
  homeTactic?: Tactic;
  awayTactic?: Tactic;
  /** Batedores escolhidos pelos técnicos (o que faltar, o jogo escolhe). */
  homeTakers?: SetPieceTakers;
  awayTakers?: SetPieceTakers;
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

/** Peso de cada posição para dar o passe do gol: meias e laterais servem mais. */
const ASSIST_WEIGHT: Record<Position, number> = { MEI: 5, ATA: 3, LAT: 3, ZAG: 0.8, GOL: 0.15 };
/** Parte dos gols que sai com assistência, no geral (o resto é jogada individual, rebote, pênalti, falta…). */
export const ASSIST_RATE = 0.72;
/** Gols de bola rolando com assistência (pênalti e falta direta não têm; escanteio é sempre de quem cobrou). */
const OPEN_PLAY_ASSIST_RATE = 0.88;

// ---------------------------------------------------------------------------
// Bola parada
// ---------------------------------------------------------------------------

/**
 * Pênaltis são raros (≈ 1 a cada 4 jogos) e quase sempre viram gol; faltas na entrada da área
 * aparecem em quase todo jogo e entram de vez em quando. As taxas são por gol esperado do time
 * (quem ataca mais sofre mais faltas perto da área).
 */
export const PENALTY_RATE = 0.09;
export const PENALTY_CONVERSION = 0.78;
export const FREE_KICK_RATE = 0.45;
export const FREE_KICK_CONVERSION = 0.3;
/** Parte dos gols de bola rolando que sai de escanteio. */
export const CORNER_GOAL_SHARE = 0.15;
/** Fatia dos gols esperados que vem de pênalti e falta (o resto é bola rolando): o total não muda. */
const SET_PIECE_SHARE = PENALTY_RATE * PENALTY_CONVERSION + FREE_KICK_RATE * FREE_KICK_CONVERSION;

/**
 * Expulsão é coisa rara: cada time tem 1,5% de chance por jogo (um vermelho a cada ~33 jogos).
 * Com um a menos, o time cria menos e sofre mais no tempo que resta.
 */
export const RED_CARD_CHANCE = 0.015;
export const RED_CARD_PENALTY = 0.3;
const RED_CARD_WEIGHT: Record<Position, number> = { ZAG: 4, LAT: 3, MEI: 3, ATA: 1.5, GOL: 0.4 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Chance de o pênalti entrar: sempre bem mais gol que erro; batedor melhor erra menos. */
export function penaltyChance(rating: number): number {
  return clamp(PENALTY_CONVERSION + (rating - 78) / 200, 0.66, 0.9);
}

/** Chance de a falta na entrada da área entrar: por volta de 30%. */
export function freeKickChance(rating: number): number {
  return clamp(FREE_KICK_CONVERSION + (rating - 78) / 250, 0.2, 0.4);
}

const TAKER_WEIGHT: Record<SetPiece, Record<Position, number>> = {
  penalti: { ATA: 1, MEI: 0.98, LAT: 0.9, ZAG: 0.88, GOL: 0.5 },
  falta: { MEI: 1, ATA: 0.97, LAT: 0.93, ZAG: 0.88, GOL: 0.5 },
  escanteio: { MEI: 1, LAT: 0.99, ATA: 0.93, ZAG: 0.85, GOL: 0.4 },
};

/** O batedor mais indicado do elenco para cada bola parada (pelo meio da faixa de nível). */
export function defaultTakers(squad: SquadPlayer[]): SetPieceTakers {
  const out: SetPieceTakers = {};
  if (squad.length === 0) return out;
  for (const kind of SET_PIECES) {
    const score = (p: SquadPlayer) => ((p.levelMin + p.levelMax) / 2) * TAKER_WEIGHT[kind][p.position];
    out[kind] = squad.reduce((a, b) => (score(b) > score(a) ? b : a)).cardId;
  }
  // Capitão: o melhor do elenco, em qualquer posição.
  const level = (p: SquadPlayer) => (p.levelMin + p.levelMax) / 2;
  out.capitao = squad.reduce((a, b) => (level(b) > level(a) ? b : a)).cardId;
  return out;
}

/** Batedores valendo: a escolha do técnico, se o jogador está no elenco; senão, o mais indicado. */
export function resolveTakers(squad: SquadPlayer[], chosen?: SetPieceTakers): SetPieceTakers {
  const out = defaultTakers(squad);
  for (const kind of TEAM_ROLES) {
    const id = chosen?.[kind];
    if (id && squad.some((p) => p.cardId === id)) out[kind] = id;
  }
  return out;
}

/**
 * Assistências dos gols. Usam um sorteio próprio, derivado do jogo, para não mexer na sequência
 * do sorteio principal: o mesmo jogo continua com o mesmo placar e os mesmos goleadores.
 */
function assignAssists(
  id: string,
  home: TeamSheet,
  away: TeamSheet,
  goals: Goal[],
  h: Map<string, number>,
  a: Map<string, number>,
  corner: { home?: string; away?: string },
  reds: RedCard[],
) {
  if (goals.length === 0) return;
  const rng = new Rng(`${id}|${home.teamId}|${away.teamId}|passes|${goals.map((g) => `${g.minute}${g.cardId}`).join(',')}`);
  for (const g of goals) {
    // Pênalti e falta direta: gol de quem bateu, sem passe.
    if (g.kind === 'penalti' || g.kind === 'falta') continue;
    const team = g.side === 'home' ? home : away;
    // Quem já foi expulso não dá passe.
    const onPitch = (p: SquadPlayer) => !reds.some((r) => r.side === g.side && r.cardId === p.cardId && g.minute >= r.minute);
    if (g.kind === 'escanteio') {
      const taker = team.squad.find((p) => p.cardId === corner[g.side] && p.cardId !== g.cardId && onPitch(p));
      if (taker) {
        g.assistCardId = taker.cardId;
        g.assistName = taker.name;
      }
      continue;
    }
    if (rng.next() >= OPEN_PLAY_ASSIST_RATE) continue;
    const ratings = g.side === 'home' ? h : a;
    const mates = team.squad.filter((p) => p.cardId !== g.cardId && onPitch(p));
    if (mates.length === 0) continue;
    const p = rng.weighted(mates, (m) => ASSIST_WEIGHT[m.position] * Math.pow((ratings.get(m.cardId) ?? 60) / 80, 2));
    g.assistCardId = p.cardId;
    g.assistName = p.name;
  }
}

const GOAL_TEXT = [
  '{p} recebe na entrada da área e bate firme no canto!',
  'Tabela rápida pelo meio e {p} toca na saída do goleiro!',
  'Contra-ataque rápido e {p} toca na saída do goleiro!',
  '{p} arrisca de longe… e acerta o ângulo!',
  'Bate-rebate na área e {p} empurra para dentro!',
];
const POST_TEXT = ['{p} solta a bomba e a bola explode na trave!', '{p} tenta por cobertura e acerta o travessão!'];
const SAVE_TEXT = ['{p} cara a cara… e o goleiro salva com o pé!', 'Que defesa! {p} já comemorava.'];
const CHANCE_TEXT = ['{p} invade a área, mas finaliza para fora.', '{p} bate cruzado e a bola passa raspando a trave.'];
const RED_TEXT = ['Entrada dura de {p}: cartão vermelho direto! O time fica com um a menos.', '{p} para o contra-ataque com falta por trás e é expulso!'];
const OFFSIDE_TEXT = ['{p} recebe em profundidade, mas o bandeirinha marca impedimento.', 'Lançamento para {p}… impedido!'];

const PENALTY_TEXT: Record<'gol' | 'defesa' | 'trave' | 'chance', string[]> = {
  gol: ['Pênalti! {p} bate com categoria: bola de um lado, goleiro do outro!', 'Pênalti! {p} enche o pé no meio do gol — rede!'],
  defesa: ['Pênalti! {p} bate no canto… e o goleiro voa para pegar!', 'Pênalti! {p} bate fraco e o goleiro defende!'],
  trave: ['Pênalti! {p} capricha demais e acerta a trave!'],
  chance: ['Pênalti! {p} isola por cima do gol!'],
};
const FREE_KICK_TEXT: Record<'gol' | 'defesa' | 'trave' | 'chance' | 'bloqueio', string[]> = {
  gol: ['Falta na entrada da área: {p} cobra por cima da barreira, no ângulo!', 'Falta perigosa… {p} bate colocado e o goleiro nem vai!'],
  defesa: ['Falta na entrada da área: {p} bate bem e o goleiro espalma!', 'Falta frontal: {p} cobra no canto, o goleiro busca.'],
  trave: ['Falta na entrada da área: {p} carimba o travessão!'],
  chance: ['Falta na entrada da área: {p} cobra por cima do gol.'],
  bloqueio: ['Falta na entrada da área: {p} bate na barreira.'],
};
const CORNER_TEXT: Record<'gol' | 'defesa' | 'chance' | 'bloqueio', string[]> = {
  gol: ['Escanteio de {t}… {p} sobe mais que todo mundo e cabeceia para a rede!', 'Escanteio fechado de {t} e {p} desvia de cabeça: gol!'],
  defesa: ['Escanteio de {t}: {p} cabeceia firme e o goleiro faz a defesa.'],
  chance: ['Escanteio de {t}: {p} cabeceia por cima do gol.'],
  bloqueio: ['Escanteio de {t} e a zaga afasta de cabeça.', 'Escanteio de {t}: a defesa corta antes de {p}.'],
};

function fill(template: string, name: string, taker = ''): string {
  return template.replace('{p}', name).replace('{t}', taker);
}

/**
 * Média de gols de um lado (Poisson). Calibrada para placares de futebol de verdade: ~2,8 gols por jogo
 * entre times iguais; 10 pontos de diferença em todos os setores dão ≈ 2,2 × 0,75 (antes davam 3,9 × 0,4,
 * e um time forte fazia +140 de saldo numa liga). Cada ponto de ataque acima da defesa rival vale ~3,6% de gols.
 */
export const GOAL_BASE = 1.28;
export const ATTACK_SCALE = 28;
export const MIDFIELD_SCALE = 56;

export function expectedGoals(attack: number, defense: number, midDiff: number, homeBoost: number, bothAttack: number): number {
  const lambda = GOAL_BASE * Math.exp((attack - defense) / ATTACK_SCALE + midDiff / MIDFIELD_SCALE + homeBoost) * (1 + bothAttack);
  return Math.min(4.5, Math.max(0.15, lambda));
}

export function simulateMatch(params: SimulateParams): MatchResult {
  const { rng, home, away } = params;
  const homeTactic = params.homeTactic ?? 'equilibrio';
  const awayTactic = params.awayTactic ?? 'equilibrio';
  const h = rateTeam(home, rng, homeTactic);
  const a = rateTeam(away, rng, awayTactic);
  const openness = (homeTactic === 'ataque' ? 0.08 : 0) + (awayTactic === 'ataque' ? 0.08 : 0);
  const homeBoost = params.neutral ? 0 : 0.1;
  let lh = expectedGoals(h.att, a.def, h.mid - a.mid, homeBoost, openness);
  let la = expectedGoals(a.att, h.def, a.mid - h.mid, 0, openness);

  // Expulsões (raras): o time fica com um a menos no tempo que resta.
  const reds: RedCard[] = [];
  for (const [side, team] of [['home', home], ['away', away]] as const) {
    if (rng.next() >= RED_CARD_CHANCE || team.squad.length === 0) continue;
    const p = rng.weighted(team.squad, (x) => RED_CARD_WEIGHT[x.position]);
    const minute = rng.int(15, 85);
    reds.push({ side, cardId: p.cardId, name: p.name, minute });
    const left = (90 - minute) / 90;
    const down = 1 - RED_CARD_PENALTY * left;
    const up = 1 + RED_CARD_PENALTY * left;
    if (side === 'home') {
      lh *= down;
      la *= up;
    } else {
      la *= down;
      lh *= up;
    }
  }
  reds.sort((x, y) => x.minute - y.minute);
  /** O jogador ainda está em campo naquele minuto? */
  const onPitch = (side: 'home' | 'away', cardId: string, minute: number) => !reds.some((r) => r.side === side && r.cardId === cardId && minute >= r.minute);

  const sides = [
    { side: 'home' as const, team: home, ratings: h.ratings, lambda: lh, takers: resolveTakers(home.squad, params.homeTakers) },
    { side: 'away' as const, team: away, ratings: a.ratings, lambda: la, takers: resolveTakers(away.squad, params.awayTakers) },
  ];
  const goals: Goal[] = [];
  /** Pênaltis e faltas que não entraram (só aparecem na narração). */
  const missed: Array<{ side: 'home' | 'away'; kind: 'penalti' | 'falta'; minute: number; player: SquadPlayer }> = [];
  for (const s of sides) {
    const player = (id: string | undefined) => s.team.squad.find((p) => p.cardId === id);
    // Bola rolando (parte dos gols nasce de escanteio) + pênaltis + faltas: somados, dão a média de sempre.
    const open = rng.poisson(s.lambda * (1 - SET_PIECE_SHARE));
    for (let i = 0; i < open; i++) {
      const minute = rng.int(1, 90);
      let p = pickScorer(s.team, s.ratings, rng);
      const corner = rng.next() < CORNER_GOAL_SHARE;
      if ((corner && p.cardId === s.takers.escanteio) || !onPitch(s.side, p.cardId, minute)) {
        // Quem cobra o escanteio não cabeceia, e expulso não faz gol: o gol é de outro.
        const others = s.team.squad.filter((x) => x.cardId !== p.cardId && onPitch(s.side, x.cardId, minute));
        if (others.length) p = rng.weighted(others, (x) => SCORER_WEIGHT[x.position] * Math.pow((s.ratings.get(x.cardId) ?? 60) / 80, 2));
      }
      goals.push({ side: s.side, cardId: p.cardId, name: p.name, minute, ...(corner ? { kind: 'escanteio' as const } : {}) });
    }
    const setPiece = (kind: 'penalti' | 'falta', rate: number, chance: (rating: number) => number) => {
      const taker = player(s.takers[kind]);
      const n = rng.poisson(s.lambda * rate);
      for (let i = 0; i < n; i++) {
        const minute = rng.int(2, 89);
        let p = taker ?? pickScorer(s.team, s.ratings, rng);
        if (!onPitch(s.side, p.cardId, minute)) {
          // Batedor expulso: outro assume a cobrança.
          const others = s.team.squad.filter((x) => onPitch(s.side, x.cardId, minute));
          if (others.length) p = rng.weighted(others, (x) => SCORER_WEIGHT[x.position] * Math.pow((s.ratings.get(x.cardId) ?? 60) / 80, 2));
        }
        if (rng.next() < chance(s.ratings.get(p.cardId) ?? 70)) goals.push({ side: s.side, cardId: p.cardId, name: p.name, minute, kind });
        else missed.push({ side: s.side, kind, minute, player: p });
      }
    };
    setPiece('penalti', PENALTY_RATE, penaltyChance);
    setPiece('falta', FREE_KICK_RATE, freeKickChance);
  }
  goals.sort((x, y) => x.minute - y.minute);
  const homeGoals = goals.filter((g) => g.side === 'home').length;
  const awayGoals = goals.length - homeGoals;
  assignAssists(params.id, home, away, goals, h.ratings, a.ratings, { home: sides[0]!.takers.escanteio, away: sides[1]!.takers.escanteio }, reds);

  const result: MatchResult = { id: params.id, homeId: home.teamId, awayId: away.teamId, homeGoals, awayGoals, goals };
  if (reds.length) result.redCards = reds;

  if (params.needWinner && homeGoals === awayGoals) {
    result.penalties = shootout(rng, h, a);
  }

  if (params.withEvents) {
    const events: MatchEvent[] = [{ minute: 0, type: 'apito', side: null, text: 'Apita o árbitro: bola rolando!' }];
    const of = (side: 'home' | 'away') => (side === 'home' ? sides[0]! : sides[1]!);
    const nameOf = (side: 'home' | 'away', id: string | undefined) => of(side).team.squad.find((p) => p.cardId === id)?.name ?? '';
    for (const g of goals) {
      const chosen = of(g.side).takers.escanteio;
      const taker = chosen && onPitch(g.side, chosen, g.minute) ? chosen : undefined;
      const text =
        g.kind === 'penalti'
          ? fill(rng.pick(PENALTY_TEXT.gol), g.name)
          : g.kind === 'falta'
            ? fill(rng.pick(FREE_KICK_TEXT.gol), g.name)
            : g.kind === 'escanteio'
              ? fill(rng.pick(CORNER_TEXT.gol), g.name, nameOf(g.side, taker) || 'curta')
              : fill(rng.pick(GOAL_TEXT), g.name) + (g.assistName ? ` Assistência de ${g.assistName}.` : '');
      events.push({
        minute: g.minute,
        type: 'gol',
        side: g.side,
        cardId: g.cardId,
        ...(g.kind ? { setPiece: g.kind } : {}),
        ...(g.kind === 'escanteio' && taker ? { takerId: taker } : {}),
        text,
      });
    }
    for (const red of reds) {
      events.push({ minute: red.minute, type: 'expulsao', side: red.side, cardId: red.cardId, text: fill(rng.pick(RED_TEXT), red.name) });
    }
    /** Jogador disponível para um lance de enfeite naquele minuto (expulso não aparece mais). */
    const available = (side: 'home' | 'away', minute: number) => of(side).team.squad.filter((p) => onPitch(side, p.cardId, minute));
    // Pênaltis perdidos e faltas que não entraram.
    for (const m of missed) {
      if (m.kind === 'penalti') {
        const type = rng.weighted(['defesa', 'trave', 'chance'] as const, (k) => (k === 'defesa' ? 6 : k === 'trave' ? 1.5 : 2.5));
        events.push({ minute: m.minute, type, side: m.side, cardId: m.player.cardId, setPiece: 'penalti', text: fill(rng.pick(PENALTY_TEXT[type]), m.player.name) });
      } else {
        const type = rng.weighted(['defesa', 'bloqueio', 'chance', 'trave'] as const, (k) => (k === 'defesa' ? 4 : k === 'bloqueio' ? 2.5 : k === 'chance' ? 2.5 : 1));
        events.push({ minute: m.minute, type, side: m.side, cardId: m.player.cardId, setPiece: 'falta', text: fill(rng.pick(FREE_KICK_TEXT[type]), m.player.name) });
      }
    }
    const attacking = () => (rng.next() < lh / (lh + la) ? 'home' : 'away');
    // Os lances de enfeite procuram um minuto longe dos outros, para o jogo não amontoar tudo de uma vez.
    const used = [...goals.map((g) => g.minute), ...missed.map((m) => m.minute), ...reds.map((x) => x.minute)];
    const freeMinute = () => {
      let best = 45;
      let bestGap = -1;
      for (let k = 0; k < 8; k++) {
        const c = rng.int(3, 88);
        const gap = Math.min(99, ...used.map((u) => Math.abs(u - c)));
        if (gap > bestGap) {
          best = c;
          bestGap = gap;
        }
      }
      used.push(best);
      return best;
    };
    const extraPlayer = (side: 'home' | 'away', minute: number) => {
      const fit = available(side, minute);
      return fit.length ? rng.weighted(fit, (x) => SCORER_WEIGHT[x.position] * Math.pow((of(side).ratings.get(x.cardId) ?? 60) / 80, 2)) : pickScorer(of(side).team, of(side).ratings, rng);
    };
        // Escanteios que não viraram gol.
    const corners = rng.int(1, 3);
    for (let i = 0; i < corners; i++) {
      const side = attacking();
      const s = of(side);
      const minute = freeMinute();
      const fit = available(side, minute);
      const taker = fit.some((p) => p.cardId === s.takers.escanteio) ? s.takers.escanteio : undefined;
      const heads = fit.filter((p) => p.cardId !== taker && p.position !== 'GOL');
      const p = heads.length ? rng.weighted(heads, (x) => (x.position === 'ZAG' ? 4 : SCORER_WEIGHT[x.position])) : pickScorer(s.team, s.ratings, rng);
      const type = rng.weighted(['bloqueio', 'defesa', 'chance'] as const, (k) => (k === 'bloqueio' ? 4.5 : k === 'defesa' ? 2.5 : 3));
      events.push({
        minute,
        type,
        side,
        cardId: p.cardId,
        setPiece: 'escanteio',
        ...(taker ? { takerId: taker } : {}),
        text: fill(rng.pick(CORNER_TEXT[type]), p.name, nameOf(side, taker) || 'curta'),
      });
    }
    // Chances de bola rolando.
    const extras = rng.int(1, 3);
    for (let i = 0; i < extras; i++) {
      const side = attacking();
      const minute = freeMinute();
      const p = extraPlayer(side, minute);
      const kind = rng.pick(['trave', 'defesa', 'chance'] as const);
      const text = fill(rng.pick(kind === 'trave' ? POST_TEXT : kind === 'defesa' ? SAVE_TEXT : CHANCE_TEXT), p.name);
      events.push({ minute, type: kind, side, cardId: p.cardId, text });
    }
    if (rng.next() < 0.6) {
      const side = attacking();
      const minute = freeMinute();
      const p = extraPlayer(side, minute);
      events.push({ minute, type: 'impedimento', side, cardId: p.cardId, text: fill(rng.pick(OFFSIDE_TEXT), p.name) });
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
