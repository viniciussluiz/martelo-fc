import { describe, expect, it } from 'vitest';
import { Auction, lotSizes, type BidStep, type MonteStep, type TiebreakStep } from '../../src/engine/auction.js';
import { GameRuleError } from '../../src/engine/errors.js';
import { DEFAULT_AUCTION_CONFIG, FORMATIONS, POSITIONS, type AuctionConfig, type Card } from '../../src/engine/types.js';
import { buildAuctionPool } from '../../src/engine/dispute.js';
import { DECK, fakeCards, participant } from './helpers.js';

const CONFIG: AuctionConfig = { ...DEFAULT_AUCTION_CONFIG, mysteryChance: 0 };

function smallPool(): { pool: Card[]; reserve: Card[] } {
  // Dois técnicos 4-3-3: vagas GOL 2, LAT 4, ZAG 4, MEI 6, ATA 6 (+1 extra cada).
  const pool = [
    ...fakeCards('GOL', 3),
    ...fakeCards('LAT', 5),
    ...fakeCards('ZAG', 5),
    ...fakeCards('MEI', 7),
    ...fakeCards('ATA', 7),
  ];
  const reserve = [...fakeCards('GOL', 4, 'rGOL'), ...fakeCards('MEI', 4, 'rMEI'), ...fakeCards('ATA', 4, 'rATA')];
  return { pool, reserve };
}

function twoHumans(config: AuctionConfig = CONFIG) {
  const { pool, reserve } = smallPool();
  return Auction.create({ participants: [participant('A'), participant('B')], pool, reserve, config, seed: 's1' });
}

function bidStep(a: Auction): BidStep {
  const s = a.step;
  if (!s || s.kind !== 'bid') throw new Error(`esperava passo de lance, veio ${s?.kind}`);
  return s;
}

describe('tamanho dos lotes', () => {
  it('soma as vagas da formação e adiciona a carta extra', () => {
    const sizes = lotSizes([{ formation: '4-3-3' }, { formation: '4-4-2' }, { formation: '4-3-3' }], 1);
    expect(sizes).toEqual({ GOL: 4, LAT: 7, ZAG: 7, MEI: 11, ATA: 9 });
  });

  it('nunca é menor que o número de cartas herdadas do ciclo anterior', () => {
    const sizes = lotSizes([{ formation: '4-3-3' }], 1, { MEI: 9 });
    expect(sizes.MEI).toBe(9);
    expect(sizes.GOL).toBe(2);
  });

  it('o pool inclui todas as cartas herdadas e completa com o baralho', () => {
    const carried = DECK.filter((c) => c.position === 'ATA').slice(0, 10);
    const { pool, reserve } = buildAuctionPool({ seats: [{ formation: '4-3-3' }, { formation: '4-3-3' }], deck: DECK, carried, extra: 1, seed: 'x' });
    for (const c of carried) expect(pool.some((p) => p.id === c.id)).toBe(true);
    // max(6+1, 10); sem Lenda entre as herdadas, entra mais uma carta (a Lenda da posição).
    const ata = pool.filter((c) => c.position === 'ATA');
    expect(ata).toHaveLength(carried.some((c) => c.tier === 'lenda') ? 10 : 11);
    expect(ata.some((c) => c.tier === 'lenda')).toBe(true);
    expect(pool.filter((c) => c.position === 'GOL')).toHaveLength(3);
    const ids = new Set([...pool, ...reserve].map((c) => c.id));
    expect(ids.size).toBe(pool.length + reserve.length);
  });
});

describe('validação de lances', () => {
  it('começa pelos goleiros, com todos elegíveis', () => {
    const a = twoHumans();
    const s = bidStep(a);
    expect(s.position).toBe('GOL');
    expect(s.cardIds).toHaveLength(3);
    expect(s.eligible).toEqual(['A', 'B']);
  });

  it('limita o número de lances às vagas abertas na posição', () => {
    const a = twoHumans();
    const [c1, c2] = bidStep(a).cardIds;
    expect(() => a.submitBids('A', { [c1!]: 5, [c2!]: 5 })).toThrowError(/só pode dar lance em 1/);
  });

  it('não permite envelope acima das moedas', () => {
    const a = twoHumans();
    const [c1] = bidStep(a).cardIds;
    expect(() => a.submitBids('A', { [c1!]: 101 })).toThrowError(GameRuleError);
  });

  it('rejeita lances fracionários, negativos e cartas de fora da leva', () => {
    const a = twoHumans();
    const [c1] = bidStep(a).cardIds;
    expect(() => a.submitBids('A', { [c1!]: 2.5 })).toThrowError(/inteiros/);
    expect(() => a.submitBids('A', { [c1!]: -3 })).toThrowError(/inteiros/);
    expect(() => a.submitBids('A', { 'LAT-1': 3 })).toThrowError(/não está nesta leva/);
  });

  it('não aceita alteração depois de lacrar', () => {
    const a = twoHumans();
    const [c1] = bidStep(a).cardIds;
    a.submitBids('A', { [c1!]: 3 }, true);
    expect(() => a.submitBids('A', { [c1!]: 4 })).toThrowError(/lacrado/);
  });

  it('lance zero equivale a retirar o lance', () => {
    const a = twoHumans();
    const [c1] = bidStep(a).cardIds;
    a.submitBids('A', { [c1!]: 0 });
    expect(bidStep(a).bids['A']).toEqual({});
  });
});

