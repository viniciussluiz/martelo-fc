import { memo, useId, type ReactNode } from 'react';
import { crestLuminance, type CrestConfig, type CrestPattern, type CrestShape } from '../../../shared/crest';
import { SYMBOLS } from './symbols';

/**
 * Desenho do escudo a partir da receita. Quadro de 128 × 144: o corpo do escudo ocupa
 * x 16–112 e y 22–130; em cima ficam as estrelas, embaixo a faixa e, dos lados, os ramos de louro.
 * Em tamanhos pequenos (tabela, placar ao vivo) o escudo sai “limpo”: só corpo, padrão e símbolo.
 */

export const INK = '#24160C';
const W = 128;
const H = 144;

const SHAPES: Record<CrestShape, string> = {
  classico: 'M16 22 H112 V68 C112 99 92 118 64 131 C36 118 16 99 16 68 Z',
  frances: 'M16 22 H112 V96 C112 112 99 121 81 123 C72 124 66 126 64 131 C62 126 56 124 47 123 C29 121 16 112 16 96 Z',
  redondo: 'M64 22 A54 54 0 1 1 63.99 22 Z',
  moderno: 'M28 22 H100 L112 34 V86 L64 131 L16 86 V34 Z',
  retro: 'M31 22 H97 L112 37 V115 L97 130 H31 L16 115 V37 Z',
  brasao: 'M16 27 Q28 17 40 27 Q52 17 64 27 Q76 17 88 27 Q100 17 112 27 V71 C112 100 92 118 64 131 C36 118 16 100 16 71 Z',
  oval: 'M64 22 C90 22 110 45 110 76 C110 107 90 130 64 130 C38 130 18 107 18 76 C18 45 38 22 64 22 Z',
  diamante: 'M64 20 L113 76 L64 132 L15 76 Z',
};

/** Centro e tamanho do símbolo em cada formato (o meio visual muda conforme a ponta). */
const SYMBOL_BOX: Record<CrestShape, { cy: number; size: number }> = {
  classico: { cy: 70, size: 56 },
  frances: { cy: 72, size: 58 },
  redondo: { cy: 76, size: 58 },
  moderno: { cy: 68, size: 54 },
  retro: { cy: 76, size: 60 },
  brasao: { cy: 73, size: 54 },
  oval: { cy: 76, size: 54 },
  diamante: { cy: 76, size: 44 },
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

/** Tinta que aparece em cima de uma cor. */
export function inkOn(hex: string): string {
  return crestLuminance(hex) > 0.58 ? INK : '#FFFFFF';
}

function Pattern({ pattern, color }: { pattern: CrestPattern; color: string }): ReactNode {
  switch (pattern) {
    case 'listras': {
      const w = 96 / 7;
      return [1, 3, 5].map((k) => <rect key={k} x={16 + k * w} y={0} width={w} height={H} fill={color} />);
    }
    case 'faixa':
      return <rect x={-30} y={64} width={190} height={26} fill={color} transform="rotate(45 64 76)" />;
    case 'metade':
      return <rect x={64} y={0} width={64} height={H} fill={color} />;
    case 'meio':
      return <rect x={0} y={76} width={W} height={H} fill={color} />;
    case 'aros': {
      const h = 108 / 7;
      return [1, 3, 5].map((k) => <rect key={k} x={0} y={22 + k * h} width={W} height={h} fill={color} />);
    }
    case 'cruz':
      return (
        <>
          <rect x={53} y={0} width={22} height={H} fill={color} />
          <rect x={0} y={58} width={W} height={22} fill={color} />
        </>
      );
    case 'chevron':
      return <polygon points="0,46 64,98 128,46 128,74 64,126 0,74" fill={color} />;
    case 'quartos':
      return (
        <>
          <rect x={0} y={0} width={64} height={76} fill={color} />
          <rect x={64} y={76} width={64} height={H} fill={color} />
        </>
      );
    case 'topo':
      return <rect x={0} y={0} width={W} height={47} fill={color} />;
    case 'central':
      return <rect x={0} y={60} width={W} height={30} fill={color} />;
    default:
      return null;
  }
}

function starPoints(cx: number, cy: number, R: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    return `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`;
  }).join(' ');
}

