import { memo, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Peças da identidade visual do Martelo FC, reaproveitadas em todas as telas:
 * moeda em pixel art, número que conta, chapinha de posição, faixa de abertura de fase,
 * confete de vitória e a bolinha de “carregando”.
 */

/** Moeda do pregão em pixel art (10 × 10). */
function PixelCoinImpl({ size = 16 }: { size?: number }) {
  // 0 vazio · 1 contorno · 2 ouro · 3 brilho · 4 sombra
  const rows = [
    '0011111100',
    '0122222210',
    '1223322221',
    '1232222241',
    '1232442241',
    '1232442241',
    '1222222241',
    '1222224441',
    '0144444410',
    '0011111100',
  ];
  const fill: Record<string, string> = { '1': '#5A3606', '2': '#FFC21A', '3': '#FFF2A8', '4': '#D18A00' };
  return (
    <svg className="pixel-coin" viewBox="0 0 10 10" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '0' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={fill[ch]} />)),
      )}
    </svg>
  );
}
export const PixelCoin = memo(PixelCoinImpl);

/** Número que corre até o valor novo (moedas, pontos) e pisca verde ou vermelho. */
export function AnimatedNumber({ value, duration = 480 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setDir(value > start ? 'up' : 'down');
    if (reduce) {
      setShown(value);
      from.current = value;
      const t = setTimeout(() => setDir(null), 600);
      return () => clearTimeout(t);
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        from.current = value;
        setTimeout(() => setDir(null), 350);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return (
    <span className="anum" data-dir={dir ?? undefined}>
      {shown}
    </span>
  );
}

/** Moedas: a moedinha e o valor. */
export function Coins({ value, size = 16, animate = true }: { value: number; size?: number; animate?: boolean }) {
  return (
    <span className="coins">
      <PixelCoin size={size} />
      {animate ? <AnimatedNumber value={value} /> : <span className="anum">{value}</span>}
    </span>
  );
}

/** Chapinha da posição (cor da linha do campo). */
export function PosChip({ pos, children }: { pos: string; children?: ReactNode }) {
  return (
    <span className="pos-chip" data-pos={pos}>
      {children ?? pos}
    </span>
  );
}

/** Luz de status: verde conectado, cinza fora. */
export function StatusLight({ on, title }: { on: boolean; title?: string }) {
  return <span className="status-light" data-off={!on || undefined} title={title} aria-hidden="true" />;
}

/** Faixa que atravessa a tela quando a disputa muda de fase. */
export function StageBanner({ title, sub, tone = 'sun' }: { title: string; sub?: string; tone?: 'sun' | 'grass' | 'red' }) {
  return (
    <div className="stage-banner" data-tone={tone} role="status" aria-live="polite">
      <div className="stage-banner-band">
        <span className="stage-banner-title">{title}</span>
        {sub && <span className="stage-banner-sub">{sub}</span>}
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#FFC81E', '#3F9B37', '#D33A2C', '#2F6FD0', '#FFFFFF', '#F07D1A'];

/** Chuva de confete curta (ganhou o lance, título, conquista). */
export function Confetti({ count = 26, seed = 1 }: { count?: number; seed?: number }) {
  const pieces = Array.from({ length: count }, (_, i) => {
    const r = Math.sin((i + 1) * 9301 + seed * 49297) * 233280;
    const f = r - Math.floor(r);
    const g = Math.sin((i + 3) * 7919 + seed * 104729) * 10000;
    const h = g - Math.floor(g);
    return {
      left: `${(f * 100).toFixed(1)}%`,
      delay: `${(h * 0.35).toFixed(2)}s`,
      dur: `${(0.9 + f * 0.8).toFixed(2)}s`,
      drift: `${((h - 0.5) * 80).toFixed(0)}px`,
      spin: `${Math.round(f * 720 - 360)}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    };
  });
  return (
    <span className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={
            {
              left: p.left,
              background: p.color,
              animationDelay: p.delay,
              animationDuration: p.dur,
              '--drift': p.drift,
              '--spin': p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Carregando: bolinha em pixel art quicando. */
export function PixelBall({ size = 28 }: { size?: number }) {
  const rows = ['00111100', '01122110', '11222211', '12211221', '12211221', '11222211', '01122110', '00111100'];
  const fill: Record<string, string> = { '1': '#24160C', '2': '#FFFDF5' };
  return (
    <svg className="pixel-ball" viewBox="0 0 8 8" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '0' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={fill[ch]} />)),
      )}
    </svg>
  );
}

/** Título de seção com a plaquinha do jogo. */
export function SectionTitle({ children, aside, as: Tag = 'h2' }: { children: ReactNode; aside?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className="section-title">
      <Tag>{children}</Tag>
      {aside && <span className="section-aside">{aside}</span>}
    </div>
  );
}
