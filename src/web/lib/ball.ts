import type { MatchView } from '../../shared/protocol';
import { Rng } from '../../engine/rng';

/**
 * Trajeto da bola no jogo ao vivo, calculado a partir do jogo já simulado no servidor:
 * passeia pelo campo e, nos lances (gol, trave, defesa, chance), vai para a área atacada.
 * Semente = id do jogo, então todo mundo na sala vê a mesma bola. Coordenadas de 0 a 1
 * (x ao longo do campo; o mandante ataca para x = 1).
 */

export interface Key {
  /** Minuto de jogo (fracionado). */
  t: number;
  x: number;
  y: number;
  /** A bola “reaparece” aqui (tiro de meta, saída do meio-campo) em vez de deslizar. */
  jump?: boolean;
  /** O trecho que termina aqui é um chute (rasteiro e rápido, com rastro destacado). */
  shot?: boolean;
}

export interface MatchTimeline {
  keys: Key[];
  /** Minuto em que cada evento acontece na tela (alinhado com `match.events`). */
  moments: number[];
  /** Minutos em que a bola entra no gol, por lado, e quando sai de novo do meio-campo. */
  goals: Array<{ t: number; side: 'home' | 'away'; until: number }>;
  /** Quantos minutos de jogo o “GOL!” fica na tela. */
  goalShow: number;
}

const PLAY_TYPES = new Set(['gol', 'trave', 'defesa', 'chance']);

/** Ritmo padrão: 90 minutos em 17 s de tela (rodada de 20 s). */
export const DEFAULT_MINUTES_PER_SECOND = 90 / 17;

/**
 * @param minutesPerSecond minutos de jogo por segundo de tela — as durações dos lances são
 *   pensadas em segundos (a comemoração do gol dura ~1,2 s qualquer que seja o ritmo).
 */
export function buildTimeline(match: MatchView, minutesPerSecond = DEFAULT_MINUTES_PER_SECOND): MatchTimeline {
  const sec = (n: number) => n * minutesPerSecond;
  const rng = new Rng(`bola:${match.id}`);
  const r = (a: number, b: number) => a + rng.next() * (b - a);
  const keys: Key[] = [{ t: 0, x: 0.5, y: 0.5 }];
  // Sem narração (jogo sem técnico humano), os gols bastam.
  const events = match.events ?? match.goals.map((g) => ({ minute: g.minute, type: 'gol' as const, side: g.side, text: '' }));
  const moments = events.map((e) => e.minute);
  const goals: MatchTimeline['goals'] = [];
  const plays = events.map((e, i) => i).filter((i) => PLAY_TYPES.has(events[i]!.type) && events[i]!.side);
  let cursor = 0;
  const push = (k: Key) => {
    const last = keys[keys.length - 1]!;
    keys.push({ ...k, t: Math.max(k.t, last.t + sec(0.12)) });
    return keys[keys.length - 1]!.t;
  };
  // Troca de passes: condução e passe curto perto da bola, às vezes uma bola longa (que sobe).
  const clampX = (x: number) => Math.min(0.9, Math.max(0.1, x));
  const clampY = (y: number) => Math.min(0.94, Math.max(0.06, y));
  const wander = (until: number) => {
    let t = cursor;
    for (;;) {
      const last = keys[keys.length - 1]!;
      const long = rng.next() < 0.3;
      t += long ? r(sec(0.6), sec(0.9)) : r(sec(0.35), sec(0.6));
      if (t >= until) break;
      if (long) push({ t, x: r(0.16, 0.84), y: r(0.08, 0.92) });
      else push({ t, x: clampX(last.x + r(-0.13, 0.13)), y: clampY(last.y + r(-0.18, 0.18)) });
    }
  };
  plays.forEach((i, k) => {
    const e = events[i]!;
    const side = e.side!;
    const next = k + 1 < plays.length ? events[plays[k + 1]!]!.minute : 95;
    // Fração do caminho até o gol atacado (mandante ataca o gol da direita).
    const at = (f: number) => (side === 'home' ? f : 1 - f);
    const m = Math.max(e.minute, cursor + sec(0.35));
    // Jogada até a área: ~1 s; mais curta quando o lance anterior foi há pouco.
    const lead = Math.min(sec(1.1), Math.max(sec(0.3), m - cursor - sec(0.15)));
    wander(m - lead);
    push({ t: m - lead, x: at(r(0.55, 0.66)), y: r(0.15, 0.85) });
    push({ t: m - lead * 0.45, x: at(r(0.78, 0.86)), y: r(0.28, 0.72) });
    // Tempo até o próximo lance começar: o “depois” do lance se encaixa nele.
    const room = Math.max(sec(0.35), next - m - sec(0.3));
    const lineX = side === 'home' ? 1 : 0;
    const out = side === 'home' ? 1 : -1;
    if (e.type === 'gol') {
      const t = push({ t: m, x: lineX + out * 0.03, y: r(0.45, 0.55), shot: true });
      moments[i] = t;
      const last = keys[keys.length - 1]!;
      push({ t: t + Math.min(sec(1.2), room * 0.6), x: last.x, y: last.y });
      cursor = push({ t: t + Math.min(sec(1.5), room * 0.8), x: 0.5, y: 0.5, jump: true });
      goals.push({ t, side, until: cursor });
    } else if (e.type === 'trave') {
      const t = push({ t: m, x: lineX - out * 0.004, y: rng.next() < 0.5 ? 0.445 : 0.555, shot: true });
      moments[i] = t;
      cursor = push({ t: t + Math.min(sec(0.35), room), x: at(r(0.74, 0.84)), y: r(0.15, 0.85) });
    } else if (e.type === 'defesa') {
      const t = push({ t: m, x: at(0.975), y: r(0.46, 0.54), shot: true });
      moments[i] = t;
      const last = keys[keys.length - 1]!;
      push({ t: t + Math.min(sec(0.45), room * 0.5), x: last.x, y: last.y });
      cursor = push({ t: t + Math.min(sec(1), room), x: at(r(0.38, 0.5)), y: r(0.15, 0.85) });
    } else {
      // Chute para fora; tiro de meta.
      const t = push({ t: m, x: lineX + out * 0.03, y: rng.next() < 0.5 ? r(0.22, 0.38) : r(0.62, 0.78), shot: true });
      moments[i] = t;
      push({ t: t + Math.min(sec(0.4), room * 0.5), x: at(0.95), y: 0.5, jump: true });
      cursor = push({ t: t + Math.min(sec(0.9), room), x: at(r(0.5, 0.62)), y: r(0.15, 0.85) });
    }
  });
  wander(89.5);
  return { keys, moments, goals, goalShow: sec(1.3) };
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
