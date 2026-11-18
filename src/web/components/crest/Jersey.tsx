import { useId, type ReactNode } from 'react';
import {
  colorDistance,
  crestLuminance,
  type CrestConfig,
  type KitBrand,
  type KitColors,
  type KitMaster,
  type KitPattern,
  type TeamKits,
} from '../../../shared/crest';
import { BASEHIT_ICON, BASEHIT_NAME, BASEHIT_PURPLE, BASEHIT_VIEWBOX } from './basehit-logo';
import { BRAND_MARK_PATH } from './brand-marks';
import { Crest, INK, inkOn } from './Crest';
import { PAGARTU_FLORESTA, PAGARTU_LARANJA, PAGARTU_PAGAR, PAGARTU_TU, PAGARTU_VIEWBOX, RESERVAI_TEAL } from './sponsor-logos';

/**
 * Camisa do uniforme desenhada a partir da receita: corpo com o padrão na cor dos detalhes, mangas,
 * gola e punhos, o escudo do clube no peito, a marca do material esportivo e o patrocínio master. Quadro de 200 × 190. O master são as marcas da casa (Pagartu, Reservai.ai e Basehit); as marcas de
 * material esportivo são inventadas.
 */

const BODY = 'M62 14 Q100 40 138 14 L150 20 L150 178 Q100 186 50 178 L50 20 Z';
const SLEEVE_L = 'M50 20 L62 14 Q56 36 50 62 L50 74 L22 84 L6 50 Z';
const SLEEVE_R = 'M150 20 L138 14 Q144 36 150 62 L150 74 L178 84 L194 50 Z';
const COLLAR = 'M62 14 Q100 40 138 14 L130 9 Q100 30 70 9 Z';
const CUFF_L = 'M22 84 L6 50 L11.5 47.4 L27.5 81.6 Z';
const CUFF_R = 'M178 84 L194 50 L188.5 47.4 L172.5 81.6 Z';

/** O padrão da camisa, desenhado no corpo (x 50–150, y 14–186). */
function PatternArt({ pattern, color }: { pattern: KitPattern; color: string }): ReactNode {
  switch (pattern) {
    case 'listras':
      return [0, 2, 4].map((k) => <rect key={k} x={60 + k * 16.6} y={0} width={14} height={200} fill={color} />);
    case 'listras-finas':
      return Array.from({ length: 9 }, (_, k) => <rect key={k} x={53 + k * 11.2} y={0} width={3.4} height={200} fill={color} />);
    case 'aros':
      return [0, 1, 2, 3, 4].map((k) => <rect key={k} x={0} y={36 + k * 30} width={200} height={14} fill={color} />);
    case 'faixa-central':
      return <rect x={84} y={0} width={32} height={200} fill={color} />;
    case 'faixa-peito':
      return <rect x={0} y={70} width={200} height={34} fill={color} />;
    case 'faixa-diagonal':
      return <rect x={-20} y={84} width={260} height={30} fill={color} transform="rotate(-38 100 100)" />;
    case 'divisa':
      return <path d="M50 50 L100 96 L150 50 L150 78 L100 124 L50 78 Z" fill={color} />;
    case 'xadrez': {
      const s = 25;
      const cells: ReactNode[] = [];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 4; col++) {
          if ((row + col) % 2 === 0) cells.push(<rect key={`${row}-${col}`} x={50 + col * s} y={14 + row * s} width={s} height={s} fill={color} />);
        }
      }
      return cells;
    }
    case 'metade':
      return <rect x={100} y={0} width={100} height={200} fill={color} />;
    case 'cruz':
      return (
        <>
          <rect x={88} y={0} width={24} height={200} fill={color} />
          <rect x={0} y={74} width={200} height={24} fill={color} />
        </>
      );
    default:
      return null;
  }
}

/** Marca do material esportivo: a silhueta da marca escolhida (quadro de 64 × 40). */
export function BrandMark({ brand, color }: { brand: KitBrand; color: string }): ReactNode {
  if (brand === 'nenhum') return null;
  return <path d={BRAND_MARK_PATH[brand]} fill={color} fillRule="evenodd" />;
}

/**
 * Patrocínio master: a logo da marca no peito, sobre uma plaquinha da cor da camisa (para continuar
 * legível em cima de listras e xadrez). Em camisa escura entra a versão negativa (letras brancas).
 */
