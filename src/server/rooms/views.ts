import { FORMATIONS, POSITIONS, type Card, type Position } from '../../engine/types.js';
import { packageLabel } from '../../engine/packages.js';
import type { MatchResult } from '../../engine/match.js';
import { aggregateAssists, aggregateScorers, playerStats } from '../../engine/league.js';
import type {
  AuctionView,
  CardView,
  CupView,
  DisputeView,
  FixtureView,
  LeagueView,
  MatchView,
  MemberView,
  PackageView,
  ParticipantView,
  RoomView,
  StepView,
} from '../../shared/protocol.js';
import type { RoomActor } from './room-actor.js';

/**
 * Visão personalizada da sala. Regras de sigilo:
 *  - lances alheios só aparecem depois do martelo (na revelação);
 *  - a faixa (tier) aparece no martelo; a faixa de nível exata só na Cerimônia;
 *  - carta-surpresa tem o nome oculto enquanto o envelope está aberto.
 */
export function buildRoomView(room: RoomActor, userId: string): RoomView {
  const members: MemberView[] = [...room.members.values()]
    .filter((m) => m.status === 'active')
    .sort((a, b) => a.seat - b.seat)
    .map((m) => ({
      userId: m.userId,
      teamName: m.teamName,
      formation: m.formation,
      seat: m.seat,
      status: m.status,
      connected: room.isConnected(m.userId),
      isHost: m.userId === room.hostUserId,
      inDispute: room.isParticipant(m.userId),
    }));
  const c = room.continuation;
  const dispute = room.dispute ? disputeView(room, userId) : null;
  const history = room.cachedHistory();
  const lastResult = room.status === 'post_dispute' || room.status === 'lobby' ? room.lastResult : null;
  const crestIds = [
    ...members.map((m) => m.userId),
    ...(dispute?.participants ?? []).flatMap((p) => (p.userId ? [p.userId] : [])),
    ...(lastResult?.outcomes ?? []).flatMap((o) => (o.userId ? [o.userId] : [])),
    ...history.flatMap((h) => h.participants.flatMap((p) => (p.userId ? [p.userId] : []))),
  ];
  return {
    id: room.id,
    code: room.code,
    mode: room.mode,
    status: room.status,
    settings: room.settings,
    deck: room.deckInfo,
    hostUserId: room.hostUserId,
    cycle: room.cycle,
    you: userId,
    members,
    dispute,
    continuation:
      c && !c.resolved
        ? { disputeId: c.disputeId, cycle: c.cycle, deadline: c.deadline, eligible: c.eligible, responses: c.responses, minHumans: c.minHumans }
        : null,
    lastResult,
    history,
    crests: room.crestsFor(crestIds),
    serverTime: Date.now(),
  };
}