function Stars({ n }: { n: number }) {
  if (n <= 0) return null;
  const gap = 15;
  const mid = (n - 1) / 2;
  return (
    <g fill="#FFC81E" stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      {Array.from({ length: n }, (_, i) => {
        const x = 64 + (i - mid) * gap;
        const y = 11 + Math.abs(i - mid) ** 2 * 1.3;
        return <polygon key={i} points={starPoints(x, y, 7, 3)} />;
      })}
    </g>
  );
}

/** Ramos de louro dos dois lados (ficam atrás do escudo). */
function Laurel({ color }: { color: string }) {
  const leaves: ReactNode[] = [];
  const side = (dir: 1 | -1) => {
    // Curva de (64 ± 12, 138) até (64 ± 56, 40), passando por (64 ± 64, 118).
    const p0 = [64 + dir * 10, 139];
    const p1 = [64 + dir * 66, 124];
    const p2 = [64 + dir * 54, 38];
    const at = (t: number) => [
      (1 - t) ** 2 * p0[0]! + 2 * (1 - t) * t * p1[0]! + t * t * p2[0]!,
      (1 - t) ** 2 * p0[1]! + 2 * (1 - t) * t * p1[1]! + t * t * p2[1]!,
    ];
    for (let k = 0; k < 9; k++) {
      const t = 0.1 + k * 0.105;
      const [x, y] = at(t);
      const [x2, y2] = at(t + 0.01);
      const ang = (Math.atan2(y2! - y!, x2! - x!) * 180) / Math.PI;
      for (const s of [1, -1]) {
        leaves.push(
          <ellipse
            key={`${dir}-${k}-${s}`}
            cx={x}
            cy={y}
            rx={7}
            ry={3.2}
            transform={`rotate(${ang + s * 38} ${x} ${y}) translate(${6} 0)`}
          />,
        );
      }
    }
    const d = `M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
    leaves.push(<path key={`stem-${dir}`} d={d} fill="none" stroke={INK} strokeWidth="2.2" />);
  };
  side(-1);
  side(1);
  return (
    <g fill={color} stroke={INK} strokeWidth="1.8">
      {leaves}
    </g>
  );
}

function Ribbon({ color, text, uid }: { color: string; text: string; uid: string }) {
  const back = shade(color, -0.22);
  const ink = inkOn(color);
  return (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <polygon points="2,120 18,114 18,134 2,138 9,128" fill={back} />
      <polygon points="126,120 110,114 110,134 126,138 119,128" fill={back} />
      <path d="M14 109 Q64 123 114 109 L114 129 Q64 143 14 129 Z" fill={color} />
      <defs>
        <path id={`${uid}-rib`} d="M16 122.5 Q64 136.5 112 122.5" />
      </defs>
      {text && (
        <text
          fill={ink}
          stroke="none"
          fontFamily="'Lilita One', 'Barlow Condensed', sans-serif"
          fontSize={text.length > 7 ? 9.5 : 11.5}
          letterSpacing="0.6"
          textAnchor="middle"
        >
          <textPath href={`#${uid}-rib`} startOffset="50%">
            {text}
          </textPath>
        </text>
      )}
    </g>
  );
}

interface Props {
  crest: CrestConfig;
  /** Altura em pixels. */
  size?: number;
  /** Força (ou proíbe) a versão limpa; por padrão, abaixo de 34 px. */
  simple?: boolean;
  title?: string;
  className?: string;
}