describe('fechamento e desempate', () => {
  it('maior lance leva e paga o próprio lance; revelação em pote crescente', () => {
    const a = twoHumans();
    const [g1, g2, g3] = bidStep(a).cardIds as [string, string, string];
    a.submitBids('A', { [g1]: 10 }, true);
    a.submitBids('B', { [g1]: 7 }, true);
    expect(a.isStepReady()).toBe(true);
    const out = a.resolveStep();
    expect(out.kind).toBe('revealed');
    const winner = out.reveals.find((r) => r.cardId === g1)!;
    expect(winner.winnerId).toBe('A');
    expect(winner.price).toBe(10);
    expect(winner.margin).toBe(3);
    expect(a.participant('A').coins).toBe(90);
    expect(a.participant('B').coins).toBe(100);
    // Pote crescente: cartas sem lance primeiro, a disputada por último.
    expect(out.reveals.map((r) => r.pot)).toEqual([0, 0, 17]);
    expect(out.reveals.slice(0, 2).map((r) => r.cardId).sort()).toEqual([g2, g3].sort());
  });

  it('empate abre desempate às cegas; o maior novo lance vence', () => {
    const a = twoHumans();
    const [g1] = bidStep(a).cardIds as [string];
    a.submitBids('A', { [g1]: 8 }, true);
    a.submitBids('B', { [g1]: 8 }, true);
    const out = a.resolveStep();
    expect(out.kind).toBe('tiebreak');
    const tb = a.step as TiebreakStep;
    expect(tb.items).toEqual([{ cardId: g1, tied: ['A', 'B'], floor: 8 }]);
    expect(() => a.submitTiebreak('A', { [g1]: 7 })).toThrowError(/pelo menos 8/);
    a.submitTiebreak('A', { [g1]: 9 });
    a.submitTiebreak('B', { [g1]: 12 });
    const done = a.resolveStep();
    const r = done.reveals.find((x) => x.cardId === g1)!;
    expect(r.winnerId).toBe('B');
    expect(r.price).toBe(12);
    expect(r.decidedBy).toBe('desempate');
    expect(a.participant('B').coins).toBe(88);
  });

  it('se ninguém responder ao desempate, vale o lance original e o sorteio decide', () => {
    const a = twoHumans();
    const [g1] = bidStep(a).cardIds as [string];
    a.submitBids('A', { [g1]: 5 }, true);
    a.submitBids('B', { [g1]: 5 }, true);
    a.resolveStep();
    const done = a.resolveStep(); // tempo esgotado
    const r = done.reveals.find((x) => x.cardId === g1)!;
    expect(['A', 'B']).toContain(r.winnerId);
    expect(r.price).toBe(5);
    expect(r.decidedBy).toBe('sorteio');
  });

  it('sem rodada de desempate configurada, o empate vai direto ao sorteio', () => {
    const a = twoHumans({ ...CONFIG, tiebreakRound: false });
    const [g1] = bidStep(a).cardIds as [string];
    a.submitBids('A', { [g1]: 5 }, true);
    a.submitBids('B', { [g1]: 5 }, true);
    const out = a.resolveStep();
    expect(out.kind).toBe('revealed');
    expect(out.reveals.find((x) => x.cardId === g1)!.decidedBy).toBe('sorteio');
  });

  it('o desempate respeita as moedas livres', () => {
    const a = twoHumans();
    // Leva de goleiros: A gasta 95 em uma carta, empata em nada; usamos LAT para ter 2 vagas.
    a.resolveStep(); // GOL sem lances
    // repescagem de GOL
    a.resolveStep();
    const lat = bidStep(a);
    expect(lat.position).toBe('LAT');
    const [l1, l2] = lat.cardIds as [string, string];
    a.submitBids('A', { [l1]: 90, [l2]: 5 }, true);
    a.submitBids('B', { [l2]: 5 }, true);
    a.resolveStep();
    expect(a.step?.kind).toBe('tiebreak');
    expect(() => a.submitTiebreak('A', { [l2]: 11 })).toThrowError(/10 moedas livres/);
    a.submitTiebreak('A', { [l2]: 10 });
  });
});

