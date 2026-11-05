import type { ReactNode } from 'react';
import type { CrestSymbol } from '../../../shared/crest';

/**
 * Símbolos dos escudos, desenhados à mão num quadro 100 × 100 (centro em 50,50).
 * Cada símbolo usa só as cores que recebe — `m` (cor dos detalhes), `t` (um tom da mesma cor),
 * `on` (tinta que contrasta com `m`) — além do contorno escuro, que vem do grupo de fora.
 */

export interface SymbolColors {
  m: string;
  t: string;
  on: string;
  ink: string;
  /** Prefixo único para ids internos (recortes). */
  uid: string;
}

const RED = '#D2392B';
const BEAK = '#FFC81E';
const IVORY = '#F6E7BE';
const WHITE = '#FFFFFF';

function ngon(cx: number, cy: number, r: number, n: number, rotDeg: number): string {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rotDeg + (360 / n) * i) * Math.PI) / 180;
    return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
}

function star(cx: number, cy: number, R: number, r: number, points = 5, rotDeg = -90): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = ((rotDeg + (180 / points) * i) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    return `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`;
  }).join(' ');
}

/** Traço grosso com contorno: desenha a tinta por baixo e a cor por cima. */
function Line({ d, w, color, ink }: { d: string; w: number; color: string; ink: string }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={ink} strokeWidth={w + 5} />
      <path d={d} stroke={color} strokeWidth={w} />
    </g>
  );
}

function gearPoints(): string {
  const pts: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = k * 45;
    for (const [da, r] of [
      [-15, 34],
      [-9, 46],
      [9, 46],
      [15, 34],
    ] as const) {
      const rad = ((a + da) * Math.PI) / 180;
      pts.push(`${(50 + Math.cos(rad) * r).toFixed(2)},${(50 + Math.sin(rad) * r).toFixed(2)}`);
    }
  }
  return pts.join(' ');
}
const GEAR = gearPoints();

const HEART = 'M50 47 C38 38 25 32 25 20 C25 11 33 6 40 9 C44 11 47 14 50 18 C53 14 56 11 60 9 C67 6 75 11 75 20 C75 32 62 38 50 47 Z';

