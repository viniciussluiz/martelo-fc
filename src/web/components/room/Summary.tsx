import type { RoomView } from '../../../shared/protocol';
import { navigate } from '../../lib/router';
import { act } from '../../lib/socket';
import { REACH_LABEL, useNow } from '../common';
import { Icon } from '../Icon';
import { HistoryPanel, RoomHeader, SettingsPanel } from './Lobby';
import { StandingsTable } from './Matches';

/** Resumo da última disputa concluída (dado histórico). */
export function LastResultCard({ room, full }: { room: RoomView; full?: boolean }) {
  const r = room.lastResult;
  if (!r) return null;
  const mine = r.outcomes.find((o) => o.userId === room.you);
  return (
    <section className="stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="small muted">Ciclo {r.seq} encerrado</span>
        <p className="headline">{r.headline}</p>
      </div>
      {mine && (
        <div className="stat-strip">
          <div className="stat">
            <div className="num">{mine.rank}º</div>
            <div className="lbl">no ranking do ciclo</div>
          </div>
          <div className="stat">
            <div className="num">{mine.leaguePosition}º</div>
            <div className="lbl">na liga, {mine.leaguePoints} pontos</div>
          </div>
          <div className="stat">
            <div className="num" style={{ fontSize: '1.4rem' }}>
              {mine.cupReach ? REACH_LABEL[mine.cupReach] : '—'}
            </div>
            <div className="lbl">{r.cupName ?? 'Sem copa'}</div>
          </div>
          <div className="stat">
            <div className="num">{mine.titles.length}</div>
            <div className="lbl">{mine.titles.length === 1 ? 'título' : 'títulos'}</div>
          </div>
        </div>
      )}
      <ol className="outcomes" aria-label="Ranking do ciclo">
        {r.outcomes.map((o) => (
          <li key={o.participantId} data-me={o.userId === room.you}>
            <span className="rank">{o.rank}</span>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <strong>
                {o.name} {o.isCpu && <span className="badge">CPU</span>}
              </strong>
              <span className="small muted">
                {o.leaguePosition}º na liga
                {o.cupReach ? `, ${(REACH_LABEL[o.cupReach] ?? o.cupReach).toLowerCase()} na copa` : ''}, gastou {o.spent} moedas, elenco {o.squadAverage}
              </span>
            </span>
            <span className="row" style={{ gap: 4 }}>
              {o.titles.map((t) => (
                <span key={t} className="badge badge-ok">
                  <Icon name={t === 'liga' ? 'taca' : 'trofeu'} size={14} /> {t === 'liga' ? 'Liga' : 'Copa'}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {full && (
        <details className="panel">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Tabela final da liga</summary>
          <StandingsTable rows={r.leagueTable} you={mine?.participantId ?? null} />
        </details>
      )}
    </section>
  );
}

function ContinuationPanel({ room }: { room: RoomView }) {
  const c = room.continuation!;
  const now = useNow(250);
  const left = Math.max(0, c.deadline - now);
  const secs = Math.ceil(left / 1000);
  const myVote = c.responses[room.you];
  const eligible = c.eligible.includes(room.you);
  const isHost = room.hostUserId === room.you;
  const yes = c.eligible.filter((u) => c.responses[u] === 'continue').length;
  const memberName = (u: string) => room.members.find((m) => m.userId === u)?.teamName ?? 'Técnico';
  const connected = (u: string) => room.members.find((m) => m.userId === u)?.connected ?? false;
  const pct = Math.min(100, (left / (room.settings.continuationTimeoutSec * 1000)) * 100);
  return (
    <section className="continuation" aria-label="Continuar na sala">
      <div className="spread">
        <h2 style={{ color: '#fff' }}>Mais uma na mesma sala?</h2>
        <span className="clock" data-urgent={secs <= 10}>
          {secs}s
        </span>
      </div>
      <div className="countbar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small" style={{ color: '#c9d2e3' }}>
        Todos os jogadores comprados neste ciclo voltam ao pregão, as moedas voltam a 100 e começa um novo leilão, liga e copa.
        {room.mode === 'online'
          ? ` Com pelo menos ${c.minHumans} ${c.minHumans === 1 ? 'técnico confirmado' : 'técnicos confirmados'}, o próximo ciclo começa sozinho quando todos responderem ou o tempo acabar. Quem não responder fica fora desta rodada e pode voltar depois pelo código.`
          : ' O próximo ciclo começa assim que você confirmar.'}
      </p>
      <ul className="votes">
        {c.eligible.map((u) => (
          <li key={u}>
            <span className="vote-name">
              <span className="dot" data-off={!connected(u)} />
              {memberName(u)}
              {u === room.you ? ' (você)' : ''}
            </span>
            {c.responses[u] === 'continue' ? (
              <span className="vote-yes">continua</span>
            ) : c.responses[u] === 'leave' ? (
              <span className="vote-no">saiu</span>
            ) : (
              <span className="vote-wait">{connected(u) ? 'decidindo…' : 'desconectado'}</span>
            )}
          </li>
        ))}
      </ul>
      {eligible && !myVote && (
        <div className="row">
          <button className="btn btn-cone" onClick={() => void act({ t: 'continue:vote', disputeId: c.disputeId, choice: 'continue' })}>
            <Icon name="repetir" /> Continuar na sala
          </button>
          <button className="btn" onClick={() => void act({ t: 'continue:vote', disputeId: c.disputeId, choice: 'leave' })}>
            Sair da sala
          </button>
        </div>
      )}
      {myVote === 'continue' && <p>Você confirmou. {yes < c.minHumans ? `Faltam ${c.minHumans - yes} para seguir.` : 'Esperando os outros responderem.'}</p>}
      {!eligible && <p className="small">Você entrou depois; aguarde o próximo ciclo começar.</p>}
      {isHost && room.mode === 'online' && myVote === 'continue' && yes >= c.minHumans && yes < c.eligible.length && (
        <button className="btn btn-pitch" onClick={() => void act({ t: 'continue:start-now', disputeId: c.disputeId })}>
          Começar agora com quem confirmou
        </button>
      )}
    </section>
  );
}

export function PostDispute({ room }: { room: RoomView }) {
  return (
    <div className="stack" style={{ gap: 22 }}>
      <RoomHeader room={room} subtitle="Fim de temporada. Os resultados já estão no seu histórico." />
      <div className="grid-2">
        <div className="stack">
          <LastResultCard room={room} full />
          <div className="row">
            <button className="btn" onClick={() => navigate(`/perfil/${room.you}`)}>
              <Icon name="perfil" /> Ver meus confrontos
            </button>
            <button className="btn" onClick={() => navigate(`/trofeus/${room.you}`)}>
              <Icon name="trofeu" /> Sala de Troféus
            </button>
          </div>
        </div>
        <aside className="stack">
          {room.continuation && <ContinuationPanel room={room} />}
          {room.hostUserId === room.you && <SettingsPanel room={room} editable />}
          <HistoryPanel room={room} />
        </aside>
      </div>
    </div>
  );
}
