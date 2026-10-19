import { useState } from 'react';
import type { Series, SeriesScope } from '../../../engine/types';
import type { DeckInfo, RoomSettings, RoomView } from '../../../shared/protocol';
import { act } from '../../lib/socket';
import { toast } from '../../lib/store';
import { CUP_FORMAT_LABEL, fmtDateTime } from '../common';
import { Icon } from '../Icon';
import { LastResultCard } from './Summary';

export function RoomHeader({ room, subtitle }: { room: RoomView; subtitle: string }) {
  const copy = async () => {
    const link = `${location.origin}/sala/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ kind: 'sucesso', title: 'Link copiado', body: link });
    } catch {
      toast({ kind: 'info', title: 'Código da sala', body: room.code });
    }
  };
  return (
    <div className="spread">
      <div className="stack" style={{ gap: 6 }}>
        <h2>{room.mode === 'solo' ? 'Partida rápida' : 'Sala com amigos'}</h2>
        <p className="muted">{subtitle}</p>
      </div>
      {room.mode === 'online' && (
        <div className="row">
          <span className="code-plate" aria-label={`Código ${room.code}`}>
            {room.code}
          </span>
          <button className="btn btn-sm" onClick={copy}>
            <Icon name="copiar" size={18} /> Copiar convite
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check" style={{ cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const SCOPES: Array<{ id: SeriesScope; label: string; groups: Series[]; desc: string }> = [
  { id: 'ALL', label: 'Tudo', groups: ['A', 'B', 'EU'], desc: 'Séries A e B do Brasileirão e os grandes da Europa.' },
  { id: 'AB', label: 'Séries A e B', groups: ['A', 'B'], desc: 'Só clubes da Série A e da Série B do Brasileirão.' },
  { id: 'EU', label: 'Europa', groups: ['EU'], desc: 'Só os grandes clubes da Europa.' },
  { id: 'A', label: 'Série A', groups: ['A'], desc: 'Só os clubes da Série A.' },
  { id: 'B', label: 'Série B', groups: ['B'], desc: 'Só os clubes da Série B.' },
];

/** Escolha dos clubes das cartas (só aparece quando o baralho tem jogadores reais separados por grupo). */
function ClubsField({ deck, value, editable, onChange }: { deck: DeckInfo; value: SeriesScope; editable: boolean; onChange: (v: SeriesScope) => void }) {
  const [showClubs, setShowClubs] = useState(false);
  const available = SCOPES.filter((o) => o.groups.some((g) => deck.groups[g]));
  if (available.length === 0) {
    return <p className="small muted">Baralho: {deck.name}</p>;
  }
  const current = SCOPES.find((o) => o.id === value) ?? SCOPES[0]!;
  const count = current.groups.reduce((n, g) => n + (deck.groups[g] ?? 0), 0);
  const clubs = current.groups.flatMap((g) => deck.clubs[g] ?? []);
  return (
    <div className="field">
      <label>Clubes das cartas</label>
      <div className="seg seg-grid seg-clubs" role="group" aria-label="Clubes das cartas">
        {available.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} disabled={!editable} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="small muted">
        {current.desc} {count} cartas, de {clubs.length} clubes.{' '}
        <button type="button" className="link-btn" onClick={() => setShowClubs((v) => !v)} aria-expanded={showClubs}>
          {showClubs ? 'Esconder clubes' : 'Ver clubes'}
        </button>
      </p>
      {showClubs && <p className="small clubs-list">{clubs.join(' · ')}</p>}
    </div>
  );
}

export function SettingsPanel({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings;
  const set = (patch: Partial<RoomSettings>) => void act({ t: 'room:settings', settings: patch });
  return (
    <div className="panel stack">
      <div className="panel-title">Regras da sala</div>
      {!editable && <p className="small muted">Só o anfitrião muda as regras.</p>}
      <ClubsField deck={room.deck} value={s.series ?? 'ALL'} editable={editable} onChange={(v) => set({ series: v })} />
      <div className="field">
        <label>Depois da liga</label>
        <div className="seg seg-grid" role="group" aria-label="Copa">
          {(['copa8', 'libertadores', 'mundial', 'nenhuma'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={s.cupFormat === f} disabled={!editable} onClick={() => set({ cupFormat: f })}>
              {CUP_FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
        <p className="small muted">
          {s.cupFormat === 'copa8' && 'Os 8 primeiros da liga jogam mata-mata em ida e volta; final em jogo único.'}
          {s.cupFormat === 'libertadores' && 'Os 8 primeiros entram em 8 grupos com 24 clubes do continente; passam 2; mata-mata ida e volta.'}
          {s.cupFormat === 'mundial' && 'Grupos em turno único com 32 clubes e mata-mata em jogo único.'}
          {s.cupFormat === 'nenhuma' && 'Termina a liga e já sai o resultado.'}
        </p>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="cpus">CPUs no pregão</label>
          <select id="cpus" className="input" value={s.cpuCount} disabled={!editable} onChange={(e) => set({ cpuCount: Number(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Ritmo</label>
          <div className="seg" role="group" aria-label="Ritmo">
            <button type="button" aria-pressed={s.speed === 'normal'} disabled={!editable} onClick={() => set({ speed: 'normal' })}>
              Normal
            </button>
            <button type="button" aria-pressed={s.speed === 'turbo'} disabled={!editable} onClick={() => set({ speed: 'turbo' })}>
              Turbo
            </button>
          </div>
        </div>
      </div>
      <Toggle label="Repescagem das sobras de cada posição" checked={s.repescagem} disabled={!editable} onChange={(v) => set({ repescagem: v })} />
      <Toggle label="Desempate às cegas antes do sorteio" checked={s.tiebreakRound} disabled={!editable} onChange={(v) => set({ tiebreakRound: v })} />
      <Toggle label="Cartas-surpresa (nome escondido)" checked={s.mysteryCards} disabled={!editable} onChange={(v) => set({ mysteryCards: v })} />
      <Toggle
        label="No próximo ciclo, todos os jogadores comprados voltam ao leilão"
        checked={s.carryOver}
        disabled={!editable}
        onChange={(v) => set({ carryOver: v })}
      />
      <div className="row">
        <div className="field">
          <label htmlFor="cont">Tempo para decidir se continua (s)</label>
          <select id="cont" className="input" value={s.continuationTimeoutSec} disabled={!editable} onChange={(e) => set({ continuationTimeoutSec: Number(e.target.value) })}>
            {[30, 45, 60, 90, 120, 180].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {room.mode === 'online' && (
          <div className="field">
            <label htmlFor="minh">Mínimo para seguir automático</label>
            <select id="minh" className="input" value={s.minHumansToContinue} disabled={!editable} onChange={(e) => set({ minHumansToContinue: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'técnico' : 'técnicos'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

export function Lobby({ room }: { room: RoomView }) {
  const me = room.members.find((m) => m.userId === room.you);
  const isHost = room.hostUserId === room.you;
  const [name, setName] = useState(me?.teamName ?? '');
  const total = room.members.length + room.settings.cpuCount;
  const canStart = isHost && total >= 2 && total <= 20;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <RoomHeader
        room={room}
        subtitle={
          room.mode === 'online'
            ? 'Mande o código para a turma. Todo mundo entra pelo site, sem baixar nada.'
            : 'Escolha a formação e as regras. A CPU já está esperando no pregão.'
        }
      />
      {room.lastResult && <LastResultCard room={room} />}
      <div className="grid-2">
        <div className="stack">
          <div className="panel stack">
            <div className="spread">
              <div className="panel-title" style={{ margin: 0 }}>
                Técnicos ({room.members.length}
                {room.settings.cpuCount ? ` + ${room.settings.cpuCount} CPU` : ''})
              </div>
              {room.cycle > 0 && <span className="badge">Ciclo {room.cycle} concluído</span>}
            </div>
            <ul className="room-list">
              {room.members.map((m) => (
                <li key={m.userId}>
                  <span className="who">
                    <span className="dot" data-off={!m.connected} />
                    <span>{m.teamName}</span>
                    {m.isHost && <span className="badge">anfitrião</span>}
                    {m.userId === room.you && <span className="badge badge-warn">você</span>}
                  </span>
                  <span className="muted small">{m.formation}</span>
                </li>
              ))}
            </ul>
          </div>
          {me && (
            <div className="panel stack">
              <div className="panel-title">Seu time</div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ t: 'room:member', teamName: name });
                }}
              >
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={28} aria-label="Nome do time" style={{ flex: 1 }} />
                <button className="btn btn-sm" disabled={name.trim() === me.teamName}>
                  Salvar nome
                </button>
              </form>
              <div className="field">
                <label>Formação (fica travada durante o pregão)</label>
                <div className="seg" role="group" aria-label="Formação">
                  {(['4-3-3', '4-4-2'] as const).map((f) => (
                    <button key={f} type="button" aria-pressed={me.formation === f} onClick={() => void act({ t: 'room:member', formation: f })}>
                      {f}
                    </button>
                  ))}
                </div>
                <p className="small muted">
                  {me.formation === '4-3-3'
                    ? '1 goleiro, 2 laterais, 2 zagueiros, 3 meias e 3 atacantes.'
                    : '1 goleiro, 2 laterais, 2 zagueiros, 4 meias e 2 atacantes.'}
                </p>
              </div>
            </div>
          )}
          <div className="row">
            {isHost ? (
              <button className="btn btn-cone" disabled={!canStart} onClick={() => void act({ t: 'room:start' })}>
                <Icon name="martelo" /> Abrir o pregão
              </button>
            ) : (
              <p className="muted">Esperando o anfitrião abrir o pregão.</p>
            )}
            <button className="btn btn-ghost" onClick={() => void act({ t: 'room:leave' })}>
              <Icon name="sair" /> Sair da sala
            </button>
          </div>
          {isHost && total < 2 && <p className="small muted">São pelo menos 2 técnicos: chame alguém ou adicione CPUs.</p>}
        </div>
        <div className="stack">
          <SettingsPanel room={room} editable={isHost} />
          <HistoryPanel room={room} />
        </div>
      </div>
    </div>
  );
}

export function HistoryPanel({ room }: { room: RoomView }) {
  if (room.history.length === 0) return null;
  return (
    <div className="panel">
      <div className="panel-title">Histórico da sala</div>
      <ul className="room-list">
        {room.history.map((h) => (
          <li key={h.disputeId}>
            <span className="stack" style={{ gap: 2 }}>
              <strong>Ciclo {h.seq}</strong>
              <span className="small muted">
                {h.status === 'finished' ? h.headline : h.status === 'active' ? 'Em andamento' : 'Encerrado sem resultado'}
              </span>
              {h.carriedCardCount > 0 && <span className="small muted">{h.carriedCardCount} jogadores voltaram do ciclo anterior.</span>}
            </span>
            <span className="small muted">{fmtDateTime(h.finishedAt ?? h.startedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
