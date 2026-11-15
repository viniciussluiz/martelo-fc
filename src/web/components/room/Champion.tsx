import { useEffect, type ReactNode } from 'react';
import { TeamCrest } from '../crest/TeamCrest';

/** Arte do campeão de cada competição (arquivos em src/web/public/campeoes/). */
export const CHAMPION_ART: Record<string, string> = {
  liga: '/campeoes/liga.webp',
  copa8: '/campeoes/liga.webp',
  libertadores: '/campeoes/continental.webp',
  mundial: '/campeoes/mundial.webp',
};

export interface Champion {
  art: string;
  title: string;
  teamId: string;
  name: string;
  userId: string | null;
}

/** Confete dourado caindo sem parar por cima da arte. */
export function GoldConfetti({ count = 34, seed = 1 }: { count?: number; seed?: number }) {
  const rnd = (i: number, k: number) => {
    const v = Math.sin((i + 1) * 9301 * k + seed * 49297) * 233280;
    return v - Math.floor(v);
  };
  return (
    <span className="champ-confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${(rnd(i, 1) * 100).toFixed(1)}%`,
              width: `${(5 + rnd(i, 2) * 7).toFixed(1)}px`,
              height: `${(8 + rnd(i, 3) * 12).toFixed(1)}px`,
              animationDelay: `-${(rnd(i, 4) * 6).toFixed(2)}s`,
              animationDuration: `${(3.6 + rnd(i, 5) * 3.4).toFixed(2)}s`,
              '--drift': `${((rnd(i, 6) - 0.5) * 120).toFixed(0)}px`,
              '--spin': `${Math.round(rnd(i, 7) * 1080 - 540)}deg`,
              '--tone': ['#ffd76a', '#f5b82e', '#fff1b8', '#c98f12'][i % 4],
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Pôster do campeão: escudo e nome do time acima da arte do troféu, com confete caindo por cima de tudo. */
export function ChampionPoster({ champion, seed = 1 }: { champion: Champion; seed?: number }) {
  const { art, title, teamId, name, userId } = champion;
  return (
    <figure className="champ">
      <GoldConfetti seed={seed} />
      <figcaption className="champ-team">
        <span className="champ-crest">
          <TeamCrest id={teamId} name={name} userId={userId} size={60} />
        </span>
        <span className="champ-who">
          <strong className="champ-name">{name}</strong>
          <span className="champ-title">{title}</span>
        </span>
      </figcaption>
      <div className="champ-art" style={{ backgroundImage: `url(${art})` }} role="img" aria-label={`${title}: ${name}`} />
    </figure>
  );
}

/**
 * A festa do campeão em tela quase cheia, por cima de tudo — todo mundo na sala vê quem ganhou.
 * `children` é o rodapé (contagem para a copa, botão do anfitrião…).
 */
export function ChampionModal({ champions, seed = 1, onClose, children }: { champions: Champion[]; seed?: number; onClose: () => void; children?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="champ-modal" role="dialog" aria-modal="true" aria-label={champions.map((c) => `${c.title}: ${c.name}`).join('; ')}>
      <GoldConfetti seed={seed + 3} count={60} />
      <div className="champ-modal-posters" data-count={champions.length}>
        {champions.map((c, i) => (
          <ChampionPoster key={`${c.title}${c.teamId}`} champion={c} seed={seed + i * 7} />
        ))}
      </div>
      <div className="champ-modal-foot">
        {children}
        <button type="button" className="btn" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
