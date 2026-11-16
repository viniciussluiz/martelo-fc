import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { userIdOfTeam } from '../crest/TeamCrest';

interface Rec {
  total: number;
  wins: number;
  draws: number;
  losses: number;
}

/** O retrospecto só muda quando uma disputa termina: uma busca por adversário basta enquanto a página está aberta. */
const cache = new Map<string, Promise<Rec | null>>();

function load(me: string, opponent: string): Promise<Rec | null> {
  const key = `${me}|${opponent}`;
  let p = cache.get(key);
  if (!p) {
    p = api<{ records: { partida: Rec } }>('GET', `/api/users/${me}/h2h/${opponent}`)
      .then((r) => r.records.partida)
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, p);
  }
  return p;
}

/** Resumo em uma linha: quem leva a melhor nos jogos diretos. */
export function rivalVerdict(r: Rec): { tone: 'up' | 'down' | 'even' | 'new'; text: string } {
  if (r.total === 0) return { tone: 'new', text: 'primeiro jogo entre vocês' };
  if (r.wins > r.losses) return { tone: 'up', text: 'você leva vantagem' };
  if (r.wins < r.losses) return { tone: 'down', text: 'você leva desvantagem' };
  return { tone: 'even', text: 'tudo igual' };
}

/**
 * Faixa do jogo contra outro técnico da sala: o histórico de partidas diretas entre os dois
 * (disputas já concluídas), do ponto de vista de quem está olhando.
 */
export function RivalRecord({ you, homeId, awayId, opponentName }: { you: string | null; homeId: string; awayId: string; opponentName: string }) {
  const me = userIdOfTeam(you);
  const opponent = you === homeId ? userIdOfTeam(awayId) : you === awayId ? userIdOfTeam(homeId) : null;
  const [rec, setRec] = useState<Rec | null>(null);
  useEffect(() => {
    setRec(null);
    if (!me || !opponent) return;
    let alive = true;
    void load(me, opponent).then((r) => {
      if (alive) setRec(r);
    });
    return () => {
      alive = false;
    };
  }, [me, opponent]);
  if (!me || !opponent || !rec) return null;
  const v = rivalVerdict(rec);
  return (
    <div className="live-rival" data-tone={v.tone}>
      <span className="live-rival-label">Retrospecto contra {opponentName}</span>
      {rec.total > 0 && (
        <span className="live-rival-rec" aria-label={`${rec.wins} vitórias, ${rec.draws} empates, ${rec.losses} derrotas`}>
          <b data-r="V">{rec.wins}V</b>
          <b data-r="E">{rec.draws}E</b>
          <b data-r="D">{rec.losses}D</b>
        </span>
      )}
      <span className="live-rival-verdict">{v.text}</span>
    </div>
  );
}
