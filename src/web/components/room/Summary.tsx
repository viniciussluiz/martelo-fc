import type { RoomView } from '../../../shared/protocol';
import { navigate } from '../../lib/router';
import { act } from '../../lib/socket';
import { REACH_LABEL, useNow } from '../common';
import { Icon } from '../Icon';
import { TeamCrest } from '../crest/TeamCrest';
import { Confetti, StatusLight } from '../ui';
import { HistoryPanel, RoomHeader, SettingsPanel } from './Lobby';
import { StandingsTable } from './Matches';

/** Arte do campeão de cada competição (arquivos em src/web/public/campeoes/). */
const CHAMPION_ART: Record<string, string> = {
  liga: '/campeoes/liga.webp',
  copa8: '/campeoes/liga.webp',
  libertadores: '/campeoes/continental.webp',
  mundial: '/campeoes/mundial.webp',
};

/** Confete dourado caindo sem parar por cima da arte. */
function GoldConfetti({ count = 34, seed = 1 }: { count?: number; seed?: number }) {
  const rnd = (i: number, k: number) => {
    const v = Math.sin((i + 1) * 9301 * k + seed * 49297) * 233280;
    return v - Math.floor(v);
  };
  return (
    <span className="champ-confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${(rnd(i, 1) * 100).toFixed(1)}%`,
              width: `${(5 + rnd(i, 2) * 7).toFixed(1)}px`,
              height: `${(8 + rnd(i, 3) * 12).toFixed(1)}px`,
              animationDelay: `-${(rnd(i, 4) * 6).toFixed(2)}s`,
              animationDuration: `${(3.6 + rnd(i, 5) * 3.4).toFixed(2)}s`,
              '--drift': `${((rnd(i, 6) - 0.5) * 120).toFixed(0)}px`,
              '--spin': `${Math.round(rnd(i, 7) * 1080 - 540)}deg`,
              '--tone': ['#ffd76a', '#f5b82e', '#fff1b8', '#c98f12'][i % 4],
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Pôster do campeão: escudo e nome do time acima da arte do troféu, com confete caindo por cima de tudo. */
function ChampionPoster({ art, title, teamId, name, userId, seed }: { art: string; title: string; teamId: string; name: string; userId: string | null; seed: number }) {
  return (
    <figure className="champ">
      <GoldConfetti seed={seed} />
      <figcaption className="champ-team">
        <span className="champ-crest">
          <TeamCrest id={teamId} name={name} userId={userId} size={60} />
        </span>
        <span className="champ-who">
          <strong className="champ-name">{name}</strong>
          <span className="champ-title">{title}</span>
        </span>
      </figcaption>
      <div className="champ-art" style={{ backgroundImage: `url(${art})` }} role="img" aria-label={`${title}: ${name}`} />
    </figure>
  );
}

/** Os campeões do ciclo: liga e, se a sala teve, a copa. */
function Champions({ room }: { room: RoomView }) {
  const r = room.lastResult!;
  const userOf = (teamId: string) => r.outcomes.find((o) => o.participantId === teamId)?.userId ?? null;
  return (
    <div className="champs">
      <ChampionPoster
        art={CHAMPION_ART.liga!}
        title="Campeão da liga"
        teamId={r.leagueChampionTeamId}
        name={r.leagueChampionName}
        userId={userOf(r.leagueChampionTeamId)}
        seed={r.seq}
      />
      {r.cupChampionTeamId && r.cupChampionName && (
        <ChampionPoster
          art={CHAMPION_ART[r.cupFormat] ?? CHAMPION_ART.liga!}
          title={`Campeão ${/^torneio/i.test(r.cupName ?? '') ? 'do' : 'da'} ${r.cupName ?? 'copa'}`}
          teamId={r.cupChampionTeamId}
          name={r.cupChampionName}
          userId={userOf(r.cupChampionTeamId)}
          seed={r.seq + 7}
        />
      )}
    </div>
  );
}

/** Resumo da última disputa concluída (dado histórico): pódio, seus números e o ranking. */
export function LastResultCard({ room, full }: { room: RoomView; full?: boolean }) {
  const r = room.lastResult;
  if (!r) return null;
  const mine = r.outcomes.find((o) => o.userId === room.you);
  const podium = [r.outcomes[1], r.outcomes[0], r.outcomes[2]].filter((o): o is NonNullable<typeof o> => !!o);
  return (
    <section className="result">
      <div className="result-head">
        <span className="result-cycle">Ciclo {r.seq} encerrado</span>
        <p className="headline">{r.headline}</p>
      </div>
      {full && <Champions room={room} />}
      {full && podium.length > 0 && (
        <div className="podium" aria-hidden="true">
          {podium.map((o) => (
            <div key={o.participantId} className="podium-step" data-rank={o.rank} data-me={o.userId === room.you || undefined}>
              {o.rank === 1 && <Confetti count={18} seed={r.seq} />}
              <span className="podium-crest">
                <TeamCrest id={o.participantId} name={o.name} userId={o.userId} size={o.rank === 1 ? 84 : 62} />
              </span>
              <span className="podium-name">{o.name}</span>
              <span className="podium-block">
                <span className="podium-rank">{o.rank}º</span>
              </span>
            </div>
          ))}
        </div>
      )}
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
            <div className="num num-word">{mine.cupReach ? REACH_LABEL[mine.cupReach] : '—'}</div>
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
          <li key={o.participantId} data-me={o.userId === room.you} data-rank={o.rank}>
            <span className="rank">{o.rank}</span>
            <TeamCrest id={o.participantId} name={o.name} userId={o.userId} size={36} />
            <span className="outcome-text">
              <strong>
                {o.name} {o.isCpu && <span className="badge badge-cpu">CPU</span>}
              </strong>
              <span className="small">
                {o.leaguePosition}º na liga
                {o.cupReach ? `, ${(REACH_LABEL[o.cupReach] ?? o.cupReach).toLowerCase()} na copa` : ''}, gastou {o.spent} moedas, elenco {o.squadAverage}
              </span>
            </span>
            <span className="outcome-titles">
              {o.titles.map((t) => (
                <span key={t} className="badge badge-gold">
                  <Icon name={t === 'liga' ? 'taca' : 'trofeu'} size={14} /> {t === 'liga' ? 'Liga' : 'Copa'}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {full && (
        <details className="fold">
          <summary>Tabela final da liga</summary>
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
      <div className="continuation-head">
        <h2>Mais uma na mesma sala?</h2>
        <span className="clock" data-urgent={secs <= 10}>
          <span className="clock-face">
            <span className="clock-num">{String(secs).padStart(2, '0')}</span>
            <span className="clock-unit">s</span>
          </span>
        </span>
      </div>
      <div className="countbar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small cont-text">
        Todos os jogadores comprados neste ciclo voltam ao pregão, as moedas voltam a 100 e começa um novo leilão, liga e copa.
        {room.mode === 'online'
          ? ` Com pelo menos ${c.minHumans} ${c.minHumans === 1 ? 'técnico confirmado' : 'técnicos confirmados'}, o próximo ciclo começa sozinho quando todos responderem ou o tempo acabar. Quem não responder fica fora desta rodada e pode voltar depois pelo código.`
          : ' O próximo ciclo começa assim que você confirmar.'}
      </p>
      <ul className="votes">
        {c.eligible.map((u) => (
          <li key={u}>
            <span className="vote-name">
              <TeamCrest userId={u} name={memberName(u)} size={24} />
              <StatusLight on={connected(u)} />
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
          <button className="btn btn-primary" onClick={() => void act({ t: 'continue:vote', disputeId: c.disputeId, choice: 'continue' })}>
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
        <button className="btn btn-primary" onClick={() => void act({ t: 'continue:start-now', disputeId: c.disputeId })}>
          Começar agora com quem confirmou
        </button>
      )}
    </section>
  );
}

export function PostDispute({ room }: { room: RoomView }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <RoomHeader room={room} subtitle="Fim de temporada. Os resultados já estão no seu histórico." />
      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <div className="panel-body">
              <LastResultCard room={room} full />
            </div>
          </section>
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
