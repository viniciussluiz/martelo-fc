import { useEffect, useMemo, useRef, useState } from 'react';
import type { BidStepView, DisputeView, MonteStepView, RevealView, RoomView, StepView, TiebreakStepView } from '../../../shared/protocol';
import { act, socket } from '../../lib/socket';
import { toast } from '../../lib/store';
import { CardAvatar, CardFace, Countdown, EnvelopeArt, POSITION_NAME, TierBadge, plural, useNow } from '../common';
import { Icon } from '../Icon';
import { SquadPitch } from './Squad';

export function AuctionScreen({ room }: { room: RoomView }) {
  const d = room.dispute!;
  const a = d.auction!;
  const me = d.participants.find((p) => p.id === d.you);
  const step = a.step;
  const pos = step && step.kind !== 'monte' ? step.position : null;
  return (
    <div className="stack">
      <div className="scoreboard">
        <div className="positions" aria-label="Posições do pregão">
          {a.progress.map((p) => (
            <span key={p.position} data-state={p.state} title={POSITION_NAME[p.position]}>
              {p.position}
            </span>
          ))}
        </div>
        <div>
          <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.3rem' }}>{stageLabel(a.reveal, step)}</strong>
          {step?.kind === 'bid' && step.batchCount > 1 && (
            <div className="small" style={{ color: '#9fabc2' }}>
              Leva {step.batchIndex + 1} de {step.batchCount}
            </div>
          )}
        </div>
        {me && (
          <div className="coins" aria-label="Suas moedas">
            <span className="num">{me.coins}</span>
            <span className="small" style={{ color: '#9fabc2' }}>
              moedas
            </span>
          </div>
        )}
        {step && !a.reveal && <Countdown deadline={step.deadline} />}
      </div>
      <div className="grid-2">
        <div className="stack">
          {a.reveal ? (
            <RevealStage reveal={a.reveal} d={d} />
          ) : step?.kind === 'bid' ? (
            <BidBoard key={step.stepId} step={step} d={d} />
          ) : step?.kind === 'tiebreak' ? (
            <TiebreakBoard key={step.stepId} step={step} d={d} />
          ) : step?.kind === 'monte' ? (
            <MonteBoard step={step} d={d} />
          ) : (
            <div className="empty">Fechando o pregão…</div>
          )}
          {pos && <p className="small muted">Posição atual: {POSITION_NAME[pos]}.</p>}
        </div>
        <aside className="stack">
          <RoomTable d={d} />
          {me && (
            <div className="panel">
              <div className="panel-title">Seu time</div>
              <SquadPitch d={d} participantId={me.id} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function stageLabel(reveal: RevealView | null, step: StepView | null) {
  if (reveal) return 'Abrindo os envelopes';
  if (!step) return 'Pregão';
  if (step.kind === 'monte') return 'Monte Final';
  if (step.kind === 'tiebreak') return `Desempate · ${POSITION_NAME[step.position]}`;
  return step.round === 'repescagem' ? `Repescagem · ${POSITION_NAME[step.position]}` : POSITION_NAME[step.position];
}

function RoomTable({ d }: { d: DisputeView }) {
  const step = d.auction?.step;
  const sealed = new Set(step && step.kind !== 'monte' ? step.sealed : []);
  const eligible = new Set(step && step.kind !== 'monte' ? step.eligible : []);
  return (
    <div className="panel">
      <div className="panel-title">A sala</div>
      <ul className="room-list">
        {d.participants.map((p) => {
          const filled = p.roster.length;
          const waiting = eligible.has(p.id) && !sealed.has(p.id);
          return (
            <li key={p.id}>
              <span className="who">
                <span className="dot" data-off={!p.connected} />
                <span>{p.name}</span>
                {p.id === d.you && <span className="badge badge-warn">você</span>}
                {p.isCpu && <span className="badge">CPU</span>}
                {p.abandoned && <span className="badge">saiu</span>}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {sealed.has(p.id) && <span className="mini-seal" title="Envelope lacrado" />}
                {waiting && <span className="small muted">escrevendo…</span>}
              </span>
              <span className="small muted">
                {p.coins} moedas, {filled}/11 no elenco
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Envelope de lances
// ---------------------------------------------------------------------------

function BidBoard({ step, d }: { step: BidStepView; d: DisputeView }) {
  const [draft, setDraft] = useState<Record<string, number>>(() => ({ ...step.myBids }));
  const [sealing, setSealing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const setBid = (cardId: string, value: number) => {
    const v = Math.max(0, Math.min(999, Math.floor(value || 0)));
    const next = { ...draft, [cardId]: v };
    if (v === 0) delete next[cardId];
    setDraft(next);
    push(next);
  };

  const seal = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSealing(true);
    const ok = await act({ t: 'bid:set', stepId: step.stepId, bids: draft, seal: true });
    setSealing(false);
    if (ok && total === 0) toast({ kind: 'info', title: 'Envelope vazio lacrado', body: 'Você passou a vez nesta leva.' });
  };

  if (!step.youAreEligible) {
    return (
      <div className="stack">
        <div className="panel">
          <strong>{d.you ? 'Você já fechou esta posição (ou está sem moedas).' : 'Você está assistindo.'}</strong>
          <p className="small muted">Acompanhe os lances dos outros técnicos — eles abrem todos juntos no martelo.</p>
        </div>
        <LotList step={step} d={d} />
      </div>
    );
  }

  if (step.mySealed) {
    const waiting = step.eligible.filter((id) => !step.sealed.includes(id)).map((id) => d.participants.find((p) => p.id === id)?.name ?? id);
    return (
      <div className="stack">
        <div style={{ maxWidth: 420 }}>
          <EnvelopeArt amount={String(total)} label={plural(count, 'lance', 'lances')} sealed />
        </div>
        <p>
          <strong>Envelope lacrado.</strong> {waiting.length ? `Esperando: ${waiting.join(', ')}.` : 'Todos lacraram — abrindo agora.'}
        </p>
        <LotList step={step} d={d} myBids={draft} />
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="muted">
        Escreva quanto paga por cada nome. Você pode dar lance em até <strong>{plural(step.myOpenSlots, 'jogador', 'jogadores')}</strong> desta
        leva, e o envelope inteiro não pode passar de <strong>{step.myCoins} moedas</strong>.
      </p>
      <div className="stack" style={{ gap: 10 }}>
        {step.cardIds.map((id) => {
          const card = d.cards[id];
          if (!card) return null;
          const v = draft[id] ?? 0;
          const blocked = !v && count >= step.myOpenSlots;
          return (
            <div className="lot" key={id} data-active={v > 0}>
              <CardFace card={card} />
              <div className="bidbox">
                <button type="button" aria-label={`Diminuir lance em ${card.name}`} onClick={() => setBid(id, v - 1)} disabled={!editable || v === 0}>
                  −
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`Lance em ${card.name}`}
                  value={v || ''}
                  placeholder="0"
                  disabled={!editable || blocked}
                  onChange={(e) => setBid(id, Number(e.target.value.replace(/\D/g, '')))}
                />
                <button type="button" aria-label={`Aumentar lance em ${card.name}`} onClick={() => setBid(id, v + 1)} disabled={!editable || blocked}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="envelope-bar">
        <div>
          <div className="small muted">Envelope</div>
          <div className="total">
            {total} <span style={{ fontSize: '1rem' }}>/ {step.myCoins}</span>
          </div>
        </div>
        <div className="small" style={{ flex: 1, minWidth: 160 }}>
          {overCoins && <span className="error-text">Passou das suas moedas.</span>}
          {overSlots && <span className="error-text">Lances demais para as vagas abertas.</span>}
          {!invalid && (
            <span className="muted">
              {plural(count, 'lance', 'lances')} de {step.myOpenSlots} possíveis
            </span>
          )}
        </div>
        <button className="btn btn-cone" onClick={seal} disabled={invalid || sealing}>
          <Icon name="lacre" /> Lacrar envelope
        </button>
      </div>
    </div>
  );
}

function LotList({ step, d, myBids }: { step: BidStepView; d: DisputeView; myBids?: Record<string, number> }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {step.cardIds.map((id) => {
        const c = d.cards[id];
        return c ? (
          <CardFace key={id} card={c} compact>
            {myBids?.[id] ? <span className="envelope-amount" style={{ position: 'static', fontSize: '2rem' }}>{myBids[id]}</span> : null}
          </CardFace>
        ) : null;
      })}
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
      <div className="panel stack">
        <strong>Desempate às cegas em andamento.</strong>
        <p className="muted">{step.mySealed ? 'Seu desempate está lacrado.' : `Empataram: ${names.join(', ')}.`}</p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="panel stack">
        <strong>Empatou no maior lance.</strong>
        <p className="muted">
          Escreva um novo valor, igual ou maior que o empate. Ninguém vê. Se empatar de novo, o sorteio decide. Moedas livres:{' '}
          <strong>{step.myFreeCoins}</strong>.
        </p>
      </div>
      {step.myItems.map((i) => {
        const card = d.cards[i.cardId];
        if (!card) return null;
        const rivals = i.rivals.map((id) => d.participants.find((p) => p.id === id)?.name ?? id).join(', ');
        return (
          <div className="lot" key={i.cardId}>
            <CardFace card={card} compact>
              <span className="small muted">Empate em {i.floor} com {rivals}</span>
            </CardFace>
            <div className="bidbox">
              <button type="button" onClick={() => setDraft({ ...draft, [i.cardId]: Math.max(i.floor, (draft[i.cardId] ?? i.floor) - 1) })} aria-label="Diminuir">
                −
              </button>
              <input
                inputMode="numeric"
                aria-label={`Desempate em ${card.name}`}
                value={draft[i.cardId] ?? i.floor}
                onChange={(e) => setDraft({ ...draft, [i.cardId]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
              <button type="button" onClick={() => setDraft({ ...draft, [i.cardId]: (draft[i.cardId] ?? i.floor) + 1 })} aria-label="Aumentar">
                +
              </button>
            </div>
          </div>
        );
      })}
      <div className="envelope-bar">
        <div className="total">{total}</div>
        <div className="small" style={{ flex: 1 }}>
          {invalid ? <span className="error-text">Valor abaixo do empate ou acima das moedas livres.</span> : <span className="muted">Desempate lacrado ninguém vê.</span>}
        </div>
        <button className="btn btn-cone" disabled={invalid} onClick={() => void act({ t: 'tiebreak:set', stepId: step.stepId, amounts: draft })}>
          <Icon name="lacre" /> Lacrar desempate
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
  const currentName = d.participants.find((p) => p.id === step.current)?.name ?? '—';
  const options = new Set(step.myOptions);
  return (
    <div className="stack">
      <div className="panel stack" style={{ gap: 4 }}>
        <strong>{mine ? 'Sua vez no Monte Final: escolha um jogador de graça.' : `Vez de ${currentName} no Monte Final.`}</strong>
        <p className="small muted">Sobrou jogador sem dono: quem ainda tem vaga escolhe um por vez, sem pagar, até fechar os 11.</p>
      </div>
      <div className="monte-grid">
        {step.pool.map((id) => {
          const c = d.cards[id];
          if (!c) return null;
          const can = mine && options.has(id);
          return (
            <button
              key={id}
              className="sticker"
              disabled={!can}
              onClick={() => void act({ t: 'monte:pick', stepId: step.stepId, cardId: id })}
              aria-label={can ? `Escolher ${c.name}` : c.name}
            >
              <div className="sticker-row">
                <CardAvatar card={c} size={44} />
                <div style={{ minWidth: 0 }}>
                  <span className="badge-pos">{c.position}</span>
                  <div className="sticker-name" style={{ fontSize: '1.15rem' }}>
                    {c.name}
                  </div>
                  <div className="sticker-meta">
                    {c.club}, {c.year}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revelação (pote crescente)
// ---------------------------------------------------------------------------

function RevealStage({ reveal, d }: { reveal: RevealView; d: DisputeView }) {
  const now = useNow(100);
  const idx = Math.min(reveal.items.length - 1, Math.max(0, Math.floor((now - reveal.startedAt) / reveal.itemMs)));
  const item = reveal.items[idx]!;
  const card = d.cards[item.cardId];
  const name = (pid: string) => d.participants.find((p) => p.id === pid)?.name ?? pid;
  const sold = !!item.winnerId;
  const flavor = useMemo(() => {
    if (!sold) return null;
    if (item.decidedBy === 'sorteio') return 'Empate até no desempate: decidiu o sorteio.';
    if (item.decidedBy === 'desempate') return 'Decidido no desempate às cegas.';
    if (item.bids.length > 1 && item.margin <= 2) return `Por um fio: ${plural(item.margin, 'moeda', 'moedas')} de diferença.`;
    if (item.bids.length === 1) return 'Lance solitário: ninguém mais quis.';
    return null;
  }, [item, sold]);
  return (
    <div className="reveal-stage" aria-live="polite">
      <div className="spread">
        <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.3rem' }}>
          Revelação {idx + 1} de {reveal.items.length}
        </strong>
        <span className="small" style={{ color: '#9fabc2' }}>
          do menor para o maior pote
        </span>
      </div>
      <div className="reveal-strip">
        {reveal.items.map((_, i) => (
          <span key={i} data-done={i <= idx} />
        ))}
      </div>
      {card && (
        <div className="reveal-card" key={item.cardId} data-legend={(sold && card.tier === 'lenda') || undefined}>
          <CardAvatar card={sold ? card : { ...card, tier: undefined }} size={96} />
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge-pos">{card.position}</span>
              {sold && <TierBadge tier={card.tier} />}
              {item.wasMystery && <span className="badge">era carta-surpresa</span>}
            </div>
            <div className="sticker-name">{card.name}</div>
            <div className="sticker-meta">
              {card.club}, {card.year}
            </div>
            {item.bids.length === 0 ? (
              <p className="muted">Ninguém deu lance. {item.round === 'leva' ? 'Vai para a repescagem.' : 'Vai para o Monte Final.'}</p>
            ) : (
              <ul className="reveal-bids">
                {item.bids.map((b) => (
                  <li key={b.participantId} data-win={b.participantId === item.winnerId}>
                    <span>
                      {name(b.participantId)}
                      {b.participantId === d.you ? ' (você)' : ''}
                    </span>
                    <span className="amount">{b.amount}</span>
                  </li>
                ))}
              </ul>
            )}
            {item.tiebreakBids && (
              <p className="small muted">Desempate: {item.tiebreakBids.map((b) => `${name(b.participantId)} ${b.amount}`).join(', ')}</p>
            )}
            {flavor && <p className="small">{flavor}</p>}
          </div>
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
      {sold && <p>Martelo batido: {name(item.winnerId!)} leva por {plural(item.price, 'moeda', 'moedas')}.</p>}
    </div>
  );
}
