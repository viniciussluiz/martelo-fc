import type { StandingRow } from '../../../engine/league';
import type { CupTie } from '../../../engine/cup';
import type { DisputeView, FixtureView, MatchView, RoomView } from '../../../shared/protocol';
import { act } from '../../lib/socket';
import { buildTimeline } from '../../lib/ball';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { REACH_LABEL, useNow } from '../common';
import { matchMinute, MatchPitch, useMatchTimeline } from './MatchPitch';
import { SquadPitch } from './Squad';
import { TeamCrest } from '../crest/TeamCrest';
import { Confetti, PosChip } from '../ui';

export function LiveMatch({
  match,
  you,
  tickStartedAt,
  tickMs,
  footer,
}: {
  match: MatchView | null;
  you: string | null;
  tickStartedAt: number;
  tickMs: number;
  /** Faixa de baixo do painel (tática para o próximo jogo). */
  footer?: ReactNode;
}) {
  const now = useNow(150);
  const playMs = playTime(tickMs);
  const timeline = useMatchTimeline(match, playMs);
  if (!match || !timeline) {
    return (
      <div className="live">
        <div className="live-wait">
          <span className="live-state" data-state="pre">Antes do jogo</span>
          <strong>Bola rolando em instantes…</strong>
        </div>
        <div className="live-bar">
          <span style={{ width: '0%' }} />
        </div>
        {footer}
      </div>
    );
  }
  // O jogo já foi simulado no servidor; aqui ele “acontece” ao longo da rodada.
  const exact = matchMinute(now, tickStartedAt, playMs);
  const minute = Math.floor(exact);
  const over = exact >= 90;
  // O placar e a narração andam junto com a bola: o gol conta quando ela entra na rede.
  const goalsSoFar = timeline.goals.filter((g) => over || g.t <= exact);
  const home = over ? match.homeGoals : goalsSoFar.filter((g) => g.side === 'home').length;
  const away = over ? match.awayGoals : goalsSoFar.filter((g) => g.side === 'away').length;
  const events = (match.events ?? [])
    .map((e, i) => ({ e, at: timeline.moments[i] ?? e.minute }))
    .filter(({ e, at }) => (over ? true : at <= exact && e.type !== 'fim' && e.type !== 'penaltis'))
    .map(({ e }) => e)
    .reverse();
  return (
    <div className="live" data-state={over ? 'fim' : 'live'}>
      <div className="live-score">
        <div className="live-team" data-me={match.homeId === you}>
          <span className="live-crest" key={`hc${home}`} data-scored={home > 0 || undefined}>
            <TeamCrest id={match.homeId} name={match.homeName} size={58} />
          </span>
          <span className="live-team-name">{match.homeName}</span>
        </div>
        <div className="live-board">
          {match.stage && <span className="live-stage">{match.stage}</span>}
          <span className="live-goals" aria-label={`${home} a ${away}`}>
            <span className="live-digit" key={`h${home}`}>
              {home}
            </span>
            <span className="live-x">:</span>
            <span className="live-digit" key={`a${away}`}>
              {away}
            </span>
          </span>
          <span className="live-state" data-state={over ? 'fim' : 'live'}>
            {over ? (match.penalties ? `Pênaltis ${match.penalties.home}×${match.penalties.away}` : 'Fim de jogo') : `Ao vivo · ${minute}'`}
          </span>
        </div>
        <div className="live-team away" data-me={match.awayId === you}>
          <span className="live-crest" key={`ac${away}`} data-scored={away > 0 || undefined}>
            <TeamCrest id={match.awayId} name={match.awayName} size={58} />
          </span>
          <span className="live-team-name">{match.awayName}</span>
        </div>
        {over && ((match.homeId === you && match.homeGoals > match.awayGoals) || (match.awayId === you && match.awayGoals > match.homeGoals)) && (
          <Confetti seed={match.homeGoals * 7 + match.awayGoals} count={20} />
        )}
      </div>
      <div className="live-body">
        <MatchPitch match={match} timeline={timeline} tickStartedAt={tickStartedAt} playMs={playMs} />
        <div className="live-feed">
          <div className="live-feed-title">Lance a lance</div>
          <ul className="radio" aria-live="polite">
            {events.length ? (
              events.map((e, i) => (
                <li key={`${e.minute}-${i}`} data-goal={e.type === 'gol'}>
                  <span className="min">{e.minute}'</span>
                  <span>{e.text}</span>
                </li>
              ))
            ) : (
              <li className="radio-empty">Rola a bola.</li>
            )}
          </ul>
        </div>
      </div>
      <div className="live-bar">
        <span style={{ width: `${(Math.min(90, exact) / 90) * 100}%` }} />
      </div>
      {footer}
    </div>
  );
}

