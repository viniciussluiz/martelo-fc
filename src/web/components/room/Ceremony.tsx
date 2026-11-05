import { useState } from 'react';
import type { RoomView } from '../../../shared/protocol';
import { act } from '../../lib/socket';
import { Countdown } from '../common';
import { SquadPitch } from './Squad';
import { Icon } from '../Icon';
import { TeamCrest } from '../crest/TeamCrest';

/** Ícone de cada prêmio da cerimônia (no lugar dos emojis). */
const AWARD_ICON: Record<string, string> = {
  achado: 'estrela',
  mico: 'caveira',
  'martelo-caro': 'martelo',
  'mao-furada': 'chama',
  'mao-de-vaca': 'cadeado',
  'perna-de-pau': 'zebra',
};

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
    <div className="stack" style={{ gap: 12 }}>
      <header className="scoreboard comp-head">
        <div className="comp-title">
          <h2 className="sb-title">Cerimônia da Revelação</h2>
          <span className="comp-sub">As faixas de nível abrem agora: em cada jogo, o jogador rende um valor dentro da faixa.</span>
        </div>
        {c && (
          <div className="ceremony-go">
            <span className="comp-sub">Liga em</span>
            <Countdown deadline={c.deadline} urgentAt={5} bar />
            {d.you && (
              <button className="btn btn-sm btn-primary" disabled={ready} onClick={() => void act({ t: 'ceremony:ready' })}>
                {ready ? 'Pronto, esperando os outros' : 'Estou pronto'}
              </button>
            )}
          </div>
        )}
      </header>
      <div className="grid-2">
        <div className="stack ceremony-pitch" style={{ gap: 8 }}>
          <div className="spread" style={{ gap: 8 }}>
            <div className="team-picker" role="group" aria-label="Escolher time">
              {d.participants.map((p) => (
                <button key={p.id} type="button" aria-pressed={view === p.id} onClick={() => setView(p.id)}>
                  <TeamCrest id={p.id} name={p.name} userId={p.userId} size={22} />
                  {p.id === d.you ? 'Você' : p.name}
                </button>
              ))}
            </div>
            <span className="ceremony-avg">
              {view === d.you ? '' : `${name(view)}: `}média <span className="band">{avg(view)}</span>, sobrou{' '}
              {d.participants.find((p) => p.id === view)?.coins} moedas
            </span>
          </div>
          <SquadPitch d={d} participantId={view} />
        </div>
        <aside className="panel awards-panel">
          <div className="panel-head">
            <h3>O pregão em números</h3>
          </div>
          <ul className="awards">
            {(c?.awards ?? []).map((a) => (
              <li key={a.id} data-award={a.id}>
                <span className="award-icon">
                  <Icon name={AWARD_ICON[a.id] ?? 'estrela'} />
                </span>
                <span className="award-text">
                  <strong>{a.title}</strong>
                  <span className="award-who" data-me={a.participantId === d.you || undefined}>
                    <TeamCrest id={a.participantId} name={name(a.participantId)} userId={d.participants.find((p) => p.id === a.participantId)?.userId ?? null} size={18} />
                    {name(a.participantId)}
                  </span>
                  <span className="award-note">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
