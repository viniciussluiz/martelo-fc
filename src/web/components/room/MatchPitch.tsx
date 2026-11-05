import { useEffect, useId, useMemo, useRef } from 'react';
import type { MatchView } from '../../../shared/protocol';
import { ballState, ballTrail, buildTimeline, matchMinute, type MatchTimeline } from '../../lib/ball';
import { serverNow } from '../../lib/store';

export { matchMinute };

/**
 * O seu jogo “ao vivo”: a bola passeia pelo campo e, nos lances do jogo (já simulado no
 * servidor), vai para a área — entra no gol nos gols, bate na trave, para no goleiro ou sai.
 * O trajeto sai de uma semente do jogo, então todo mundo na sala vê a mesma bola.
 * Campo na horizontal: o mandante (à esquerda no placar) ataca para a direita.
 */

// Campo 105 × 68 desenhado num viewBox com margem para as redes.
const VB_W = 113;
const VB_H = 74;
const FX = 4;
const FY = 3;
const FW = 105;
const FH = 68;
const px = (x: number) => FX + x * FW;
const py = (y: number) => FY + y * FH;

const BALL_R = 1.45;
/** Altura máxima (em unidades do desenho) de uma bola longa. */
const LIFT = 5;
const TRAIL = 14;

export function MatchPitch({
  match,
  timeline,
  tickStartedAt,
  playMs,
}: {
  match: MatchView;
  timeline: MatchTimeline;
  tickStartedAt: number;
  playMs: number;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const goalText = useRef<HTMLSpanElement | null>(null);
  const ball = useRef<SVGGElement | null>(null);
  const spin = useRef<SVGGElement | null>(null);
  const shadow = useRef<SVGEllipseElement | null>(null);
  const trail = useRef<SVGPathElement | null>(null);
  const grad = useRef<SVGLinearGradientElement | null>(null);
  const pulse = useRef<SVGCircleElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const shineId = `mp-shine-${uid}`;
  const trailId = `mp-trail-${uid}`;
  useEffect(() => {
    let raf = 0;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const mps = 90 / (playMs / 1000);
    const stops = Array.from(grad.current?.querySelectorAll('stop') ?? []);
    let angle = 0;
    let last: { x: number; y: number } | null = null;
    const draw = () => {
      const t = matchMinute(serverNow(), tickStartedAt, playMs);
      const s = ballState(timeline.keys, t);
      const x = px(s.x);
      const y = py(s.y);
      const lift = s.h * LIFT;
      // Rolando: gira conforme anda (bola no ar gira menos).
      if (last) {
        const d = Math.hypot(x - last.x, y - last.y);
        angle += (d / BALL_R) * (180 / Math.PI) * (x >= last.x ? 1 : -1) * (s.h > 0.2 ? 0.4 : 1);
      }
      last = { x, y };
      ball.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${(y - lift).toFixed(2)}) scale(${(1 + 0.3 * s.h).toFixed(3)})`);
      spin.current?.setAttribute('transform', `rotate(${(angle % 360).toFixed(1)})`);
      shadow.current?.setAttribute('transform', `translate(${(x + 0.4 + lift * 0.25).toFixed(2)} ${(y + 0.9).toFixed(2)}) scale(${(1 - 0.35 * s.h).toFixed(3)})`);
      shadow.current?.setAttribute('opacity', (1 - 0.55 * s.h).toFixed(2));
      if (!reduce && trail.current && grad.current) {
        // Rastro: uma fita que afina até sumir; mais longa e dourada nos chutes.
        const pts = ballTrail(timeline.keys, t, (s.shot ? 0.5 : 0.34) * mps, TRAIL).map((p) => ({ x: px(p.x), y: py(p.y) - p.h * LIFT }));
        const head = pts[0]!;
        const tail = pts[pts.length - 1]!;
        if (Math.hypot(head.x - tail.x, head.y - tail.y) < 0.6) {
          trail.current.setAttribute('d', '');
        } else {
          const left: string[] = [];
          const right: string[] = [];
          let nx = 0;
          let ny = 0;
          pts.forEach((p, k) => {
            const a = pts[Math.max(0, k - 1)]!;
            const b = pts[Math.min(pts.length - 1, k + 1)]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const len = Math.hypot(dx, dy);
            if (len > 1e-4) {
              nx = -dy / len;
              ny = dx / len;
            }
            const w = BALL_R * 0.95 * (1 - k / TRAIL) ** 0.85;
            left.push(`${(p.x + nx * w).toFixed(2)} ${(p.y + ny * w).toFixed(2)}`);
            right.push(`${(p.x - nx * w).toFixed(2)} ${(p.y - ny * w).toFixed(2)}`);
          });
          trail.current.setAttribute('d', `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`);
          grad.current.setAttribute('x1', head.x.toFixed(2));
          grad.current.setAttribute('y1', head.y.toFixed(2));
          grad.current.setAttribute('x2', tail.x.toFixed(2));
          grad.current.setAttribute('y2', tail.y.toFixed(2));
          const color = s.shot ? '#ffd36b' : '#ffffff';
          for (const stop of stops) stop.setAttribute('stop-color', color);
        }
      }
      // “Toque”: um anel que se abre onde a bola foi chutada.
      if (pulse.current) {
        const age = s.kick ? (t - s.kick.t) / (0.32 * mps) : 1;
        if (!reduce && s.kick && age >= 0 && age < 1) {
          pulse.current.setAttribute('cx', px(s.kick.x).toFixed(2));
          pulse.current.setAttribute('cy', py(s.kick.y).toFixed(2));
          pulse.current.setAttribute('r', (BALL_R + 3.2 * age).toFixed(2));
          pulse.current.setAttribute('opacity', (0.6 * (1 - age)).toFixed(3));
        } else {
          pulse.current.setAttribute('opacity', '0');
        }
      }
      // “GOL!” e a rede balançando: do momento em que a bola entra até a saída do meio-campo.
      const goal = timeline.goals.filter((g) => t >= g.t && t < Math.min(g.until, g.t + timeline.goalShow)).pop();
      if (box.current) {
        if (goal) box.current.dataset.goal = goal.side;
        else delete box.current.dataset.goal;
      }
      if (goalText.current) goalText.current.hidden = !goal;
      if (t < 90) raf = reduce ? window.setTimeout(draw, 500) : requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(raf);
    };
  }, [timeline, tickStartedAt, playMs]);
  const boxW = 16.5 / 105;
  const boxH = 40.3 / 68;
  const smallW = 5.5 / 105;
  const smallH = 18.3 / 68;
  const goalH = 7.32 / 68;
  return (
    <div className="match-pitch" ref={box}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={`Campo: ${match.homeName} ataca para a direita, ${match.awayName} para a esquerda`}>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={px(i / 10)} y={FY} width={FW / 10 + 0.05} height={FH} className={i % 2 ? 'mp-stripe-b' : 'mp-stripe-a'} />
        ))}
        <g className="mp-lines">
          <rect x={FX} y={FY} width={FW} height={FH} />
          <line x1={px(0.5)} y1={FY} x2={px(0.5)} y2={FY + FH} />
          <circle cx={px(0.5)} cy={py(0.5)} r={9.15} />
          <rect x={FX} y={py(0.5 - boxH / 2)} width={boxW * FW} height={boxH * FH} />
          <rect x={px(1 - boxW)} y={py(0.5 - boxH / 2)} width={boxW * FW} height={boxH * FH} />
          <rect x={FX} y={py(0.5 - smallH / 2)} width={smallW * FW} height={smallH * FH} />
          <rect x={px(1 - smallW)} y={py(0.5 - smallH / 2)} width={smallW * FW} height={smallH * FH} />
          <path d={`M ${px(boxW)} ${py(0.5 - 0.12)} A 9.15 9.15 0 0 1 ${px(boxW)} ${py(0.5 + 0.12)}`} />
          <path d={`M ${px(1 - boxW)} ${py(0.5 - 0.12)} A 9.15 9.15 0 0 0 ${px(1 - boxW)} ${py(0.5 + 0.12)}`} />
        </g>
        <g className="mp-spots">
          <circle cx={px(0.5)} cy={py(0.5)} r={0.6} />
          <circle cx={px(11 / 105)} cy={py(0.5)} r={0.5} />
          <circle cx={px(1 - 11 / 105)} cy={py(0.5)} r={0.5} />
        </g>
        {/* Redes: a da esquerda é do mandante, a da direita do visitante. */}
        <rect className="mp-net" data-side="home" x={FX - 3} y={py(0.5 - goalH / 2)} width={3} height={goalH * FH} />
        <rect className="mp-net" data-side="away" x={FX + FW} y={py(0.5 - goalH / 2)} width={3} height={goalH * FH} />
        <text className="mp-team" x={FX + 1.5} y={FY + FH - 1.6}>
          {match.homeName}
        </text>
        <text className="mp-team" x={FX + FW - 1.5} y={FY + FH - 1.6} textAnchor="end">
          {match.awayName}
        </text>
        <defs>
          <linearGradient ref={grad} id={trailId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={shineId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#0b1222" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        <circle ref={pulse} className="mp-pulse" r={BALL_R} opacity={0} />
        <ellipse ref={shadow} className="mp-shadow" rx={1.6} ry={0.75} />
        <path ref={trail} className="mp-trail" style={{ fill: `url(#${trailId})` }} aria-hidden="true" />
        <g ref={ball} className="mp-ball">
          <g ref={spin}>
            <circle r={BALL_R} />
            <path d="M -0.5 -0.32 L 0 -0.7 L 0.5 -0.32 L 0.32 0.28 L -0.32 0.28 Z" />
            <path d="M 0 -0.7 L 0 -1.38 M 0.5 -0.32 L 1.3 -0.55 M 0.32 0.28 L 0.82 1.1 M -0.32 0.28 L -0.82 1.1 M -0.5 -0.32 L -1.3 -0.55" className="mp-seams" />
          </g>
          <circle r={BALL_R} className="mp-shine" style={{ fill: `url(#${shineId})` }} />
        </g>
      </svg>
      <span className="mp-goal" ref={goalText} hidden>
        GOL!
      </span>
    </div>
  );
}

/** Linha do tempo do jogo, recalculada só quando o jogo muda. */
export function useMatchTimeline(match: MatchView | null, playMs: number): MatchTimeline | null {
  const ref = useRef(match);
  ref.current = match;
  const key = match ? `${match.id}:${match.events?.length ?? 0}:${match.goals.length}:${playMs}` : '';
  return useMemo(() => (ref.current ? buildTimeline(ref.current, 90 / (playMs / 1000)) : null), [key]);
}
