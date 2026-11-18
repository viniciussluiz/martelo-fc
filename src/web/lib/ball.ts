import type { LineupPlayer, MatchView } from '../../shared/protocol';
import type { MatchEvent } from '../../engine/match';
import type { Position } from '../../engine/types';
import { Rng } from '../../engine/rng';

/**
 * O jogo “ao vivo” no campinho, montado a partir do jogo já simulado no servidor: os 22 jogadores
 * ficam no gramado (cada time na sua formação, subindo e recuando com a bola) e a bola passa de pé
 * em pé. Nos lances do jogo ela vai para a área: finalização, pênalti, falta na entrada da área,
 * escanteio, impedimento. Semente = id do jogo, então todo mundo na sala vê a mesma partida.
 * Coordenadas de 0 a 1 (x ao longo do campo; o mandante ataca para x = 1).
 */

export type Side = 'home' | 'away';

/** Jogador no campinho. */
export interface PitchPlayer {
  side: Side;
  /** Posição na escalação do time (0–10). */
  idx: number;
  cardId: string;
  name: string;
  position: Position;
  /** Capitão do time. */
  captain?: boolean;
  /** Lugar na formação, no sentido do próprio ataque (0 = o próprio gol, 1 = o gol atacado). */
  bx: number;
  by: number;
}

export interface Holder {
  side: Side;
  idx: number;
}

export interface Key {
  /** Minuto de jogo (fracionado). */
  t: number;
  x: number;
  y: number;
  /** A bola “reaparece” aqui (tiro de meta, saída do meio-campo, bola na marca) em vez de deslizar. */
  jump?: boolean;
  /** O trecho que termina aqui é um chute (rasteiro e rápido, com rastro destacado). */
  shot?: boolean;
  /** Jogador que está com a bola neste ponto. */
  holder?: Holder;
}

/** Jogador fora do lugar da formação por um tempo (batedor na bola, barreira, quem vai finalizar…). */
interface Override {
  side: Side;
  idx: number;
  from: number;
  to: number;
  /** Tempo para chegar (antes de `from`) e para voltar (depois de `to`). */
  lead: number;
  tail: number;
  x: number;
  y: number;
}

export interface Banner {
  from: number;
  to: number;
  text: string;
}

export interface MatchTimeline {
  keys: Key[];
  /** Minuto em que cada evento acontece na tela (alinhado com `match.events`). */
  moments: number[];
  /** Minutos em que a bola entra no gol, por lado, e quando sai de novo do meio-campo. */
  goals: Array<{ t: number; side: Side; until: number }>;
  /** Quantos minutos de jogo o “GOL!” fica na tela. */
  goalShow: number;
  /** Os 22 jogadores (11 do mandante, depois 11 do visitante). */
  players: PitchPlayer[];
  /** Avisos de bola parada (“Pênalti!”, “Falta!”, “Escanteio!”, “Impedimento!”). */
  banners: Banner[];
  /** Para onde os times se deslocam ao longo do jogo. */
  focus: Array<{ t: number; x: number; y: number }>;
  overrides: Override[];
  /** Cartões vermelhos: quando aparecem na tela. */
  cards: Array<{ t: number; side: Side; cardId: string }>;
  /** Expulsos: a partir de `t` o jogador não está mais no gramado. */
  sentOff: Array<{ side: Side; idx: number; t: number }>;
  /** Minutos de jogo por segundo de tela. */
  minutesPerSecond: number;
}

const PLAY_TYPES = new Set<MatchEvent['type']>(['gol', 'trave', 'defesa', 'chance', 'bloqueio', 'impedimento', 'expulsao']);

/** Ritmo padrão: 90 minutos em 34 s de tela (rodada de 40 s). */
export const DEFAULT_MINUTES_PER_SECOND = 90 / 34;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const PENALTY_SPOT = 1 - 11 / 105;
/** Distância da bola ao centro do jogador que a domina (fração do comprimento do campo). */
const FOOT = 0.011;

/** Escalação genérica (4-4-2 sem nomes) para jogos que chegam sem as escalações. */
const GENERIC: Position[] = ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'MEI', 'ATA', 'ATA'];

const LINE_X: Record<Position, number> = { GOL: 0.05, ZAG: 0.2, LAT: 0.27, MEI: 0.47, ATA: 0.68 };

/** Espalha `n` jogadores de uma linha pela largura do campo. */
function spread(position: Position, n: number): number[] {
  if (n <= 1) return [0.5];
  if (position === 'LAT') return Array.from({ length: n }, (_, i) => 0.1 + (0.8 * i) / (n - 1));
  const gap = position === 'ZAG' ? 0.22 : position === 'ATA' ? (n === 2 ? 0.26 : 0.3) : n >= 4 ? 0.22 : 0.25;
  const lo = clamp(0.5 - (gap * (n - 1)) / 2, 0.1, 0.5);
  return Array.from({ length: n }, (_, i) => lo + ((1 - 2 * lo) * i) / (n - 1));
}