function disputeView(room: RoomActor, userId: string): DisputeView {
  const d = room.dispute!;
  const myPid = `u:${userId}`;
  const me = d.participants.find((p) => p.id === myPid) ?? null;
  const step = d.auction.step;
  const afterAuction = d.phase !== 'auction';
  const cardIds = new Set<string>();
  const soldIds = new Set<string>();
  for (const p of d.participants) {
    for (const r of p.roster) {
      cardIds.add(r.cardId);
      if (r.source !== 'monte') soldIds.add(r.cardId);
    }
  }
  let hiddenMystery = new Set<string>();
  const clubs = d.auction.isClubs;
  if (d.phase === 'auction' && step) {
    if (step.kind === 'bid') {
      step.cardIds.forEach((id) => cardIds.add(id));
      hiddenMystery = new Set(step.mysteryCardIds);
    } else if (step.kind === 'tiebreak') {
      step.items.forEach((i) => cardIds.add(i.cardId));
    } else if (step.kind === 'monte') {
      step.pool.forEach((id) => cardIds.add(id));
    } else if (me) {
      // Convocação: só o dono vê os nomes dos próprios pacotes (sem faixa nem nível).
      const options = d.auction.convocaOptions(me.id);
      for (const pos of POSITIONS) options[pos].forEach((id) => cardIds.add(id));
    }
  }
  if (room.reveal) {
    room.reveal.items.forEach((i) => cardIds.add(i.cardId));
    // Enquanto a revelação passa, o nome da carta-surpresa aparece.
    for (const i of room.reveal.items) hiddenMystery.delete(i.cardId);
  }
  for (const m of d.auction.state.monteLog) cardIds.add(m.cardId);

  const cards: Record<string, CardView> = {};
  for (const id of cardIds) {
    const card = d.cards[id];
    if (!card) continue;
    cards[id] = cardView(card, {
      hideName: hiddenMystery.has(id),
      showTier: afterAuction || soldIds.has(id),
      showLevel: afterAuction,
    });
  }

  const teamNames: Record<string, string> = {};
  for (const p of d.participants) teamNames[p.id] = p.name;
  for (const t of d.league?.state.teams ?? []) teamNames[t.teamId] = t.name;
  for (const t of d.cup?.state.teams ?? []) teamNames[t.teamId] = t.name;

  const participants: ParticipantView[] = d.participants.map((p) => {
    const v: ParticipantView = {
      id: p.id,
      userId: p.userId,
      name: p.name,
      isCpu: p.isCpu,
      formation: p.formation,
      coins: p.coins,
      roster: p.roster.map((r) => ({ cardId: r.cardId, position: r.position, price: r.price, source: r.source })),
      connected: p.isCpu || room.isConnected(p.userId),
      abandoned: room.abandoned.has(p.id),
    };
    if (clubs) {
      const packs = d.auction.packagesOf(p.id);
      v.packs = POSITIONS.filter((pos) => packs[pos]).map((pos) => ({ position: pos, ...packs[pos]! }));
    }
    return v;
  });

  // Pacotes do leilão de clubes: clube, setor e tamanho; os nomes só para o dono, na convocação.
  const packages: Record<string, PackageView> = {};
  if (clubs) {
    const mine = new Set(Object.values(me ? d.auction.packagesOf(me.id) : {}).map((w) => w!.packageId));
    const showNames = d.phase === 'auction' && step?.kind === 'convocacao';
    for (const pk of Object.values(d.auction.state.packages ?? {})) {
      packages[pk.id] = {
        id: pk.id,
        club: pk.club,
        position: pk.position,
        size: pk.cardIds.length,
        label: packageLabel(pk),
        ...(pk.mixed ? { mixed: true } : {}),
        ...(showNames && mine.has(pk.id) ? { cardIds: pk.cardIds } : {}),
      };
    }
  }

  return {
    id: room.disputeId!,
    seq: room.disputeSeq,
    phase: d.phase,
    paused: room.paused,
    you: me ? me.id : null,
    participants,
    cards,
    teamNames,
    carriedCount: d.state.carriedCardIds.length,
    auctionMode: clubs ? 'clubes' : 'jogador',
    packages,
    auction: d.phase === 'auction' || room.reveal ? auctionView(room, myPid) : null,
    ceremony:
      d.phase === 'ceremony' && d.state.awards
        ? { awards: d.state.awards, deadline: room.ceremony?.deadline ?? Date.now(), ready: [...(room.ceremony?.ready ?? [])] }
        : null,
    league: d.league ? leagueView(room, myPid, teamNames) : null,
    cup: d.cup ? cupView(room, myPid, teamNames) : null,
    tactic: me ? (d.state.tactics[me.id] ?? 'equilibrio') : null,
    result: d.state.result,
  };
}

function cardView(card: Card, opts: { hideName: boolean; showTier: boolean; showLevel: boolean }): CardView {
  const v: CardView = {
    id: card.id,
    name: opts.hideName ? '? ? ? ?' : card.name,
    position: card.position,
    club: card.club,
    year: card.year,
  };
  if (opts.hideName) v.mystery = true;
  if (card.kit) v.kit = card.kit;
  if (opts.showTier) v.tier = card.tier;
  if (opts.showLevel) {
    v.levelMin = card.levelMin;
    v.levelMax = card.levelMax;
  }
  return v;
}

