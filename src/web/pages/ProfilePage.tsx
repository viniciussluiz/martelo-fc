import { useEffect, useState } from 'react';
import type { CrestConfig } from '../../shared/crest';
import { Empty, Spinner, fmtDate, REACH_LABEL } from '../components/common';
import { CrestEditorDialog } from '../components/crest/CrestEditor';
import { TeamCrest } from '../components/crest/TeamCrest';
import { Icon } from '../components/Icon';
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

export function Record3({ r }: { r: Rec }) {
  return (
    <span className="record3">
      <span data-r="V">{r.wins}V</span> <span data-r="E">{r.draws}E</span> <span data-r="D">{r.losses}D</span>
    </span>
  );
}

export function ProfilePage({ userId }: { userId: string }) {
  const me = useStore((s) => s.user);
  const [p, setP] = useState<Profile | null>(null);
  const [opps, setOpps] = useState<Opponent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setP(null);
    setOpps(null);
    Promise.all([api<Profile>('GET', `/api/users/${userId}/profile`), api<Opponent[]>('GET', `/api/users/${userId}/opponents`)])
      .then(([a, b]) => {
        setP(a);
        setOpps(b);
      })
      .catch((e: Error) => setError(e.message));
  }, [userId]);
  if (error) return <Empty icon="info">{error}</Empty>;
  if (!p || !opps) return <Spinner />;
  const s = p.stats;
  const isMe = me?.id === userId;
  // O seu escudo pode ter mudado agora há pouco no criador.
  const crest = isMe && me ? me.crest : p.user.crest;
  return (
    <div className="profile">
      <header className="profile-head">
        <div className="profile-crest">
          <TeamCrest userId={p.user.id} name={p.user.displayName} crest={crest} size={150} />
          {isMe && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              <Icon name="pincel" /> Editar escudo
            </button>
          )}
        </div>
        <div className="profile-id">
          <h1>{p.user.displayName}</h1>
          <p className="profile-since">
            Técnico desde {fmtDate(p.user.createdAt)}
            {p.user.isGuest ? ' (convidado)' : ''}
          </p>
          <div className="career">
            <div className="career-top">
              <span className="career-name">{p.career.name}</span>
              <span className="career-xp">
                {p.career.xp} pontos{p.career.nextXp ? `, próximo nível em ${p.career.nextXp}` : ', topo da pirâmide'}
              </span>
            </div>
            <div className="ladder" aria-label={`Nível ${p.career.level} de 5`}>
              {[0, 1, 2, 3, 4, 5].map((l) => (
                <span key={l} data-on={l <= p.career.level} />
              ))}
            </div>
          </div>
        </div>
        <button className="btn btn-primary profile-trophies" onClick={() => navigate(`/trofeus/${userId}`)}>
          <Icon name="trofeu" /> Sala de Troféus ({p.trophiesUnlocked})
        </button>
        {isMe && <CrestEditorDialog open={editing} onClose={() => setEditing(false)} initial={crest} teamName={p.user.displayName} />}
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
        <SectionTitle>Confrontos</SectionTitle>
        {opps.length === 0 ? (
          <Empty icon="turma">
            {isMe ? 'Jogue uma sala com amigos para começar o seu histórico de confrontos.' : 'Ainda sem confrontos contra outros técnicos.'}
          </Empty>
        ) : (
          <ul className="opp-list">
            {opps.map((o) => (
              <li key={o.userId}>
                <a
                  href={`/perfil/${userId}/rival/${o.userId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/perfil/${userId}/rival/${o.userId}`);
                  }}
                >
                  <span className="opp-vs" aria-hidden="true">
                    <TeamCrest userId={p.user.id} name={p.user.displayName} crest={crest} size={36} />
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
      </section>

      <section className="stack">
        <SectionTitle>Últimas disputas</SectionTitle>
        {p.recent.length === 0 ? (
          <Empty icon="apito">Nenhuma disputa concluída ainda. Abra uma partida rápida e o resultado aparece aqui.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Sala</th>
                  <th>Time</th>
                  <th className="r">Ranking</th>
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
