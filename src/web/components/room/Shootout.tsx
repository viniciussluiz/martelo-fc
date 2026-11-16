import type { PenaltyKick } from '../../../engine/match';
import type { MatchView } from '../../../shared/protocol';
import { kickMs, shootoutAt } from '../../../shared/shootout';

export type ShootoutState = ReturnType<typeof shootoutAt>;

/** Onde a disputa de pênaltis do jogo está agora (nulo se o jogo não teve disputa cobrança por cobrança). */
export function shootoutState(match: MatchView, tickMs: number, sinceWhistleMs: number): ShootoutState | null {
  const n = match.penaltyKicks?.length ?? 0;
  return n ? shootoutAt(n, tickMs, sinceWhistleMs) : null;
}

/** Placar da disputa contando só as cobranças que já terminaram na tela. */
export function shootoutScore(kicks: PenaltyKick[], done: number): { home: number; away: number } {
  const seen = kicks.slice(0, done);
  return { home: seen.filter((k) => k.side === 'home' && k.outcome === 'gol').length, away: seen.filter((k) => k.side === 'away' && k.outcome === 'gol').length };
}

/**
 * Bolinhas de um time: verde no gol, vermelha no erro, vazia no que falta da série de cinco.
 * As alternadas vão aparecendo uma a uma (o total nunca é mostrado antes, para não entregar o fim).
 */
export function PenaltyDots({ kicks, side, state, mini }: { kicks: PenaltyKick[]; side: 'home' | 'away'; state: ShootoutState; mini?: boolean }) {
  const mine = kicks.map((k, i) => ({ k, i })).filter((x) => x.k.side === side);
  const shown = mine.filter((x) => x.i < state.done || x.i === state.current);
  const slots = Math.max(5, shown.length);
  return (
    <span className="pk-dots" data-mini={mini || undefined}>
      {Array.from({ length: slots }, (_, n) => {
        const x = shown[n];
        const finished = x && x.i < state.done;
        return <i key={n} data-r={finished ? (x.k.outcome === 'gol' ? 'gol' : 'erro') : undefined} data-now={(x && !finished) || undefined} />;
      })}
    </span>
  );
}

const STAMP: Record<PenaltyKick['outcome'], string> = { gol: 'GOL!', defesa: 'DEFENDEU!', trave: 'NA TRAVE!', fora: 'PRA FORA!' };

/** Para onde a bola e o goleiro vão em cada cobrança (varia com o número dela, sempre igual para todo mundo). */
function aim(kick: PenaltyKick, index: number): { ball: [number, number]; keeper: [number, number, number] } {
  const left = (index * 7 + kick.name.length) % 2 === 0;
  const high = (index * 5 + kick.name.length) % 3 === 0;
  const sx = left ? -1 : 1;
  switch (kick.outcome) {
    case 'gol': {
      // Bola num canto; o goleiro pula para o outro lado.
      return { ball: [300 + sx * 150, high ? 92 : 196], keeper: [300 - sx * 78, 176, -sx * 58] };
    }
    case 'defesa':
      return { ball: [300 + sx * 96, high ? 128 : 178], keeper: [300 + sx * 78, high ? 150 : 182, sx * 62] };
    case 'trave':
      return high ? { ball: [300 + sx * 60, 58], keeper: [300 + sx * 40, 168, sx * 30] } : { ball: [300 + sx * 191, 150], keeper: [300 + sx * 80, 176, sx * 58] };
    default:
      return { ball: [300 + sx * (high ? 90 : 238), high ? 12 : 96], keeper: [300 + sx * 60, 176, sx * 45] };
  }
}

