import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BidStep, ConvocacaoStep } from '../../src/engine/auction.js';
import { Dispute, type SeatInput } from '../../src/engine/dispute.js';
import { GameRuleError } from '../../src/engine/errors.js';
import { buildClubPackages, PACK_MAX, PACK_MIN, SECTOR_NEED } from '../../src/engine/packages.js';
import { DEFAULT_AUCTION_CONFIG, DEFAULT_DISPUTE_CONFIG, FORMATIONS, POSITIONS, type Card, type DisputeConfig } from '../../src/engine/types.js';
import { DECK, seat } from './helpers.js';

const REAL: Card[] = JSON.parse(readFileSync(join(__dirname, '../../data/deck-wikidata.json'), 'utf8')).cards;
const CLUBS: DisputeConfig = { ...DEFAULT_DISPUTE_CONFIG, auction: { ...DEFAULT_AUCTION_CONFIG, mode: 'clubes' } };

function seats(): SeatInput[] {
  return [
    seat('u:ana'),
    seat('u:bia', { formation: '4-4-2' }),
    seat('cpu:1', { isCpu: true, cpuStyle: 'agressivo' }),
    seat('cpu:2', { isCpu: true, formation: '4-4-2', cpuStyle: 'poupador' }),
  ];
}

function rule(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameRuleError) return err.code;
    throw err;
  }
  return 'ok';
}

/** Ana dá 6 no primeiro pacote de cada lote; Bia nunca dá lance (o Monte e a convocação decidem por ela). */
function playAuction(d: Dispute, convocar: (step: ConvocacaoStep) => void) {
  let guard = 0;
  while (d.phase === 'auction' && guard++ < 500) {
    const step = d.auction.step!;
    if (step.kind === 'bid' && step.eligible.includes('u:ana')) d.auction.submitBids('u:ana', { [step.cardIds[0]!]: 6 }, true);
    if (step.kind === 'convocacao') convocar(step);
    d.auction.resolveStep();
    d.afterAuctionStep();
  }
}

describe('pacotes do leilão de clubes', () => {
  it('cada setor tem um pacote a mais que os técnicos, com tamanho entre o mínimo e o máximo', () => {
    for (const n of [2, 4, 9, 20]) {
      const { packages, cards } = buildClubPackages({ participants: n, deck: REAL, seed: `t${n}` });
      for (const pos of POSITIONS) {
        const sector = packages.filter((p) => p.position === pos);
        expect(sector, `${pos} com ${n} técnicos`).toHaveLength(n + 1);
        for (const p of sector) {
          expect(p.cardIds.length).toBeGreaterThanOrEqual(SECTOR_NEED[pos]);
          expect(p.cardIds.length).toBeLessThanOrEqual(PACK_MAX);
          expect(p.cardIds.every((id) => cards.find((c) => c.id === id)!.position === pos)).toBe(true);
        }
      }
      // Ninguém aparece em dois pacotes (nem em versões de clube/ano diferentes).
      const people = cards.map((c) => c.personId ?? c.id);
      expect(new Set(people).size).toBe(people.length);
    }
  });

  it('com o baralho real, os pacotes de 4 técnicos têm sobra para escolher e há Lenda em todo setor', () => {
    const { packages, cards } = buildClubPackages({ participants: 4, deck: REAL, seed: 'lendas' });
    const tier = (id: string) => cards.find((c) => c.id === id)!.tier;
    for (const pos of POSITIONS) {
      const sector = packages.filter((p) => p.position === pos);
      expect(sector.every((p) => p.cardIds.length >= PACK_MIN[pos])).toBe(true);
      expect(sector.some((p) => p.cardIds.some((id) => tier(id) === 'lenda'))).toBe(true);
      // Um clube por pacote e sem clube repetido no setor.
      expect(new Set(sector.map((p) => p.club)).size).toBe(sector.length);
    }
  });

  it('baralho pequeno: completa com pacotes combinados e a disputa ainda fecha', () => {
    const many = Array.from({ length: 20 }, (_, i) => seat(i < 2 ? `u:h${i}` : `cpu:${i}`, { isCpu: i >= 2 }));
    const d = Dispute.create({ id: 'pequeno', seed: 'p', config: CLUBS, seats: many, deck: DECK });
    const result = d.runToEnd();
    expect(result.outcomes).toHaveLength(20);
    for (const p of d.participants) expect(p.roster).toHaveLength(11);
  });
});

