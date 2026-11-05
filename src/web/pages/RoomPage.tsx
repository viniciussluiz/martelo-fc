import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '../../shared/protocol';
import { Spinner } from '../components/common';
import { Icon } from '../components/Icon';
import { StageBanner } from '../components/ui';
import { CUP_FORMAT_LABEL } from '../components/common';
import { AuctionScreen } from '../components/room/Auction';
import { CeremonyScreen } from '../components/room/Ceremony';
import { Lobby } from '../components/room/Lobby';
import { CupScreen, LeagueScreen } from '../components/room/Matches';
import { PostDispute } from '../components/room/Summary';
import { navigate } from '../lib/router';
import { act, socket } from '../lib/socket';
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
      <div className="panel narrow">
        <div className="panel-head">
          <h2>{error ? 'Não foi possível entrar na sala' : 'Você saiu da sala'}</h2>
        </div>
        <div className="panel-body stack">
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
      </div>
    );
  }

  if (!room || room.code !== code) return <Spinner label={`Entrando na sala ${code}…`} />;

  if (room.status === 'lobby') return <Lobby room={room} />;
  if (room.status === 'post_dispute') return <PostDispute room={room} />;
  if (room.status === 'closed') return <Spinner label="Sala encerrada." />;

  const d = room.dispute;
  if (!d) return <Spinner label="Preparando a disputa…" />;
  // Qual tela da disputa está no ar (a troca entre elas ganha uma transição curta).
  const screen =
    d.phase === 'auction' || (d.auction?.reveal && d.phase === 'ceremony')
      ? 'auction'
      : d.phase === 'ceremony'
        ? 'ceremony'
        : // Entre a última rodada da liga e o 1º jogo da copa, a liga continua na tela (o último jogo ainda está passando).
          d.phase === 'league' || (d.phase === 'cup' && d.cup?.lastResults.length === 0 && d.league)
          ? 'league'
          : d.phase === 'finished' || d.phase === 'cup'
            ? 'cup'
            : null;
  return (
    <div className="stack room-live">
      <PhaseBanner screen={screen} room={room} />
      <RoomBar room={room} />
      {d.paused && (
        <div className="notice" data-kind="alert">
          <strong>Disputa pausada</strong>
          <span>Ninguém está conectado. Ela continua assim que alguém voltar.</span>
        </div>
      )}
      {!d.you && (
        <div className="notice">
          <strong>Você está assistindo</strong>
          <span>Você entrou no meio desta disputa. No fim dela, dá para entrar no próximo ciclo.</span>
        </div>
      )}
      <div className="phase-screen" key={screen}>
        {screen === 'auction' && <AuctionScreen room={room} />}
        {screen === 'ceremony' && <CeremonyScreen room={room} />}
        {screen === 'league' && <LeagueScreen room={room} />}
        {screen === 'cup' && <CupScreen room={room} />}
      </div>
    </div>
  );
}

const PHASE_TITLE: Record<string, string> = {
  auction: 'Pregão aberto',
  ceremony: 'Cerimônia da Revelação',
  league: 'Começa a liga',
};

/** Faixa que atravessa a tela quando a disputa muda de fase (não aparece ao abrir a sala no meio). */
function PhaseBanner({ screen, room }: { screen: string | null; room: RoomView }) {
  const prev = useRef<string | null | undefined>(undefined);
  const [show, setShow] = useState<{ key: number; title: string; sub?: string } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = screen;
    if (before === undefined || before === screen || !screen) return;
    const title = screen === 'cup' ? (room.dispute?.cup?.name ?? CUP_FORMAT_LABEL[room.settings.cupFormat] ?? 'Copa') : PHASE_TITLE[screen];
    if (!title) return;
    const sub =
      screen === 'auction'
        ? 'Escreva os lances e lacre o envelope'
        : screen === 'ceremony'
          ? 'As faixas de nível vão abrir'
          : screen === 'league'
            ? `${room.dispute?.league?.totalRounds ?? 38} rodadas, turno e returno`
            : 'Mata-mata valendo taça';
    setShow({ key: Date.now(), title, sub });
    const t = setTimeout(() => setShow(null), 2100);
    return () => clearTimeout(t);
    // Só a troca de tela dispara a faixa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  if (!show) return null;
  return <StageBanner key={show.key} title={show.title} {...(show.sub ? { sub: show.sub } : {})} tone={screen === 'ceremony' ? 'sun' : 'grass'} />;
}

/** Faixa do topo durante a disputa: onde você está e o botão de sair (com confirmação). */
function RoomBar({ room }: { room: RoomView }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = room.dispute!;
  const playing = !!d.you && !d.participants.find((p) => p.id === d.you)?.abandoned;
  const othersPlaying = d.participants.some((p) => !p.isCpu && p.id !== d.you && !p.abandoned);
  const consequence = !playing
    ? 'Você está só assistindo. Dá para voltar depois pelo código da sala.'
    : room.mode === 'solo' || !othersPlaying
      ? 'Ninguém mais está jogando: a disputa termina aqui, sem resultado.'
      : 'Seu time segue na disputa no automático (sem lances; no Monte e na convocação o jogo escolhe por você). Dá para voltar pelo código da sala.';
  const leave = async () => {
    setBusy(true);
    const ok = await act({ t: 'room:leave' });
    setBusy(false);
    if (!ok) return;
    store.set({ leftReason: null });
    navigate('/');
  };
  return (
    <div className="room-bar">
      <span className="room-bar-where">
        <Icon name={room.mode === 'solo' ? 'martelo' : 'turma'} size={18} />
        {room.mode === 'solo' ? 'Partida rápida' : `Sala ${room.code}`}
        <span className="room-bar-cycle">Ciclo {d.seq}</span>
      </span>
      {confirming ? (
        <div className="leave-confirm" role="group" aria-label="Confirmar saída">
          <div className="stack" style={{ gap: 2 }}>
            <strong>{room.mode === 'solo' ? 'Sair da partida?' : 'Sair da sala?'}</strong>
            <span className="small muted">{consequence}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Ficar
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void leave()} disabled={busy}>
              <Icon name="sair" /> Sair
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(true)}>
          <Icon name="sair" /> {room.mode === 'solo' ? 'Sair da partida' : 'Sair da sala'}
        </button>
      )}
    </div>
  );
}
