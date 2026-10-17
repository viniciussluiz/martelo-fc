import type { StandingRow } from '../../../engine/league';
import type { CupTie } from '../../../engine/cup';
import type { DisputeView, FixtureView, MatchView, RoomView } from '../../../shared/protocol';
import { act } from '../../lib/socket';
import { REACH_LABEL, useNow } from '../common';

export function LiveMatch({ match, you, tickStartedAt, tickMs }: { match: MatchView | null; you: string | null; tickStartedAt: number; tickMs: number }) {
  const now = useNow(150);
  if (!match) {
    return (
      <div className="live">
        <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.4rem' }}>Bola rolando em instantes…</strong>
        <div className="live-bar">
          <span style={{ width: '0%' }} />
        </div>
      </div>
    );
  }
  // O jogo já foi simulado no servidor; aqui ele “acontece” ao longo da rodada.
  const playMs = Math.max(400, tickMs * 0.85);
  const minute = Math.max(0, Math.min(90, Math.floor(((now - tickStartedAt) / playMs) * 90)));
  const over = minute >= 90;
  const goalsSoFar = match.goals.filter((g) => g.minute <= minute);
  const home = goalsSoFar.filter((g) => g.side === 'home').length;
  const away = goalsSoFar.filter((g) => g.side === 'away').length;
  const events = (match.events ?? []).filter((e) => e.minute <= minute && (over || e.type !== 'fim') && (over || e.type !== 'penaltis')).slice().reverse();
  return (
    <div className="live" aria-live="polite">
      {match.stage && <span className="small" style={{ color: '#a8d5bb' }}>{match.stage}</span>}
      <div className="live-score">
        <div className="live-team" data-me={match.homeId === you}>
          {match.homeName}
        </div>
        <div className="live-board">
          {home} × {away}
          <small>{over ? (match.penalties ? `pênaltis ${match.penalties.home}×${match.penalties.away}` : 'fim de jogo') : `${minute}'`}</small>
        </div>
        <div className="live-team away" data-me={match.awayId === you}>
          {match.awayName}
        </div>
      </div>
      <div className="live-bar">
        <span style={{ width: `${(minute / 90) * 100}%` }} />
      </div>
      <ul className="radio">
        {events.map((e, i) => (
          <li key={`${e.minute}-${i}`} data-goal={e.type === 'gol'}>
            <span className="min">{e.minute}'</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TacticPicker({ d, next }: { d: DisputeView; next: FixtureView | null }) {
  if (!d.you || !next) return null;
  const tactic = d.tactic ?? 'equilibrio';
  return (
    <div className="panel stack" style={{ gap: 8 }}>
      <div className="spread">
        <div>
          <div className="small muted">Próximo jogo, {next.label}</div>
          <strong>
            {next.homeName} × {next.awayName}
          </strong>
        </div>
        <div className="seg" role="group" aria-label="Tática">
          {(
            [
              ['retranca', 'Retranca'],
              ['equilibrio', 'Equilíbrio'],
              ['ataque', 'Ataque'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={tactic === k} onClick={() => void act({ t: 'tactic', tactic: k })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">
        Retranca segura a defesa e cria menos; ataque cria mais e se expõe. A tática vale para os próximos jogos até você mudar.
      </p>
    </div>
  );
}

export function StandingsTable({ rows, you, zones = true, compact }: { rows: StandingRow[]; you: string | null; zones?: boolean; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th className="r">P</th>
            <th className="r">J</th>
            {!compact && <th className="r">V</th>}
            {!compact && <th className="r">E</th>}
            {!compact && <th className="r">D</th>}
            <th className="r">SG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.teamId}
              data-me={r.teamId === you}
              data-zone={zones ? (r.position <= 8 ? 'g8' : r.position > rows.length - 4 ? 'z4' : undefined) : undefined}
            >
              <td>{r.position}</td>
              <td>{r.name}</td>
              <td className="r">
                <strong>{r.points}</strong>
              </td>
              <td className="r">{r.played}</td>
              {!compact && <td className="r">{r.won}</td>}
              {!compact && <td className="r">{r.drawn}</td>}
              {!compact && <td className="r">{r.lost}</td>}
              <td className="r">{r.goalDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Scorers({ list, names }: { list: Array<{ cardId: string; name: string; teamId: string; goals: number }>; names: Record<string, string> }) {
  if (!list.length) return <p className="small muted">Sem gols ainda.</p>;
  return (
    <ol className="stack" style={{ gap: 4, paddingLeft: 20, margin: 0 }}>
      {list.map((s) => (
        <li key={`${s.teamId}-${s.cardId}`}>
          <strong>{s.name}</strong> <span className="small muted">({names[s.teamId] ?? s.teamId})</span> <span className="num">{s.goals}</span>
        </li>
      ))}
    </ol>
  );
}

function ResultsList({ results, you }: { results: MatchView[]; you: string | null }) {
  if (!results.length) return null;
  return (
    <details className="panel">
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Todos os jogos da rodada</summary>
      <ul className="room-list">
        {results.map((m) => (
          <li key={m.id} style={{ fontWeight: m.homeId === you || m.awayId === you ? 700 : 400 }}>
            <span>
              {m.homeName} <span className="num">{m.homeGoals}</span> × <span className="num">{m.awayGoals}</span> {m.awayName}
              {m.penalties ? ` (pên. ${m.penalties.home}×${m.penalties.away})` : ''}
            </span>
            {m.stage && <span className="small muted">{m.stage}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LeagueScreen({ room }: { room: RoomView }) {
  const d = room.dispute!;
  const l = d.league!;
  const myRow = l.table.find((r) => r.teamId === d.you);
  return (
    <div className="stack">
      <div className="scoreboard">
        <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.5rem' }}>
          Liga · rodada {Math.max(1, l.round)} de {l.totalRounds}
        </strong>
        {myRow && (
          <span style={{ marginLeft: 'auto' }}>
            <span className="num" style={{ fontSize: '1.6rem' }}>
              {myRow.position}º
            </span>{' '}
            <span className="small" style={{ color: '#9fabc2' }}>
              {myRow.points} pts
            </span>
          </span>
        )}
      </div>
      <div className="grid-2">
        <div className="stack">
          <LiveMatch match={l.myLastMatch} you={d.you} tickStartedAt={l.tickStartedAt} tickMs={l.tickMs} />
          <TacticPicker d={d} next={l.myNextFixture} />
          <div className="panel">
            <div className="panel-title">Classificação</div>
            <StandingsTable rows={l.table} you={d.you} />
            <p className="small muted" style={{ marginTop: 8 }}>
              {d.result?.cupName || room.settings.cupFormat !== 'nenhuma'
                ? 'Os 8 primeiros (faixa verde) vão para a copa.'
                : 'Sem copa nesta sala: vale a tabela.'}
            </p>
          </div>
        </div>
        <aside className="stack">
          <div className="panel">
            <div className="panel-title">Artilharia</div>
            <Scorers list={l.topScorers} names={d.teamNames} />
          </div>
          <ResultsList results={l.lastResults} you={d.you} />
        </aside>
      </div>
    </div>
  );
}

const STAGE_ORDER = ['grupos', 'oitavas', 'quartas', 'semi', 'final'];
const STAGE_NAME: Record<string, string> = { oitavas: 'Oitavas', quartas: 'Quartas', semi: 'Semifinais', final: 'Final' };

function TieCard({ t, names, you }: { t: CupTie; names: Record<string, string>; you: string | null }) {
  const agg = t.aggregate;
  return (
    <div className="tie" data-me={t.aId === you || t.bId === you}>
      <span className={t.winnerId === t.aId ? 'w' : ''}>{names[t.aId]}</span>
      <span className="num">{agg ? agg.a : '–'}</span>
      <span className={t.winnerId === t.bId ? 'w' : ''}>{names[t.bId]}</span>
      <span className="num">{agg ? agg.b : '–'}</span>
      {t.penalties && (
        <span className="small muted" style={{ gridColumn: '1 / -1' }}>
          Pênaltis {t.penalties.a}×{t.penalties.b}
        </span>
      )}
    </div>
  );
}

export function CupScreen({ room }: { room: RoomView }) {
  const d = room.dispute!;
  const c = d.cup;
  if (!c) return d.league ? <LeagueScreen room={room} /> : null;
  const myReach = d.you ? c.reached[d.you] : undefined;
  const stages = STAGE_ORDER.filter((s) => s !== 'grupos' && c.ties.some((t) => t.stage === s));
  return (
    <div className="stack">
      <div className="scoreboard">
        <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.5rem' }}>
          {c.name}
          {c.stage ? ` · ${c.stage === 'grupos' ? 'fase de grupos' : (STAGE_NAME[c.stage] ?? c.stage).toLowerCase()}` : ' · encerrada'}
        </strong>
        <span style={{ marginLeft: 'auto' }} className="small">
          {d.you ? (myReach ? `Você: ${REACH_LABEL[myReach]}` : 'Você não se classificou') : ''}
        </span>
      </div>
      {d.phase === 'finished' && <div className="banner-pause">Apito final. Fechando a temporada e gravando o histórico…</div>}
      <div className="grid-2">
        <div className="stack">
          <LiveMatch match={c.myLastMatch} you={d.you} tickStartedAt={c.tickStartedAt} tickMs={c.tickMs} />
          <TacticPicker d={d} next={c.myNextFixture} />
          {stages
            .slice()
            .reverse()
            .map((s) => (
              <div className="panel" key={s}>
                <div className="panel-title">{STAGE_NAME[s]}</div>
                <div className="ties">
                  {c.ties
                    .filter((t) => t.stage === s)
                    .map((t) => (
                      <TieCard key={t.id} t={t} names={d.teamNames} you={d.you} />
                    ))}
                </div>
              </div>
            ))}
          {c.groupTables && (
            <details className="panel" open={c.stage === 'grupos'}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Grupos</summary>
              <div className="ties" style={{ marginTop: 10 }}>
                {Object.entries(c.groupTables).map(([g, rows]) => (
                  <div key={g} className="stack" style={{ gap: 4 }}>
                    <strong>Grupo {g}</strong>
                    <StandingsTable rows={rows} you={d.you} zones={false} compact />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <aside className="stack">
          <ResultsList results={c.lastResults} you={d.you} />
          {d.league && (
            <details className="panel">
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Tabela final da liga</summary>
              <StandingsTable rows={d.league.table} you={d.you} compact />
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
