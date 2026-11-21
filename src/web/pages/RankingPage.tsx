import { useEffect, useState } from 'react';
import { COMPETITION_LABEL, RANKING_COMPETITIONS, isSeasonKey, seasonLabel, type RankingRow, type RankingView } from '../../shared/ranking';
import { Empty, Spinner } from '../components/common';
import { TeamCrest } from '../components/crest/TeamCrest';
import { Icon } from '../components/Icon';
import { COMPETITION_ICON, TitleChips, fmtInt } from '../components/ranking';
import { api } from '../lib/api';
import { navigate, usePath } from '../lib/router';
import { useStore } from '../lib/store';

/** Endereço de um período: '/ranking' (temporada atual), '/ranking?temporada=geral' ou '?temporada=2026-10'. */
const hrefFor = (q: string | null) => (q ? `/ranking?temporada=${q}` : '/ranking');

function perDispute(r: RankingRow) {
  return (r.points / Math.max(1, r.disputes)).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Row({ r, me }: { r: RankingRow; me: boolean }) {
  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(`/perfil/${r.userId}`);
  };
  return (
    <tr data-me={me || undefined}>
      <td className="pos">
        <span className="pos-num" data-top={r.position <= 3 ? r.position : undefined}>
          {r.position}
        </span>
      </td>
      <td className="team">
        <a className="team-cell" href={`/perfil/${r.userId}`} onClick={open}>
          <TeamCrest userId={r.userId} name={r.name} crest={r.crest} size={28} />
          <span className="team-cell-name">{r.name}</span>
          {me && <span className="badge badge-me">você</span>}
        </a>
      </td>
      <td className="r" title={`${fmtInt(r.pointsGames)} de jogos + ${fmtInt(r.pointsTitles)} de títulos`}>
        <strong>{fmtInt(r.points)}</strong>
      </td>
      <td>
        <TitleChips titles={r.titles} />
      </td>
      <td className="r">
        <span className="record3">
          <span data-r="V">{r.won}V</span> <span data-r="E">{r.drawn}E</span> <span data-r="D">{r.lost}D</span>
        </span>
      </td>
      <td className="r">{r.disputes}</td>
      <td className="r">{perDispute(r)}</td>
    </tr>
  );
}

