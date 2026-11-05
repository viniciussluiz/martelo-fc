import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FORMATIONS, type Position } from '../../../engine/types';
import type {
  BidStepView,
  ConvocacaoStepView,
  DisputeView,
  MonteStepView,
  PackageView,
  ParticipantView,
  RevealView,
  RoomView,
  RosterView,
  StepView,
  TiebreakStepView,
} from '../../../shared/protocol';
import { act, socket } from '../../lib/socket';
import { toast } from '../../lib/store';
import { ClubBadge } from '../ClubBadge';
import { CardFace, CardIdentity, Countdown, EnvelopeArt, POSITION_NAME, TierBadge, plural, useNow } from '../common';
import { TeamCrest } from '../crest/TeamCrest';
import { Icon } from '../Icon';
import { SquadPitch } from './Squad';
import { LegendFigure } from '../LegendFigure';
import { AnimatedNumber, Coins, Confetti, PixelCoin, PosChip, StatusLight } from '../ui';

const POSITIONS: Position[] = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'];
const SECTOR_NOUN: Record<Position, [string, string]> = {
  GOL: ['goleiro', 'goleiros'],
  LAT: ['lateral', 'laterais'],
  ZAG: ['zagueiro', 'zagueiros'],
  MEI: ['meia', 'meias'],
  ATA: ['atacante', 'atacantes'],
};

export function AuctionScreen({ room }: { room: RoomView }) {
  const d = room.dispute!;
  const a = d.auction!;
  const me = d.participants.find((p) => p.id === d.you);
  const step = a.step;
  const clubs = d.auctionMode === 'clubes';
  const now = useNow(a.reveal ? 100 : 30_000);
  const revealIdx = a.reveal ? revealIndex(a.reveal, now) : -1;
  const pending = useMemo(() => unrevealed(a.reveal, revealIdx), [a.reveal, revealIdx]);
  return (
    <div className="auction">
      <AuctionHead d={d} pending={pending} />
      <div className="auction-grid">
        <div className="auction-main">
          {a.reveal ? (
            <RevealStage reveal={a.reveal} idx={revealIdx} d={d} />
          ) : step?.kind === 'bid' ? (
            <BidBoard key={step.stepId} step={step} d={d} />
          ) : step?.kind === 'tiebreak' ? (
            <TiebreakBoard key={step.stepId} step={step} d={d} />
          ) : step?.kind === 'monte' ? (
            <MonteBoard step={step} d={d} />
          ) : step?.kind === 'convocacao' ? (
            <ConvocacaoBoard key={step.stepId} step={step} d={d} />
          ) : (
            <div className="empty">Fechando o pregão…</div>
          )}
        </div>
        <aside className="auction-side">
          <RoomTable d={d} pending={pending} />
          {me && (clubs ? <MyPackages d={d} participantId={me.id} pending={pending} /> : <MySquad d={d} participantId={me.id} pending={pending} />)}
          <HammerLog d={d} pending={pending} />
        </aside>
      </div>
    </div>
  );
}

/** Quanto o técnico já pagou no pregão (sem contar o que a revelação ainda não mostrou). */
function spentBy(d: DisputeView, p: ParticipantView, pending: Unrevealed): number {
  if (d.auctionMode === 'clubes') return (p.packs ?? []).filter((x) => !pending.cards.has(x.packageId)).reduce((n, x) => n + x.price, 0);
  return p.roster.filter((r) => !pending.cards.has(r.cardId)).reduce((n, r) => n + r.price, 0);
}

/** Placar de cima do pregão: setor e leva, luzes das posições, saldo e relógio. */
function AuctionHead({ d, pending }: { d: DisputeView; pending: Unrevealed }) {
  const a = d.auction!;
  const step = a.step;
  const clubs = d.auctionMode === 'clubes';
  const me = d.participants.find((p) => p.id === d.you);
  const sub = a.reveal ? 'Do menor para o maior pote' : step?.kind === 'bid' && step.batchCount > 1 ? `Leva ${step.batchIndex + 1} de ${step.batchCount}` : null;
  const coins = me ? me.coins + (pending.coins.get(me.id) ?? 0) : 0;
  const filled = me ? (clubs ? (me.packs ?? []).filter((x) => !pending.cards.has(x.packageId)).length : me.roster.length - (pending.count.get(me.id) ?? 0)) : 0;
  return (
    <header className="scoreboard auction-head">
      <div className="sb-stage">
        <ol className="positions" aria-label="Posições do pregão">
          {a.progress.map((p) => (
            <li key={p.position} data-state={p.state} data-pos={p.position} title={`${POSITION_NAME[p.position]}: ${p.state}`}>
              {p.position}
            </li>
          ))}
        </ol>
        <div className="sb-title-wrap">
          <h2 className="sb-title">{stageLabel(a.reveal, step, clubs)}</h2>
          {sub && <span className="sb-sub">{sub}</span>}
        </div>
      </div>
      {me && (
        <dl className="sb-stats">
          <div className="sb-stat sb-coins">
            <dt>Saldo</dt>
            <dd>
              <PixelCoin size={22} />
              <span className="led">
                <AnimatedNumber value={coins} />
              </span>
            </dd>
          </div>
          <div className="sb-stat">
            <dt>Investido</dt>
            <dd>
              <span className="led led-dim">{spentBy(d, me, pending)}</span>
            </dd>
          </div>
          <div className="sb-stat">
            <dt>{clubs ? 'Pacotes' : 'Elenco'}</dt>
            <dd>
              <span className="led led-dim">{filled}</span>
              <span className="sb-of">/{clubs ? 5 : 11}</span>
            </dd>
          </div>
        </dl>
      )}
      {step && !a.reveal && <Countdown deadline={step.deadline} bar />}
    </header>
  );
}

