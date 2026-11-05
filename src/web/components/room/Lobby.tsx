import { useState } from 'react';
import type { Formation, Series, SeriesScope } from '../../../engine/types';
import type { DeckInfo, RoomSettings, RoomView } from '../../../shared/protocol';
import { CPU_TEAM_NAMES } from '../../../shared/teams';
import { act } from '../../lib/socket';
import { toast, useStore } from '../../lib/store';
import { CUP_FORMAT_LABEL, fmtDateTime } from '../common';
import { CrestEditorDialog } from '../crest/CrestEditor';
import { TeamCrest } from '../crest/TeamCrest';
import { Icon } from '../Icon';
import { StatusLight } from '../ui';
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
    <div className="room-header">
      <div className="room-header-text">
        <h1>{room.mode === 'solo' ? 'Partida rápida' : 'Sala com amigos'}</h1>
        <p>{subtitle}</p>
      </div>
      {room.mode === 'online' && (
        <div className="ticket">
          <span className="ticket-label">Código da sala</span>
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
    <label className="check" data-disabled={disabled || undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden="true" />
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
      <p className="hint">
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
  const clubs = s.auctionMode === 'clubes';
  const set = (patch: Partial<RoomSettings>) => void act({ t: 'room:settings', settings: patch });
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Regras da sala</h2>
        {!editable && <span className="panel-head-aside">Só o anfitrião muda</span>}
      </div>
      <div className="panel-body stack">
        <div className="field">
          <label>Tipo de leilão</label>
          <div className="seg seg-grid" role="group" aria-label="Tipo de leilão">
            <button type="button" aria-pressed={!clubs} disabled={!editable} onClick={() => set({ auctionMode: 'jogador' })}>
              Jogador
            </button>
            <button type="button" aria-pressed={clubs} disabled={!editable} onClick={() => set({ auctionMode: 'clubes' })}>
              Clubes <span className="badge badge-new">novo</span>
            </button>
          </div>
          <p className="hint">
            {clubs
              ? 'Cada lote é o setor de um clube (os goleiros do Corinthians, por exemplo). Quem leva o pacote escolhe no fim quem joga; sem escolha a tempo, entra o pior. As sobras vão para os times da liga.'
              : 'O leilão de sempre: um jogador por lance.'}
          </p>
        </div>
        {clubs ? (
          <p className="hint">No leilão de clubes entram todos os clubes (Brasil e Europa).</p>
        ) : (
          <ClubsField deck={room.deck} value={s.series ?? 'ALL'} editable={editable} onChange={(v) => set({ series: v })} />
        )}
        <div className="field">
          <label>Depois da liga</label>
          <div className="seg seg-grid" role="group" aria-label="Copa">
            {(['copa8', 'libertadores', 'mundial', 'nenhuma'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={s.cupFormat === f} disabled={!editable} onClick={() => set({ cupFormat: f })}>
                {CUP_FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          <p className="hint">
            {s.cupFormat === 'copa8' && 'Os 8 primeiros da liga jogam mata-mata em ida e volta; final em jogo único.'}
            {s.cupFormat === 'libertadores' && 'Os 8 primeiros entram em 8 grupos com 24 clubes do continente; passam 2; mata-mata ida e volta.'}
            {s.cupFormat === 'mundial' && 'Grupos em turno único com 32 clubes e mata-mata em jogo único.'}
            {s.cupFormat === 'nenhuma' && 'Termina a liga e já sai o resultado.'}
          </p>
        </div>
        <div className="row settings-row">
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
        <div className="checks">
          <Toggle label="Repescagem das sobras de cada posição" checked={s.repescagem} disabled={!editable} onChange={(v) => set({ repescagem: v })} />
          <Toggle label="Desempate às cegas antes do sorteio" checked={s.tiebreakRound} disabled={!editable} onChange={(v) => set({ tiebreakRound: v })} />
          {!clubs && (
            <>
              <Toggle label="Cartas-surpresa (nome escondido)" checked={s.mysteryCards} disabled={!editable} onChange={(v) => set({ mysteryCards: v })} />
              <Toggle
                label="No próximo ciclo, todos os jogadores comprados voltam ao leilão"
                checked={s.carryOver}
                disabled={!editable}
                onChange={(v) => set({ carryOver: v })}
              />
            </>
          )}
        </div>
        {clubs && <p className="hint">No leilão de clubes os pacotes são sorteados de novo a cada ciclo.</p>}
        <div className="row settings-row">
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
    </section>
  );
}

/** Desenho pequeno da formação (bolinhas por linha), usado no botão de escolha. */
function FormationMini({ f }: { f: Formation }) {
  const lines = f === '4-3-3' ? [1, 4, 3, 3] : [1, 4, 4, 2];
  return (
    <svg className="formation-mini" viewBox="0 0 40 52" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="38" height="50" rx="3" />
      <line x1="1" y1="26" x2="39" y2="26" />
      {lines.flatMap((n, row) =>
        Array.from({ length: n }, (_, i) => <circle key={`${row}-${i}`} cx={(40 / (n + 1)) * (i + 1)} cy={45 - row * 12.5} r="2.8" />),
      )}
    </svg>
  );
}

/** O vestiário: técnicos da sala (com escudo) e as CPUs que vão entrar no pregão. */
function LockerRoom({ room }: { room: RoomView }) {
  const cpus = CPU_TEAM_NAMES.slice(0, room.settings.cpuCount).concat(
    Array.from({ length: Math.max(0, room.settings.cpuCount - CPU_TEAM_NAMES.length) }, (_, i) => CPU_TEAM_NAMES[i % CPU_TEAM_NAMES.length]!),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Vestiário</h2>
        <span className="panel-head-aside">
          {room.members.length} {room.members.length === 1 ? 'técnico' : 'técnicos'}
          {room.settings.cpuCount ? ` e ${room.settings.cpuCount} CPU` : ''}
        </span>
      </div>
      <div className="panel-body">
        {room.cycle > 0 && <span className="badge badge-gold locker-cycle">Ciclo {room.cycle} concluído</span>}
        <ul className="locker" aria-label="Técnicos na sala">
          {room.members.map((m) => (
            <li key={m.userId} data-me={m.userId === room.you || undefined}>
              <TeamCrest userId={m.userId} name={m.teamName} size={44} />
              <span className="locker-who">
                <span className="locker-name">{m.teamName}</span>
                <span className="locker-meta">
                  <StatusLight on={m.connected} title={m.connected ? 'Conectado' : 'Desconectado'} />
                  {m.formation}
                  {m.isHost && <span className="badge">anfitrião</span>}
                  {m.userId === room.you && <span className="badge badge-you">você</span>}
                </span>
              </span>
            </li>
          ))}
          {cpus.map((n, i) => (
            <li key={`cpu-${i}`} data-cpu="true">
              <TeamCrest name={n} size={44} />
              <span className="locker-who">
                <span className="locker-name">{n}</span>
                <span className="locker-meta">
                  <span className="badge badge-cpu">CPU</span>
                  {i % 2 ? '4-4-2' : '4-3-3'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MyTeamPanel({ room }: { room: RoomView }) {
  const me = room.members.find((m) => m.userId === room.you)!;
  const user = useStore((s) => s.user);
  const crest = room.crests[room.you] ?? user?.crest;
  const [name, setName] = useState(me.teamName);
  const [editing, setEditing] = useState(false);
  return (
    <section className="panel my-team">
      <div className="panel-head">
        <h2>Seu time</h2>
      </div>
      <div className="panel-body my-team-body">
        <div className="my-team-crest">
          <TeamCrest userId={room.you} name={me.teamName} size={112} />
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} disabled={!crest}>
            <Icon name="pincel" /> Editar escudo
          </button>
        </div>
        <div className="stack my-team-fields">
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ t: 'room:member', teamName: name });
            }}
          >
            <label htmlFor="team-name">Nome nesta sala</label>
            <div className="row">
              <input id="team-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={28} aria-label="Nome do time" style={{ flex: 1 }} />
              <button className="btn btn-sm" disabled={name.trim() === me.teamName}>
                Salvar nome
              </button>
            </div>
          </form>
          <div className="field">
            <label>Formação (fica travada durante o pregão)</label>
            <div className="formations" role="group" aria-label="Formação">
              {(['4-3-3', '4-4-2'] as const).map((f) => (
                <button key={f} type="button" className="formation" aria-pressed={me.formation === f} onClick={() => void act({ t: 'room:member', formation: f })}>
                  <FormationMini f={f} />
                  <span>{f}</span>
                </button>
              ))}
            </div>
            <p className="hint">
              {me.formation === '4-3-3'
                ? '1 goleiro, 2 laterais, 2 zagueiros, 3 meias e 3 atacantes.'
                : '1 goleiro, 2 laterais, 2 zagueiros, 4 meias e 2 atacantes.'}
            </p>
          </div>
        </div>
      </div>
      {crest && <CrestEditorDialog open={editing} onClose={() => setEditing(false)} initial={crest} teamName={me.teamName} />}
    </section>
  );
}

export function Lobby({ room }: { room: RoomView }) {
  const me = room.members.find((m) => m.userId === room.you);
  const isHost = room.hostUserId === room.you;
  const total = room.members.length + room.settings.cpuCount;
  const canStart = isHost && total >= 2 && total <= 20;
  return (
    <div className="lobby">
      <RoomHeader
        room={room}
        subtitle={
          room.mode === 'online'
            ? 'Mande o código para a turma. Todo mundo entra pelo site, sem baixar nada.'
            : 'Escolha a formação e as regras. A CPU já está esperando no pregão.'
        }
      />
      {room.lastResult && (
        <section className="panel">
          <div className="panel-body">
            <LastResultCard room={room} />
          </div>
        </section>
      )}
      <div className="grid-2">
        <div className="stack">
          {me && <MyTeamPanel room={room} />}
          <LockerRoom room={room} />
          <div className="kickoff">
            {isHost ? (
              <button className="btn btn-primary btn-xl" disabled={!canStart} onClick={() => void act({ t: 'room:start' })}>
                <Icon name="martelo" size={26} /> Abrir o pregão
              </button>
            ) : (
              <p className="kickoff-wait">
                <Icon name="relogio" /> Esperando o anfitrião abrir o pregão.
              </p>
            )}
            <button className="btn btn-ghost" onClick={() => void act({ t: 'room:leave' })}>
              <Icon name="sair" /> Sair da sala
            </button>
          </div>
          {isHost && total < 2 && <p className="hint">São pelo menos 2 técnicos: chame alguém ou adicione CPUs.</p>}
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
    <section className="panel">
      <div className="panel-head">
        <h2>Histórico da sala</h2>
      </div>
      <ul className="history-list">
        {room.history.map((h) => {
          const champ = h.participants.find((p) => p.rank === 1);
          return (
            <li key={h.disputeId}>
              <span className="history-seq">{h.seq}</span>
              <span className="history-text">
                <strong>Ciclo {h.seq}</strong>
                <span>{h.status === 'finished' ? h.headline : h.status === 'active' ? 'Em andamento' : 'Encerrado sem resultado'}</span>
                {h.carriedCardCount > 0 && <span className="small muted">{h.carriedCardCount} jogadores voltaram do ciclo anterior.</span>}
              </span>
              {champ && (
                <span className="history-champ" title={`1º: ${champ.name}`}>
                  <TeamCrest userId={champ.userId} name={champ.name} size={30} />
                </span>
              )}
              <span className="history-date">{fmtDateTime(h.finishedAt ?? h.startedAt)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