export const SYMBOLS: Record<Exclude<CrestSymbol, 'iniciais' | 'nenhum'>, (c: SymbolColors) => ReactNode> = {
  bola: (c) => (
    <>
      <defs>
        <clipPath id={`${c.uid}-ball`}>
          <circle cx="50" cy="50" r="44" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="44" fill={c.m} />
      <g clipPath={`url(#${c.uid}-ball)`} stroke="none">
        <polygon points={ngon(50, 50, 15, 5, -90)} fill={c.on} />
        {[0, 1, 2, 3, 4].map((i) => {
          const a = ((-90 + 72 * i) * Math.PI) / 180;
          return <polygon key={i} points={ngon(50 + Math.cos(a) * 43, 50 + Math.sin(a) * 43, 14, 5, -90 + 72 * i + 180)} fill={c.on} />;
        })}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = ((-90 + 72 * i) * Math.PI) / 180;
          return (
            <line
              key={`s${i}`}
              x1={50 + Math.cos(a) * 15}
              y1={50 + Math.sin(a) * 15}
              x2={50 + Math.cos(a) * 30}
              y2={50 + Math.sin(a) * 30}
              stroke={c.on}
              strokeWidth="3.2"
            />
          );
        })}
      </g>
      <circle cx="50" cy="50" r="44" fill="none" />
    </>
  ),
  estrela: (c) => (
    <>
      <polygon points={star(50, 53, 47, 19)} fill={c.m} />
      <polygon points={`50,53 ${star(50, 53, 47, 19).split(' ').slice(0, 3).join(' ')}`} fill={c.t} stroke="none" />
    </>
  ),
  coroa: (c) => (
    <>
      <path d="M13 76 L8 30 L30 50 L50 16 L70 50 L92 30 L87 76 Z" fill={c.m} />
      <rect x="10" y="74" width="80" height="16" rx="3" fill={c.t} />
      <circle cx="8" cy="29" r="6.5" fill={c.m} />
      <circle cx="50" cy="15" r="6.5" fill={c.m} />
      <circle cx="92" cy="29" r="6.5" fill={c.m} />
      {[30, 50, 70].map((x) => (
        <circle key={x} cx={x} cy="82" r="4" fill={c.on} />
      ))}
    </>
  ),
  martelo: (c) => (
    <g transform="rotate(-38 50 50)">
      <rect x="44" y="40" width="12" height="56" rx="5" fill={c.t} />
      <rect x="16" y="14" width="68" height="30" rx="5" fill={c.m} />
      <rect x="24" y="12" width="9" height="34" rx="2" fill={c.t} />
      <rect x="67" y="12" width="9" height="34" rx="2" fill={c.t} />
    </g>
  ),
  raio: (c) => (
    <>
      <polygon points="60,3 16,57 44,57 33,97 84,39 56,39 70,3" fill={c.m} />
      <polygon points="60,3 16,57 30,57 62,14 70,3" fill={c.t} stroke="none" />
    </>
  ),
  trofeu: (c) => (
    <>
      <Line d="M28 22 H14 C14 40 20 48 32 52" w={7} color={c.m} ink={c.ink} />
      <Line d="M72 22 H86 C86 40 80 48 68 52" w={7} color={c.m} ink={c.ink} />
      <path d="M25 12 H75 V34 C75 54 64 64 50 66 C36 64 25 54 25 34 Z" fill={c.m} />
      <path d="M33 18 H43 V36 C43 46 46 52 50 56 C38 54 33 46 33 36 Z" fill={c.t} stroke="none" />
      <rect x="44" y="64" width="12" height="14" fill={c.t} />
      <rect x="30" y="76" width="40" height="10" rx="2" fill={c.m} />
      <rect x="23" y="85" width="54" height="10" rx="2" fill={c.t} />
    </>
  ),
  leao: (c) => (
    <>
      <polygon points={star(50, 52, 48, 36, 12, -90)} fill={c.m} />
      <circle cx="31" cy="27" r="8" fill={c.t} />
      <circle cx="69" cy="27" r="8" fill={c.t} />
      <circle cx="50" cy="54" r="27" fill={c.t} />
      <ellipse cx="50" cy="67" rx="14" ry="10" fill={IVORY} />
      <ellipse cx="40" cy="49" rx="3.4" ry="4.4" fill={c.ink} />
      <ellipse cx="60" cy="49" rx="3.4" ry="4.4" fill={c.ink} />
      <polygon points="43,59 57,59 50,66" fill={c.ink} />
      <path d="M50 66 V71 M43 72 Q50 77 57 72" fill="none" strokeWidth="2.6" stroke={c.ink} />
    </>
  ),
  aguia: (c) => (
    <>
      <polygon points="44,38 4,18 11,33 3,40 13,48 7,56 19,62 15,71 42,63" fill={c.m} />
      <polygon points="56,38 96,18 89,33 97,40 87,48 93,56 81,62 85,71 58,63" fill={c.m} />
      <polygon points="42,74 58,74 66,95 50,88 34,95" fill={c.m} />
      <polygon points="39,33 61,33 65,62 50,84 35,62" fill={c.t} />
      <circle cx="50" cy="24" r="11.5" fill={c.m} />
      <polygon points="58,20 72,26 58,31" fill={BEAK} />
      <circle cx="53" cy="22" r="2.4" fill={c.ink} />
    </>
  ),
  galo: (c) => (
    <>
      <path d="M38 58 C20 54 10 36 18 12 C24 30 34 40 46 46 Z" fill={c.t} />
      <path d="M36 64 C16 66 4 52 4 32 C14 48 26 54 42 54 Z" fill={c.m} />
      <path d="M26 62 C26 48 38 44 52 46 C56 40 56 32 58 26 L70 28 C70 40 72 48 76 58 C78 74 68 86 52 86 C36 86 26 76 26 62 Z" fill={c.m} />
      <path d="M38 62 C46 54 58 56 64 64 C56 74 44 74 38 62 Z" fill={c.t} />
      <path d="M56 18 C55 10 61 8 63 13 C64 6 70 6 71 12 C73 8 79 10 76 18 Z" fill={RED} />
      <circle cx="65" cy="24" r="9.5" fill={c.m} />
      <polygon points="73,21 84,25 73,29" fill={BEAK} />
      <ellipse cx="72" cy="33" rx="3.4" ry="5.4" fill={RED} />
      <circle cx="67" cy="22" r="2" fill={c.ink} />
      <path d="M46 86 L44 96 M58 86 L60 96 M38 96 H50 M54 96 H66" fill="none" strokeWidth="3" stroke={c.ink} strokeLinecap="round" />
    </>
  ),
  lobo: (c) => (
    <>
      <polygon points="18,4 38,28 62,28 82,4 88,46 73,72 50,97 27,72 12,46" fill={c.m} />
      <polygon points="22,13 33,28 26,31" fill={c.t} />
      <polygon points="78,13 67,28 74,31" fill={c.t} />
      <polygon points="33,46 50,39 67,46 63,74 50,91 37,74" fill={c.t} />
      <polygon points="29,44 44,47 37,52" fill={c.ink} />
      <polygon points="71,44 56,47 63,52" fill={c.ink} />
      <ellipse cx="50" cy="80" rx="7" ry="5" fill={c.ink} />
    </>
  ),
  touro: (c) => (
    <>
      <path d="M31 34 C17 34 6 26 4 8 C13 19 22 22 35 23 Z" fill={IVORY} />
      <path d="M69 34 C83 34 94 26 96 8 C87 19 78 22 65 23 Z" fill={IVORY} />
      <polygon points="32,36 12,44 31,48" fill={c.t} />
      <polygon points="68,36 88,44 69,48" fill={c.t} />
      <path d="M29 23 H71 L68 62 C66 78 60 88 50 88 C40 88 34 78 32 62 Z" fill={c.m} />
      <polygon points="41,23 50,35 59,23" fill={c.t} />
      <ellipse cx="50" cy="76" rx="16" ry="12" fill={c.t} />
      <ellipse cx="44" cy="77" rx="2.8" ry="3.8" fill={c.ink} />
      <ellipse cx="56" cy="77" rx="2.8" ry="3.8" fill={c.ink} />
      <circle cx="39" cy="47" r="3.4" fill={c.ink} />
      <circle cx="61" cy="47" r="3.4" fill={c.ink} />
    </>
  ),
  tubarao: (c) => (
    <>
      <path d="M10 72 C34 66 58 42 80 6 C72 30 72 54 84 72 Z" fill={c.m} />
      <path d="M80 6 C70 30 66 52 70 70 L60 70 C58 50 66 28 80 6 Z" fill={c.t} stroke="none" />
      <path d="M2 74 Q13 66 24 74 T46 74 T68 74 T90 74 T98 72 V88 H2 Z" fill={c.t} />
      <path d="M2 86 Q13 78 24 86 T46 86 T68 86 T90 86 T98 84 V96 H2 Z" fill={c.m} />
    </>
  ),
  coruja: (c) => (
    <>
      <polygon points="21,32 16,4 40,18" fill={c.m} />
      <polygon points="79,32 84,4 60,18" fill={c.m} />
      <path d="M20 40 C20 18 34 12 50 12 C66 12 80 18 80 40 V64 C80 84 66 95 50 95 C34 95 20 84 20 64 Z" fill={c.m} />
      <ellipse cx="50" cy="73" rx="18" ry="17" fill={c.t} />
      <path d="M42 68 l4 4 l4 -4 M50 68 l4 4 l4 -4 M46 78 l4 4 l4 -4" fill="none" strokeWidth="2.4" stroke={c.ink} />
      <circle cx="36" cy="40" r="13" fill={WHITE} />
      <circle cx="64" cy="40" r="13" fill={WHITE} />
      <circle cx="37.5" cy="41" r="6.5" fill={c.ink} />
      <circle cx="62.5" cy="41" r="6.5" fill={c.ink} />
      <circle cx="39.5" cy="38.5" r="2" fill={WHITE} stroke="none" />
      <circle cx="64.5" cy="38.5" r="2" fill={WHITE} stroke="none" />
      <polygon points="45,51 55,51 50,61" fill={BEAK} />
    </>
  ),
  castelo: (c) => (
    <>
      <path d="M17 10 H32 V21 H43 V10 H57 V21 H68 V10 H83 V36 H77 V95 H23 V36 H17 Z" fill={c.m} />
      <rect x="23" y="36" width="54" height="7" fill={c.t} />
      <path d="M39 95 V73 C39 62 61 62 61 73 V95 Z" fill={c.ink} />
      <rect x="45" y="47" width="10" height="13" rx="5" fill={c.ink} />
    </>
  ),
  ancora: (c) => (
    <>
      <Line d="M50 6 a8 8 0 1 1 0.01 0" w={6} color={c.m} ink={c.ink} />
      <Line d="M14 62 C18 82 34 90 50 90 C66 90 82 82 86 62" w={9} color={c.m} ink={c.ink} />
      <rect x="44.5" y="20" width="11" height="70" rx="3" fill={c.m} />
      <rect x="27" y="30" width="46" height="10" rx="4" fill={c.t} />
      <polygon points="6,68 14,50 24,66" fill={c.m} />
      <polygon points="94,68 86,50 76,66" fill={c.m} />
    </>
  ),
  chama: (c) => (
    <>
      <path d="M50 3 C58 22 79 32 79 58 C79 79 65 95 50 95 C35 95 21 79 21 58 C21 44 29 35 36 29 C36 41 42 47 46 50 C44 33 46 17 50 3 Z" fill={c.m} />
      <path d="M50 40 C57 52 67 58 67 72 C67 84 59 91 50 91 C41 91 33 84 33 72 C33 63 39 57 44 53 C44 61 47 65 50 66 C50 58 48 50 50 40 Z" fill={BEAK} />
    </>
  ),
  montanha: (c) => (
    <>
      <polygon points="68,34 99,88 41,88" fill={c.t} />
      <polygon points="36,12 74,88 1,88" fill={c.m} />
      <polygon points="36,12 47,34 41,30 36,37 30,30 25,34" fill={WHITE} />
      <polygon points="68,34 76,48 71,46 66,50 62,46 61,46" fill={WHITE} />
    </>
  ),
  trevo: (c) => (
    <>
      <Line d="M54 56 C60 72 64 84 74 95" w={6} color={c.t} ink={c.ink} />
      {[0, 90, 180, 270].map((r) => (
        <path key={r} d={HEART} fill={r % 180 ? c.t : c.m} transform={`rotate(${r} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="5" fill={c.m} />
    </>
  ),
  robo: (c) => (
    <>
      <Line d="M50 22 V9" w={4} color={c.t} ink={c.ink} />
      <circle cx="50" cy="8" r="6" fill={RED} />
      <path d="M18 98 C18 87 30 82 50 82 C70 82 82 87 82 98 Z" fill={c.m} />
      <rect x="39" y="72" width="22" height="12" fill={c.t} />
      <rect x="8" y="38" width="12" height="22" rx="3" fill={c.t} />
      <rect x="80" y="38" width="12" height="22" rx="3" fill={c.t} />
      <rect x="17" y="20" width="66" height="56" rx="13" fill={c.m} />
      <circle cx="36" cy="44" r="10" fill={WHITE} />
      <circle cx="64" cy="44" r="10" fill={WHITE} />
      <circle cx="37" cy="45" r="5" fill={c.ink} />
      <circle cx="63" cy="45" r="5" fill={c.ink} />
      <rect x="30" y="59" width="40" height="10" rx="3" fill={c.ink} />
      {[37, 45, 53, 61].map((x) => (
        <rect key={x} x={x} y="59" width="3" height="10" fill={c.m} stroke="none" />
      ))}
    </>
  ),
  chip: (c) => (
    <>
      {[30, 42, 54, 66].map((p) => (
        <g key={p}>
          <rect x={p - 1} y="6" width="6" height="16" rx="1.5" fill={c.t} />
          <rect x={p - 1} y="78" width="6" height="16" rx="1.5" fill={c.t} />
          <rect x="6" y={p - 1} width="16" height="6" rx="1.5" fill={c.t} />
          <rect x="78" y={p - 1} width="16" height="6" rx="1.5" fill={c.t} />
        </g>
      ))}
      <rect x="20" y="20" width="60" height="60" rx="7" fill={c.m} />
      <rect x="33" y="33" width="34" height="34" rx="3" fill={c.t} />
      <circle cx="28" cy="28" r="3.2" fill={c.ink} />
      <path d="M40 50 H60 M50 40 V60" stroke={c.on} strokeWidth="3.2" fill="none" />
    </>
  ),
  engrenagem: (c) => (
    <>
      <polygon points={GEAR} fill={c.m} />
      <circle cx="50" cy="50" r="20" fill={c.t} />
      <circle cx="50" cy="50" r="8.5" fill={c.ink} />
    </>
  ),
};

export const SYMBOL_LABEL: Record<CrestSymbol, string> = {
  bola: 'Bola',
  estrela: 'Estrela',
  coroa: 'Coroa',
  martelo: 'Martelo',
  raio: 'Raio',
  trofeu: 'Taça',
  leao: 'Leão',
  aguia: 'Águia',
  galo: 'Galo',
  lobo: 'Lobo',
  touro: 'Touro',
  tubarao: 'Tubarão',
  coruja: 'Coruja',
  castelo: 'Castelo',
  ancora: 'Âncora',
  chama: 'Chama',
  montanha: 'Montanha',
  trevo: 'Trevo',
  robo: 'Robô',
  chip: 'Chip',
  engrenagem: 'Engrenagem',
  iniciais: 'Sigla',
  nenhum: 'Nenhum',
};
