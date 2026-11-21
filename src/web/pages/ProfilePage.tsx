import { useEffect, useRef, useState } from 'react';
import type { CrestConfig } from '../../shared/crest';
import { seasonLabel, type CompetitionRecord, type ProfileRanking } from '../../shared/ranking';
import { Empty, Spinner, fmtDate, REACH_LABEL } from '../components/common';
import { ClubEditorDialog } from '../components/crest/CrestEditor';
import { TeamCrest } from '../components/crest/TeamCrest';
import { Icon } from '../components/Icon';
import { CompetitionName, fmtInt } from '../components/ranking';
import { SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';

interface Rec {
  total: number;
  wins: number;
  draws: number;
  losses: number;
  pct: number;
}

interface Profile {
  user: { id: string; displayName: string; isGuest: boolean; createdAt: string; crest: CrestConfig };
  stats: Record<string, number>;
  career: { level: number; name: string; xp: number; nextXp: number | null };
  winRate: number;
  trophiesUnlocked: number;
  ranking: ProfileRanking;
  byCompetition: CompetitionRecord[];
  recent: Array<{
    dispute_id: string;
    seq: number;
    finished_at: string;
    room_code: string;
    mode: string;
    team_name: string;
    rank: number;
    league_position: number;
    cup_reach: string | null;
    league_title: number;
    cup_title: number;
    cup_name: string | null;
    participants: number;
    humans: number;
  }>;
}

interface Opponent {
  userId: string;
  displayName: string;
  crest: CrestConfig | null;
  lastAt: string;
  records: Record<string, Rec>;
}

/** Uma página de adversários (a API pagina e busca pelo nome do time). */
interface OpponentsPage {
  items: Opponent[];
  total: number;
  overall: number;
  page: number;
  pages: number;
  pageSize: number;
  query: string;
}

/** Com até este número de adversários, a busca não aparece (cabe tudo numa olhada). */
const SEARCH_FROM = 7;

/**
 * Confrontos do perfil: adversários do mais recente para o mais antigo, 12 por página, com busca
 * pelo nome do time (sem diferenciar maiúsculas nem acentos).
 */
function OpponentsSection({ userId, name, crest, isMe }: { userId: string; name: string; crest: CrestConfig; isMe: boolean }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OpponentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const top = useRef<HTMLElement | null>(null);

  // Espera a pessoa parar de digitar e volta para a primeira página.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams({ pagina: String(page) });
    if (search) qs.set('busca', search);
    api<OpponentsPage>('GET', `/api/users/${userId}/opponents?${qs}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId, page, search]);

  const go = (n: number) => {
    setPage(n);
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const count = data ? `${data.overall} ${data.overall === 1 ? 'adversário' : 'adversários'}` : null;
  return (
    <section className="stack opponents" ref={top}>
      <SectionTitle aside={data && data.overall > 0 ? count : null}>Confrontos</SectionTitle>
      {!data ? (
        <Spinner />
      ) : data.overall === 0 ? (
        <Empty icon="turma">
          {isMe ? 'Jogue uma sala com amigos para começar o seu histórico de confrontos.' : 'Ainda sem confrontos contra outros técnicos.'}
        </Empty>
      ) : (
        <>
          {(data.overall >= SEARCH_FROM || query) && (
            <div className="opp-search">
              <span className="opp-search-field">
                <Icon name="lupa" size={18} />
                <input
                  className="input"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar adversário pelo nome do time"
                  aria-label="Buscar adversário"
                  maxLength={60}
                />
              </span>
              {search && (
                <span className="small muted">
                  {data.total} de {count}
                </span>
              )}
            </div>
          )}
          {data.items.length === 0 ? (
            <Empty icon="info">Nenhum adversário com “{search}” no nome.</Empty>
          ) : (
            <ul className="opp-list" data-loading={loading || undefined}>
              {data.items.map((o) => (
                <li key={o.userId}>
                  <a
                    href={`/perfil/${userId}/rival/${o.userId}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/perfil/${userId}/rival/${o.userId}`);
                    }}
                  >
                    <span className="opp-vs" aria-hidden="true">
                      <TeamCrest userId={userId} name={name} crest={crest} size={36} />
                      <span className="opp-x">×</span>
                      <TeamCrest userId={o.userId} name={o.displayName} crest={o.crest} size={36} />
                    </span>
                    <strong className="opp-name">{o.displayName}</strong>
                    <span className="small muted">último em {fmtDate(o.lastAt)}</span>
                    <span className="opp-line">
                      Ciclos <Record3 r={o.records.ciclo!} />
                    </span>
                    <span className="opp-line">
                      Partidas <Record3 r={o.records.partida!} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {data.pages > 1 && (
            <nav className="pager" aria-label="Páginas de confrontos">
              <button type="button" className="btn btn-sm" disabled={data.page <= 1 || loading} onClick={() => go(data.page - 1)}>
                <Icon name="voltar" size={16} /> Anterior
              </button>
              <span className="pager-info">
                Página <strong>{data.page}</strong> de {data.pages}
              </span>
              <button type="button" className="btn btn-sm pager-next" disabled={data.page >= data.pages || loading} onClick={() => go(data.page + 1)}>
                Próxima <Icon name="voltar" size={16} />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

export function Record3({ r }: { r: Rec }) {
  return (
    <span className="record3">
      <span data-r="V">{r.wins}V</span> <span data-r="E">{r.draws}E</span> <span data-r="D">{r.losses}D</span>
    </span>
  );
}

/** Posição no ranking da temporada (e no geral), com link para a página do ranking. */
function ProfileRankingLine({ ranking, isMe }: { ranking: ProfileRanking; isMe: boolean }) {
  const s = ranking.seasonStanding;
  const o = ranking.overall;
  const month = seasonLabel(ranking.season, true);
  // Visitante pontua, mas fica fora da lista (posição nula) até criar a conta.
  const guest = s?.position === null || o?.position === null;
  let text: React.ReactNode;
  if (guest) {
    text = isMe ? <>{fmtInt(o?.points ?? 0)} pontos no ranking · crie sua conta para aparecer na lista</> : <>Visitante: fora do ranking</>;
  } else if (s?.position) {
    text = (
      <>
        <strong>{s.position}º</strong> no ranking de {month} · {fmtInt(s.points)} pontos
        {o?.position ? ` · ${o.position}º no geral` : ''}
      </>
    );
  } else if (o?.position) {
    text = (
      <>
        Sem pontos em {month} · <strong>{o.position}º</strong> no geral, {fmtInt(o.points)} pontos
      </>
    );
  } else {
    text = <>Sem pontos no ranking ainda</>;
  }
  return (
    <a
      className="profile-ranking"
      href="/ranking"
      onClick={(e) => {
        e.preventDefault();
        navigate('/ranking');
      }}
    >
      <Icon name="podio" size={18} />
      <span>{text}</span>
    </a>
  );
}

export function ProfilePage({ userId }: { userId: string }) {
  const me = useStore((s) => s.user);
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setP(null);
    api<Profile>('GET', `/api/users/${userId}/profile`)
      .then(setP)
      .catch((e: Error) => setError(e.message));
  }, [userId]);
  if (error) return <Empty icon="info">{error}</Empty>;
  if (!p) return <Spinner />;
  const s = p.stats;
  const isMe = me?.id === userId;
  // O seu escudo pode ter mudado agora há pouco no criador.
  const crest = isMe && me ? me.crest : p.user.crest;
  // O nome também pode ter acabado de mudar aqui mesmo.
  const name = isMe && me ? me.displayName : p.user.displayName;
  return (
    <div className="profile">
      <header className="profile-head">
        <div className="profile-crest">
          <TeamCrest userId={p.user.id} name={name} crest={crest} size={150} />
          {isMe && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              <Icon name="pincel" /> Editar clube
            </button>
          )}
        </div>
        <div className="profile-id">
          <h1>{name}</h1>
          <p className="profile-since">
            Técnico desde {fmtDate(p.user.createdAt)}
            {p.user.isGuest ? ' (convidado)' : ''}
          </p>
          <div className="career">
            <div className="career-top">
              <span className="career-name">{p.career.name}</span>
              <span className="career-xp">
                {p.career.xp} XP{p.career.nextXp ? `, próximo nível em ${p.career.nextXp}` : ', topo da pirâmide'}
              </span>
            </div>
            <div className="ladder" aria-label={`Nível ${p.career.level} de 5`}>
              {[0, 1, 2, 3, 4, 5].map((l) => (
                <span key={l} data-on={l <= p.career.level} />
              ))}
            </div>
          </div>
          <ProfileRankingLine ranking={p.ranking} isMe={isMe} />
        </div>
        <button className="btn btn-primary profile-trophies" onClick={() => navigate(`/trofeus/${userId}`)}>
          <Icon name="trofeu" /> Sala de Troféus ({p.trophiesUnlocked})
        </button>
        {isMe && <ClubEditorDialog open={editing} onClose={() => setEditing(false)} initial={crest} teamName={p.user.displayName} />}
      </header>

      <section className="stat-strip" aria-label="Números">
        <div className="stat">
          <div className="num">{s.disputes}</div>
          <div className="lbl">disputas concluídas</div>
        </div>
        <div className="stat">
          <div className="num">{s.leagueTitles}</div>
          <div className="lbl">ligas</div>
        </div>
        <div className="stat">
          <div className="num">{s.cupTitles}</div>
          <div className="lbl">copas</div>
        </div>
        <div className="stat">
          <div className="num">{p.winRate}%</div>
          <div className="lbl">vitórias em {s.matchesPlayed} jogos</div>
        </div>
        <div className="stat">
          <div className="num">{s.maxWinStreak}</div>
          <div className="lbl">maior sequência de vitórias</div>
        </div>
        <div className="stat">
          <div className="num">{s.cardsWon}</div>
          <div className="lbl">jogadores arrematados</div>
        </div>
      </section>

      <section className="stack">
        <SectionTitle>Por competição</SectionTitle>
        {p.byCompetition.length === 0 ? (
          <Empty icon="taca">{isMe ? 'Termine uma disputa e os seus números de cada competição aparecem aqui.' : 'Nenhuma disputa concluída ainda.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table comp-table">
              <thead>
                <tr>
                  <th>Competição</th>
                  <th className="r">Títulos</th>
                  <th className="r">Jogos</th>
                  <th className="r">Vitórias</th>
                  <th className="r">Empates</th>
                  <th className="r">Derrotas</th>
                </tr>
              </thead>
              <tbody>
                {p.byCompetition.map((c) => (
                  <tr key={c.competition}>
                    <td>
                      <CompetitionName c={c.competition} />
                    </td>
                    <td className="r">{c.titles > 0 ? <strong className="comp-titles">{c.titles}</strong> : <span className="muted">0</span>}</td>
                    <td className="r">{c.played}</td>
                    <td className="r">{c.won}</td>
                    <td className="r">{c.drawn}</td>
                    <td className="r">{c.lost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OpponentsSection key={userId} userId={userId} name={name} crest={crest} isMe={isMe} />

      <section className="stack">
        <SectionTitle>Últimas disputas</SectionTitle>
        {p.recent.length === 0 ? (
          <Empty icon="apito">Nenhuma disputa concluída ainda. Jogue no single player e o resultado aparece aqui.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Sala</th>
                  <th>Time</th>
                  <th className="r">No ciclo</th>
                  <th className="r">Liga</th>
                  <th>Copa</th>
                  <th>Títulos</th>
                </tr>
              </thead>
              <tbody>
                {p.recent.map((r) => (
                  <tr key={r.dispute_id}>
                    <td>{fmtDate(r.finished_at)}</td>
                    <td>
                      {r.room_code} <span className="small muted">ciclo {r.seq}</span>
                    </td>
                    <td>
                      <span className="team-cell">
                        <TeamCrest userId={p.user.id} name={r.team_name} crest={crest} size={22} />
                        <span className="team-cell-name">{r.team_name}</span>
                      </span>
                    </td>
                    <td className="r">
                      {r.rank}º de {r.participants}
                    </td>
                    <td className="r">{r.league_position}º</td>
                    <td>{r.cup_reach ? REACH_LABEL[r.cup_reach] : '—'}</td>
                    <td>
                      {r.league_title || r.cup_title ? (
                        <span className="row" style={{ gap: 4 }}>
                          {r.league_title ? (
                            <span className="badge badge-gold">
                              <Icon name="taca" size={13} /> Liga
                            </span>
                          ) : null}
                          {r.cup_title ? (
                            <span className="badge badge-gold">
                              <Icon name="trofeu" size={13} /> Copa
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
