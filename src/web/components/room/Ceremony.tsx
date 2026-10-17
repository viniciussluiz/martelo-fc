import { useState } from 'react';
import type { RoomView } from '../../../shared/protocol';
import { act } from '../../lib/socket';
import { Countdown } from '../common';
import { SquadPitch } from './Squad';

export function CeremonyScreen({ room }: { room: RoomView }) {
  const d = room.dispute!;
  const c = d.ceremony;
  const [view, setView] = useState<string>(d.you ?? d.participants[0]!.id);
  const ready = c?.ready.includes(room.you) ?? false;
  const name = (pid: string) => d.participants.find((p) => p.id === pid)?.name ?? pid;
  const avg = (pid: string) => {
    const p = d.participants.find((x) => x.id === pid)!;
    const vals = p.roster.map((r) => d.cards[r.cardId]).filter(Boolean).map((cd) => ((cd!.levelMin ?? 0) + (cd!.levelMax ?? 0)) / 2);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
  };
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="spread">
        <div className="stack" style={{ gap: 6 }}>
          <h2>Cerimônia da Revelação</h2>
          <p className="muted">As faixas de nível aparecem agora. Cada jogador rende, em cada partida, um valor dentro da sua faixa.</p>
        </div>
        {c && (
          <div className="row">
            <span className="small muted">A liga começa em</span>
            <Countdown deadline={c.deadline} urgentAt={5} />
            {d.you && (
              <button className="btn btn-pitch" disabled={ready} onClick={() => void act({ t: 'ceremony:ready' })}>
                {ready ? 'Pronto, esperando os outros' : 'Estou pronto'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid-2">
        <div className="stack">
          <div className="seg" role="group" aria-label="Escolher time" style={{ flexWrap: 'wrap' }}>
            {d.participants.map((p) => (
              <button key={p.id} type="button" aria-pressed={view === p.id} onClick={() => setView(p.id)}>
                {p.id === d.you ? 'Você' : p.name}
              </button>
            ))}
          </div>
          <div className="spread">
            <strong>{name(view)}</strong>
            <span className="small muted">
              média do elenco <span className="band">{avg(view)}</span>, sobrou {d.participants.find((p) => p.id === view)?.coins} moedas
            </span>
          </div>
          <SquadPitch d={d} participantId={view} />
        </div>
        <aside className="panel">
          <div className="panel-title">O pregão em números</div>
          <ul className="room-list">
            {(c?.awards ?? []).map((a) => (
              <li key={a.id}>
                <span className="stack" style={{ gap: 2 }}>
                  <strong>
                    {a.emoji} {a.title}
                  </strong>
                  <span className="small">{name(a.participantId)}</span>
                  <span className="small muted">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
