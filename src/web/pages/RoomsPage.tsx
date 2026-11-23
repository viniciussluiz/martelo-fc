import { useEffect, useState } from 'react';
import type { PublicRoomView } from '../../shared/protocol';
import { auctionLabel, CUP_FORMAT_LABEL, Empty, ONLY_CUP_LABEL, Spinner } from '../components/common';
import { TeamCrest } from '../components/crest/TeamCrest';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { navigate } from '../lib/router';

/**
 * Salas em andamento: as salas com amigos que não foram ocultadas. Aberta = entra quem quiser;
 * fechada (cadeado) = pede a senha na entrada. A lista se atualiza sozinha.
 */

const REFRESH_MS = 5000;

const PHASE_LABEL: Record<string, string> = { auction: 'no leilão', ceremony: 'na cerimônia', league: 'na liga', cup: 'na copa', finished: 'terminando' };

function statusOf(r: PublicRoomView): { text: string; tone: 'open' | 'live' } {
  if (r.status === 'lobby') return { text: r.cycle > 0 ? 'Entre disputas' : 'Esperando para começar', tone: 'open' };
  if (r.status === 'post_dispute') return { text: 'Entre disputas', tone: 'open' };
  return { text: `Jogando · ${PHASE_LABEL[r.phase ?? ''] ?? 'em disputa'}`, tone: 'live' };
}

function competitionOf(r: PublicRoomView): string {
  if (r.skipLeague) return ONLY_CUP_LABEL;
  return r.cupFormat === 'nenhuma' ? 'Só liga' : `Liga + ${CUP_FORMAT_LABEL[r.cupFormat] ?? 'copa'}`;
}

export function RoomsPage() {
  const [rooms, setRooms] = useState<PublicRoomView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ rooms: PublicRoomView[] }>('GET', '/api/public-rooms')
        .then((r) => {
          if (!alive) return;
          setRooms(r.rooms);
          setError(null);
        })
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="rooms-page stack">
      <header className="rooms-head">
        <div>
          <h1>Salas em andamento</h1>
          <p>Sala aberta entra quem quiser. Sala fechada (com cadeado) pede a senha de quem criou.</p>
        </div>
        <button className="btn" onClick={() => navigate('/')}>
          <Icon name="voltar" size={18} /> Voltar
        </button>
      </header>
      {error && !rooms ? (
        <Empty icon="info">{error}</Empty>
      ) : !rooms ? (
        <Spinner label="Procurando salas…" />
      ) : rooms.length === 0 ? (
        <Empty icon="turma">Nenhuma sala aberta agora. Crie a sua em “Sala com amigos” e ela aparece aqui.</Empty>
      ) : (
        <ul className="rooms-list">
          {rooms.map((r) => {
            const st = statusOf(r);
            const full = r.humans >= r.maxHumans;
            const playing = r.status === 'in_dispute';
            return (
              <li key={r.code} className="room-row" data-locked={r.locked || undefined}>
                <span className="room-row-crest">
                  <TeamCrest userId={r.hostUserId} name={r.hostName} crest={r.hostCrest} size={52} />
                </span>
                <span className="room-row-text">
                  <strong className="room-row-name">
                    Sala de {r.hostName}
                    {r.locked ? (
                      <span className="badge badge-lock">
                        <Icon name="cadeado" size={13} /> fechada
                      </span>
                    ) : (
                      <span className="badge badge-open">aberta</span>
                    )}
                  </strong>
                  <span className="small">
                    <span className="room-row-status" data-tone={st.tone}>
                      {st.text}
                    </span>{' '}
                    · {r.humans} de {r.maxHumans} técnicos{r.cpuCount ? ` + ${r.cpuCount} CPU${r.cpuCount > 1 ? 's' : ''}` : ''} · {auctionLabel(r.auctionMode)} · {competitionOf(r)}
                  </span>
                </span>
                <button className="btn btn-primary room-row-go" disabled={full} onClick={() => navigate(`/sala/${r.code}`)}>
                  {full ? 'Lotada' : playing ? 'Entrar e assistir' : 'Entrar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
