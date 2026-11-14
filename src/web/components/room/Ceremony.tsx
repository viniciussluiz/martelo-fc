import { useState } from 'react';
import type { DisputeView, RoomView } from '../../../shared/protocol';
import type { TeamRole } from '../../../engine/match';
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

const SET_PIECE_FIELDS: Array<{ id: TeamRole; label: string; note: string }> = [
  { id: 'capitao', label: 'Capitão', note: 'Usa a braçadeira: aparece com o “C” no campinho.' },
  { id: 'penalti', label: 'Pênalti', note: 'Raro, mas quase sempre gol.' },
  { id: 'falta', label: 'Falta', note: 'Na entrada da área: entra uma a cada três.' },
  { id: 'escanteio', label: 'Escanteio', note: 'Quem cobra dá a assistência.' },
];
const TAKER_ORDER = ['ATA', 'MEI', 'LAT', 'ZAG', 'GOL'];

/** Capitão e batedores de bola parada do seu time (pênalti, falta e escanteio). */
function SetPiecesPanel({ d }: { d: DisputeView }) {
  const me = d.participants.find((p) => p.id === d.you);
  if (!me || !d.setPieces) return null;
  const roster = [...me.roster].filter((r) => d.cards[r.cardId]).sort((a, b) => TAKER_ORDER.indexOf(a.position) - TAKER_ORDER.indexOf(b.position));
  return (
    <section className="panel setpieces-panel">
      <div className="panel-head">
        <h3>Capitão e bola parada</h3>
      </div>
      <div className="panel-body">
      <p className="small muted setpieces-note">Escolha o capitão e quem bate. Se não escolher, vale a indicação do jogo.</p>
      <div className="setpieces">
        {SET_PIECE_FIELDS.map((f) => (
          <div className="field" key={f.id}>
            <label htmlFor={`taker-${f.id}`}>{f.label}</label>
            <select
              id={`taker-${f.id}`}
              className="input"
              value={d.setPieces?.[f.id] ?? ''}
              onChange={(e) => void act({ t: 'setpieces', takers: { [f.id]: e.target.value } })}
            >
              {roster.map((r) => {
                const c = d.cards[r.cardId]!;
                return (
                  <option key={r.cardId} value={r.cardId}>
                    {c.name} · {r.position}
                    {c.levelMin !== undefined ? ` · ${c.levelMin}–${c.levelMax}` : ''}
                  </option>
                );
              })}
            </select>
            <span className="small muted">{f.note}</span>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}

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
          <span className="comp-sub">
            As faixas de nível abrem agora: em cada jogo, o jogador rende um valor dentro da faixa. Aproveite para definir o capitão e quem bate
            pênalti, falta e escanteio.
          </span>
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
        <div className="stack" style={{ gap: 12 }}>
          <SetPiecesPanel d={d} />
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
    </div>
  );
}
