import { useEffect, useState } from 'react';
import { COMPETITION_LABEL, RANKING_COMPETITIONS, seasonLabel, type RankingCompetition, type RankingGain, type TitleCounts } from '../../shared/ranking';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { Icon } from './Icon';

/** Ícone de cada competição (o mesmo no ranking, no perfil e no resumo). */
export const COMPETITION_ICON: Record<RankingCompetition, string> = {
  mundial: 'coroa',
  libertadores: 'trofeu',
  liga: 'taca',
  copa8: 'medalha',
};

export const fmtInt = (n: number) => n.toLocaleString('pt-BR');

/** Os títulos de um técnico, um selo por competição com a quantidade. */
export function TitleChips({ titles }: { titles: TitleCounts }) {
  const won = RANKING_COMPETITIONS.filter((c) => titles[c] > 0);
  if (won.length === 0) return <span className="muted">—</span>;
  return (
    <span className="title-chips">
      {won.map((c) => (
        <span key={c} className="title-chip" data-c={c} title={`${COMPETITION_LABEL[c]}: ${titles[c]}`}>
          <Icon name={COMPETITION_ICON[c]} size={14} />
          <span aria-hidden="true">{titles[c]}</span>
          <span className="sr-only">
            {titles[c]} {titles[c] === 1 ? 'título' : 'títulos'} de {COMPETITION_LABEL[c]}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Nome da competição com o seu ícone. */
export function CompetitionName({ c }: { c: RankingCompetition }) {
  return (
    <span className="comp-name" data-c={c}>
      <span className="comp-icon">
        <Icon name={COMPETITION_ICON[c]} size={16} />
      </span>
      {COMPETITION_LABEL[c]}
    </span>
  );
}

/** No resumo do fim da disputa: quantos pontos ela rendeu no ranking e a posição na temporada. */
export function RankingGainBar({ disputeId }: { disputeId: string }) {
  const [gain, setGain] = useState<RankingGain | null>(null);
  useEffect(() => {
    let alive = true;
    setGain(null);
    api<{ gain: RankingGain | null }>('GET', `/api/ranking/disputa/${encodeURIComponent(disputeId)}`)
      .then((r) => alive && setGain(r.gain))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [disputeId]);
  if (!gain) return null;
  const { points } = gain;
  const titles = gain.titles.map((c) => COMPETITION_LABEL[c]).join(' e ');
  const month = seasonLabel(gain.season, true);
  return (
    <div className="ranking-gain">
      <span className="ranking-gain-pts">+{fmtInt(points.total)}</span>
      <span className="ranking-gain-text">
        <strong>pontos no ranking</strong>
        <span className="small">
          {fmtInt(points.jogos)} de jogos ({gain.won}V {gain.drawn}E {gain.lost}D)
          {points.titulos > 0 ? ` + ${fmtInt(points.titulos)} de títulos (${titles})` : ''}
        </span>
      </span>
      <span className="ranking-gain-side">
        <span className="ranking-gain-pos">
        {gain.guest ? (
          <a
            href="/entrar"
            onClick={(e) => {
              e.preventDefault();
              navigate('/entrar');
            }}
          >
            Crie sua conta para aparecer no ranking
          </a>
        ) : gain.position ? (
          <>
            Você está em <strong>{gain.position}º</strong> em {month}
          </>
        ) : null}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => navigate('/ranking')}>
          <Icon name="podio" /> Ver ranking
        </button>
      </span>
    </div>
  );
}
