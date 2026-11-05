import { useEffect, useState } from 'react';
import type { CrestConfig } from '../../shared/crest';
import { Empty, Spinner, fmtDate, REACH_LABEL } from '../components/common';
import { TeamCrest } from '../components/crest/TeamCrest';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { navigate } from '../lib/router';

interface Rec {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  pct: number;
  goalsFor?: number;
  goalsAgainst?: number;
}

interface Side {
  teamName: string;
  rank: number;
  leaguePosition: number;
  cupReach: string | null;
  titles: string[];
  squadAverage: number;
  spent: number;
  topBuy: { name: string; price: number; tier: string } | null;
}

interface Detail {
  me: { userId: string; displayName: string; crest: CrestConfig | null };
  opponent: { userId: string; displayName: string; crest: CrestConfig | null };
  records: Record<string, Rec>;
  streaks: { current: { type: 'V' | 'E' | 'D'; length: number } | null; longestWin: number; longestLoss: number };
  lastResults: Array<{ matchId: string; at: string; result: 'V' | 'E' | 'D'; mine: number; theirs: number; competition: string; stage: string }>;
  matches: Array<{ matchId: string; disputeId: string; at: string; result: 'V' | 'E' | 'D'; mine: number; theirs: number; competition: string; stage: string; penalties: { mine: number; theirs: number } | null }>;
  finals: Array<{ disputeId: string; at: string; result: 'V' | 'D'; mine: number; theirs: number }>;
  titlesInCommon: Array<{ disputeId: string; at: string; who: 'eu' | 'adversario'; title: string }>;
  timeline: Array<{ disputeId: string; seq: number; roomCode: string; cupName: string | null; finishedAt: string; me: Side; them: Side; auctionDuels: { mine: number; theirs: number } }>;
}

const KIND_INFO: Array<[string, string, string]> = [
  ['ciclo', 'Ciclos', 'Disputas completas em comum: vence quem termina melhor no ranking do ciclo.'],
  ['liga', 'Ligas', 'Quem terminou acima na tabela da mesma liga.'],
  ['copa', 'Copas', 'Quem foi mais longe na copa quando os dois jogaram; mesma fase é empate.'],
  ['partida', 'Partidas', 'Cada jogo direto entre os dois times. Pênaltis não mudam o placar.'],
  ['eliminatoria', 'Mata-matas', 'Confrontos eliminatórios entre os dois na copa.'],
  ['lance', 'Disputas de lance', 'Cartas em que os dois deram lance e um deles levou.'],
];

function Bar({ r }: { r: Rec }) {
  const t = Math.max(1, r.total);
  return (
    <div className="h2h-bar" aria-hidden="true">
      <span style={{ width: `${(r.wins / t) * 100}%` }} />
      <span style={{ width: `${(r.draws / t) * 100}%` }} />
      <span style={{ width: `${(r.losses / t) * 100}%` }} />
    </div>
  );
}

const RESULT_WORD = { V: 'vitória', E: 'empate', D: 'derrota' } as const;
const RESULT_PLURAL = { V: 'vitórias', E: 'empates', D: 'derrotas' } as const;