/** Quanto do intervalo da rodada o jogo ocupa na tela (o resto é o “fim de jogo”). */
export function playTime(tickMs: number): number {
  return Math.max(400, tickMs * 0.85);
}

/**
 * Enquanto o jogo da rodada passa na tela, o resto (tabela, artilharia, resultados, chaves da copa)
 * continua como estava antes dela; o resultado novo aparece no apito final.
 */
export function useAfterWhistle<T>(value: T, tickStartedAt: number, tickMs: number): T {
  const now = useNow(250);
  const store = useRef<{ tick: number; before: T; current: T } | null>(null);
  if (!store.current) store.current = { tick: tickStartedAt, before: value, current: value };
  else if (store.current.tick !== tickStartedAt) store.current = { tick: tickStartedAt, before: store.current.current, current: value };
  else store.current.current = value;
  return now < tickStartedAt + playTime(tickMs) ? store.current.before : store.current.current;
}

const TACTICS = [
  { id: 'retranca', label: 'Retranca', note: 'Segura a defesa e cria menos.' },
  { id: 'equilibrio', label: 'Equilíbrio', note: 'Defende e ataca na mesma medida.' },
  { id: 'ataque', label: 'Ataque', note: 'Cria mais e se expõe atrás.' },
] as const;

/** Tática para o próximo jogo, na faixa de baixo do painel do jogo. */
export function TacticBar({ d, next, masked = false }: { d: DisputeView; next: FixtureView | null; masked?: boolean }) {
  if (!d.you || !next) return null;
  const tactic = d.tactic ?? 'equilibrio';
  const current = TACTICS.find((t) => t.id === tactic) ?? TACTICS[1];
  return (
    <div className="live-foot">
      <div className="live-next">
        {/* Na copa, o próximo adversário entregaria quem passou: aparece no apito final. */}
        <span>{masked ? 'Próximo jogo' : `Próximo jogo · ${next.label}`}</span>
        <strong>{masked ? 'Adversário no apito final' : `${next.homeName} × ${next.awayName}`}</strong>
      </div>
      <div className="live-tactic">
        <div className="seg seg-dark" role="group" aria-label="Tática para os próximos jogos">
          {TACTICS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tactic === t.id} title={t.note} onClick={() => void act({ t: 'tactic', tactic: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="live-tactic-note">{current.note} Vale até você mudar.</span>
      </div>
    </div>
  );
}

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Abas logo abaixo do campo. Até a pessoa escolher uma, fica na `initial` (e acompanha se ela mudar,
 * por exemplo da fase de grupos para o mata-mata).
 */
export function TabbedPanel({ label, tabs, initial }: { label: string; tabs: Tab[]; initial?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const uid = useId();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = tabs.find((t) => t.id === picked) ?? tabs.find((t) => t.id === initial) ?? tabs[0];
  if (!active) return null;
  const onKey = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const t = tabs[(to + tabs.length) % tabs.length]!;
    setPicked(t.id);
    buttons.current[t.id]?.focus();
  };
  return (
    <section className="tabbed">
      <div className="tabs" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={t.id === active.id}
            aria-controls={`${uid}-panel`}
            tabIndex={t.id === active.id ? 0 : -1}
            onClick={() => setPicked(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${active.id}`} tabIndex={0}>
        {active.content}
      </div>
    </section>
  );
}

export function StandingsTable({ rows, you, zones = true, compact }: { rows: StandingRow[]; you: string | null; zones?: boolean; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="pos">#</th>
            <th>Time</th>
            <th className="r">P</th>
            <th className="r">J</th>
            {!compact && <th className="r opt">V</th>}
            {!compact && <th className="r opt">E</th>}
            {!compact && <th className="r opt">D</th>}
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
              <td className="pos">
                <span className="pos-num">{r.position}</span>
              </td>
              <td className="team">
                <span className="team-cell">
                  <TeamCrest id={r.teamId} name={r.name} size={compact ? 20 : 24} />
                  <span className="team-cell-name">{r.name}</span>
                  {r.teamId === you && <span className="badge badge-me">você</span>}
                </span>
              </td>
              <td className="r">
                <strong>{r.points}</strong>
              </td>
              <td className="r">{r.played}</td>
              {!compact && <td className="r opt">{r.won}</td>}
              {!compact && <td className="r opt">{r.drawn}</td>}
              {!compact && <td className="r opt">{r.lost}</td>}
              <td className="r">{r.goalDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Leader = { cardId: string; name: string; teamId: string; goals?: number; assists?: number };

/** Ranking de jogadores: artilharia (gols) ou maiores garçons (assistências). */
export function Scorers({
  list,
  names,
  you = null,
  kind = 'gols',
}: {
  list: Leader[];
  names: Record<string, string>;
  you?: string | null;
  kind?: 'gols' | 'assistencias';
}) {
  const value = (s: Leader) => (kind === 'gols' ? (s.goals ?? 0) : (s.assists ?? 0));
  if (!list.length) return <p className="small muted">{kind === 'gols' ? 'Sem gols ainda.' : 'Ninguém deu assistência ainda.'}</p>;
  return (
    <ol className="scorers" data-kind={kind}>
      {list.map((s) => {
        // Empatados dividem a posição (1, 2, 2, 4…).
        const rank = list.findIndex((x) => value(x) === value(s)) + 1;
        const n = value(s);
        return (
          <li key={`${s.teamId}-${s.cardId}`} data-me={s.teamId === you || undefined} data-rank={rank}>
            <span className="scorers-rank">{rank}</span>
            <span className="scorers-who">
              <strong>{s.name}</strong>
              <span className="scorers-team">
                <TeamCrest id={s.teamId} name={names[s.teamId] ?? s.teamId} size={16} />
                {names[s.teamId] ?? s.teamId}
              </span>
            </span>
            <span className="scorers-goals">
              <span className="num">{n}</span>
              <span>{kind === 'gols' ? (n === 1 ? 'gol' : 'gols') : n === 1 ? 'assistência' : 'assistências'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const LINE_ORDER = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'];

/** Escalação: o seu time e o adversário do jogo na tela (quem só assiste escolhe qualquer time), com gols e assistências. */
function Lineup({
  d,
  opponentId,
  stats,
  competition,
}: {
  d: DisputeView;
  opponentId: string | null;
  stats: Record<string, Record<string, [number, number]>>;
  competition: string;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const has = (id: string | null): id is string => !!id && d.participants.some((p) => p.id === id);
  const options = d.you ? [d.you, ...(has(opponentId) ? [opponentId] : [])] : d.participants.map((p) => p.id);
  const view = pick && options.includes(pick) ? pick : options[0];
  const p = d.participants.find((x) => x.id === view);
  if (!view || !p) return <p className="small muted">Sem escalação para mostrar.</p>;
  const mine = stats[view] ?? {};
  const roster = [...p.roster]
    .filter((r) => d.cards[r.cardId])
    .sort((a, b) => LINE_ORDER.indexOf(a.position) - LINE_ORDER.indexOf(b.position));
  const totalG = roster.reduce((n, r) => n + (mine[r.cardId]?.[0] ?? 0), 0);
  const totalA = roster.reduce((n, r) => n + (mine[r.cardId]?.[1] ?? 0), 0);
  return (
    <div className="lineup">
      <div className="lineup-head">
        {options.length > 1 ? (
          <div className="team-picker" role="group" aria-label="Escolher time">
            {options.map((id) => {
              const nm = d.teamNames[id] ?? d.participants.find((x) => x.id === id)?.name ?? id;
              return (
                <button key={id} type="button" aria-pressed={id === view} onClick={() => setPick(id)}>
                  <TeamCrest id={id} name={nm} size={22} />
                  {id === d.you ? 'Seu time' : nm}
                </button>
              );
            })}
          </div>
        ) : (
          <strong className="lineup-name">
            <TeamCrest id={p.id} name={p.name} userId={p.userId} size={24} />
            {p.name}
          </strong>
        )}
        <span className="small muted">{p.formation}</span>
      </div>
      <div className="lineup-body">
        <SquadPitch d={d} participantId={view} showPrice={false} stats={mine} />
        <div className="lineup-roster">
          <table className="table roster-table">
            <caption>Gols e assistências na {competition}</caption>
            <thead>
              <tr>
                <th>Jogador</th>
                <th className="r" title="Gols">
                  Gols
                </th>
                <th className="r" title="Assistências">
                  Assist.
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const c = d.cards[r.cardId]!;
                const [g, a] = mine[r.cardId] ?? [0, 0];
                return (
                  <tr key={r.cardId} data-hot={g + a > 0 || undefined}>
                    <td>
                      <span className="roster-player">
                        <PosChip pos={r.position} />
                        <span className="roster-name">{c.name}</span>
                        {c.levelMin !== undefined && (
                          <span className="band" title="Faixa de nível">
                            {c.levelMin}–{c.levelMax}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="r">
                      <span className="roster-n" data-zero={g === 0 || undefined}>
                        {g}
                      </span>
                    </td>
                    <td className="r">
                      <span className="roster-n" data-zero={a === 0 || undefined}>
                        {a}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total do time</td>
                <td className="r">{totalG}</td>
                <td className="r">{totalA}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Todos os jogos da rodada, ao vivo: o placar de cada um anda junto com o relógio (o gol conta
 * quando a bola entra, no mesmo ritmo do jogo que está no campo).
 */
function LiveRound({
  matches,
  myMatch,
  you,
  tickStartedAt,
  tickMs,
  subtitle,
}: {
  matches: MatchView[];
  myMatch: MatchView | null;
  you: string | null;
  tickStartedAt: number;
  tickMs: number;
  subtitle?: string;
}) {
  const now = useNow(120);
  const playMs = playTime(tickMs);
  const key = `${tickStartedAt}:${playMs}:${matches.map((m) => m.id).join(',')}:${myMatch?.id ?? ''}:${myMatch?.events?.length ?? 0}`;
  const timelines = useMemo(() => {
    const mps = 90 / (playMs / 1000);
    // O seu jogo usa a mesma linha do tempo (com os lances) que o campo usa.
    return new Map(matches.map((m) => [m.id, buildTimeline(myMatch && myMatch.id === m.id ? myMatch : m, mps)]));
  }, [key]);
  const exact = matchMinute(now, tickStartedAt, playMs);
  const over = exact >= 90;
  // Mesmo jogo da tela primeiro, depois a ordem da rodada.
  const ordered = [...matches].sort((a, b) => Number(isMine(b, you)) - Number(isMine(a, you)));
  return (
    <section className="round-live" aria-label="Jogos da rodada">
      <div className="round-live-head">
        <div>
          <h3 className="side-title">Jogos da rodada</h3>
          {subtitle && <div className="side-sub">{subtitle}</div>}
        </div>
        {matches.length > 0 && (
          <span className="live-chip" data-state={over ? 'fim' : 'live'}>
            {over ? 'Encerrados' : `Ao vivo · ${Math.floor(exact)}'`}
          </span>
        )}
      </div>
      {matches.length === 0 ? (
        <p className="small muted">Os jogos aparecem aqui quando a bola rolar.</p>
      ) : (
        <ul className="scores">
          {ordered.map((m) => {
            const tl = timelines.get(m.id);
            const sofar = tl ? tl.goals.filter((g) => g.t <= exact) : [];
            const h = over || !tl ? m.homeGoals : sofar.filter((g) => g.side === 'home').length;
            const a = over || !tl ? m.awayGoals : sofar.filter((g) => g.side === 'away').length;
            // Mesmo tempo do “GOL!” no campo: some na saída de bola do meio-campo.
            const flash = !over && tl ? tl.goals.find((g) => exact >= g.t && exact < Math.min(g.until, g.t + tl.goalShow))?.side : undefined;
            const pens = over && m.penalties ? m.penalties : null;
            const lead = pens ? (pens.home > pens.away ? 'home' : 'away') : h > a ? 'home' : a > h ? 'away' : null;
            return (
              <li key={m.id} data-me={isMine(m, you) || undefined}>
                <span className="sc-time" data-state={over ? 'fim' : 'live'}>
                  {over ? 'Fim' : `${Math.floor(exact)}'`}
                </span>
                <ScoreLine id={m.homeId} name={m.homeName} goals={h} lead={lead === 'home'} flash={flash === 'home'} me={m.homeId === you} />
                <ScoreLine id={m.awayId} name={m.awayName} goals={a} lead={lead === 'away'} flash={flash === 'away'} me={m.awayId === you} />
                {pens && (
                  <span className="sc-note">
                    Pênaltis {pens.home}×{pens.away}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function isMine(m: MatchView, you: string | null): boolean {
  return !!you && (m.homeId === you || m.awayId === you);
}

function ScoreLine({ id, name, goals, lead, flash, me }: { id: string; name: string; goals: number; lead: boolean; flash: boolean; me: boolean }) {
  return (
    <>
      <span className="sc-team" data-lead={lead || undefined} data-me={me || undefined}>
        <TeamCrest id={id} name={name} size={20} />
        <span className="sc-name">{name}</span>
        {flash && <span className="sc-flash">Gol</span>}
      </span>
      <span className="sc-goals" data-flash={flash || undefined} data-lead={lead || undefined}>
        {goals}
      </span>
    </>
  );
}

function opponentOf(m: MatchView | null, you: string | null): string | null {
  if (!m || !you) return null;
  return m.homeId === you ? m.awayId : m.awayId === you ? m.homeId : null;
}

export function LeagueScreen({ room }: { room: RoomView }) {
  const d = room.dispute!;
  const live = d.league!;
  // Tabela, artilharia e resultados só mudam no apito final do jogo que está passando.
  const l = useAfterWhistle(live, live.tickStartedAt, live.tickMs);
  const myRow = l.table.find((r) => r.teamId === d.you);
  // Quem só assiste vê o primeiro jogo da rodada no campo.
  const featured = live.myLastMatch ?? live.lastResults[0] ?? null;
  const tabs: Tab[] = [
    {
      id: 'tabela',
      label: 'Classificação',
      content: (
        <>
          <StandingsTable rows={l.table} you={d.you} />
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            {d.result?.cupName || room.settings.cupFormat !== 'nenhuma'
              ? 'Os 8 primeiros (faixa verde) vão para a copa.'
              : 'Sem copa nesta sala: vale a tabela.'}
          </p>
        </>
      ),
    },
    {
      id: 'escalacao',
      label: 'Escalação',
      content: <Lineup d={d} opponentId={opponentOf(live.myLastMatch, d.you)} stats={l.playerStats ?? {}} competition="liga" />,
    },
    { id: 'artilharia', label: 'Artilharia', content: <Scorers list={l.topScorers} names={d.teamNames} you={d.you} /> },
    { id: 'garcons', label: 'Garçons', content: <Scorers list={l.topAssists ?? []} names={d.teamNames} you={d.you} kind="assistencias" /> },
  ];
  return (
    <div className="stack">
      <header className="scoreboard comp-head">
        <div className="comp-title">
          <h2 className="sb-title">
            Liga · rodada {Math.max(1, live.round)} de {live.totalRounds}
          </h2>
          <span className="comp-bar" aria-hidden="true">
            <span style={{ width: `${(Math.max(0, live.round) / live.totalRounds) * 100}%` }} />
          </span>
        </div>
        {myRow && (
          <dl className="sb-stats">
            <div className="sb-stat sb-team">
              <dt>Seu time</dt>
              <dd>
                <TeamCrest id={myRow.teamId} name={myRow.name} size={34} />
              </dd>
            </div>
            <div className="sb-stat">
              <dt>Posição</dt>
              <dd>
                <span className="led">{myRow.position}º</span>
              </dd>
            </div>
            <div className="sb-stat">
              <dt>Pontos</dt>
              <dd>
                <span className="led">{myRow.points}</span>
              </dd>
            </div>
            <div className="sb-stat">
              <dt>Saldo</dt>
              <dd>
                <span className="led led-dim">{myRow.goalDiff > 0 ? `+${myRow.goalDiff}` : myRow.goalDiff}</span>
              </dd>
            </div>
          </dl>
        )}
      </header>
      <div className="grid-2">
        <div className="stack">
          <LiveMatch
            match={featured}
            you={d.you}
            tickStartedAt={live.tickStartedAt}
            tickMs={live.tickMs}
            footer={<TacticBar d={d} next={live.myNextFixture} />}
          />
          <TabbedPanel label="Liga" tabs={tabs} initial="tabela" />
        </div>
        <aside className="live-side">
          <LiveRound
            matches={live.lastResults}
            myMatch={live.myLastMatch}
            you={d.you}
            tickStartedAt={live.tickStartedAt}
            tickMs={live.tickMs}
          />
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
      <span className={t.winnerId === t.aId ? 'tie-team w' : 'tie-team'}>
        <TeamCrest id={t.aId} name={names[t.aId] ?? t.aId} size={22} />
        <span className="tie-name">{names[t.aId]}</span>
      </span>
      <span className="tie-score">{agg ? agg.a : '–'}</span>
      <span className={t.winnerId === t.bId ? 'tie-team w' : 'tie-team'}>
        <TeamCrest id={t.bId} name={names[t.bId] ?? t.bId} size={22} />
        <span className="tie-name">{names[t.bId]}</span>
      </span>
      <span className="tie-score">{agg ? agg.b : '–'}</span>
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
  const live = d.cup;
  // Chaves, grupos e resultados só mudam no apito final do jogo que está passando.
  const c = useAfterWhistle(live, live?.tickStartedAt ?? 0, live?.tickMs ?? 0);
  const phase = useAfterWhistle(d.phase, live?.tickStartedAt ?? 0, live?.tickMs ?? 0);
  if (!live || !c) return d.league ? <LeagueScreen room={room} /> : null;
  const myReach = d.you ? c.reached[d.you] : undefined;
  const stages = STAGE_ORDER.filter((s) => s !== 'grupos' && c.ties.some((t) => t.stage === s));
  const featured = live.myLastMatch ?? live.lastResults[0] ?? null;
  const tabs: Tab[] = [];
  if (c.groupTables) {
    tabs.push({
      id: 'grupos',
      label: 'Grupos',
      content: (
        <div className="ties">
          {Object.entries(c.groupTables).map(([g, rows]) => (
            <div key={g} className="group-box">
              <strong className="group-title">Grupo {g}</strong>
              <StandingsTable rows={rows} you={d.you} zones={false} compact />
            </div>
          ))}
        </div>
      ),
    });
  }
  if (stages.length) {
    tabs.push({
      id: 'chaves',
      label: 'Mata-mata',
      content: (
        <div className="stack" style={{ gap: 12 }}>
          {stages
            .slice()
            .reverse()
            .map((s) => (
              <div key={s} className="stack" style={{ gap: 8 }}>
                <strong className="tab-sub">{STAGE_NAME[s]}</strong>
                <div className="ties">
                  {c.ties
                    .filter((t) => t.stage === s)
                    .map((t) => (
                      <TieCard key={t.id} t={t} names={d.teamNames} you={d.you} />
                    ))}
                </div>
              </div>
            ))}
        </div>
      ),
    });
  }
  tabs.push({
    id: 'escalacao',
    label: 'Escalação',
    content: <Lineup d={d} opponentId={opponentOf(live.myLastMatch, d.you)} stats={c.playerStats ?? {}} competition="copa" />,
  });
  tabs.push({ id: 'artilharia', label: 'Artilharia', content: <Scorers list={c.topScorers ?? []} names={d.teamNames} you={d.you} /> });
  tabs.push({ id: 'garcons', label: 'Garçons', content: <Scorers list={c.topAssists ?? []} names={d.teamNames} you={d.you} kind="assistencias" /> });
  if (d.league) tabs.push({ id: 'liga', label: 'Liga', content: <StandingsTable rows={d.league.table} you={d.you} compact /> });
  return (
    <div className="stack">
      <header className="scoreboard comp-head">
        <h2 className="sb-title">
          {c.name}
          {c.stage ? ` · ${c.stage === 'grupos' ? 'fase de grupos' : (STAGE_NAME[c.stage] ?? c.stage).toLowerCase()}` : ' · encerrada'}
        </h2>
        {d.you && (
          <span className="comp-reach" data-champ={myReach === 'campeao' || undefined}>
            {d.you && <TeamCrest id={d.you} name={d.teamNames[d.you] ?? 'Você'} size={30} />}
            {myReach ? `Você: ${REACH_LABEL[myReach]}` : 'Você não se classificou'}
          </span>
        )}
      </header>
      {phase === 'finished' && (
        <div className="notice" data-kind="done">
          <strong>Apito final.</strong>
          <span>Fechando a temporada e gravando o histórico…</span>
        </div>
      )}
      <div className="grid-2">
        <div className="stack">
          <LiveMatch
            match={featured}
            you={d.you}
            tickStartedAt={live.tickStartedAt}
            tickMs={live.tickMs}
            footer={<TacticBar d={d} next={live.myNextFixture} masked={c !== live} />}
          />
          <TabbedPanel label="Copa" tabs={tabs} initial={c.stage === 'grupos' || !stages.length ? 'grupos' : 'chaves'} />
        </div>
        <aside className="live-side">
          <LiveRound
            matches={live.lastResults}
            myMatch={live.myLastMatch}
            you={d.you}
            tickStartedAt={live.tickStartedAt}
            tickMs={live.tickMs}
            subtitle={live.lastResults[0]?.stage}
          />
        </aside>
      </div>
    </div>
  );
}