/** Ranking dos técnicos: a temporada (o mês) e o geral, com a sua linha destacada. */
export function RankingPage() {
  const user = useStore((s) => s.user);
  const path = usePath();
  const q = new URLSearchParams(path.split('?')[1] ?? '').get('temporada');
  const overall = q === 'geral';
  const asked = isSeasonKey(q) ? q : null;
  const [view, setView] = useState<RankingView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api<RankingView>('GET', `/api/ranking${overall ? '?temporada=geral' : asked ? `?temporada=${asked}` : ''}`)
      .then((v) => alive && setView(v))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [overall, asked, user?.id, user?.isGuest]);

  const go = (target: string | null) => navigate(hrefFor(target), true);
  const loading = !view || (overall ? view.season !== null : view.season !== (asked ?? view.current));
  const season = view?.season ?? null;
  const idx = view && season ? view.seasons.indexOf(season) : -1;
  const older = view && idx >= 0 ? view.seasons[idx + 1] : undefined;
  const newer = view && idx > 0 ? view.seasons[idx - 1] : undefined;
  const me = view?.me ?? null;
  const meInTop = !!me && !!view && view.rows.some((r) => r.userId === me.userId);
  const period = overall ? 'no geral' : season ? `em ${seasonLabel(season, true)}` : '';

  return (
    <div className="ranking">
      <header className="ranking-head">
        <h1>Ranking</h1>
        <p>Vitórias, empates e títulos de todas as disputas concluídas. Libertadores e Torneio Mundial valem mais.</p>
      </header>

      <div className="ranking-bar">
        <div className="seg" role="group" aria-label="Período">
          <button type="button" aria-pressed={!overall} onClick={() => go(null)}>
            <Icon name="relogio" size={16} /> Temporada
          </button>
          <button type="button" aria-pressed={overall} onClick={() => go('geral')}>
            <Icon name="estante" size={16} /> Geral
          </button>
        </div>
        {!overall && view && season && (
          <div className="season-nav">
            <button type="button" className="btn btn-sm btn-icon" aria-label="Temporada anterior" disabled={!older} onClick={() => older && go(older)}>
              <Icon name="voltar" size={16} />
            </button>
            <strong className="season-name">{seasonLabel(season)}</strong>
            {season === view.current && <span className="badge badge-gold">em andamento</span>}
            <button
              type="button"
              className="btn btn-sm btn-icon season-next"
              aria-label="Temporada seguinte"
              disabled={!newer}
              onClick={() => newer && go(newer === view.current ? null : newer)}
            >
              <Icon name="voltar" size={16} />
            </button>
          </div>
        )}
        {overall && <span className="season-name">Todos os tempos</span>}
      </div>

      {error ? (
        <Empty icon="info">{error}</Empty>
      ) : loading ? (
        <Spinner />
      ) : (
        <>
          {me && me.position > 0 && (
            <section className="stat-strip ranking-me" aria-label="Você no ranking">
              <div className="stat">
                <div className="num">{me.position}º</div>
                <div className="lbl">
                  {period}, de {view.total} {view.total === 1 ? 'técnico' : 'técnicos'}
                </div>
              </div>
              <div className="stat">
                <div className="num">{fmtInt(me.points)}</div>
                <div className="lbl">
                  pontos: {fmtInt(me.pointsGames)} de jogos e {fmtInt(me.pointsTitles)} de títulos
                </div>
              </div>
              <div className="stat">
                <div className="num">{RANKING_COMPETITIONS.reduce((s, c) => s + me.titles[c], 0)}</div>
                <div className="lbl">títulos {period}</div>
              </div>
            </section>
          )}
          {me && me.position === 0 && (
            <p className="notice">
              <Icon name="info" />
              <span>
                Você tem <strong>{fmtInt(me.points)} pontos</strong> {period}.{' '}
                <a
                  href="/entrar"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/entrar');
                  }}
                >
                  Crie sua conta
                </a>{' '}
                para aparecer no ranking com eles.
              </span>
            </p>
          )}
          {!me && user && <p className="hint">Você ainda não tem pontos {period}. Termine uma disputa para entrar no ranking.</p>}

          {view.rows.length === 0 ? (
            <Empty icon="podio">
              {overall ? 'Ninguém pontuou ainda.' : 'Ninguém pontuou nesta temporada ainda.'} Termine uma disputa e seja o primeiro.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table ranking-table">
                <thead>
                  <tr>
                    <th className="pos">#</th>
                    <th>Time</th>
                    <th className="r">Pontos</th>
                    <th>Títulos</th>
                    <th className="r">Jogos</th>
                    <th className="r">Disputas</th>
                    <th className="r">Por disputa</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <Row key={r.userId} r={r} me={r.userId === me?.userId} />
                  ))}
                  {me && me.position > 0 && !meInTop && (
                    <>
                      <tr className="ranking-gap" aria-hidden="true">
                        <td colSpan={7}>⋯</td>
                      </tr>
                      <Row r={me} me />
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {view.total > view.rows.length && (
            <p className="hint">
              Mostrando os {view.rows.length} primeiros de {view.total} técnicos.
            </p>
          )}
        </>
      )}

      <section className="panel ranking-how">
        <div className="panel-head">
          <h2>Como funciona a pontuação</h2>
        </div>
        <div className="panel-body ranking-how-body">
          <div>
            <h3>Jogos</h3>
            <ul className="points-list">
              <li>
                <span>Vitória</span>
                <strong>{view?.weights.vitoria ?? 3}</strong>
              </li>
              <li>
                <span>Empate (inclui jogo decidido nos pênaltis)</span>
                <strong>{view?.weights.empate ?? 1}</strong>
              </li>
              <li>
                <span>Derrota</span>
                <strong>0</strong>
              </li>
            </ul>
            <p className="small muted">Valem os jogos da liga e da copa, contra técnicos e contra clubes da máquina.</p>
          </div>
          <div>
            <h3>Títulos</h3>
            <ul className="points-list">
              {RANKING_COMPETITIONS.map((c) => (
                <li key={c}>
                  <span className="comp-name" data-c={c}>
                    <span className="comp-icon">
                      <Icon name={COMPETITION_ICON[c]} size={16} />
                    </span>
                    {COMPETITION_LABEL[c]}
                  </span>
                  <strong>{view?.weights[c] ?? '—'}</strong>
                </li>
              ))}
            </ul>
            <p className="small muted">A Só Libertadores vale como a Libertadores.</p>
          </div>
          <ul className="rules-list ranking-notes">
            <li>A temporada é o mês, no horário de Brasília. O geral soma todos os tempos.</li>
            <li>Quem sai da sala no meio da disputa não pontua nela.</li>
            <li>Visitante pontua, mas só aparece no ranking depois de criar a conta.</li>
            <li>Empate em pontos: vence quem tem mais títulos de Mundial e Libertadores, depois mais títulos, mais vitórias e melhor saldo.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
