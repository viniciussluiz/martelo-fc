import { memo, useId } from 'react';
import { clubCode } from '../../shared/clubs';
import { useStore } from '../lib/store';

/**
 * Selo do clube ao lado do nome. Por padrão é um desenho genérico do jogo (escudo liso nas
 * cores do clube com a sigla), não o escudo oficial. Se o servidor tiver o escudo do clube em
 * `data/escudos/` (colocado por quem tem autorização para usá-lo), mostra a imagem.
 */

const FALLBACK: [string, string] = ['#33415F', '#FFFFFF'];

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const SHIELD = 'M2 2H22V13C22 20 17.2 24.6 12 26.6C6.8 24.6 2 20 2 13Z';

interface Props {
  club: string;
  kit?: [string, string] | undefined;
  size?: number;
}

function ClubBadgeImpl({ club, kit, size = 26 }: Props) {
  const crest = useStore((s) => s.room?.deck?.crests?.[club]);
  const uid = useId().replace(/:/g, '');
  if (crest) {
    return <img className="club-badge club-crest" src={crest} alt="" width={size} height={size} loading="lazy" decoding="async" />;
  }
  const [primary, secondary] = kit ?? FALLBACK;
  const code = clubCode(club);
  // Texto sobre a cor principal: escolhe o tom que contrasta.
  const ink = luminance(primary) > 0.6 ? '#14213D' : '#FFFFFF';
  const band = Math.abs(luminance(primary) - luminance(secondary)) < 0.12 ? ink : secondary;
  const fontSize = code.length <= 2 ? 10.5 : code.length === 3 ? 9.4 : code.length === 4 ? 7.4 : 6;
  return (
    <svg className="club-badge" viewBox="0 0 24 28" width={size} height={Math.round((size * 28) / 24)} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`shield-${uid}`}>
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <path d={SHIELD} fill={primary} />
      <rect x="0" y="0" width="24" height="6" fill={band} clipPath={`url(#shield-${uid})`} />
      <text x="12" y="18.4" textAnchor="middle" fontSize={fontSize} fontWeight="800" fill={ink} fontFamily="Big Shoulders Display, Public Sans, sans-serif">
        {code}
      </text>
      <path d={SHIELD} fill="none" stroke="#14213D" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export const ClubBadge = memo(ClubBadgeImpl);

/** “Clube, ano” com o selo do clube na frente, como aparece nas cartas. */
export function ClubLine({ club, year, kit }: { club: string; year: number; kit?: [string, string] | undefined }) {
  return (
    <span className="club-line">
      <ClubBadge club={club} kit={kit} />
      <span>
        <span className="club-name">{club}</span>, {year}
      </span>
    </span>
  );
}
