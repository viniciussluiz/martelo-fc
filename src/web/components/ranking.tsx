import { useEffect, useState } from 'react';
import {
  COMPETITION_LABEL,
  RANKING_COMPETITIONS,
  seasonLabel,
  type RankingCompetition,
  type RankingGain,
  type RankingRow,
  type RankingView,
  type RoomRankingView,
  type TitleCounts,
} from '../../shared/ranking';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { TeamCrest } from './crest/TeamCrest';
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

/** Lista curta de técnicos (ranking da sala, top 5 da tela inicial). */
function MiniRanking({
  rows,
  you,
  record,
  titles = true,
}: {
  rows: Array<RankingRow & { guest?: boolean }>;
  you: string | null;
  record?: boolean;
  titles?: boolean;
}) {
  return (
    <ol className="mini-ranking">
      {rows.map((r) => (
        <li key={r.userId} data-me={r.userId === you || undefined}>
          <span className="pos-num" data-top={r.position <= 3 ? r.position : undefined}>
            {r.position}
          </span>
          <TeamCrest userId={r.userId} name={r.name} crest={r.crest} size={30} />
          <span className="mini-ranking-text">
            <strong>
              {r.name}
              {r.userId === you && <span className="badge badge-me">você</span>}
            </strong>
            {record && (
              <span className="small muted">
                {r.won}V {r.drawn}E {r.lost}D
              </span>
            )}
          </span>
          {titles && RANKING_COMPETITIONS.some((c) => r.titles[c] > 0) && <TitleChips titles={r.titles} />}
          <span className="mini-ranking-pts">
            <strong>{fmtInt(r.points)}</strong>
            <span className="small muted">pts</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Ranking da sala: os pontos de cada técnico só nos ciclos desta sala (mesma conta do ranking geral,
 * visitantes incluídos). Aparece a partir de dois técnicos humanos com pontos.
 */
export function RoomRankingPanel({ code, finished, you }: { code: string; finished: number; you: string | null }) {
  const [view, setView] = useState<RoomRankingView | null>(null);
  useEffect(() => {
    if (finished === 0) return;
    let alive = true;
    api<RoomRankingView>('GET', `/api/rooms/${encodeURIComponent(code)}/ranking`)
      .then((v) => alive && setView(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [code, finished]);
  if (!view || view.rows.length < 2) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Ranking da sala</h2>
        <span className="panel-head-aside">
          {view.cycles} {view.cycles === 1 ? 'ciclo' : 'ciclos'}
        </span>
      </div>
      <MiniRanking rows={view.rows} you={you} record />
      <p className="hint mini-ranking-note">
        Só os ciclos desta sala, com a mesma pontuação do{' '}
        <a
          href="/ranking"
          onClick={(e) => {
            e.preventDefault();
            navigate('/ranking');
          }}
        >
          ranking
        </a>
        .
      </p>
    </section>
  );
}

/** Tela inicial: os 5 primeiros da temporada e onde você está. */
export function TopRankingCard({ you }: { you: string | null }) {
  const [view, setView] = useState<RankingView | null>(null);
  useEffect(() => {
    let alive = true;
    api<RankingView>('GET', '/api/ranking?limite=5')
      .then((v) => alive && setView(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [you]);
  if (!view) return null;
  const month = seasonLabel(view.current, true);
  const me = view.me;
  return (
    <section className="panel top-ranking">
      <div className="panel-head">
        <h2>Top 5 de {month}</h2>
      </div>
      {view.rows.length === 0 ? (
        <p className="panel-body small">Ninguém pontuou em {month} ainda. Termine uma disputa e saia na frente.</p>
      ) : (
        // Na coluna estreita da tela inicial, só nome e pontos: os títulos estão na página do ranking.
        <MiniRanking rows={view.rows} you={you} titles={false} />
      )}
      <div className="top-ranking-foot">
        {me && me.position === 0 && <span className="small">Você tem {fmtInt(me.points)} pontos. Crie sua conta para entrar na lista.</span>}
        {me && me.position > view.rows.length && (
          <span className="small">
            Você: <strong>{me.position}º</strong> · {fmtInt(me.points)} pontos
          </span>
        )}
        <button type="button" className="btn btn-sm" onClick={() => navigate('/ranking')}>
          <Icon name="podio" /> Ver ranking
        </button>
      </div>
    </section>
  );
}
