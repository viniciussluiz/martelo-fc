import { useEffect, useState } from 'react';
import { Spinner } from '../components/common';
import { AuctionScreen } from '../components/room/Auction';
import { CeremonyScreen } from '../components/room/Ceremony';
import { Lobby } from '../components/room/Lobby';
import { CupScreen, LeagueScreen } from '../components/room/Matches';
import { PostDispute } from '../components/room/Summary';
import { navigate } from '../lib/router';
import { socket } from '../lib/socket';
import { store, useStore } from '../lib/store';

export function RoomPage({ code }: { code: string }) {
  const room = useStore((s) => s.room);
  const leftReason = useStore((s) => s.leftReason);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (store.get().room?.code === code) return;
    socket.joinRoom(code).catch((err: Error) => {
      setError(err.message);
      store.set({ roomCode: null });
    });
  }, [code]);

  if (error || (leftReason && (!room || room.code !== code))) {
    return (
      <div className="panel stack" style={{ maxWidth: 520 }}>
        <div className="panel-title">{error ? 'Não foi possível entrar na sala' : 'Você saiu da sala'}</div>
        <p>{error ?? leftReason}</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Voltar ao início
          </button>
          {!error && (
            <button
              className="btn"
              onClick={() => {
                store.set({ leftReason: null });
                socket.joinRoom(code).catch((e: Error) => setError(e.message));
              }}
            >
              Entrar de novo
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!room || room.code !== code) return <Spinner label={`Entrando na sala ${code}…`} />;

  if (room.status === 'lobby') return <Lobby room={room} />;
  if (room.status === 'post_dispute') return <PostDispute room={room} />;
  if (room.status === 'closed') return <Spinner label="Sala encerrada." />;

  const d = room.dispute;
  if (!d) return <Spinner label="Preparando a disputa…" />;
  return (
    <div className="stack">
      {d.paused && <div className="banner-pause">Disputa pausada: ninguém está conectado. Ela continua assim que alguém voltar.</div>}
      {!d.you && (
        <div className="banner-pause">Você entrou no meio desta disputa e está assistindo. No fim dela, dá para entrar no próximo ciclo.</div>
      )}
      {(d.phase === 'auction' || (d.auction?.reveal && d.phase === 'ceremony')) && <AuctionScreen room={room} />}
      {d.phase === 'ceremony' && !d.auction?.reveal && <CeremonyScreen room={room} />}
      {d.phase === 'league' && <LeagueScreen room={room} />}
      {(d.phase === 'cup' || d.phase === 'finished') && <CupScreen room={room} />}
    </div>
  );
}