/** O gol visto de frente: a cobrança da vez (bola, goleiro e o selo do resultado). */
export function ShootoutGoal({ match, state, tickMs }: { match: MatchView; state: ShootoutState; tickMs: number }) {
  const kicks = match.penaltyKicks ?? [];
  const index = state.current ?? (state.over ? kicks.length - 1 : null);
  const kick = index === null ? null : kicks[index]!;
  const target = kick && index !== null ? aim(kick, index) : null;
  const per = kickMs(kicks.length, tickMs);
  const team = kick ? (kick.side === 'home' ? match.homeName : match.awayName) : '';
  const vars = target
    ? ({
        '--pk-dx': `${target.ball[0] - 300}px`,
        '--pk-dy': `${target.ball[1] - 298}px`,
        '--pk-kx': `${target.keeper[0] - 300}px`,
        '--pk-ky': `${target.keeper[1] - 186}px`,
        '--pk-kr': `${target.keeper[2]}deg`,
        '--pk-per': `${Math.round(per)}ms`,
      } as React.CSSProperties)
    : undefined;
  return (
    <div className="pk-stage" data-idle={!kick || undefined} style={vars} aria-hidden="true">
      <svg viewBox="0 0 600 330" preserveAspectRatio="xMidYMid slice">
        <rect x="0" y="0" width="600" height="150" fill="#22401f" />
        <g opacity=".5">
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={((i * 37) % 600) + 8} cy={20 + ((i * 53) % 110)} r="6" fill={['#ffd76a', '#fff', '#e5483a', '#7fb8ff'][i % 4]} />
          ))}
        </g>
        <rect x="110" y="60" width="380" height="170" fill="rgba(255,255,255,.10)" />
        <g stroke="rgba(255,255,255,.45)" strokeWidth="1.5">
          {Array.from({ length: 19 }, (_, i) => (
            <line key={`v${i}`} x1={110 + i * 20} y1="60" x2={110 + i * 20} y2="230" />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <line key={`h${i}`} x1="110" y1={60 + i * 21.25} x2="490" y2={60 + i * 21.25} />
          ))}
        </g>
        <path d="M110 232 V60 H490 V232" fill="none" stroke="#fff" strokeWidth="9" strokeLinejoin="round" />
        <line x1="0" y1="232" x2="600" y2="232" stroke="#fff" strokeWidth="4" />
        <ellipse cx="300" cy="300" rx="7" ry="3" fill="#fff" />
        {/* key por cobrança: a animação recomeça a cada batedor */}
        <g key={`k${index ?? 'x'}`} className="pk-keeper" transform="translate(300 186)">
          <g className="pk-keeper-body">
            <rect x="-16" y="-34" width="32" height="46" rx="10" fill="#7a4fd0" stroke="#24160c" strokeWidth="4" />
            <circle cx="0" cy="-48" r="13" fill="#f2c79a" stroke="#24160c" strokeWidth="4" />
            <rect x="-46" y="-34" width="32" height="12" rx="6" fill="#7a4fd0" stroke="#24160c" strokeWidth="4" />
            <rect x="14" y="-34" width="32" height="12" rx="6" fill="#7a4fd0" stroke="#24160c" strokeWidth="4" />
            <rect x="-14" y="10" width="11" height="30" rx="5" fill="#24160c" />
            <rect x="3" y="10" width="11" height="30" rx="5" fill="#24160c" />
          </g>
        </g>
        <g key={`b${index ?? 'x'}`} className="pk-ball" transform="translate(300 298)">
          <g className="pk-ball-body">
            <circle r="13" fill="#fff" stroke="#24160c" strokeWidth="4" />
            <circle r="4" fill="#24160c" />
          </g>
        </g>
      </svg>
      <div className="pk-caption">
        <span className="pk-kicker">{kick ? `${kick.name} (${team})` : 'Vai para os pênaltis!'}</span>
        {kick && (
          <span key={`s${index}`} className="pk-stamp" data-r={kick.outcome === 'gol' ? 'gol' : 'erro'}>
            {STAMP[kick.outcome]}
          </span>
        )}
      </div>
    </div>
  );
}

const ORDINAL = (n: number) => `${n}ª`;

/** Coluna da direita durante a disputa: as bolinhas dos dois times e a narração de cada cobrança. */
export function ShootoutFeed({ match, state }: { match: MatchView; state: ShootoutState }) {
  const kicks = match.penaltyKicks ?? [];
  const seen = kicks.slice(0, state.done).map((k, i) => ({ k, n: i + 1 }));
  return (
    <div className="live-feed">
      <div className="live-feed-title">Disputa de pênaltis</div>
      <div className="pk-tally">
        <span className="pk-tally-name">{match.homeName}</span>
        <PenaltyDots kicks={kicks} side="home" state={state} />
        <span className="pk-tally-name">{match.awayName}</span>
        <PenaltyDots kicks={kicks} side="away" state={state} />
      </div>
      <ul className="radio" aria-live="polite">
        {seen.length ? (
          seen.reverse().map(({ k, n }) => (
            <li key={n} data-goal={k.outcome === 'gol'}>
              <span className="min">{ORDINAL(n)}</span>
              <span>{k.text}</span>
            </li>
          ))
        ) : (
          <li>
            <span className="min">·</span>
            <span>Empate no tempo normal: a vaga sai nos pênaltis.</span>
          </li>
        )}
      </ul>
    </div>
  );
}