export function RivalPage({ userId, opponentId }: { userId: string; opponentId: string }) {
  const [period, setPeriod] = useState<number>(0);
  const [competition, setCompetition] = useState<'' | 'liga' | 'copa'>('');
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams();
    if (period) q.set('period', String(period));
    if (competition) q.set('competition', competition);
    api<Detail>('GET', `/api/users/${userId}/h2h/${opponentId}?${q}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [userId, opponentId, period, competition]);
  if (error) return <Empty icon="info">{error}</Empty>;
  if (!data) return <Spinner />;
  const r = data.records;
  const cur = data.streaks.current;
  return (
    <div className="rival">
      <a
        className="back-link"
        href={`/perfil/${userId}`}
        onClick={(e) => {
          e.preventDefault();
          navigate(`/perfil/${userId}`);
        }}
      >
        <Icon name="voltar" size={18} /> Voltar ao perfil
      </a>
      <header className="faceoff-head">
        <span className="faceoff-crest">
          <TeamCrest userId={data.me.userId} name={data.me.displayName} crest={data.me.crest} size={120} />
        </span>
        <h1 className="faceoff">
          <span className="faceoff-name">{data.me.displayName}</span> <span className="faceoff-x">×</span>{' '}
          <span className="faceoff-name">{data.opponent.displayName}</span>
        </h1>
        <span className="faceoff-crest">
          <TeamCrest userId={data.opponent.userId} name={data.opponent.displayName} crest={data.opponent.crest} size={120} />
        </span>
      </header>
      <div className="row filters">
        <div className="seg" role="group" aria-label="Período">
          {[
            [0, 'Tudo'],
            [7, '7 dias'],
            [30, '30 dias'],
            [90, '90 dias'],
          ].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={period === v} onClick={() => setPeriod(v as number)}>
              {l}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Competição">
          {[
            ['', 'Todas'],
            ['liga', 'Liga'],
            ['copa', 'Copa'],
          ].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={competition === v} onClick={() => setCompetition(v as '' | 'liga' | 'copa')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <section className="stat-strip">
        {KIND_INFO.map(([k, label, help]) => {
          const rec = r[k]!;
          if (competition && (k === 'ciclo' || k === 'lance')) return null;
          return (
            <div className="stat stack" key={k} style={{ gap: 6 }} title={help}>
              <div className="spread">
                <strong>{label}</strong>
                <span className="small muted">{rec.total}</span>
              </div>
              <div className="num" style={{ fontSize: '1.5rem' }}>
                {rec.wins}–{rec.draws}–{rec.losses}
              </div>
              <Bar r={rec} />
              <div className="lbl">{rec.total ? `${rec.pct}% de aproveitamento` : 'nenhum ainda'}</div>
              {k === 'partida' && rec.total > 0 && (
                <div className="lbl">
                  Gols: {rec.goalsFor} a {rec.goalsAgainst}
                </div>
              )}
            </div>
          );
        })}
      </section>
      <p className="small muted">Vitórias, empates e derrotas, sempre do ponto de vista de {data.me.displayName}. Cada modalidade é contada separadamente.</p>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Forma recente nas partidas</h2>
          </div>
          <div className="panel-body stack">
          {data.lastResults.length === 0 ? (
            <p className="muted">Sem partidas diretas no filtro.</p>
          ) : (
            <>
              <div className="form-chips" aria-label="Últimos resultados">
                {data.lastResults.map((m) => (
                  <span key={m.matchId} data-r={m.result} title={`${RESULT_WORD[m.result]} ${m.mine}×${m.theirs}`}>
                    {m.result}
                  </span>
                ))}
              </div>
              <p className="small">
                {cur ? `Sequência atual: ${cur.length} ${cur.length === 1 ? RESULT_WORD[cur.type] : RESULT_PLURAL[cur.type]}.` : ''}{' '}
                Maior série de vitórias: {data.streaks.longestWin}. Maior série de derrotas: {data.streaks.longestLoss}.
              </p>
            </>
          )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Títulos e finais em comum</h2>
          </div>
          <div className="panel-body stack">
          {data.titlesInCommon.length === 0 && data.finals.length === 0 ? (
            <p className="muted">Ninguém levantou taça nas disputas em comum ainda.</p>
          ) : (
            <ul className="plain-list">
              {data.finals.map((f) => (
                <li key={`f-${f.disputeId}`}>
                  <span>
                    Final de copa: {f.result === 'V' ? 'vitória' : 'derrota'} ({f.mine}×{f.theirs} no agregado)
                  </span>
                  <span className="small muted">{fmtDate(f.at)}</span>
                </li>
              ))}
              {data.titlesInCommon.map((t, i) => (
                <li key={`t-${i}`}>
                  <span>
                    {t.who === 'eu' ? data.me.displayName : data.opponent.displayName} campeão da {t.title === 'liga' ? 'liga' : 'copa'}
                  </span>
                  <span className="small muted">{fmtDate(t.at)}</span>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </section>

      <section className="stack">
        <SectionTitle>Disputas em comum</SectionTitle>
        {data.timeline.length === 0 ? (
          <Empty icon="apito">Nenhuma disputa em comum no período.</Empty>
        ) : (
          data.timeline.map((t) => (
            <article className="panel" key={t.disputeId}>
              <div className="panel-head">
                <h3>
                  {fmtDate(t.finishedAt)}, sala {t.roomCode}, ciclo {t.seq}
                </h3>
                <span className="panel-head-aside">
                  Disputas de lance: {t.auctionDuels.mine} a {t.auctionDuels.theirs}
                </span>
              </div>
              <div className="panel-body">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th className="r">Ranking</th>
                      <th className="r">Liga</th>
                      <th>{t.cupName ?? 'Copa'}</th>
                      <th className="r">Elenco</th>
                      <th className="r">Gastou</th>
                      <th>Compra mais cara</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[t.me, t.them].map((s, i) => (
                      <tr key={i} data-me={i === 0}>
                        <td>
                          <span className="team-cell">
                            <TeamCrest
                              userId={i === 0 ? data.me.userId : data.opponent.userId}
                              name={s.teamName}
                              crest={i === 0 ? data.me.crest : data.opponent.crest}
                              size={22}
                            />
                            <span className="team-cell-name">
                              {s.teamName} {s.titles.length ? `(${s.titles.join(' e ')})` : ''}
                            </span>
                          </span>
                        </td>
                        <td className="r">{s.rank}º</td>
                        <td className="r">{s.leaguePosition}º</td>
                        <td>{s.cupReach ? REACH_LABEL[s.cupReach] : '—'}</td>
                        <td className="r">{s.squadAverage}</td>
                        <td className="r">{s.spent}</td>
                        <td>{s.topBuy ? `${s.topBuy.name} (${s.topBuy.price})` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </article>
          ))
        )}
      </section>

      {data.matches.length > 0 && (
        <section className="stack">
          <SectionTitle>Todas as partidas</SectionTitle>
          <ul className="match-list panel">
            {data.matches.map((m) => (
              <li key={`${m.disputeId}-${m.matchId}`}>
                <span className="row" style={{ gap: 8 }}>
                  <span className="form-chips">
                    <span data-r={m.result}>{m.result}</span>
                  </span>
                  <span className="match-score">
                    {m.mine} × {m.theirs}
                  </span>
                  {m.penalties && <span className="small muted">pên. {m.penalties.mine}×{m.penalties.theirs}</span>}
                  <span className="small muted">
                    {m.competition === 'liga' ? 'Liga' : 'Copa'}, {m.stage}
                  </span>
                </span>
                <span className="small muted">{fmtDate(m.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