describe('repescagem e Monte Final', () => {
  it('sobras vão para a repescagem só de quem tem vaga, depois para o Monte', () => {
    const a = twoHumans();
    const gk = bidStep(a).cardIds as [string, string, string];
    a.submitBids('A', { [gk[0]]: 3 }, true);
    a.submitBids('B', {}, true);
    a.resolveStep();
    const rep = bidStep(a);
    expect(rep.round).toBe('repescagem');
    expect(rep.eligible).toEqual(['B']);
    expect(rep.cardIds.sort()).toEqual([gk[1], gk[2]].sort());
    a.submitBids('B', {}, true);
    a.resolveStep();
    expect(a.state.montePool.sort()).toEqual([gk[1], gk[2]].sort());
  });

  it('Monte: só joga quem está na vez, só posições abertas e todos fecham 11', () => {
    const a = twoHumans();
    // Ninguém dá lance em nada: tudo vai para o Monte.
    while (a.step && a.step.kind === 'bid') a.resolveStep();
    const m = a.step as MonteStep;
    expect(m.kind).toBe('monte');
    expect(m.queue).toEqual(['A', 'B']);
    const other = m.queue[1]!;
    expect(() => a.pickMonte(other, m.pool[0]!)).toThrowError(/não é a sua vez/);
    const gk = m.pool.find((id) => a.state.cards[id]!.position === 'GOL')!;
    a.pickMonte('A', gk);
    expect(a.participant('A').roster).toHaveLength(1);
    // A já tem goleiro: não pode pegar outro.
    const m2 = a.step as MonteStep;
    expect(m2.current).toBe('B');
    a.resolveStep(); // B por tempo esgotado → escolha automática
    const m3 = a.step as MonteStep;
    expect(m3.current).toBe('A');
    const gk2 = m3.pool.find((id) => a.state.cards[id]!.position === 'GOL');
    if (gk2) expect(() => a.pickMonte('A', gk2)).toThrowError(/completou essa posição/);
    a.runToEnd();
    for (const id of ['A', 'B']) {
      const roster = a.participant(id).roster;
      expect(roster).toHaveLength(11);
      for (const pos of POSITIONS) expect(roster.filter((r) => r.position === pos)).toHaveLength(FORMATIONS['4-3-3'][pos]);
      expect(roster.every((r) => r.price === 0 && r.source === 'monte')).toBe(true);
    }
  });
});

describe('leilão completo com CPUs (propriedades)', () => {
  it.each(['a', 'b', 'c', 'd', 'e', 'f'])('semente %s: elencos válidos, saldo nunca negativo, sem duplicidade', (seed) => {
    const seats = [participant('H'), ...Array.from({ length: 7 }, (_, i) => participant(`cpu:${i}`, i % 2 ? '4-4-2' : '4-3-3', true))];
    const { pool, reserve } = buildAuctionPool({ seats, deck: DECK, carried: [], extra: 1, seed });
    const a = Auction.create({ participants: seats, pool, reserve, config: DEFAULT_AUCTION_CONFIG, seed });
    a.runToEnd();
    const all: string[] = [];
    for (const p of a.state.participants) {
      expect(p.coins).toBeGreaterThanOrEqual(0);
      expect(p.roster).toHaveLength(11);
      for (const pos of POSITIONS) expect(p.roster.filter((r) => r.position === pos)).toHaveLength(FORMATIONS[p.formation][pos]);
      const spent = p.roster.reduce((s, r) => s + r.price, 0);
      expect(spent + p.coins).toBe(100);
      all.push(...p.roster.map((r) => r.cardId));
    }
    expect(new Set(all).size).toBe(all.length);
    // CPUs efetivamente disputam o leilão.
    expect(a.state.revealLog.filter((r) => r.winnerId?.startsWith('cpu:')).length).toBeGreaterThan(10);
  });

  it('é determinístico para a mesma semente', () => {
    const run = () => {
      const seats = [participant('cpu:1', '4-3-3', true), participant('cpu:2', '4-4-2', true), participant('cpu:3', '4-3-3', true)];
      const { pool, reserve } = buildAuctionPool({ seats, deck: DECK, carried: [], extra: 1, seed: 'det' });
      const a = Auction.create({ participants: seats, pool, reserve, config: DEFAULT_AUCTION_CONFIG, seed: 'det' });
      a.runToEnd();
      return JSON.stringify(a.state.participants);
    };
    expect(run()).toBe(run());
  });

  it('sobrevive a serialização no meio do leilão (snapshot/restauração)', () => {
    const seats = [participant('H'), participant('cpu:1', '4-3-3', true), participant('cpu:2', '4-4-2', true)];
    const { pool, reserve } = buildAuctionPool({ seats, deck: DECK, carried: [], extra: 1, seed: 'snap' });
    const a = Auction.create({ participants: seats, pool, reserve, config: DEFAULT_AUCTION_CONFIG, seed: 'snap' });
    for (let i = 0; i < 4; i++) a.resolveStep();
    const restored = Auction.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    a.runToEnd();
    restored.runToEnd();
    expect(JSON.stringify(restored.state.participants)).toBe(JSON.stringify(a.state.participants));
  });

  it('cartas surpresa aparecem quando configuradas', () => {
    const seats = [participant('H'), participant('cpu:1', '4-3-3', true)];
    const { pool, reserve } = buildAuctionPool({ seats, deck: DECK, carried: [], extra: 1, seed: 'm' });
    const a = Auction.create({ participants: seats, pool, reserve, config: { ...DEFAULT_AUCTION_CONFIG, mysteryChance: 1 }, seed: 'm' });
    expect(bidStep(a).mysteryCardIds).toHaveLength(1);
  });
});