function auctionView(room: RoomActor, myPid: string): AuctionView {
  const d = room.dispute!;
  const a = d.auction;
  const step = d.phase === 'auction' ? a.step : null;
  let stepView: StepView | null = null;
  const isMine = d.participants.some((p) => p.id === myPid);
  if (step && !room.reveal) {
    const deadline = room.stepDeadline ?? Date.now();
    if (step.kind === 'bid') {
      const eligible = step.eligible.includes(myPid);
      stepView = {
        kind: 'bid',
        stepId: step.stepId,
        position: step.position,
        round: step.round,
        batchIndex: step.batchIndex,
        batchCount: step.batchCount,
        cardIds: step.cardIds,
        deadline,
        eligible: step.eligible,
        sealed: step.sealed,
        youAreEligible: eligible,
        myBids: step.bids[myPid] ?? {},
        mySealed: step.sealed.includes(myPid),
        myOpenSlots: isMine ? a.vacancies(myPid)[step.position] : 0,
        myCoins: isMine ? a.participant(myPid).coins : 0,
      };
    } else if (step.kind === 'tiebreak') {
      const myItems = step.items
        .filter((i) => i.tied.includes(myPid))
        .map((i) => ({ cardId: i.cardId, floor: i.floor, rivals: i.tied.filter((x) => x !== myPid) }));
      const committed = step.pending.items.filter((i) => !i.tie && i.winnerId === myPid).reduce((s, i) => s + i.price, 0);
      stepView = {
        kind: 'tiebreak',
        stepId: step.stepId,
        position: step.position,
        deadline,
        eligible: step.eligible,
        sealed: step.sealed,
        myItems,
        myBids: step.bids[myPid] ?? {},
        mySealed: step.sealed.includes(myPid),
        myFreeCoins: isMine ? a.participant(myPid).coins - committed : 0,
      };
    } else if (step.kind === 'convocacao') {
      const me = isMine ? a.participant(myPid) : null;
      const packs = me ? a.packagesOf(myPid) : {};
      stepView = {
        kind: 'convocacao',
        stepId: step.stepId,
        deadline,
        eligible: step.eligible,
        sealed: step.sealed,
        need: me ? FORMATIONS[me.formation] : { GOL: 0, LAT: 0, ZAG: 0, MEI: 0, ATA: 0 },
        myPackages: Object.fromEntries(POSITIONS.filter((pos) => packs[pos]).map((pos) => [pos, packs[pos]!.packageId])),
        myPicks: step.picks[myPid] ?? [],
        mySealed: step.sealed.includes(myPid),
      };
    } else {
      stepView = {
        kind: 'monte',
        stepId: step.stepId,
        pool: step.pool,
        current: step.current,
        queue: step.queue,
        deadline,
        myOptions: step.current === myPid ? a.monteOptionsFor(myPid) : [],
        pickNumber: step.pickNumber,
      };
    }
  }
  const currentPos: Position | null = step && (step.kind === 'bid' || step.kind === 'tiebreak') ? step.position : null;
  const idx = currentPos ? POSITIONS.indexOf(currentPos) : a.done || step?.kind === 'monte' || step?.kind === 'convocacao' ? POSITIONS.length : 0;
  return {
    step: stepView,
    reveal: room.reveal,
    progress: POSITIONS.map((position, i) => ({ position, state: i < idx ? 'feito' : i === idx ? 'agora' : 'depois' })),
    monteLog: a.state.monteLog,
  };
}

function matchView(m: MatchResult, names: Record<string, string>, withEvents: boolean, stage?: string): MatchView {
  const v: MatchView = {
    id: m.id,
    homeId: m.homeId,
    awayId: m.awayId,
    homeName: names[m.homeId] ?? m.homeId,
    awayName: names[m.awayId] ?? m.awayId,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    goals: m.goals,
  };
  if (m.penalties) v.penalties = m.penalties;
  if (withEvents && m.events) v.events = m.events;
  if (stage) v.stage = stage;
  return v;
}