/** Coloca os jogadores de um time na formação (pela posição de cada um). */
export function layoutTeam(side: Side, lineup: LineupPlayer[]): PitchPlayer[] {
  const out: PitchPlayer[] = [];
  const count: Partial<Record<Position, number>> = {};
  for (const p of lineup) count[p.position] = (count[p.position] ?? 0) + 1;
  const seen: Partial<Record<Position, number>> = {};
  lineup.forEach((p, idx) => {
    const n = count[p.position]!;
    const k = seen[p.position] ?? 0;
    seen[p.position] = k + 1;
    const by = spread(p.position, n)[k]!;
    // Centroavante um pouco à frente dos pontas; goleiro reserva (não deveria existir) fica no gol.
    const bx = LINE_X[p.position] + (p.position === 'ATA' && n >= 3 && k === Math.floor(n / 2) ? 0.04 : 0);
    out.push({ side, idx, cardId: p.cardId, name: p.name, position: p.position, bx, by, ...(p.captain ? { captain: true } : {}) });
  });
  return out;
}

function lineupsOf(match: MatchView): PitchPlayer[] {
  const generic = (tag: string): LineupPlayer[] => GENERIC.map((position, i) => ({ cardId: `${tag}${i}`, name: '', position }));
  const home = match.lineups?.home.length ? match.lineups.home : generic('h');
  const away = match.lineups?.away.length ? match.lineups.away : generic('a');
  return [...layoutTeam('home', home), ...layoutTeam('away', away)];
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function focusAt(focus: MatchTimeline['focus'], t: number): { x: number; y: number } {
  const first = focus[0];
  if (!first) return { x: 0.5, y: 0.5 };
  if (t <= first.t) return first;
  for (let i = 1; i < focus.length; i++) {
    const b = focus[i]!;
    if (t < b.t) {
      const a = focus[i - 1]!;
      const u = smooth((t - a.t) / (b.t - a.t));
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  return focus[focus.length - 1]!;
}

type Shape = Pick<MatchTimeline, 'focus' | 'overrides' | 'minutesPerSecond'>;

/** Onde o jogador está no minuto `t`: o lugar na formação, deslocado com o jogo, mais os desvios dos lances. */
export function playerAt(tl: Shape, p: PitchPlayer, t: number): { x: number; y: number } {
  const f = focusAt(tl.focus, t);
  // No sentido do próprio ataque.
  const fx = p.side === 'home' ? f.x : 1 - f.x;
  const fy = p.side === 'home' ? f.y : 1 - f.y;
  const keeper = p.position === 'GOL';
  const secs = t / tl.minutesPerSecond;
  let x = p.bx + (fx - 0.5) * (keeper ? 0.1 : 0.55) + 0.008 * Math.sin(secs * 0.9 + p.idx * 1.7 + (p.side === 'home' ? 0 : 2.1));
  let y = p.by + (fy - 0.5) * (keeper ? 0.12 : 0.28) + 0.012 * Math.sin(secs * 0.7 + p.idx * 2.3 + (p.side === 'home' ? 1.3 : 0.4));
  x = keeper ? clamp(x, 0.02, 0.16) : clamp(x, 0.07, 0.93);
  y = clamp(y, 0.04, 0.96);
  if (p.side === 'away') {
    x = 1 - x;
    y = 1 - y;
  }
  for (const o of tl.overrides) {
    if (o.side !== p.side || o.idx !== p.idx) continue;
    if (t <= o.from - o.lead || t >= o.to + o.tail) continue;
    const w = t < o.from ? smooth((t - (o.from - o.lead)) / o.lead) : t > o.to ? 1 - smooth((t - o.to) / o.tail) : 1;
    x += (o.x - x) * w;
    y += (o.y - y) * w;
  }
  return { x, y };
}

/** Posição dos 22 jogadores no minuto `t`, na ordem de `timeline.players`. */
export function playersAt(tl: MatchTimeline, t: number): Array<{ x: number; y: number }> {
  return tl.players.map((p) => playerAt(tl, p, t));
}

/** Aviso de bola parada que está na tela no minuto `t`. */
export function bannerAt(tl: MatchTimeline, t: number): Banner | null {
  return tl.banners.find((b) => t >= b.from && t < b.to) ?? null;
}

/** Quem está com a bola no minuto `t` (ninguém quando ela já saiu, entrou no gol ou espera uma cobrança). */
export function holderAt(keys: Key[], t: number): Holder | null {
  let last: Holder | null = null;
  for (const k of keys) {
    if (k.t > t) break;
    last = k.holder ?? null;
  }
  return last;
}

interface Play {
  /** Índice em `events`. */
  i: number;
  e: MatchEvent;
  /** Minutos de jogo antes e depois do instante do lance. */
  pre: number;
  post: number;
  /**
   * Bola parada: tempo, antes de `pre`, para a jogada que leva a ela (o ataque chega, a zaga desvia
   * para escanteio, o atacante sofre a falta) — a cobrança nunca aparece “do nada” do outro lado.
   */
  lead: number;
  /** Instante do lance na tela. */
  m: number;
}

/**
 * @param minutesPerSecond minutos de jogo por segundo de tela — as durações dos lances são
 *   pensadas em segundos (a comemoração do gol dura ~1,3 s qualquer que seja o ritmo).
 */
export function buildTimeline(match: MatchView, minutesPerSecond = DEFAULT_MINUTES_PER_SECOND): MatchTimeline {
  const rng = new Rng(`bola:${match.id}`);
  const r = (a: number, b: number) => a + rng.next() * (b - a);
  const players = lineupsOf(match);
  /** Expulsos até aqui: não participam mais das jogadas. */
  const gone = new Set<PitchPlayer>();
  const team = (side: Side) => players.filter((p) => p.side === side && !gone.has(p));
  const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');
  // Sem narração (jogo sem técnico humano), os gols bastam.
  const events: MatchEvent[] =
    match.events ??
    [
      ...match.goals.map((g) => ({ minute: g.minute, type: 'gol' as const, side: g.side, cardId: g.cardId, ...(g.kind ? { setPiece: g.kind } : {}), text: '' })),
      ...(match.redCards ?? []).map((c) => ({ minute: c.minute, type: 'expulsao' as const, side: c.side, cardId: c.cardId, text: '' })),
    ].sort((x, y) => x.minute - y.minute);
  const moments = events.map((e) => e.minute);

  // ---- Agenda dos lances: cada um precisa de um tempo antes (armar a jogada) e depois (comemorar, repor). ----
  const base = (n: number) => n * minutesPerSecond;
  const plays: Play[] = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => PLAY_TYPES.has(e.type) && e.side)
    .map(({ e, i }) => {
      const pre = e.type === 'impedimento' || e.type === 'expulsao' ? 1 : e.setPiece === 'penalti' ? 2.1 : e.setPiece === 'falta' ? 1.9 : e.setPiece === 'escanteio' ? 1.8 : 1.4;
      const post = e.type === 'gol' ? 1.7 : e.type === 'expulsao' ? 1.5 : e.type === 'impedimento' ? 0.9 : e.type === 'trave' || e.type === 'bloqueio' ? 0.7 : 1;
      const lead = e.type !== 'impedimento' && e.type !== 'expulsao' && e.setPiece ? 1.5 : 0;
      return { i, e, pre: base(pre), post: base(post), lead: base(lead), m: e.minute };
    });
  const GAP = base(0.3);
  const END = 89.4;
  const needed = plays.reduce((n, p) => n + p.lead + p.pre + p.post + GAP, 0);
  // Muitos lances para pouco tempo de tela (turbo): tudo encolhe por igual.
  const scale = needed > END - 0.6 ? (END - 0.6) / needed : 1;
  const sec = (n: number) => base(n) * scale;
  let end = 0.3;
  for (const p of plays) {
    p.pre *= scale;
    p.post *= scale;
    p.lead *= scale;
    p.m = Math.max(p.e.minute, end + GAP * scale + p.lead + p.pre);
    end = p.m + p.post;
  }
  // Lances amontoados no fim do jogo: recuam para caber antes do apito.
  let limit = END;
  for (let k = plays.length - 1; k >= 0; k--) {
    const p = plays[k]!;
    if (p.m + p.post > limit) p.m = limit - p.post;
    limit = p.m - p.pre - p.lead - GAP * scale;
  }

  // ---- Estado da montagem ----
  const tl: MatchTimeline = {
    keys: [{ t: 0, x: 0.5, y: 0.5 }],
    moments,
    goals: [],
    goalShow: sec(1.3),
    players,
    banners: [],
    focus: [{ t: 0, x: 0.5, y: 0.5 }],
    overrides: [],
    cards: [],
    sentOff: [],
    minutesPerSecond,
  };
  const keys = tl.keys;
  let poss: Side = rng.next() < 0.5 ? 'home' : 'away';
  let cursor = 0;
  const lastT = () => keys[keys.length - 1]!.t;
  const stamp = (t: number) => Math.max(t, lastT() + sec(0.12));
  const focusTo = (t: number, x: number, y: number) => {
    const last = tl.focus[tl.focus.length - 1]!;
    tl.focus.push({ t: Math.max(t, last.t + 1e-3), x: clamp(x, 0.12, 0.88), y: clamp(y, 0.1, 0.9) });
  };
  /** Bola num ponto do campo (chute, marca do pênalti, rede…). */
  const point = (t: number, x: number, y: number, extra: Partial<Key> = {}) => {
    const k: Key = { t: stamp(t), x, y, ...extra };
    keys.push(k);
    return k.t;
  };
  /** Bola no pé de um jogador. */
  const toPlayer = (t: number, p: PitchPlayer, extra: Partial<Key> = {}) => {
    const at = stamp(t);
    const pos = playerAt(tl, p, at);
    // No pé: um passo à frente do jogador (no sentido do ataque dele), para a bola não esconder o boneco.
    keys.push({ t: at, x: pos.x + (p.side === 'home' ? FOOT : -FOOT), y: pos.y + FOOT * 0.9, holder: { side: p.side, idx: p.idx }, ...extra });
    return at;
  };
  /** Tira um jogador da formação entre `from` e `to` (o caminho de ida nunca começa antes da última bola). */
  const move = (p: PitchPlayer, from: number, to: number, x: number, y: number, lead = sec(0.9), tail = sec(1.1)) => {
    tl.overrides.push({ side: p.side, idx: p.idx, from, to, lead: Math.max(sec(0.15), Math.min(lead, from - lastT())), tail, x, y });
  };
  const nearest = (side: Side, t: number, x: number, y: number, skip: (p: PitchPlayer) => boolean = () => false): PitchPlayer => {
    const dist = (p: PitchPlayer) => {
      const pos = playerAt(tl, p, t);
      return Math.hypot((pos.x - x) * 105, (pos.y - y) * 68);
    };
    const pool = team(side).filter((p) => !skip(p));
    const list = (pool.length ? pool : team(side)).map((p) => ({ p, d: dist(p) })).sort((a, b) => a.d - b.d);
    return list[0]!.p;
  };
  const byCard = (side: Side, cardId: string | undefined) => team(side).find((p) => p.cardId === cardId);
  const keeperOf = (side: Side) => team(side).find((p) => p.position === 'GOL') ?? team(side)[0]!;
  const isKeeper = (p: PitchPlayer) => p.position === 'GOL';

  /** Finalizações “soltas” (fora da narração) que a troca de passes pode render por jogo. */
  const MAX_LOOSE_SHOTS = 4;
  let looseShots = 0;
  /**
   * Troca de passes até `until`: a bola anda de pé em pé, com desarmes e viradas de jogo.
   * Com `toward`, o fim do trecho prepara o próximo lance: esse time recupera a bola e sobe ao ataque
   * (sem perder a posse), para o lance nascer de onde o jogo está, e não do outro lado do campo.
   */
  const wander = (until: number, toward?: Side) => {
    let t = cursor;
    let holder = holderAt(keys, t);
    for (;;) {
      t += r(sec(0.45), sec(0.8));
      if (t >= until - sec(0.1)) break;
      const f = tl.focus[tl.focus.length - 1]!;
      const closing = !!toward && t >= until - sec(2.6);
      if (closing) poss = toward!;
      const dir = poss === 'home' ? 1 : -1;
      const long = !closing && rng.next() < 0.18;
      let fx = clamp(f.x + dir * (closing ? r(0.07, 0.17) : long ? r(0.12, 0.26) : r(-0.05, 0.12)), 0.2, closing ? 0.74 : 0.8);
      if (closing) fx = dir > 0 ? Math.max(fx, 0.26) : Math.min(fx, 0.74);
      const fy = clamp(long ? r(0.15, 0.85) : f.y + r(-0.22, 0.22), 0.14, 0.86);
      // Desarme: mais provável quando o ataque já está no campo do adversário.
      const deep = dir * (fx - 0.5) > 0.18;
      if (!closing && rng.next() < (deep ? 0.5 : 0.16)) {
        poss = other(poss);
        fx = clamp(fx - dir * 0.05, 0.2, 0.8);
      }
      focusTo(t, fx, fy);
      const prev = holder;
      const carry = rng.next() < 0.2;
      // Na cara do gol ninguém toca para trás: ou há tempo para finalizar (chute para fora ou travado
      // pela zaga — lances sem importância, fora da narração), ou a bola nem chega lá.
      const attack = poss;
      // (a posse pode ter acabado de trocar: o sentido é o de quem está com a bola agora)
      const fwd = attack === 'home' ? 1 : -1;
      const facingGoal = (p: PitchPlayer) => {
        const pos = playerAt(tl, p, t);
        return fwd * (pos.x - 0.5) > 0.3 && Math.abs(pos.y - 0.5) < 0.27;
      };
      const canShoot = !closing && looseShots < MAX_LOOSE_SHOTS && until - t > sec(2.4);
      const next = nearest(
        attack,
        t,
        fx,
        fy,
        (p) => isKeeper(p) || (!carry && !!prev && prev.side === p.side && prev.idx === p.idx) || (!canShoot && facingGoal(p)),
      );
      toPlayer(t, next);
      holder = { side: next.side, idx: next.idx };
      if (canShoot && facingGoal(next)) {
        looseShots++;
        const defending = other(attack);
        const goalX = attack === 'home' ? 1 : 0;
        const toGoal = (f: number) => (attack === 'home' ? f : 1 - f);
        const from = playerAt(tl, next, t);
        const shotAt = t + sec(0.5);
        const keeper = keeperOf(defending);
        if (rng.next() < 0.62) {
          // Para fora: tiro de meta.
          const wide = from.y < 0.5 ? r(0.6, 0.78) : r(0.22, 0.4);
          const gone = point(shotAt, goalX + fwd * 0.03, rng.next() < 0.7 ? wide : 1 - wide, { shot: true });
          point(gone + sec(0.55), toGoal(0.95), 0.5, { jump: true, holder: { side: defending, idx: keeper.idx } });
        } else {
          // Travado: um zagueiro se joga na frente e fica com a bola.
          const bx = from.x + (goalX - from.x) * 0.3;
          const by = from.y + (0.5 - from.y) * 0.3;
          const blocker = nearest(defending, t, bx, by, isKeeper);
          move(blocker, shotAt - sec(0.1), shotAt + sec(0.3), bx, by, sec(0.4), sec(0.8));
          point(shotAt, bx, by, { shot: true, holder: { side: defending, idx: blocker.idx } });
        }
        // A defesa sai jogando.
        const outY = r(0.2, 0.8);
        const restart = lastT() + sec(0.75);
        focusTo(restart, toGoal(0.62), outY);
        toPlayer(restart, nearest(defending, restart, toGoal(0.68), outY, isKeeper));
        poss = defending;
        const got = keys[keys.length - 1]!.holder;
        holder = got ?? null;
        t = lastT();
      }
    }
    cursor = lastT();
  };

  for (const play of plays) {
    const { e, m, pre, post } = play;
    const side = e.side as Side;
    const def = other(side);
    // Fração do caminho até o gol atacado (mandante ataca o gol da direita).
    const at = (f: number) => (side === 'home' ? f : 1 - f);
    const lineX = side === 'home' ? 1 : 0;
    const out = side === 'home' ? 1 : -1;
    const start = m - pre;
    const keeper = keeperOf(def);
    const shooter = byCard(side, e.cardId) ?? team(side).filter((p) => p.position === 'ATA')[0] ?? team(side)[team(side).length - 1]!;
    const lead = play.lead;
    wander(start - lead, side);
    poss = side;
    moments[play.i] = m;

    /**
     * Jogada que leva à bola parada, entre `start - lead` e `start`: um passe de quem ataca rumo ao
     * ponto (tx, ty) e a bola chega a `target` ali. Devolve o instante em que ele domina.
     */
    const arrive = (target: PitchPlayer, tx: number, ty: number): number => {
      const f = tl.focus[tl.focus.length - 1]!;
      const s0 = start - lead;
      const mid = s0 + lead * 0.28;
      const mx = f.x + (tx - f.x) * 0.55;
      const my = f.y + (ty - f.y) * 0.5;
      focusTo(mid, mx, my);
      // O passe do meio não vai para quem já está na cara do gol (ele não tocaria para trás).
      const inFront = (p: PitchPlayer) => {
        const pos = playerAt(tl, p, mid);
        return out * (pos.x - 0.5) > 0.3 && Math.abs(pos.y - 0.5) < 0.27;
      };
      toPlayer(mid, nearest(side, mid, mx, my, (p) => isKeeper(p) || p === target || inFront(p)));
      const recv = start - lead * 0.42;
      focusTo(recv, clamp(tx - out * 0.08, 0.2, 0.8), ty);
      move(target, recv, start, tx, ty, lead * 0.3, sec(0.9));
      return toPlayer(recv, target);
    };
    const hasLead = lead > sec(0.45);

    /** Desfecho de uma finalização que chega ao gol no instante `m`. */
    const finish = (kind: MatchEvent['type']) => {
      if (kind === 'gol') {
        const t = point(m, lineX + out * 0.03, r(0.455, 0.545), { shot: true });
        const net = keys[keys.length - 1]!;
        point(t + post * 0.55, net.x, net.y);
        cursor = point(t + post * 0.92, 0.5, 0.5, { jump: true });
        focusTo(cursor, 0.5, 0.5);
        tl.goals.push({ t, side, until: cursor });
        poss = def;
      } else if (kind === 'trave') {
        const t = point(m, lineX - out * 0.004, rng.next() < 0.5 ? 0.445 : 0.555, { shot: true });
        const y = r(0.2, 0.8);
        focusTo(t + post, at(0.7), y);
        cursor = toPlayer(t + post, nearest(def, t + post, at(0.8), y, isKeeper));
        poss = def;
      } else if (kind === 'defesa') {
        const y = r(0.46, 0.54);
        move(keeper, m - sec(0.25), m + post * 0.5, at(0.975), y, sec(0.25), sec(0.6));
        const t = point(m, at(0.972), y, { shot: true, holder: { side: def, idx: keeper.idx } });
        const hold = keys[keys.length - 1]!;
        point(t + post * 0.45, hold.x, hold.y, { holder: { side: def, idx: keeper.idx } });
        const fy = r(0.2, 0.8);
        focusTo(t + post, at(0.62), fy);
        cursor = toPlayer(t + post, nearest(def, t + post, at(0.7), fy, isKeeper));
        poss = def;
      } else {
        // Para fora: tiro de meta.
        const t = point(m, lineX + out * 0.03, rng.next() < 0.5 ? r(0.2, 0.38) : r(0.62, 0.8), { shot: true });
        point(t + post * 0.4, at(0.95), 0.5, { jump: true, holder: { side: def, idx: keeper.idx } });
        const fy = r(0.2, 0.8);
        focusTo(t + post, at(0.6), fy);
        cursor = toPlayer(t + post, nearest(def, t + post, at(0.66), fy, isKeeper));
        poss = def;
      }
    };

    if (e.type === 'expulsao') {
      // Falta dura no meio-campo: cartão vermelho, o jogador sai e o time segue com um a menos.
      const culprit = shooter;
      const fx = clamp(0.5 - out * r(0.03, 0.2), 0.25, 0.75);
      const fy = r(0.25, 0.75);
      focusTo(start, fx, fy);
      const victim = nearest(def, start, fx, fy, isKeeper);
      toPlayer(start, victim);
      focusTo(m, fx, fy);
      const spot = playerAt(tl, victim, m);
      move(culprit, m - sec(0.1), m + post * 0.4, spot.x - out * 0.012, spot.y + 0.015, pre * 0.8, sec(0.2));
      const t = toPlayer(m, victim);
      tl.banners.push({ from: t, to: t + post * 0.95, text: 'Cartão vermelho!' });
      tl.cards.push({ t, side, cardId: culprit.cardId });
      // Sai pela lateral mais próxima e não volta.
      const leave = t + post * 0.9;
      tl.overrides.push({ side, idx: culprit.idx, from: leave, to: 1e6, lead: post * 0.5, tail: 1, x: spot.x, y: spot.y < 0.5 ? -0.05 : 1.05 });
      tl.sentOff.push({ side, idx: culprit.idx, t: leave });
      gone.add(culprit);
      cursor = toPlayer(t + post, victim);
      poss = def;
      moments[play.i] = t;
      continue;
    }

    if (e.type === 'impedimento') {
      // Lançamento em profundidade, bandeira levantada, falta para a defesa.
      const passer = nearest(side, start, at(0.55), 0.5, (p) => isKeeper(p) || p === shooter);
      focusTo(start, at(0.6), r(0.3, 0.7));
      toPlayer(start, passer);
      const y = r(0.25, 0.75);
      move(shooter, m, m + post * 0.5, at(0.87), y, pre * 0.7, sec(0.8));
      const t = toPlayer(m, shooter);
      tl.banners.push({ from: t, to: t + post * 0.9, text: 'Impedimento!' });
      point(t + post * 0.5, at(0.84), y, { jump: true });
      focusTo(t + post, at(0.62), r(0.3, 0.7));
      cursor = toPlayer(t + post, nearest(def, t + post, at(0.66), 0.5, isKeeper));
      poss = def;
      continue;
    }

    if (e.setPiece === 'penalti') {
      const spot = at(PENALTY_SPOT);
      if (hasLead) {
        // O atacante recebe dentro da área e é derrubado pelo marcador.
        const bx = at(r(0.88, 0.93));
        const by = r(0.36, 0.64);
        const victim = nearest(side, start - lead, bx, by, isKeeper);
        const got = arrive(victim, bx, by);
        const fouler = nearest(def, got, bx, by, isKeeper);
        move(fouler, start - lead * 0.12, start + pre * 0.2, bx + out * 0.012, by + 0.014, lead * 0.28, sec(0.8));
        point(start - lead * 0.04, bx + out * 0.006, by, { holder: { side, idx: victim.idx } });
      }
      tl.banners.push({ from: start, to: m - pre * 0.12, text: 'Pênalti!' });
      // Times fora da área, goleiro na linha, batedor na bola.
      focusTo(start + pre * 0.3, at(0.68), 0.5);
      focusTo(m, at(0.68), 0.5);
      const placed = point(start + pre * 0.22, spot, 0.5, { jump: true });
      move(keeper, placed, m - sec(0.2), at(0.992), 0.5, sec(0.4), sec(0.3));
      move(shooter, placed + pre * 0.2, m + sec(0.2), spot - out * 0.03, 0.5, pre * 0.3, sec(1));
      // Só o batedor e o goleiro na área: quem estaria lá dentro espera na risca.
      for (const p of players) {
        if (p === shooter || p === keeper) continue;
        const pos = playerAt(tl, p, m);
        if (out * (pos.x - at(0.8)) <= 0 || Math.abs(pos.y - 0.5) > 0.34) continue;
        const y = Math.abs(pos.y - 0.5) < 0.15 ? 0.5 + (pos.y < 0.5 ? -1 : 1) * (0.15 + Math.abs(pos.y - 0.5) * 0.6) : pos.y;
        move(p, placed + pre * 0.2, m, at(0.8) - out * (p.idx % 3) * 0.012, y, pre * 0.3, sec(0.8));
      }
      point(m - sec(0.34), spot, 0.5, { holder: { side, idx: shooter.idx } });
      finish(e.type);
      continue;
    }

    if (e.setPiece === 'falta') {
      // Onde foi a falta: varia de jogo para jogo — pela esquerda, pela direita ou de frente, mais
      // perto ou mais longe, sempre fora da área (pelos lados dá para chegar mais perto da linha de fundo).
      const zone = rng.next();
      const y = zone < 0.36 ? r(0.13, 0.3) : zone < 0.72 ? r(0.7, 0.87) : r(0.34, 0.66);
      const wide = Math.abs(y - 0.5) > 0.31;
      const x = at(wide ? r(0.72, 0.86) : r(0.7, 0.815));
      if (hasLead) {
        // O atacante leva a bola até ali e é parado com falta.
        const victim = nearest(side, start - lead, x, y, (p) => isKeeper(p) || p === shooter);
        const got = arrive(victim, x, y);
        const fouler = nearest(def, got, x, y, isKeeper);
        move(fouler, start - lead * 0.12, start + pre * 0.15, x + out * 0.012, y + 0.014, lead * 0.28, sec(0.8));
        point(start - lead * 0.04, x, y, { holder: { side, idx: victim.idx } });
      }
      tl.banners.push({ from: start, to: m - pre * 0.12, text: 'Falta!' });
      focusTo(start + pre * 0.3, at(0.72), 0.5 + (y - 0.5) * 0.7);
      focusTo(m, at(0.72), 0.5 + (y - 0.5) * 0.7);
      const placed = point(start + pre * 0.22, x, y, { jump: true });
      // Barreira de três a 9,15 m, na linha entre a bola e o meio do gol.
      const gx = (lineX - x) * 105;
      const gy = (0.5 - y) * 68;
      const gd = Math.hypot(gx, gy) || 1;
      const wallX = x + ((gx / gd) * 9.15) / 105;
      const wallY = y + ((gy / gd) * 9.15) / 68;
      // Os três lado a lado, atravessados à linha do chute.
      const sideX = ((-gy / gd) * 2.2) / 105;
      const sideY = ((gx / gd) * 2.2) / 68;
      const wall = team(def)
        .filter((p) => p.position !== 'GOL')
        .map((p) => ({ p, d: Math.hypot(playerAt(tl, p, placed).x - wallX, playerAt(tl, p, placed).y - wallY) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((w) => w.p);
      wall.forEach((p, k) => move(p, placed + pre * 0.15, m + sec(0.3), wallX + (k - 1) * sideX, wallY + (k - 1) * sideY, pre * 0.3, sec(1)));
      // O batedor toma distância atrás da bola, na linha do chute.
      move(shooter, placed + pre * 0.2, m + sec(0.2), x - ((gx / gd) * 2.9) / 105, y - ((gy / gd) * 2.9) / 68, pre * 0.3, sec(1));
      point(m - sec(0.42), x, y, { holder: { side, idx: shooter.idx } });
      if (e.type === 'bloqueio') {
        // Na barreira: a bola sobra para a defesa.
        const t = point(m, wallX - ((gx / gd) * 0.8) / 105, wallY - ((gy / gd) * 0.8) / 68, { shot: true, ...(wall[1] ? { holder: { side: def, idx: wall[1].idx } } : {}) });
        const fy = r(0.25, 0.75);
        focusTo(t + post, at(0.6), fy);
        cursor = toPlayer(t + post, nearest(def, t + post, at(0.62), fy, (p) => isKeeper(p) || wall.includes(p)));
        poss = def;
      } else finish(e.type);
      continue;
    }

    if (e.setPiece === 'escanteio') {
      const top = rng.next() < 0.5;
      const cx = at(0.992);
      const cy = top ? 0.012 : 0.988;
      if (hasLead) {
        // O ataque chega por aquele lado, cruza, e a zaga corta para a linha de fundo.
        const wx = at(r(0.8, 0.87));
        const wy = top ? r(0.12, 0.26) : r(0.74, 0.88);
        const winger = nearest(side, start - lead, wx, wy, (p) => isKeeper(p) || p === shooter);
        const got = arrive(winger, wx, wy);
        const bx = at(0.935);
        const by = top ? r(0.24, 0.32) : r(0.68, 0.76);
        const blocker = nearest(def, got, bx, by, isKeeper);
        move(blocker, start - lead * 0.2, start + pre * 0.1, bx + out * 0.008, by, lead * 0.2, sec(0.8));
        point(start - lead * 0.18, bx, by, { shot: true, holder: { side: def, idx: blocker.idx } });
        point(start - lead * 0.03, lineX + out * 0.02, top ? r(0.1, 0.22) : r(0.78, 0.9));
      }
      const taker = byCard(side, e.takerId) ?? nearest(side, start, cx, cy, (p) => isKeeper(p) || p === shooter);
      tl.banners.push({ from: start, to: m - pre * 0.3, text: 'Escanteio!' });
      focusTo(start + pre * 0.3, at(0.84), 0.5);
      focusTo(m, at(0.84), 0.5);
      const placed = point(start + pre * 0.2, cx, cy, { jump: true });
      move(taker, placed + pre * 0.15, m - pre * 0.3, cx + out * 0.012, top ? 0.0 : 1.0, pre * 0.25, sec(1.2));
      // Área cheia: três atacantes sobem para a cabeçada e a zaga cola neles.
      const free = (p: PitchPlayer) => p !== taker && p !== shooter && p.position !== 'GOL';
      const crowd = team(side)
        .filter(free)
        .sort((p1, p2) => out * (playerAt(tl, p2, placed).x - playerAt(tl, p1, placed).x))
        .slice(0, 3);
      const markers = team(def)
        .filter((p) => p.position !== 'GOL')
        .sort((p1, p2) => out * (playerAt(tl, p2, placed).x - playerAt(tl, p1, placed).x))
        .slice(0, 4);
      crowd.forEach((p, k) => {
        const x = at(0.895 + ((k * 7) % 3) * 0.018);
        const y = (top ? 0.4 : 0.6) + (top ? 1 : -1) * k * 0.1 + r(-0.015, 0.015);
        move(p, placed + pre * 0.15, m + sec(0.2), x, y, pre * 0.3, sec(1));
        const mark = markers[k];
        if (mark) move(mark, placed + pre * 0.15, m + sec(0.2), x + out * 0.022, y + (top ? -0.022 : 0.022), pre * 0.3, sec(1));
      });
      // Um zagueiro guarda a primeira trave.
      if (markers[3]) move(markers[3], placed + pre * 0.15, m + sec(0.2), at(0.975), top ? 0.43 : 0.57, pre * 0.3, sec(1));
      const kick = point(m - pre * 0.42, cx, cy, { holder: { side, idx: taker.idx } });
      // Cruzamento na área: quem cabeceia chega na bola.
      const hx = at(r(0.905, 0.94));
      const hy = r(0.4, 0.6);
      const head = m - Math.max(sec(0.3), pre * 0.14);
      if (e.type === 'bloqueio') {
        // A zaga chega antes e afasta.
        const stopper = nearest(def, kick, hx, hy, isKeeper);
        move(stopper, head, head + sec(0.2), hx, hy, head - kick, sec(0.8));
        toPlayer(head, stopper);
        const fy = r(0.2, 0.8);
        const t = point(m, at(0.68), fy);
        focusTo(t + post, at(0.6), fy);
        cursor = toPlayer(t + post, nearest(rng.next() < 0.5 ? side : def, t + post, at(0.66), fy, isKeeper));
        const got = keys[keys.length - 1]!.holder;
        poss = got ? got.side : def;
      } else {
        move(shooter, head, head + sec(0.2), hx, hy, head - kick, sec(0.9));
        toPlayer(head, shooter);
        finish(e.type);
      }
      continue;
    }

    // Bola rolando: quem dá o passe (a assistência, se houver) acha quem finaliza na entrada da área.
    const goal = e.type === 'gol' ? match.goals.find((g) => g.side === side && g.cardId === e.cardId && g.minute === e.minute) : undefined;
    const fy = r(0.25, 0.75);
    const passer = byCard(side, goal?.assistCardId) ?? nearest(side, start, at(0.62), fy, (p) => isKeeper(p) || p === shooter);
    focusTo(start, at(0.6), fy);
    toPlayer(start, passer);
    const sx = at(r(0.8, 0.87));
    const sy = r(0.3, 0.7);
    const recv = m - pre * 0.36;
    focusTo(recv, at(0.76), sy);
    focusTo(m, at(0.78), sy);
    move(shooter, recv, m + sec(0.15), sx, sy, pre * 0.5, sec(1));
    // Uma tabela no meio do caminho, se der tempo.
    if (pre > sec(1.1)) {
      const mid = start + (recv - start) * 0.5;
      toPlayer(mid, nearest(side, mid, at(0.7), (fy + sy) / 2, (p) => isKeeper(p) || p === shooter || p === passer));
    }
    toPlayer(recv, shooter);
    finish(e.type);
  }
  wander(89.6);
  return tl;
}

/** Bola chutada: sai rápida e perde velocidade (atrito), em vez de acelerar e frear por igual. */
const kick = (u: number) => 1 - (1 - u) ** 2.2;

export interface BallState {
  x: number;
  y: number;
  /** Altura da bola, de 0 (no chão) a 1 (bola longa no ponto mais alto). */
  h: number;
  /** O trecho atual é um chute. */
  shot: boolean;
  /** Onde e quando a bola foi tocada pela última vez (para o “toque” na tela). */
  kick: { t: number; x: number; y: number } | null;
  /** Último momento em que a bola reapareceu (o rastro não atravessa o campo). */
  since: number;
}

/** Comprimento do trecho em metros (campo de 105 × 68). */
function meters(a: Key, b: Key): number {
  return Math.hypot((b.x - a.x) * 105, (b.y - a.y) * 68);
}

export function ballState(keys: Key[], t: number): BallState {
  let since = keys[0]!.t;
  const first = keys[0]!;
  if (t <= first.t) return { x: first.x, y: first.y, h: 0, shot: false, kick: null, since };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (b.jump && b.t <= t) since = b.t;
    if (t < b.t) {
      const a = keys[i - 1]!;
      if (b.jump) return { x: a.x, y: a.y, h: 0, shot: false, kick: null, since };
      const lin = (t - a.t) / (b.t - a.t);
      const u = kick(lin);
      const len = meters(a, b);
      // Bola longa sobe (parábola); chute vai rasteiro; toque curto fica no chão.
      const lift = b.shot ? 0.12 : Math.min(1, Math.max(0, (len - 26) / 30));
      const moving = len > 2;
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        h: 4 * lin * (1 - lin) * lift,
        shot: !!b.shot,
        kick: moving ? { t: a.t, x: a.x, y: a.y } : null,
        since,
      };
    }
  }
  const last = keys[keys.length - 1]!;
  return { x: last.x, y: last.y, h: 0, shot: false, kick: null, since };
}

export function ballAt(keys: Key[], t: number): { x: number; y: number } {
  const s = ballState(keys, t);
  return { x: s.x, y: s.y };
}

/**
 * Pontos do rastro: onde a bola esteve nos últimos instantes, só desde o último toque — o rastro
 * acompanha o voo atual (nasce no chute e cresce), sem dobrar pelos passes anteriores nem atravessar
 * uma “reaparição” (saída de bola, tiro de meta).
 */
export function ballTrail(keys: Key[], t: number, span: number, samples: number): Array<{ x: number; y: number; h: number }> {
  const now = ballState(keys, t);
  const since = Math.max(now.since, now.kick?.t ?? -Infinity);
  const out: Array<{ x: number; y: number; h: number }> = [];
  for (let k = 0; k <= samples; k++) {
    const s = ballState(keys, Math.max(since, t - (span * k) / samples));
    out.push({ x: s.x, y: s.y, h: s.h });
  }
  return out;
}

/** Minuto de jogo (fracionado) agora. */
export function matchMinute(now: number, tickStartedAt: number, playMs: number): number {
  return Math.max(0, Math.min(90, ((now - tickStartedAt) / playMs) * 90));
}