function CrestImpl({ crest, size = 64, simple, title, className }: Props) {
  const uid = `cr${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const lean = simple ?? size < 34;
  const body = SHAPES[crest.shape] ?? SHAPES.classico;
  const box = SYMBOL_BOX[crest.shape] ?? SYMBOL_BOX.classico;
  const ribbon = crest.ribbon && !lean;
  const topText = crest.pattern === 'topo' && crest.symbol !== 'iniciais' && !lean;
  let cy = box.cy + (topText ? 7 : 0) - (ribbon ? 5 : 0);
  let symSize = box.size * (crest.medallion ? 0.8 : 1) * (ribbon || topText ? 0.9 : 1) * (lean ? 1.12 : 1);
  if (crest.shape === 'diamante' && ribbon) cy -= 2;
  const m = crest.detail;
  const t = shade(m, crestLuminance(m) > 0.5 ? -0.2 : 0.26);
  const on = crestLuminance(m) > 0.45 ? INK : '#FFFFFF';
  const borderW = lean ? 0 : crest.border === 'grossa' ? 18 : crest.border === 'dupla' ? 0 : 9;
  const vb = lean ? '10 16 108 120' : `0 0 ${W} ${H}`;
  const [vbW, vbH] = lean ? [108, 120] : [W, H];
  const initials = crest.initials || 'FC';
  const SymbolArt = crest.symbol !== 'iniciais' && crest.symbol !== 'nenhum' ? SYMBOLS[crest.symbol] : null;
  if (crest.medallion) symSize = Math.min(symSize, lean ? 52 : 46);
  const medR = Math.min(lean ? 36 : 32, symSize * 0.68 + 2);

  return (
    <svg
      className={className ? `crest ${className}` : 'crest'}
      viewBox={vb}
      width={Math.round((size * vbW) / vbH)}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={`${uid}-body`}>
          <path d={body} />
        </clipPath>
      </defs>
      {crest.laurel && !lean && <Laurel color={m} />}
      <path d={body} fill={crest.primary} />
      <g clipPath={`url(#${uid}-body)`}>
        <Pattern pattern={crest.pattern} color={crest.secondary} />
        {borderW > 0 && <path d={body} fill="none" stroke={m} strokeWidth={borderW} />}
        {crest.border === 'dupla' && !lean && (
          <>
            <path d={body} fill="none" stroke={INK} strokeWidth={22} />
            <path d={body} fill="none" stroke={m} strokeWidth={18} />
            <path d={body} fill="none" stroke={INK} strokeWidth={11} />
            <path d={body} fill="none" stroke={m} strokeWidth={8} />
          </>
        )}
        {/* Brilho de cima, como um escudo esmaltado. */}
        <polygon points="0,0 128,0 128,30 0,74" fill="#FFFFFF" opacity="0.13" />
      </g>
      {topText && (
        <text
          x="64"
          y="41.5"
          textAnchor="middle"
          fontFamily="'Lilita One', 'Barlow Condensed', sans-serif"
          fontSize="17"
          letterSpacing="2"
          fill={inkOn(crest.secondary)}
        >
          {initials}
        </text>
      )}
      <path d={body} fill="none" stroke={INK} strokeWidth={lean ? 7 : 4.5} strokeLinejoin="round" />
      {crest.medallion && crest.symbol !== 'nenhum' && (
        <circle cx="64" cy={cy} r={medR} fill={crest.primary} stroke={m} strokeWidth="4" style={{ paintOrder: 'stroke' }} />
      )}
      {crest.medallion && crest.symbol !== 'nenhum' && <circle cx="64" cy={cy} r={medR + 2} fill="none" stroke={INK} strokeWidth="2.2" />}
      {SymbolArt && (
        <g
          transform={`translate(${64 - symSize / 2} ${cy - symSize / 2}) scale(${symSize / 100})`}
          stroke={INK}
          strokeWidth={(lean ? 9 : 6.5) * (56 / symSize)}
          strokeLinejoin="round"
          style={{ paintOrder: 'stroke' }}
        >
          {SymbolArt({ m, t, on, ink: INK, uid })}
        </g>
      )}
      {crest.symbol === 'iniciais' && (
        <text
          x="64"
          y={cy + (initials.length >= 3 ? 9 : 12)}
          textAnchor="middle"
          fontFamily="'Lilita One', 'Barlow Condensed', sans-serif"
          fontSize={initials.length === 1 ? 50 : initials.length === 2 ? 38 : initials.length === 3 ? 28 : 22}
          fill={m}
          stroke={crestLuminance(m) < 0.22 ? '#FFFFFF' : INK}
          strokeWidth={lean ? 6 : 4.5}
          strokeLinejoin="round"
          style={{ paintOrder: 'stroke' }}
        >
          {initials}
        </text>
      )}
      {!lean && <Stars n={crest.stars} />}
      {ribbon && <Ribbon color={m} text={crest.motto} uid={uid} />}
    </svg>
  );
}

export const Crest = memo(CrestImpl);