function leagueView(room: RoomActor, myPid: string, names: Record<string, string>): LeagueView {
  const d = room.dispute!;
  const league = d.league!;
  const round = league.state.currentRound;
  const lastIds = d.phase === 'league' ? room.lastTickMatchIds : (league.state.fixtures[round - 1] ?? []).map((f) => f.id);
  const last = lastIds.map((id) => league.state.results[id]).filter((m): m is MatchResult => !!m);
  const mine = last.find((m) => m.homeId === myPid || m.awayId === myPid) ?? null;
  const next = league.state.fixtures[round]?.find((f) => f.homeId === myPid || f.awayId === myPid) ?? null;
  const fixture: FixtureView | null = next
    ? { homeId: next.homeId, awayId: next.awayId, homeName: names[next.homeId]!, awayName: names[next.awayId]!, label: `Rodada ${next.round}` }
    : null;
  return {
    round,
    totalRounds: league.totalRounds,
    table: league.standings(),
    lastResults: last.map((m) => matchView(m, names, false)),
    myLastMatch: mine ? matchView(mine, names, true) : null,
    myNextFixture: d.phase === 'league' ? fixture : null,
    topScorers: league.topScorers(10),
    topAssists: league.topAssists(10),
    playerStats: playerStats(Object.values(league.state.results), new Set(d.participants.map((p) => p.id))),
    tickStartedAt: room.tickStartedAt,
    tickMs: room.timing.leagueRoundMs,
  };
}

const STAGE_LABEL: Record<string, string> = { grupos: 'Fase de grupos', oitavas: 'Oitavas', quartas: 'Quartas', semi: 'Semifinal', final: 'Final' };

function cupView(room: RoomActor, myPid: string, names: Record<string, string>): CupView {
  const d = room.dispute!;
  const cup = d.cup!;
  const s = cup.state;
  const lastIds = d.phase === 'cup' || d.phase === 'finished' ? room.lastTickMatchIds : [];
  const last = lastIds.map((id) => s.results[id]).filter((m): m is MatchResult => !!m);
  const stageOf = (id: string) => (id.startsWith('C-G') ? 'grupos' : (id.split('-')[1] ?? ''));
  const mine = last.find((m) => m.homeId === myPid || m.awayId === myPid) ?? null;
  const nextDay = cup.peekMatchday();
  const next = nextDay.find((m) => m.homeId === myPid || m.awayId === myPid) ?? null;
  return {
    name: s.name,
    format: s.format,
    stage: cup.currentStage,
    matchdayIndex: s.matchdayIndex,
    ties: s.ties,
    groupTables: s.groups.length ? cup.groupStandings() : null,
    groups: s.groups,
    lastResults: last.map((m) => matchView(m, names, false, STAGE_LABEL[stageOf(m.id)])),
    myLastMatch: mine ? matchView(mine, names, true, STAGE_LABEL[stageOf(mine.id)]) : null,
    myNextFixture: next
      ? {
          homeId: next.homeId,
          awayId: next.awayId,
          homeName: names[next.homeId]!,
          awayName: names[next.awayId]!,
          label: `${STAGE_LABEL[next.stage] ?? next.stage}${next.leg ? (s.knockoutTwoLegs && next.stage !== 'final' && next.stage !== 'grupos' ? (next.leg === 1 ? ' · ida' : ' · volta') : '') : ''}`,
        }
      : null,
    reached: s.reached,
    championId: s.championId,
    topScorers: aggregateScorers(Object.values(s.results), 10),
    topAssists: aggregateAssists(Object.values(s.results), 10),
    playerStats: playerStats(Object.values(s.results), new Set(d.participants.map((p) => p.id))),
    tickStartedAt: room.tickStartedAt,
    tickMs: d.phase === 'cup' ? room.timing.cupMatchdayMs : room.timing.leagueRoundMs,
  };
}
