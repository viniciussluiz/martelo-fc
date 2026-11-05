import { memo, useMemo, useState } from 'react';
import { clubCode } from '../../shared/clubs';
import { crestHash, crestLuminance, type CrestConfig, type CrestPattern } from '../../shared/crest';
import { useStore } from '../lib/store';
import { Crest } from './crest/Crest';

/**
 * Escudo do clube da carta. Usa o escudo oficial que o servidor indicar (arquivo em `data/escudos/` ou
 * endereço registrado em `data/escudos/fontes.json`, ver `npm run escudos`). Sem escudo — ou se a
 * imagem não carregar — mostra o selo do jogo: um escudo nas cores do clube com a sigla.
 */

const FALLBACK: [string, string] = ['#33415F', '#FFFFFF'];
const PATTERNS: CrestPattern[] = ['liso', 'topo', 'listras', 'faixa', 'metade', 'liso'];

function genericCrest(club: string, kit: [string, string] | undefined): CrestConfig {
  const [primary, secondaryRaw] = kit ?? FALLBACK;
  const close = Math.abs(crestLuminance(primary) - crestLuminance(secondaryRaw)) < 0.14;
  const secondary = close ? (crestLuminance(primary) > 0.5 ? '#24160C' : '#FFFFFF') : secondaryRaw;
  const h = crestHash(club);
  const pattern = PATTERNS[h % PATTERNS.length]!;
  return {
    shape: (['classico', 'frances', 'redondo'] as const)[(h >> 3) % 3]!,
    pattern: pattern === 'topo' ? 'liso' : pattern,
    primary: primary.toUpperCase(),
    secondary: secondary.toUpperCase(),
    detail: pattern === 'liso' ? secondary.toUpperCase() : crestLuminance(primary) > 0.6 ? '#24160C' : '#FFFFFF',
    symbol: 'iniciais',
    initials: clubCode(club).slice(0, 4),
    motto: '',
    stars: 0,
    ribbon: false,
    laurel: false,
    medallion: pattern !== 'liso',
    border: 'simples',
  };
}

interface Props {
  club: string;
  kit?: [string, string] | undefined;
  size?: number;
}

function ClubBadgeImpl({ club, kit, size = 28 }: Props) {
  const crest = useStore((s) => s.room?.deck?.crests?.[club]);
  const [failed, setFailed] = useState<string | null>(null);
  const generic = useMemo(() => genericCrest(club, kit), [club, kit]);
  if (crest && failed !== crest) {
    return (
      <img
        className="club-badge club-crest"
        src={crest}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(crest)}
      />
    );
  }
  return (
    <span className="club-badge club-generic" style={{ height: size }}>
      <Crest crest={generic} size={size} />
    </span>
  );
}

export const ClubBadge = memo(ClubBadgeImpl);

/** Escudo do clube e, ao lado, “Clube (ano)” — como aparece nas cartas. */
export function ClubLine({ club, year, kit, size }: { club: string; year: number; kit?: [string, string] | undefined; size?: number }) {
  return (
    <span className="club-line">
      <ClubBadge club={club} kit={kit} size={size} />
      <span className="club-label">
        <span className="club-name">{club}</span> <span className="club-year">({year})</span>
      </span>
    </span>
  );
}
