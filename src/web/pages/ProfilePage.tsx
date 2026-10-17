import { useEffect, useState } from 'react';
import { Spinner, fmtDate, REACH_LABEL } from '../components/common';
import { Icon } from '../components/Icon';
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
  user: { id: string; displayName: string; isGuest: boolean; createdAt: string };
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
  lastAt: string;
  records: Record<string, Rec>;
}

export function Record3({ r }: { r: Rec }) {
  return (
    <span className="num" style={{ fontSize: '1.05rem' }}>
      {r.wins}V {r.draws}E {r.losses}D
    </span>
  );
}

export function ProfilePage({ userId }: { userId: string }) {
  const me = useStore((s) => s.user);
  const [p, setP] = useState<Profile | null>(null);
  const [opps, setOpps] = useState<Opponent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  if (error) return <div className="empty">{error}</div>;
  if (!p || !opps) return <Spinner />;
  const s = p.stats;
  const isMe = me?.id === userId;
  return (
    <div className="stack" style={{ gap: 26 }}>
      <div className="spread">
        <div className="stack" style={{ gap: 6 }}>
          <h1>{p.user.displayName}</h1>
          <p className="muted">
            Técnico desde {fmtDate(p.user.createdAt)}
            {p.user.isGuest ? ' (convidado)' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate(`/trofeus/${userId}`)}>
          <Icon name="trofeu" /> Sala de Troféus ({p.trophiesUnlocked})
        </button>
      </div>

      <section className="panel stack">
        <div className="spread">
          <div>
            <div className="small muted">Trajetória</div>
            <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.6rem' }}>{p.career.name}</strong>
          </div>
          <span className="small muted">
            {p.career.xp} pontos{p.career.nextXp ? `, próximo nível em ${p.career.nextXp}` : ', topo da pirâmide'}
          </span>
        </div>
        <div className="ladder" aria-label={`Nível ${p.career.level} de 5`}>
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <span key={l} data-on={l <= p.career.level} />
          ))}
        </div>
      </section>

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
        <h2>Confrontos</h2>
        {opps.length === 0 ? (
          <div className="empty">
            {isMe ? 'Jogue uma sala com amigos para começar o seu histórico de confrontos.' : 'Ainda sem confrontos contra outros técnicos.'}
          </div>
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
                  <strong style={{ fontSize: '1.1rem' }}>{o.displayName}</strong>
                  <span className="small muted">último em {fmtDate(o.lastAt)}</span>
                  <span className="small">
                    Ciclos: <Record3 r={o.records.ciclo!} />
                  </span>
                  <span className="small">
                    Partidas: <Record3 r={o.records.partida!} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2>Últimas disputas</h2>
        {p.recent.length === 0 ? (
          <div className="empty">Nenhuma disputa concluída ainda.</div>
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
                    <td>{r.team_name}</td>
                    <td className="r">
                      {r.rank}º de {r.participants}
                    </td>
                    <td className="r">{r.league_position}º</td>
                    <td>{r.cup_reach ? REACH_LABEL[r.cup_reach] : '—'}</td>
                    <td>{[r.league_title ? 'Liga' : '', r.cup_title ? 'Copa' : ''].filter(Boolean).join(' e ') || '—'}</td>
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