function MasterArt({ master, shirt }: { master: KitMaster; shirt: string }): ReactNode {
  if (master === 'nenhum') return null;
  const dark = crestLuminance(shirt) < 0.45;
  const plate = <rect x={54} y={94} width={92} height={30} rx={6} fill={shirt} opacity={0.9} />;
  if (master === 'pagartu') {
    // Sobre laranja, o nome inteiro em Floresta (a versão de uma cor do kit da marca).
    const onOrange = colorDistance(shirt, PAGARTU_LARANJA) < 70;
    const pagar = onOrange || !dark ? PAGARTU_FLORESTA : '#FFFFFF';
    const tu = onOrange ? PAGARTU_FLORESTA : PAGARTU_LARANJA;
    const k = 84 / PAGARTU_VIEWBOX.w;
    return (
      <g className="jersey-master">
        {plate}
        <g transform={`translate(58 ${109 - (PAGARTU_VIEWBOX.h * k) / 2 + 2}) scale(${k}) translate(0 ${-PAGARTU_VIEWBOX.y})`}>
          <path d={PAGARTU_PAGAR} fill={pagar} />
          <path d={PAGARTU_TU} fill={tu} />
        </g>
      </g>
    );
  }
  if (master === 'basehit') {
    // Basehit: o símbolo roxo e o nome (preto; branco em camisa escura). Em camisa roxa, o símbolo vai na cor do nome.
    const name = dark ? '#FFFFFF' : '#000000';
    const icon = colorDistance(shirt, BASEHIT_PURPLE) < 110 ? name : BASEHIT_PURPLE;
    const k = 84 / BASEHIT_VIEWBOX.w;
    return (
      <g className="jersey-master">
        {plate}
        <g transform={`translate(58 ${109 - (BASEHIT_VIEWBOX.h * k) / 2}) scale(${k})`}>
          <path d={BASEHIT_ICON} fill={icon} fillRule="evenodd" />
          <path d={BASEHIT_NAME} fill={name} fillRule="evenodd" />
        </g>
      </g>
    );
  }
  // Reservai.ai: as três setas e o nome em preto (em camisa escura, branco, para continuar legível).
  return (
    <g className="jersey-master">
      {plate}
      <g transform="translate(57 102)">
        {RESERVAI_TEAL.map((c, i) => (
          <path key={c} d="M0 0 H4.8 L10 7 L4.8 14 H0 L5.2 7 Z" transform={`translate(${i * 5.8} 0)`} fill={c} />
        ))}
        <text className="jersey-reservai" x={23.5} y={11.8} fontSize={13} textLength={62.5} lengthAdjust="spacingAndGlyphs" fill={dark ? '#FFFFFF' : '#000000'}>
          Reservai.ai
        </text>
      </g>
    </g>
  );
}

export function Jersey({
  kit,
  kits,
  crest,
  size = 220,
  simple,
  title,
}: {
  kit: KitColors;
  /** De onde saem os patrocinadores e a marca (os mesmos nos dois uniformes). */
  kits?: Pick<TeamKits, 'master' | 'brand'>;
  /** Escudo do clube, no peito. */
  crest?: CrestConfig;
  size?: number;
  /** Miniatura: só camisa e padrão. */
  simple?: boolean;
  title?: string;
}) {
  const clip = `jersey-${useId().replace(/:/g, '')}`;
  const pattern = kit.pattern ?? 'liso';
  const sleeveColor = pattern === 'mangas' ? kit.trim : kit.shirt;
  // Tinta dos patrocínios: a que aparece sobre a camisa, com um contorno da cor da camisa por baixo
  // (assim o texto continua legível em cima de listras e xadrez).
  const ink = inkOn(kit.shirt);
  const halo = kit.shirt;
  const cuff = pattern === 'mangas' ? kit.shirt : kit.trim;
  return (
    <svg className="jersey" width={size} height={(size * 190) / 200} viewBox="0 0 200 190" role="img" aria-label={title ?? 'Uniforme'}>
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <path d={SLEEVE_L} fill={sleeveColor} />
      <path d={SLEEVE_R} fill={sleeveColor} />
      <path d={BODY} fill={kit.shirt} />
      <g clipPath={`url(#${clip})`}>
        <PatternArt pattern={pattern} color={kit.trim} />
        {/* Sombra leve nas laterais, para a camisa não parecer chapada. */}
        <rect x={50} y={0} width={9} height={200} fill="#000" opacity={0.08} />
        <rect x={141} y={0} width={9} height={200} fill="#000" opacity={0.08} />
      </g>
      <path d={CUFF_L} fill={cuff} />
      <path d={CUFF_R} fill={cuff} />
      <path d={COLLAR} fill={kit.trim} />
      <g fill="none" stroke={INK} strokeWidth={simple ? 5 : 3} strokeLinejoin="round">
        <path d={SLEEVE_L} />
        <path d={SLEEVE_R} />
        <path d={BODY} />
        <path d={COLLAR} strokeWidth={simple ? 3 : 2} />
      </g>
      {!simple && (
        <>
          {kits?.brand && kits.brand !== 'nenhum' && (
            <g transform="translate(57 42) scale(0.47)">
              <rect x={-4} y={-3} width={72} height={44} rx={8} fill={halo} opacity={0.85} />
              <BrandMark brand={kits.brand} color={ink} />
            </g>
          )}
          {crest && (
            <g transform="translate(118 40)">
              <Crest crest={crest} size={26} simple />
            </g>
          )}
          <MasterArt master={kits?.master ?? 'nenhum'} shirt={kit.shirt} />
        </>
      )}
    </svg>
  );
}