/** Item da revelação que está na tela agora. */
function revealIndex(reveal: RevealView, now: number): number {
  return Math.min(reveal.items.length - 1, Math.max(0, Math.floor((now - reveal.startedAt) / reveal.itemMs)));
}

interface Unrevealed {
  /** Itens comprados (cartas ou pacotes) que a revelação ainda não mostrou. */
  cards: Set<string>;
  /** Moedas pagas por eles, por técnico (voltam ao saldo exibido até a revelação chegar lá). */
  coins: Map<string, number>;
  /** Quantos deles, por técnico (saem da contagem do elenco). */
  count: Map<string, number>;
}

/** Enquanto os envelopes abrem, o resto da tela não pode adiantar quem levou quem. */
function unrevealed(reveal: RevealView | null, idx: number): Unrevealed {
  const out: Unrevealed = { cards: new Set(), coins: new Map(), count: new Map() };
  if (!reveal) return out;
  reveal.items.forEach((item, i) => {
    if (i <= idx || !item.winnerId) return;
    out.cards.add(item.cardId);
    out.coins.set(item.winnerId, (out.coins.get(item.winnerId) ?? 0) + item.price);
    out.count.set(item.winnerId, (out.count.get(item.winnerId) ?? 0) + 1);
  });
  return out;
}

function stageLabel(reveal: RevealView | null, step: StepView | null, clubs: boolean) {
  if (reveal) return 'Abrindo os envelopes';
  if (!step) return 'Pregão';
  if (step.kind === 'monte') return clubs ? 'Monte Final · pacotes' : 'Monte Final';
  if (step.kind === 'convocacao') return 'Convocação';
  if (step.kind === 'tiebreak') return `Desempate · ${POSITION_NAME[step.position]}`;
  return step.round === 'repescagem' ? `Repescagem · ${POSITION_NAME[step.position]}` : POSITION_NAME[step.position];
}

// ---------------------------------------------------------------------------
// Itens do lote: carta (leilão de jogadores) ou pacote (leilão de clubes)
// ---------------------------------------------------------------------------

function itemName(d: DisputeView, id: string): string {
  return d.packages[id]?.label ?? d.cards[id]?.name ?? id;
}

/** Pacote: escudo, clube e quantos jogadores vêm nele (os nomes só aparecem na convocação). */
function PackIdentity({ pack, children, sector }: { pack: PackageView; children?: ReactNode; sector?: boolean }) {
  return (
    <div className="pack-id">
      {pack.mixed ? (
        <span className="pack-mixed" aria-hidden="true">
          {pack.position}
        </span>
      ) : (
        <ClubBadge club={pack.club} size={28} />
      )}
      <div className="pack-text">
        <div className="pack-club">{pack.mixed ? 'Pacote combinado' : pack.club}</div>
        <div className="pack-meta">
          {sector ? `${POSITION_NAME[pack.position]}, ` : ''}
          {plural(pack.size, 'jogador', 'jogadores')} no pacote
        </div>
      </div>
      {children}
    </div>
  );
}

function ItemFace({ d, id, compact, children }: { d: DisputeView; id: string; compact?: boolean; children?: ReactNode }) {
  const pack = d.packages[id];
  if (pack) {
    return (
      <div className="sticker pack" data-compact={compact || undefined}>
        <PackIdentity pack={pack}>{children}</PackIdentity>
      </div>
    );
  }
  const card = d.cards[id];
  if (!card) return null;
  return (
    <CardFace card={card} compact={compact}>
      {children}
    </CardFace>
  );
}

