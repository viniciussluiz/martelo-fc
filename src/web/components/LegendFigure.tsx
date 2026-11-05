import { memo, useId } from 'react';

/**
 * Figura da Lenda: só aparece depois do martelo, quando a carta vendida é uma Lenda.
 * Não retrata o jogador: rosto amarelo (sem tom de pele), sem cabelo nem traços, com a
 * camisa nas cores do clube. Jogadores comuns não têm figura nenhuma.
 */

const PATTERNS = ['liso', 'listras', 'faixa', 'metade', 'aros'] as const;
const FALLBACK_KITS: Array<[string, string]> = [
  ['#1D3FC2', '#FFFFFF'],
  ['#C62F2F', '#FFFFFF'],
  ['#0E7C47', '#FFFFFF'],
  ['#14213D', '#E8B22E'],
  ['#FFFFFF', '#14213D'],
  ['#E5520A', '#14213D'],
  ['#5A2D82', '#FFFFFF'],
  ['#111111', '#FFFFFF'],
];

const SHIRT = 'M14 120 C14 96 34 84 60 84 C86 84 106 96 106 120 Z';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

interface Props {
  club: string;
  kit?: [string, string] | undefined;
  size?: number;
}

function LegendFigureImpl({ club, kit, size = 64 }: Props) {
  const uid = useId().replace(/:/g, '');
  const hc = hash(club);
  const [primary, secondaryRaw] = kit ?? FALLBACK_KITS[hc % FALLBACK_KITS.length]!;
  // Garante contraste entre as duas cores da camisa.
  const secondary =
    Math.abs(luminance(primary) - luminance(secondaryRaw)) < 0.18 ? (luminance(primary) > 0.5 ? '#14213D' : '#FFFFFF') : secondaryRaw;
  const pattern = PATTERNS[hc % PATTERNS.length]!;
  return (
    <span className="legend-figure" style={{ width: size, height: size }} role="img" aria-label="Lenda">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <radialGradient id={`lf-bg-${uid}`} cx="50%" cy="36%" r="72%">
            <stop offset="0%" stopColor="#2B3C69" />
            <stop offset="100%" stopColor="#0C1530" />
          </radialGradient>
          <radialGradient id={`lf-head-${uid}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#FFEB8A" />
            <stop offset="55%" stopColor="#FFD12E" />
            <stop offset="100%" stopColor="#E8A900" />
          </radialGradient>
          <clipPath id={`lf-shirt-${uid}`}>
            <path d={SHIRT} />
          </clipPath>
        </defs>
        <rect width="120" height="120" fill={`url(#lf-bg-${uid})`} />
        <g opacity="0.28" stroke="#F2C94C" strokeWidth="3">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <line key={i} x1="60" y1="52" x2={60 + Math.cos(a) * 80} y2={52 + Math.sin(a) * 80} />;
          })}
        </g>
        <g transform="translate(60 122) scale(1.16) translate(-60 -122)">
          {/* pescoço */}
          <rect x="51" y="70" width="18" height="20" rx="5" fill="#D99A00" />
          {/* camisa do clube */}
          <path d={SHIRT} fill={primary} />
          <g clipPath={`url(#lf-shirt-${uid})`}>
            {pattern === 'listras' && [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={10 + i * 16} y="80" width="8" height="40" fill={secondary} />)}
            {pattern === 'aros' && [0, 1, 2].map((i) => <rect key={i} x="0" y={92 + i * 12} width="120" height="6" fill={secondary} />)}
            {pattern === 'faixa' && <polygon points="22,86 38,86 98,120 82,120" fill={secondary} />}
            {pattern === 'metade' && <rect x="60" y="80" width="60" height="40" fill={secondary} />}
          </g>
          <path
            d="M49 86 L60 98 L71 86"
            fill="none"
            stroke={pattern === 'liso' ? secondary : shade(primary, -0.25)}
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {/* cabeça amarela, sem traços */}
          <ellipse cx="43" cy="56" rx="3.6" ry="5.4" fill="#E8A900" />
          <ellipse cx="77" cy="56" rx="3.6" ry="5.4" fill="#E8A900" />
          <ellipse cx="60" cy="53" rx="17" ry="21" fill={`url(#lf-head-${uid})`} />
          <ellipse cx="53.5" cy="41" rx="5.5" ry="3.2" fill="#FFFFFF" opacity="0.5" transform="rotate(-18 53.5 41)" />
        </g>
      </svg>
      <span className="legend-crown" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
        </svg>
      </span>
    </span>
  );
}

export const LegendFigure = memo(LegendFigureImpl);