describe('leilão de clubes', () => {
  it('só dá para dar lance em um pacote por setor', () => {
    const d = Dispute.create({ id: 'x', seed: 'um-por-setor', config: CLUBS, seats: seats(), deck: REAL });
    const step = d.auction.step as BidStep;
    expect(step.kind).toBe('bid');
    expect(step.position).toBe('GOL');
    expect(step.cardIds).toHaveLength(5);
    expect(step.mysteryCardIds).toEqual([]);
    expect(rule(() => d.auction.submitBids('u:ana', { [step.cardIds[0]!]: 3, [step.cardIds[1]!]: 2 }))).toBe('lances_demais');
    expect(rule(() => d.auction.submitBids('u:ana', { [step.cardIds[1]!]: 3 }))).toBe('ok');
  });

  it('quem leva um pacote sai do setor; quem não leva recebe um pacote de graça no Monte', () => {
    const d = Dispute.create({ id: 'x', seed: 'fluxo', config: CLUBS, seats: seats(), deck: REAL });
    const step = d.auction.step as BidStep;
    d.auction.submitBids('u:ana', { [step.cardIds[0]!]: 40 }, true);
    d.auction.resolveStep();
    expect(d.auction.packagesOf('u:ana').GOL).toMatchObject({ packageId: step.cardIds[0], price: 40, source: 'leilao' });
    expect(d.participant('u:ana').coins).toBe(60);
    // Repescagem do mesmo setor: só quem ainda está sem goleiros.
    const next = d.auction.step!;
    if (next.kind === 'bid' && next.position === 'GOL') expect(next.eligible).not.toContain('u:ana');

    playAuction(d, () => undefined);
    // Bia nunca deu lance: ficou com 5 pacotes do Monte, sem pagar nada.
    const bia = d.auction.packagesOf('u:bia');
    expect(POSITIONS.every((pos) => bia[pos]?.source === 'monte' && bia[pos]?.price === 0)).toBe(true);
    expect(d.participant('u:bia').coins).toBe(100);
    expect(d.phase).toBe('ceremony');
  });

  it('convocação: valida as escolhas, completa com o pior do pacote e divide o preço do pacote', () => {
    const d = Dispute.create({ id: 'x', seed: 'convoca', config: CLUBS, seats: seats(), deck: REAL });
    let anaPicks: string[] = [];
    playAuction(d, (step) => {
      expect(step.sealed.sort()).toEqual(['cpu:1', 'cpu:2']);
      const a = d.auction;
      const mine = a.convocaOptions('u:ana');
      const bias = a.convocaOptions('u:bia');
      // Jogador de outro técnico, setor estourado e convocação incompleta não passam.
      expect(rule(() => a.submitConvocacao('u:ana', [bias.GOL[0]!]))).toBe('carta_invalida');
      expect(rule(() => a.submitConvocacao('u:ana', mine.GOL.slice(0, 2)))).toBe('convocados_demais');
      expect(rule(() => a.submitConvocacao('u:ana', mine.GOL.slice(0, 1), true))).toBe('convocacao_incompleta');
      // Ana escolhe os últimos de cada pacote; Bia não escolhe nada.
      anaPicks = POSITIONS.flatMap((pos) => mine[pos].slice(-FORMATIONS['4-3-3'][pos]));
      expect(rule(() => a.submitConvocacao('u:ana', anaPicks, true))).toBe('ok');
      expect(rule(() => a.submitConvocacao('u:ana', anaPicks))).toBe('envelope_lacrado');
    });
    expect(d.phase).toBe('ceremony');
    const ana = d.participant('u:ana');
    expect(ana.roster.map((r) => r.cardId).sort()).toEqual([...anaPicks].sort());

    // Bia (4-4-2) ficou com o pior de cada pacote.
    const mid = (id: string) => d.cards[id]!.levelMin + d.cards[id]!.levelMax;
    const bia = d.participant('u:bia');
    for (const pos of POSITIONS) {
      const pack = d.auction.state.packages![d.auction.packagesOf('u:bia')[pos]!.packageId]!;
      const worst = [...pack.cardIds].sort((a, b) => mid(a) - mid(b)).slice(0, FORMATIONS['4-4-2'][pos]);
      const got = bia.roster.filter((r) => r.position === pos).map((r) => r.cardId);
      expect(got.map(mid).sort()).toEqual(worst.map(mid).sort());
    }
    expect(d.auction.state.convocacaoLog!.filter((x) => x.participantId === 'u:bia').every((x) => x.auto)).toBe(true);

    // O preço do pacote é dividido entre os convocados do setor (a sobra vai para os primeiros).
    for (const p of d.participants) {
      for (const pos of POSITIONS) {
        const win = d.auction.packagesOf(p.id)[pos]!;
        const prices = p.roster.filter((r) => r.position === pos).map((r) => r.price);
        expect(prices.reduce((a, b) => a + b, 0)).toBe(win.price);
        expect(Math.max(...prices) - Math.min(...prices)).toBeLessThanOrEqual(1);
      }
      expect(p.coins).toBe(100 - POSITIONS.reduce((s, pos) => s + d.auction.packagesOf(p.id)[pos]!.price, 0));
    }
  });

  it('a disputa restaura no meio da convocação e as sobras vão para os times do jogo', () => {
    const d = Dispute.create({ id: 'x', seed: 'sobras', config: CLUBS, seats: seats(), deck: REAL });
    let guard = 0;
    while (d.auction.step?.kind !== 'convocacao' && guard++ < 200) {
      d.auction.resolveStep();
      d.afterAuctionStep();
    }
    const restored = Dispute.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
    expect(restored.auction.step?.kind).toBe('convocacao');
    expect(restored.auction.isClubs).toBe(true);
    restored.runToEnd();
    const leftovers = new Set(restored.leftoverPackageCards().map((c) => c.id));
    const owned = new Set(restored.participants.flatMap((p) => p.roster.map((r) => r.cardId)));
    const botPlayers = restored.league!.state.teams.filter((t) => !t.participantId).flatMap((t) => t.squad.map((s) => s.cardId));
    const real = botPlayers.filter((id) => leftovers.has(id));
    expect(real.length).toBeGreaterThan(20);
    expect(real.some((id) => owned.has(id))).toBe(false);
    expect(new Set(real).size).toBe(real.length);
  });

  it('a CPU espalha as moedas pelos cinco setores', () => {
    const cpus = Array.from({ length: 6 }, (_, i) => seat(`cpu:${i + 1}`, { isCpu: true, cpuStyle: (['agressivo', 'equilibrado', 'poupador'] as const)[i % 3] }));
    let lateSpend = 0;
    for (const s of ['a', 'b', 'c']) {
      const d = Dispute.create({ id: s, seed: `cpu-${s}`, config: CLUBS, seats: cpus, deck: REAL });
      d.runToEnd();
      // Quem levou pacote do ataque (último setor) no leilão ainda tinha moedas para pagar por ele.
      for (const p of d.participants) {
        const ata = d.auction.packagesOf(p.id).ATA!;
        if (ata.source !== 'monte') lateSpend++;
      }
    }
    expect(lateSpend).toBeGreaterThan(6);
  });
});