function RoomTable({ d, pending }: { d: DisputeView; pending: Unrevealed }) {
  const step = d.auction?.step;
  const clubs = d.auctionMode === 'clubes';
  const sealed = new Set(step && step.kind !== 'monte' ? step.sealed : []);
  const eligible = new Set(step && step.kind !== 'monte' ? step.eligible : []);
  const convocando = step?.kind === 'convocacao';
  const monteTurn = step?.kind === 'monte' ? step.current : null;
  return (
    <section className="side-block" aria-label="A sala">
      <h3 className="side-title">
        A sala <span className="side-meta">{plural(d.participants.length, 'técnico', 'técnicos')}</span>
      </h3>
      <ul className="room-table">
        {d.participants.map((p) => {
          const filled = p.roster.length - (pending.count.get(p.id) ?? 0);
          const packs = (p.packs ?? []).filter((x) => !pending.cards.has(x.packageId));
          const waiting = eligible.has(p.id) && !sealed.has(p.id);
          const state = sealed.has(p.id) ? 'lacrado' : waiting ? 'escrevendo' : monteTurn === p.id ? 'escolhendo' : undefined;
          const status = sealed.has(p.id)
            ? convocando
              ? 'convocação fechada'
              : 'envelope lacrado'
            : waiting
              ? convocando
                ? 'convocando'
                : 'escrevendo'
              : monteTurn === p.id
                ? 'escolhendo'
                : null;
          return (
            <li key={p.id} data-me={p.id === d.you || undefined} data-state={state}>
              <span className="rt-crest">
                <TeamCrest id={p.id} name={p.name} userId={p.userId} size={34} />
                <StatusLight on={p.connected || p.isCpu} />
              </span>
              <span className="rt-who">
                <span className="rt-name">
                  <span className="who-name">{p.name}</span>
                  {p.id === d.you && <span className="badge badge-you">você</span>}
                  {p.isCpu && <span className="badge badge-cpu">CPU</span>}
                  {p.abandoned && <span className="badge">saiu</span>}
                </span>
                <span className="rt-status">
                  {sealed.has(p.id) && <span className="mini-seal" title={convocando ? 'Convocação fechada' : 'Envelope lacrado'} />}
                  {status && (
                    <span className="rt-state">
                      {status}
                      {state === 'escrevendo' || state === 'escolhendo' ? <span className="dots" aria-hidden="true" /> : null}
                    </span>
                  )}
                  <span className="rt-squad">{clubs ? `${packs.length}/5 pacotes` : `${filled}/11 no elenco`}</span>
                </span>
                {clubs && packs.length > 0 && (
                  <span className="room-packs">
                    {packs.map((x) => (d.packages[x.packageId]?.mixed ? 'Combinado' : d.packages[x.packageId]?.club)).join(', ')}
                  </span>
                )}
              </span>
              <span className="rt-coins" aria-label={`${p.coins + (pending.coins.get(p.id) ?? 0)} moedas`}>
                <Coins value={p.coins + (pending.coins.get(p.id) ?? 0)} size={14} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Posições do seu time: quantos já tem de quantos a formação pede. */
function NeedStrip({ have, formation }: { have: Partial<Record<Position, number>>; formation: string }) {
  const need = FORMATIONS[formation as keyof typeof FORMATIONS] ?? FORMATIONS['4-3-3'];
  return (
    <ul className="need-strip" aria-label="Vagas por posição">
      {POSITIONS.map((pos) => {
        const n = have[pos] ?? 0;
        return (
          <li key={pos} data-done={n >= need[pos] || undefined} data-pos={pos}>
            <span className="need-pos">{pos}</span>
            <span className="need-n">
              {n}/{need[pos]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Leilão de jogadores: o seu time no campo e as vagas que faltam. */
function MySquad({ d, participantId, pending }: { d: DisputeView; participantId: string; pending: Unrevealed }) {
  const p = d.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const have: Partial<Record<Position, number>> = {};
  for (const r of p.roster) if (!pending.cards.has(r.cardId)) have[r.position] = (have[r.position] ?? 0) + 1;
  return (
    <section className="side-block" aria-label="Seu time">
      <h3 className="side-title">
        Seu time <span className="side-meta">{p.formation}</span>
      </h3>
      <NeedStrip have={have} formation={p.formation} />
      <SquadPitch d={d} participantId={participantId} hidden={pending.cards} />
    </section>
  );
}

/** Leilão de clubes: os pacotes que você já levou, setor por setor. */
function MyPackages({ d, participantId, pending }: { d: DisputeView; participantId: string; pending: Unrevealed }) {
  const p = d.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const packs = (p.packs ?? []).filter((x) => !pending.cards.has(x.packageId));
  return (
    <section className="side-block" aria-label="Seus pacotes">
      <h3 className="side-title">
        Seus pacotes <span className="side-meta">{p.formation}</span>
      </h3>
      <ul className="my-packs">
        {POSITIONS.map((pos) => {
          const win = packs.find((x) => x.position === pos);
          const pack = win ? d.packages[win.packageId] : undefined;
          return (
            <li key={pos} data-empty={!pack || undefined}>
              <PosChip pos={pos} />
              {pack ? (
                <>
                  {pack.mixed ? <span className="pack-mixed small-mixed">{pos}</span> : <ClubBadge club={pack.club} size={20} />}
                  <span className="my-packs-club">{pack.mixed ? 'Combinado' : pack.club}</span>
                  <span className="my-packs-price">{win!.source === 'monte' ? 'Monte' : <Coins value={win!.price} size={13} animate={false} />}</span>
                </>
              ) : (
                <span className="small muted">ainda sem pacote</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="side-note">No fim do pregão você convoca quem joga dentro de cada pacote. Quem ficar de fora vai para os outros times da liga.</p>
    </section>
  );
}

interface Hammer {
  key: string;
  pos: Position;
  label: string;
  club: string | null;
  year: number | null;
  kit?: [string, string] | undefined;
  buyer: string;
  buyerId: string;
  buyerUser: string | null;
  mine: boolean;
  price: number;
  monte: boolean;
}

/** Martelos já batidos neste pregão (o que a revelação ainda não mostrou fica de fora). */
function HammerLog({ d, pending }: { d: DisputeView; pending: Unrevealed }) {
  const [all, setAll] = useState(false);
  const clubs = d.auctionMode === 'clubes';
  const rows: Hammer[] = [];
  for (const p of d.participants) {
    if (clubs) {
      for (const w of p.packs ?? []) {
        const pack = d.packages[w.packageId];
        if (!pack || pending.cards.has(w.packageId)) continue;
        rows.push({ key: w.packageId, pos: w.position, label: pack.mixed ? 'Pacote combinado' : pack.club, club: pack.mixed ? null : pack.club, year: null, buyer: p.name, buyerId: p.id, buyerUser: p.userId, mine: p.id === d.you, price: w.price, monte: w.source === 'monte' });
      }
    } else {
      for (const r of p.roster) {
        const c = d.cards[r.cardId];
        if (!c || pending.cards.has(r.cardId)) continue;
        rows.push({ key: r.cardId, pos: r.position, label: c.name, club: c.club, year: c.year, kit: c.kit, buyer: p.name, buyerId: p.id, buyerUser: p.userId, mine: p.id === d.you, price: r.price, monte: r.source === 'monte' });
      }
    }
  }
  if (rows.length === 0) return null;
  // Setor mais recente primeiro; dentro dele, do mais caro para o mais barato.
  rows.sort((x, y) => POSITIONS.indexOf(y.pos) - POSITIONS.indexOf(x.pos) || y.price - x.price);
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="side-block" aria-label="Martelos batidos">
      <h3 className="side-title">
        Martelos batidos <span className="side-meta">{rows.length}</span>
      </h3>
      <ul className="hammer-log">
        {shown.map((h) => (
          <li key={h.key} data-me={h.mine || undefined}>
            <PosChip pos={h.pos} />
            <span className="hl-what">
              <span className="hl-name">{h.label}</span>
              <span className="hl-buyer">
                <TeamCrest id={h.buyerId} name={h.buyer} userId={h.buyerUser} size={16} />
                {h.mine ? 'você' : h.buyer}
              </span>
            </span>
            <span className="hl-price">{h.monte ? <span className="hl-monte">Monte</span> : <Coins value={h.price} size={13} animate={false} />}</span>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <button type="button" className="link-btn side-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Mostrar menos' : `Ver todos os ${rows.length}`}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Envelope de lances
// ---------------------------------------------------------------------------

function BidBoard({ step, d }: { step: BidStepView; d: DisputeView }) {
  const [draft, setDraft] = useState<Record<string, number>>(() => ({ ...step.myBids }));
  const [sealing, setSealing] = useState(false);
  const [bumps, setBumps] = useState<Record<string, { k: number; delta: number }>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clubs = d.auctionMode === 'clubes';
  const total = Object.values(draft).reduce((s, v) => s + (v || 0), 0);
  const count = Object.values(draft).filter((v) => v > 0).length;
  const overSlots = count > step.myOpenSlots;
  const overCoins = total > step.myCoins;
  const invalid = overSlots || overCoins;
  const editable = step.youAreEligible && !step.mySealed;

  // Rascunho é enviado ao servidor (sem lacrar) para valer mesmo se o tempo acabar.
  const push = (next: Record<string, number>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const c = Object.values(next).filter((v) => v > 0);
      if (c.length > step.myOpenSlots || c.reduce((s, v) => s + v, 0) > step.myCoins) return;
      socket.request({ t: 'bid:set', stepId: step.stepId, bids: next }).catch(() => undefined);
    }, 350);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const setBid = (id: string, value: number) => {
    const v = Math.max(0, Math.min(999, Math.floor(value || 0)));
    const delta = v - (draft[id] ?? 0);
    if (delta !== 0) setBumps((b) => ({ ...b, [id]: { k: (b[id]?.k ?? 0) + 1, delta } }));
    const next = { ...draft, [id]: v };
    if (v === 0) delete next[id];
    setDraft(next);
    push(next);
  };

  const seal = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSealing(true);
    const ok = await act({ t: 'bid:set', stepId: step.stepId, bids: draft, seal: true });
    setSealing(false);
    if (ok && total === 0) toast({ kind: 'info', title: 'Envelope vazio lacrado', body: clubs ? 'Você passou a vez neste setor.' : 'Você passou a vez nesta leva.' });
  };

  if (!step.youAreEligible) {
    return (
      <div className="stack">
        <div className="notice" data-kind="done">
          <strong>
            {d.you ? (clubs ? 'Você já tem pacote neste setor (ou está sem moedas).' : 'Você já fechou esta posição (ou está sem moedas).') : 'Você está assistindo.'}
          </strong>
          <span>Os envelopes dos outros técnicos abrem todos juntos no martelo.</span>
        </div>
        <LotList step={step} d={d} />
      </div>
    );
  }

  if (step.mySealed) {
    const waiting = step.eligible.filter((id) => !step.sealed.includes(id)).map((id) => d.participants.find((p) => p.id === id)).filter((p) => !!p);
    return (
      <div className="stack">
        <div className="sealed-note">
          <EnvelopeArt amount={String(total)} label={plural(count, 'lance', 'lances')} sealed />
          <div className="sealed-text">
            <strong>Envelope lacrado.</strong>
            {waiting.length ? (
              <span className="sealed-wait">
                Esperando:
                {waiting.map((p) => (
                  <span key={p!.id} className="sealed-who">
                    <TeamCrest id={p!.id} name={p!.name} userId={p!.userId} size={20} />
                    {p!.name}
                  </span>
                ))}
              </span>
            ) : (
              <span>Todos lacraram. Abrindo agora.</span>
            )}
          </div>
        </div>
        <LotList step={step} d={d} myBids={draft} />
      </div>
    );
  }

  return (
    <div className="stack">
      {clubs ? (
        <p className="lot-intro">
          Dê lance em <strong>um pacote</strong>: quem pagar mais leva o setor inteiro do clube e escolhe quem joga na convocação. Os nomes só
          aparecem lá.
        </p>
      ) : (
        <p className="lot-intro">
          Lance em até <strong>{plural(step.myOpenSlots, 'jogador', 'jogadores')}</strong> desta leva, somando no máximo{' '}
          <strong>{step.myCoins} moedas</strong>. Ninguém vê o seu envelope até o martelo.
        </p>
      )}
      <div className="lot-grid">
        {step.cardIds.map((id) => {
          if (!d.cards[id] && !d.packages[id]) return null;
          const name = itemName(d, id);
          const v = draft[id] ?? 0;
          const blocked = !v && count >= step.myOpenSlots;
          const bump = bumps[id];
          return (
            <div className="lot" key={id} data-active={v > 0} data-blocked={blocked || undefined}>
              <ItemFace d={d} id={id} />
              <div className="bidbox">
                <button type="button" aria-label={`Diminuir lance em ${name}`} onClick={() => setBid(id, v - 1)} disabled={!editable || v === 0}>
                  −
                </button>
                <span className="bid-field">
                  <PixelCoin size={18} />
                  <input
                    inputMode="numeric"
                    aria-label={`Lance em ${name}`}
                    value={v || ''}
                    placeholder="0"
                    disabled={!editable || blocked}
                    onChange={(e) => setBid(id, Number(e.target.value.replace(/\D/g, '')))}
                  />
                </span>
                <button type="button" aria-label={`Aumentar lance em ${name}`} onClick={() => setBid(id, v + 1)} disabled={!editable || blocked}>
                  +
                </button>
                {bump && (
                  <span className="bid-bump" key={bump.k} data-dir={bump.delta > 0 ? 'up' : 'down'} aria-hidden="true">
                    {bump.delta > 0 ? `+${bump.delta}` : bump.delta}
                  </span>
                )}
              </div>
              {v > 0 && (
                <span className="lot-tag" aria-hidden="true">
                  no envelope
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="envelope-bar" data-over={invalid || undefined}>
        <span className="eb-flap" aria-hidden="true" />
        <div className="eb-sum">
          <span className="eb-label">Seu envelope</span>
          <span className="total" data-over={overCoins || undefined}>
            {total}
            <span className="eb-of"> / {step.myCoins}</span>
          </span>
        </div>
        <div className="eb-note">
          {overCoins && <span className="error-text">Passou das suas moedas.</span>}
          {overSlots && <span className="error-text">{clubs ? 'É um pacote por setor.' : 'Lances demais para as vagas abertas.'}</span>}
          {!invalid && (
            <span className="muted">
              {clubs ? (count ? 'Lance em 1 pacote.' : 'Nenhum pacote escolhido.') : `${plural(count, 'lance', 'lances')} de ${step.myOpenSlots} possíveis`}
            </span>
          )}
        </div>
        <button className="btn btn-seal" onClick={seal} disabled={invalid || sealing}>
          <SealDisc /> Lacrar envelope
        </button>
      </div>
    </div>
  );
}

function LotList({ step, d, myBids }: { step: BidStepView; d: DisputeView; myBids?: Record<string, number> }) {
  return (
    <div className="lot-list">
      {step.cardIds.map((id) => (
        <ItemFace key={id} d={d} id={id} compact>
          {myBids?.[id] ? (
            <span className="lot-amount">
              <Coins value={myBids[id]!} size={14} animate={false} />
            </span>
          ) : null}
        </ItemFace>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desempate
// ---------------------------------------------------------------------------

function TiebreakBoard({ step, d }: { step: TiebreakStepView; d: DisputeView }) {
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(step.myItems.map((i) => [i.cardId, step.myBids[i.cardId] ?? i.floor])),
  );
  const total = Object.values(draft).reduce((s, v) => s + v, 0);
  const invalid = total > step.myFreeCoins || step.myItems.some((i) => (draft[i.cardId] ?? 0) < i.floor);
  if (step.myItems.length === 0 || step.mySealed) {
    const names = step.eligible.map((id) => d.participants.find((p) => p.id === id)?.name ?? id);
    return (
      <div className="notice">
        <strong>Desempate às cegas em andamento.</strong>
        <span>{step.mySealed ? 'Seu desempate está lacrado.' : `Empataram: ${names.join(', ')}.`}</span>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="notice" data-kind="alert">
        <strong>Empatou no maior lance.</strong>
        <span>
          Escreva um novo valor, igual ou maior que o empate. Ninguém vê. Se empatar de novo, o sorteio decide. Moedas livres:{' '}
          <strong>{step.myFreeCoins}</strong>.
        </span>
      </div>
      <div className="lot-list lot-list-duel">
        {step.myItems.map((i) => {
          if (!d.cards[i.cardId] && !d.packages[i.cardId]) return null;
          const rivals = i.rivals.map((id) => d.participants.find((p) => p.id === id)?.name ?? id).join(', ');
          return (
            <div className="lot" key={i.cardId}>
              <ItemFace d={d} id={i.cardId} compact>
                <span className="small muted">Empate em {i.floor} com {rivals}</span>
              </ItemFace>
              <div className="bidbox">
                <button type="button" onClick={() => setDraft({ ...draft, [i.cardId]: Math.max(i.floor, (draft[i.cardId] ?? i.floor) - 1) })} aria-label="Diminuir">
                  −
                </button>
                <span className="bid-field">
                <PixelCoin size={18} />
                <input
                  inputMode="numeric"
                  aria-label={`Desempate em ${itemName(d, i.cardId)}`}
                  value={draft[i.cardId] ?? i.floor}
                  onChange={(e) => setDraft({ ...draft, [i.cardId]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                />
                </span>
                <button type="button" onClick={() => setDraft({ ...draft, [i.cardId]: (draft[i.cardId] ?? i.floor) + 1 })} aria-label="Aumentar">
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="envelope-bar">
        <span className="eb-flap" aria-hidden="true" />
        <div className="eb-sum">
          <span className="eb-label">Desempate</span>
          <span className="total">
            {total}
            <span className="eb-of"> / {step.myFreeCoins}</span>
          </span>
        </div>
        <div className="eb-note">
          {invalid ? <span className="error-text">Valor abaixo do empate ou acima das moedas livres.</span> : <span>Desempate lacrado ninguém vê.</span>}
        </div>
        <button className="btn btn-seal" disabled={invalid} onClick={() => void act({ t: 'tiebreak:set', stepId: step.stepId, amounts: draft })}>
          <SealDisc /> Lacrar desempate
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monte Final
// ---------------------------------------------------------------------------

function MonteBoard({ step, d }: { step: MonteStepView; d: DisputeView }) {
  const mine = step.current === d.you;
  const clubs = d.auctionMode === 'clubes';
  const currentName = d.participants.find((p) => p.id === step.current)?.name ?? '—';
  const options = new Set(step.myOptions);
  return (
    <div className="stack">
      <div className="notice" data-kind={mine ? 'turn' : undefined}>
        {!mine && (
          <span className="notice-crest">
            <TeamCrest id={step.current} name={currentName} userId={d.participants.find((p) => p.id === step.current)?.userId ?? null} size={30} />
          </span>
        )}
        <strong>
          {mine
            ? clubs
              ? 'Sua vez no Monte Final: escolha de graça um pacote para o setor que ficou vazio.'
              : 'Sua vez no Monte Final: escolha um jogador de graça.'
            : `Vez de ${currentName} no Monte Final.`}
        </strong>
        <span>
          {clubs
            ? 'Sobrou pacote sem dono: quem ficou sem pacote em algum setor escolhe um por vez, sem pagar.'
            : 'Sobrou jogador sem dono: quem ainda tem vaga escolhe um por vez, sem pagar, até fechar os 11.'}
        </span>
      </div>
      <div className="monte-grid">
        {step.pool.map((id) => {
          const pack = d.packages[id];
          const c = d.cards[id];
          if (!pack && !c) return null;
          const can = mine && options.has(id);
          return (
            <button
              key={id}
              className={pack ? 'sticker pack' : 'sticker'}
              disabled={!can}
              onClick={() => void act({ t: 'monte:pick', stepId: step.stepId, cardId: id })}
              aria-label={can ? `Escolher ${itemName(d, id)}` : itemName(d, id)}
            >
              {pack ? (
                <PackIdentity pack={pack} sector />
              ) : (
                <>
                  <PosChip pos={c!.position} />
                  <CardIdentity card={c!} crestSize={24} />
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convocação (leilão de clubes)
// ---------------------------------------------------------------------------

function ConvocacaoBoard({ step, d }: { step: ConvocacaoStepView; d: DisputeView }) {
  const [picks, setPicks] = useState<string[]>(() => step.myPicks);
  const [sealing, setSealing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectors = POSITIONS.filter((pos) => step.myPackages[pos]);
  const optionsOf = (pos: Position) => d.packages[step.myPackages[pos] ?? '']?.cardIds ?? [];
  const countOf = (pos: Position, list = picks) => list.filter((id) => optionsOf(pos).includes(id)).length;
  const firstOpen = (list: string[]) => sectors.find((pos) => countOf(pos, list) < step.need[pos]);
  const [tab, setTab] = useState<Position>(() => firstOpen(step.myPicks) ?? sectors[0] ?? 'GOL');
  const total = POSITIONS.reduce((n, pos) => n + step.need[pos], 0);
  const missing = sectors.filter((pos) => countOf(pos) < step.need[pos]);
  const me = d.participants.find((p) => p.id === d.you);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!me || !step.eligible.includes(me.id)) {
    return (
      <div className="notice">
        <strong>Os técnicos estão convocando.</strong>
        <span>Cada um escolhe quem joga dentro dos pacotes que levou. Depois abrem as faixas de nível.</span>
      </div>
    );
  }

  const push = (next: string[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      socket.request({ t: 'convoca:set', stepId: step.stepId, cardIds: next }).catch(() => undefined);
    }, 300);
  };
  const toggle = (pos: Position, id: string) => {
    if (step.mySealed) return;
    const has = picks.includes(id);
    if (!has && countOf(pos) >= step.need[pos]) return;
    const next = has ? picks.filter((x) => x !== id) : [...picks, id];
    setPicks(next);
    push(next);
    // Fechou o setor: passa para o próximo que ainda falta.
    if (!has && countOf(pos, next) === step.need[pos]) {
      const after = firstOpen(next);
      if (after) setTab(after);
    }
  };
  const seal = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSealing(true);
    await act({ t: 'convoca:set', stepId: step.stepId, cardIds: picks, seal: true });
    setSealing(false);
  };

  const draftRoster: RosterView[] = picks
    .map((id) => d.cards[id])
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({ cardId: c.id, position: c.position, price: 0, source: 'leilao' }));
  const pack = d.packages[step.myPackages[tab] ?? ''];
  const waiting = step.eligible.filter((id) => !step.sealed.includes(id)).map((id) => d.participants.find((p) => p.id === id)?.name ?? id);
  const missingText = missing
    .map((pos) => {
      const n = step.need[pos] - countOf(pos);
      return `${n} ${SECTOR_NOUN[pos][n === 1 ? 0 : 1]}`;
    })
    .join(' · ');

  return (
    <div className="stack convoca">
      <div className="convoca-head">
        <div>
          <span className="small">
            Escolha quem joga em cada pacote ({me.formation}). Quem fica de fora vai para os times da liga.
            {!step.mySealed && (
              <>
                {' '}
                Se o tempo acabar, entra o <strong>pior</strong> de cada pacote.
              </>
            )}
          </span>
        </div>
        <span className="convoca-count" aria-label={`${picks.length} de ${total} convocados`}>
          <span className="led">
            {picks.length}/{total}
          </span>
          <span>convocados</span>
        </span>
      </div>
      <div className="convoca-body">
        <div className="tabbed">
          <div className="tabs" role="tablist" aria-label="Setores">
            {sectors.map((pos) => {
              const n = countOf(pos);
              const done = n === step.need[pos];
              return (
                <button
                  key={pos}
                  type="button"
                  role="tab"
                  aria-selected={tab === pos}
                  data-done={done || undefined}
                  onClick={() => setTab(pos)}
                >
                  {pos}
                  <span className="tab-count">
                    {n}/{step.need[pos]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="tab-panel" role="tabpanel">
            {pack && (
              <div className="stack" style={{ gap: 8 }}>
                <PackIdentity pack={pack}>
                  <span className="small muted" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    Convoque {step.need[tab]} de {pack.size}
                  </span>
                </PackIdentity>
                <ul className="convoca-list">
                  {(pack.cardIds ?? []).map((id) => {
                    const c = d.cards[id];
                    if (!c) return null;
                    const on = picks.includes(id);
                    const full = !on && countOf(tab) >= step.need[tab];
                    return (
                      <li key={id}>
                        <label className="convoca-row" data-on={on || undefined} data-off={full || undefined}>
                          <input type="checkbox" checked={on} disabled={step.mySealed || full} onChange={() => toggle(tab, id)} />
                          <span className="convoca-name">{c.name}</span>
                          <span className="convoca-year">{c.year}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
        <SquadPitch d={d} participantId={me.id} roster={draftRoster} showPrice={false} />
      </div>
      {step.mySealed ? (
        <div className="notice" data-kind="done">
          <strong>Convocação fechada.</strong>
          <span>{waiting.length ? `Esperando: ${waiting.join(', ')}.` : 'Todos fecharam. Abrindo as faixas.'}</span>
        </div>
      ) : (
        <div className="envelope-bar">
          <span className="eb-flap" aria-hidden="true" />
          <div className="eb-note">{missing.length ? <span>Falta: {missingText}.</span> : <span>Time completo. Pode fechar.</span>}</div>
          <button className="btn btn-seal" onClick={seal} disabled={missing.length > 0 || sealing}>
            <SealDisc /> Fechar convocação
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revelação (pote crescente)
// ---------------------------------------------------------------------------

function RevealStage({ reveal, idx, d }: { reveal: RevealView; idx: number; d: DisputeView }) {
  const item = reveal.items[idx]!;
  const card = d.cards[item.cardId];
  const pack = d.packages[item.cardId];
  const who = (pid: string) => d.participants.find((p) => p.id === pid);
  const name = (pid: string) => who(pid)?.name ?? pid;
  const sold = !!item.winnerId;
  const mineWin = sold && item.winnerId === d.you;
  const iLost = sold && !mineWin && item.bids.some((b) => b.participantId === d.you);
  // A Lenda só aparece depois dos lances: carta vendida no martelo.
  const legend = sold && !pack && card?.tier === 'lenda';
  const top = Math.max(1, ...item.bids.map((b) => b.amount));
  const flavor = useMemo(() => {
    if (!sold) return null;
    if (item.decidedBy === 'sorteio') return 'Empate até no desempate: decidiu o sorteio.';
    if (item.decidedBy === 'desempate') return 'Decidido no desempate às cegas.';
    if (item.bids.length > 1 && item.margin <= 2) return `Por um fio: ${plural(item.margin, 'moeda', 'moedas')} de diferença.`;
    if (item.bids.length === 1) return 'Lance solitário: ninguém mais quis.';
    return null;
  }, [item, sold]);
  const winner = item.winnerId ? who(item.winnerId) : undefined;
  return (
    <section className="reveal-stage" aria-live="polite" data-outcome={mineWin ? 'win' : iLost ? 'lost' : undefined}>
      <div className="reveal-head">
        <strong className="reveal-count">
          Revelação {idx + 1} de {reveal.items.length}
        </strong>
        <div className="reveal-strip" aria-hidden="true">
          {reveal.items.map((_, i) => (
            <span key={i} data-done={i < idx || undefined} data-now={i === idx || undefined} />
          ))}
        </div>
      </div>
      {(card || pack) && (
        <div className="reveal-card" key={item.cardId} data-legend={legend || undefined} data-pack={pack ? true : undefined} data-sold={sold}>
          {mineWin && <Confetti seed={idx + 1} />}
          <div className="reveal-item">
            {legend && card && <LegendFigure club={card.club} kit={card.kit} size={96} />}
            <div className="reveal-body">
              {!pack && card && (
                <div className="reveal-tags">
                  <PosChip pos={card.position} />
                  {sold && <TierBadge tier={card.tier} />}
                  {item.wasMystery && <span className="badge">era carta-surpresa</span>}
                </div>
              )}
              {pack ? <PackIdentity pack={pack} /> : <CardIdentity card={card!} crestSize={46} />}
            </div>
          </div>
          {item.bids.length === 0 ? (
            <p className="reveal-empty">
              Ninguém deu lance. {item.round === 'leva' ? 'Vai para a repescagem.' : 'Vai para o Monte Final.'}
            </p>
          ) : (
            <ul className="reveal-bids" aria-label="Lances">
              {item.bids.map((b, i) => {
                const p = who(b.participantId);
                return (
                  <li
                    key={b.participantId}
                    data-win={b.participantId === item.winnerId}
                    data-me={b.participantId === d.you || undefined}
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <span className="rb-who">
                      <TeamCrest id={b.participantId} name={name(b.participantId)} userId={p?.userId ?? null} size={24} />
                      <span className="rb-name">
                        {name(b.participantId)}
                        {b.participantId === d.you ? ' (você)' : ''}
                      </span>
                    </span>
                    <span className="rb-bar" aria-hidden="true">
                      <span style={{ width: `${(b.amount / top) * 100}%`, animationDelay: `${i * 70}ms` }} />
                    </span>
                    <span className="amount">
                      <PixelCoin size={15} />
                      {b.amount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {item.tiebreakBids && (
            <p className="small muted">Desempate: {item.tiebreakBids.map((b) => `${name(b.participantId)} ${b.amount}`).join(', ')}</p>
          )}
          {flavor && <p className="reveal-flavor">{flavor}</p>}
          {sold ? (
            <span className="stamp" key={`s${idx}`}>
              Vendido por {item.price}
            </span>
          ) : (
            <span className="stamp" data-kind="monte" key={`m${idx}`}>
              Sem dono
            </span>
          )}
        </div>
      )}
      {sold && (
        <p className="reveal-verdict" data-mine={mineWin || undefined}>
          {winner && <TeamCrest id={winner.id} name={winner.name} userId={winner.userId} size={30} />}
          <span>
            {mineWin ? (
              <>
                <strong>É seu!</strong> Você leva {pack ? 'o pacote ' : ''}por {plural(item.price, 'moeda', 'moedas')}.
              </>
            ) : (
              <>
                Martelo batido: <strong>{name(item.winnerId!)}</strong> leva {pack ? 'o pacote ' : ''}por {plural(item.price, 'moeda', 'moedas')}.
              </>
            )}
          </span>
        </p>
      )}
    </section>
  );
}

/** Lacre de cera do botão que fecha o envelope. */
function SealDisc() {
  return (
    <span className="seal-disc" aria-hidden="true">
      <Icon name="martelo" />
    </span>
  );
}
