import { memo, useId } from 'react';

/**
 * Figurinha ilustrada do jogador (desenho próprio, sem rosto e sem foto).
 * Os traços (pele, cabelo, barba) saem de uma semente estável por jogador;
 * a camisa usa as cores oficiais do clube quando o baralho as tem.
 * Lendas ganham destaque: avatar maior, aro dourado com brilho e coroa.
 */

const SKIN = ['#F6D7C3', '#EBC2A0', '#DDAA82', '#C98D66', '#AD7049', '#8F5636', '#714127', '#4F2D1B'];
const HAIR = ['#1C1714', '#2B1F18', '#3F2A1C', '#5B3B24', '#7A5230', '#A4743F', '#D2A866', '#9B3A1E', '#BDBDBD'];
const HAIR_WEIGHTS = [26, 20, 14, 10, 8, 6, 5, 4, 3];
const STYLES = ['curto', 'raspado', 'cacheado', 'black', 'longo', 'careca', 'moicano', 'topete', 'trancas'] as const;
const STYLE_WEIGHTS = [22, 16, 12, 8, 8, 8, 5, 12, 6];
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

function pick<T>(items: readonly T[], weights: number[], roll: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = (roll % 10_000) / 10_000 * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export interface AvatarTraits {
  skin: string;
  hair: string;
  style: (typeof STYLES)[number];
  beard: boolean;
  pattern: (typeof PATTERNS)[number];
  kit: [string, string];
}

export function avatarTraits(seed: string, club: string, kit?: [string, string]): AvatarTraits {
  const h = hash(seed);
  const h2 = hash(`${seed}:2`);
  const hc = hash(club);
  let style = pick(STYLES, STYLE_WEIGHTS, h2);
  const hair = pick(HAIR, HAIR_WEIGHTS, h >>> 4);
  if (hair === '#BDBDBD' && style === 'black') style = 'curto';
  return {
    skin: SKIN[h % SKIN.length]!,
    hair,
    style,
    beard: (h2 >>> 9) % 100 < 22,
    pattern: PATTERNS[hc % PATTERNS.length]!,
    kit: kit ?? FALLBACK_KITS[hc % FALLBACK_KITS.length]!,
  };
}

interface AvatarProps {
  seed: string;
  club: string;
  kit?: [string, string] | undefined;
  size?: number;
  legend?: boolean;
  mystery?: boolean;
  label?: string;
}

function AvatarImpl({ seed, club, kit, size = 64, legend = false, mystery = false, label }: AvatarProps) {
  const uid = useId().replace(/:/g, '');
  const finalSize = legend ? Math.round(size * 1.3) : size;
  if (mystery) {
    return (
      <span className="avatar avatar-mystery" style={{ width: finalSize, height: finalSize }} role="img" aria-label="Carta-surpresa">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <rect width="120" height="120" fill="#E8E1FA" />
          <path d="M14 120 C14 96 34 84 60 84 C86 84 106 96 106 120 Z" fill="#B9AEE0" />
          <ellipse cx="60" cy="54" rx="17" ry="21" fill="#B9AEE0" />
          <text x="60" y="64" textAnchor="middle" fontSize="28" fontWeight="800" fill="#ffffff" fontFamily="Big Shoulders Display, sans-serif">
            ?
          </text>
        </svg>
      </span>
    );
  }
  const t = avatarTraits(seed, club, kit);
  const [primary, secondaryRaw] = t.kit;
  // Garante contraste entre as duas cores da camisa.
  const secondary = Math.abs(luminance(primary) - luminance(secondaryRaw)) < 0.18 ? (luminance(primary) > 0.5 ? '#14213D' : '#FFFFFF') : secondaryRaw;
  const skinShadow = shade(t.skin, -0.12);
  const hairHi = shade(t.hair, 0.08);
  const shirt = 'M14 120 C14 96 34 84 60 84 C86 84 106 96 106 120 Z';
  return (
    <span
      className={legend ? 'avatar avatar-legend' : 'avatar'}
      style={{ width: finalSize, height: finalSize }}
      role="img"
      aria-label={label ?? (legend ? 'Figurinha de Lenda' : 'Figurinha do jogador')}
      data-legend={legend || undefined}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <clipPath id={`shirt-${uid}`}>
            <path d={shirt} />
          </clipPath>
          {legend && (
            <radialGradient id={`bg-${uid}`} cx="50%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#FFF4C7" />
              <stop offset="55%" stopColor="#F2C94C" />
              <stop offset="100%" stopColor="#B98712" />
            </radialGradient>
          )}
        </defs>
        <rect width="120" height="120" fill={legend ? `url(#bg-${uid})` : '#E6ECF5'} />
        {legend && (
          <g opacity="0.35" stroke="#FFF7DA" strokeWidth="3">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <line key={i} x1="60" y1="52" x2={60 + Math.cos(a) * 80} y2={52 + Math.sin(a) * 80} />;
            })}
          </g>
        )}
        <g transform="translate(60 122) scale(1.16) translate(-60 -122)">
        {/* cabelo comprido (atrás da cabeça) */}
        {t.style === 'longo' && <path d="M40 52 C38 32 50 26 60 26 C71 26 82 32 80 52 L83 86 C76 90 70 86 70 80 L50 80 C50 86 44 90 37 86 Z" fill={t.hair} />}
        {/* pescoço */}
        <rect x="51" y="70" width="18" height="20" rx="5" fill={skinShadow} />
        {/* camisa */}
        <path d={shirt} fill={primary} />
        <g clipPath={`url(#shirt-${uid})`}>
          {t.pattern === 'listras' && [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={10 + i * 16} y="80" width="8" height="40" fill={secondary} />)}
          {t.pattern === 'aros' && [0, 1, 2].map((i) => <rect key={i} x="0" y={92 + i * 12} width="120" height="6" fill={secondary} />)}
          {t.pattern === 'faixa' && <polygon points="22,86 38,86 98,120 82,120" fill={secondary} />}
          {t.pattern === 'metade' && <rect x="60" y="80" width="60" height="40" fill={secondary} />}
        </g>
        <path d="M49 86 L60 98 L71 86" fill="none" stroke={t.pattern === 'liso' ? secondary : shade(primary, -0.25)} strokeWidth="4" strokeLinejoin="round" />
        {/* orelhas e cabeça (sem rosto) */}
        <ellipse cx="43" cy="56" rx="3.6" ry="5.4" fill={skinShadow} />
        <ellipse cx="77" cy="56" rx="3.6" ry="5.4" fill={skinShadow} />
        <ellipse cx="60" cy="53" rx="17" ry="21" fill={t.skin} />
        {t.beard && <path d="M44 58 C45 73 52 77 60 77 C68 77 75 73 76 58 C73 67 67 70 60 70 C53 70 47 67 44 58 Z" fill={t.hair} opacity="0.9" />}
        {/* cabelo */}
        {t.style === 'curto' && <path d="M43 50 C42 35 50 30 60 30 C71 30 79 35 77 50 C75 43 70 39 60 39 C50 39 45 43 43 50 Z" fill={t.hair} />}
        {t.style === 'raspado' && <path d="M44 47 C44 36 51 32 60 32 C69 32 76 36 76 47 C73 41 68 38 60 38 C52 38 47 41 44 47 Z" fill={t.hair} opacity="0.75" />}
        {t.style === 'topete' && (
          <path d="M43 50 C41 34 50 25 63 25 C74 26 80 34 77 50 C75 42 70 37 60 38 C52 39 46 43 43 50 Z M52 27 C58 20 70 20 74 28 C68 25 60 25 52 27 Z" fill={t.hair} />
        )}
        {t.style === 'moicano' && <path d="M55 25 C57 22 63 22 65 25 L65 42 L55 42 Z" fill={t.hair} />}
        {(t.style === 'cacheado' || t.style === 'black') && (
          <g fill={t.hair}>
            {(t.style === 'black'
              ? [
                  [42, 42, 11],
                  [50, 30, 12],
                  [60, 26, 13],
                  [70, 30, 12],
                  [78, 42, 11],
                ]
              : [
                  [45, 42, 8],
                  [51, 33, 9],
                  [60, 30, 9],
                  [69, 33, 9],
                  [75, 42, 8],
                ]
            ).map(([cx, cy, r], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} />
            ))}
            <circle cx="56" cy="31" r="4" fill={hairHi} opacity="0.5" />
          </g>
        )}
        {t.style === 'longo' && <path d="M43 50 C42 34 50 29 60 29 C71 29 79 34 77 50 C73 41 67 38 60 38 C53 38 47 41 43 50 Z" fill={t.hair} />}
        {t.style === 'trancas' && (
          <g>
            <path d="M43 50 C42 35 50 30 60 30 C71 30 79 35 77 50 C75 43 70 39 60 39 C50 39 45 43 43 50 Z" fill={t.hair} />
            {[44, 48, 72, 76].map((x) => (
              <line key={x} x1={x} y1="44" x2={x + (x < 60 ? -3 : 3)} y2="72" stroke={t.hair} strokeWidth="3.4" strokeLinecap="round" />
            ))}
          </g>
        )}
        {t.style === 'careca' && <ellipse cx="54" cy="38" rx="6" ry="3" fill="#ffffff" opacity="0.18" />}
        </g>
      </svg>
      {legend && (
        <span className="avatar-crown" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
          </svg>
        </span>
      )}
    </span>
  );
}

export const Avatar = memo(AvatarImpl);
