import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BidStep, ConvocacaoStep } from '../../src/engine/auction.js';
import { Dispute, type SeatInput } from '../../src/engine/dispute.js';
import { GameRuleError } from '../../src/engine/errors.js';
import { buildClubPackages, packageStrength, PACK_MAX, PACK_MIN, SECTOR_NEED } from '../../src/engine/packages.js';
import { cpuPlanBids } from '../../src/engine/cpu.js';
import { Rng } from '../../src/engine/rng.js';
import { DEFAULT_AUCTION_CONFIG, DEFAULT_DISPUTE_CONFIG, deckForScope, FORMATIONS, POSITIONS, type Card, type DisputeConfig } from '../../src/engine/types.js';
import { DECK, participant, seat } from './helpers.js';

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

  it('dá para trocar a formação na convocação: muda quantos entram por setor e o time fecha na nova', () => {
    const d = Dispute.create({ id: 'x', seed: 'formacao', config: CLUBS, seats: seats(), deck: REAL });
    const a = d.auction;
    // Fora da convocação não troca.
    expect(rule(() => a.setConvocaFormation('u:ana', '4-4-2'))).toBe('fora_de_hora');
    let picks442: string[] = [];
    playAuction(d, () => {
      const mine = a.convocaOptions('u:ana');
      // Ana (4-3-3) convoca 3 atacantes e 3 meias, depois muda para o 4-4-2.
      const draft = [...mine.ATA.slice(0, 3), ...mine.MEI.slice(0, 3)];
      a.submitConvocacao('u:ana', draft);
      expect(rule(() => a.setConvocaFormation('u:ana', '2-3-5' as never))).toBe('formacao_invalida');
      a.setConvocaFormation('u:ana', '4-4-2');
      expect(d.participant('u:ana').formation).toBe('4-4-2');
      // O ataque encolheu para 2: sai o último escolhido; os meias continuam.
      const step = a.step as ConvocacaoStep;
      expect(step.picks['u:ana']).toEqual([...mine.ATA.slice(0, 2), ...mine.MEI.slice(0, 3)]);
      // Agora cabem 4 meias e só 2 atacantes.
      expect(rule(() => a.submitConvocacao('u:ana', mine.ATA.slice(0, 3)))).toBe('convocados_demais');
      picks442 = POSITIONS.flatMap((pos) => mine[pos].slice(0, FORMATIONS['4-4-2'][pos]));
      expect(rule(() => a.submitConvocacao('u:ana', picks442, true))).toBe('ok');
      // Depois de fechar, a formação não muda mais.
      expect(rule(() => a.setConvocaFormation('u:ana', '4-3-3'))).toBe('envelope_lacrado');
      // Bia (4-4-2) troca para o 4-3-3 e não convoca ninguém: entra o pior de cada pacote, na formação nova.
      a.setConvocaFormation('u:bia', '4-3-3');
    });
    expect(d.phase).toBe('ceremony');
    const ana = d.participant('u:ana');
    expect(ana.roster.map((r) => r.cardId).sort()).toEqual([...picks442].sort());
    const bia = d.participant('u:bia');
    expect(bia.formation).toBe('4-3-3');
    for (const pos of POSITIONS) expect(bia.roster.filter((r) => r.position === pos)).toHaveLength(FORMATIONS['4-3-3'][pos]);
    // A disputa segue até o fim com as formações novas.
    expect(d.runToEnd().outcomes.find((o) => o.participantId === 'u:ana')!.formation).toBe('4-4-2');
  });

  it.each(['4-5-1', '4-2-4', '3-5-2', '3-4-3', '5-4-1'] as const)('formação %s na convocação: o time fecha com as contas dela e joga até o fim', (formation) => {
    const d = Dispute.create({ id: 'x', seed: `varias-${formation}`, config: CLUBS, seats: seats(), deck: REAL });
    const a = d.auction;
    playAuction(d, () => {
      const mine = a.convocaOptions('u:ana');
      a.setConvocaFormation('u:ana', formation);
      a.submitConvocacao('u:ana', POSITIONS.flatMap((pos) => mine[pos].slice(0, FORMATIONS[formation][pos])), true);
    });
    const ana = d.participant('u:ana');
    expect(ana.formation).toBe(formation);
    expect(ana.roster).toHaveLength(11);
    for (const pos of POSITIONS) expect(ana.roster.filter((r) => r.position === pos)).toHaveLength(FORMATIONS[formation][pos]);
    const result = d.runToEnd();
    expect(result.outcomes.find((o) => o.participantId === 'u:ana')!.formation).toBe(formation);
  });

  it('formação que o pacote não preenche é recusada (pacote de 4 meias não dá um 4-5-1)', () => {
    const d = Dispute.create({ id: 'x', seed: 'curto', config: CLUBS, seats: seats(), deck: REAL });
    const a = d.auction;
    let tried = false;
    playAuction(d, () => {
      const pack = a.state.packages![a.packagesOf('u:ana').MEI!.packageId]!;
      pack.cardIds = pack.cardIds.slice(0, 4);
      expect(rule(() => a.setConvocaFormation('u:ana', '4-5-1'))).toBe('formacao_sem_jogadores');
      expect(rule(() => a.setConvocaFormation('u:ana', '4-4-2'))).toBe('ok');
      tried = true;
    });
    expect(tried).toBe(true);
    expect(d.participant('u:ana').formation).toBe('4-4-2');
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

describe('mistura dos pacotes de cada setor', () => {
  const ALL = deckForScope(REAL, 'ALL');
  const mid = (c: Card) => (c.levelMin + c.levelMax) / 2;

  /** Terços de força dos clubes do baralho no setor (limites entre fortes/médios e médios/fracos). */
  function thirds(deck: Card[], pos: Card['position']): [number, number] {
    const byClub = new Map<string, Card[]>();
    for (const c of deck.filter((c) => c.position === pos)) byClub.set(c.club, [...(byClub.get(c.club) ?? []), c]);
    const strengths = [...byClub.values()]
      .filter((l) => l.length >= PACK_MIN[pos])
      .map((l) => packageStrength([...l].sort((a, b) => mid(b) - mid(a)).slice(0, PACK_MAX), pos))
      .sort((a, b) => b - a);
    const third = Math.ceil(strengths.length / 3);
    return [strengths[third - 1]!, strengths[2 * third - 1]!];
  }

  it('metade Europa, metade Brasil em todo setor', () => {
    for (const n of [2, 3, 4, 7, 12]) {
      for (let i = 0; i < 25; i++) {
        const { packages, cards } = buildClubPackages({ participants: n, deck: ALL, seed: `mix${n}-${i}` });
        const series = new Map(cards.map((c) => [c.id, c.series]));
        for (const pos of POSITIONS) {
          const sector = packages.filter((p) => p.position === pos);
          const eu = sector.filter((p) => series.get(p.cardIds[0]!) === 'EU').length;
          expect(Math.abs(eu - sector.length / 2), `${pos}, ${n} técnicos, semente ${i}: ${eu} europeus em ${sector.length}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('pelo menos 1/3 de clubes fortes e nunca mais fracos do que 1/3', () => {
    for (const n of [2, 3, 4, 7, 12]) {
      for (let i = 0; i < 25; i++) {
        const { packages, cards } = buildClubPackages({ participants: n, deck: ALL, seed: `forca${n}-${i}` });
        const byId = new Map(cards.map((c) => [c.id, c]));
        for (const pos of POSITIONS) {
          const [strongFrom, weakBelow] = thirds(ALL, pos);
          const sector = packages.filter((p) => p.position === pos);
          const strengths = sector.map((p) => packageStrength(p.cardIds.map((id) => byId.get(id)!), pos));
          const label = `${pos}, ${n} técnicos, semente ${i}: ${strengths.map((s) => s.toFixed(0)).join(' ')}`;
          // Folga de 2 pontos: o corte do pacote e quem já saiu em outro setor mexem um pouco na força.
          expect(strengths.filter((s) => s >= strongFrom - 2).length, label).toBeGreaterThanOrEqual(Math.floor(sector.length / 3));
          expect(strengths.filter((s) => s < weakBelow - 2).length, label).toBeLessThanOrEqual(Math.ceil(sector.length / 3));
        }
      }
    }
  });

  it('sala só com Brasil (ou só com Europa) continua montando os pacotes', () => {
    for (const scope of ['AB', 'EU'] as const) {
      const { packages } = buildClubPackages({ participants: 4, deck: deckForScope(REAL, scope), seed: scope });
      for (const pos of POSITIONS) expect(packages.filter((p) => p.position === pos)).toHaveLength(5);
    }
  });
});

describe('lances da CPU nos pacotes', () => {
  const pack = (id: string, level: number): Card => ({
    id,
    name: id,
    position: 'ATA',
    club: id,
    year: 2000,
    levelMin: level - 3,
    levelMax: level + 3,
    tier: 'titular',
    hint: '',
  });
  const plan = (cards: Card[], coins: number, seed: string, totalOpenSlots = 3) =>
    cpuPlanBids({
      rng: new Rng(seed),
      participant: { ...participant('cpu:1', '4-3-3', true), coins, cpuStyle: 'agressivo' },
      cards,
      mysteryCardIds: [],
      openInPosition: 1,
      totalOpenSlots,
      playersPerItem: 3,
      demand: 3,
      round: 'leva',
    });

  it('não torra o caixa em pacote fraco, mesmo com muitas moedas e no último setor', () => {
    const weak = [pack('a', 72), pack('b', 70), pack('c', 69), pack('d', 68)];
    const amounts: number[] = [];
    for (let i = 0; i < 200; i++) amounts.push(Object.values(plan(weak, 100, `fraco${i}`))[0] ?? 0);
    amounts.sort((x, y) => x - y);
    // A CPU ainda erra a avaliação de vez em quando, mas o normal é um lance baixo.
    expect(amounts[Math.floor(amounts.length * 0.95)]).toBeLessThanOrEqual(22);
    expect(amounts[amounts.length - 1]).toBeLessThanOrEqual(40);
  });

  it('paga bem mais pelo pacote forte do lote do que pelos que sobram', () => {
    const lot = [pack('forte', 94), pack('ok', 84), pack('fraco1', 72), pack('fraco2', 70)];
    let strong = 0;
    let strongSum = 0;
    for (let i = 0; i < 200; i++) {
      const bids = plan(lot, 100, `lote${i}`, 11);
      expect(bids.fraco1 ?? 0).toBeLessThanOrEqual(3);
      expect(bids.fraco2 ?? 0).toBeLessThanOrEqual(3);
      if (bids.forte) {
        strong++;
        strongSum += bids.forte;
      }
    }
    expect(strong).toBeGreaterThan(180);
    expect(strongSum / strong).toBeGreaterThan(20);
  });

  it('repescagem só com sobras parecidas: lance simbólico ou nenhum (o Monte dá de graça)', () => {
    const leftovers = [pack('x', 76), pack('y', 75), pack('z', 75)];
    const amounts: number[] = [];
    for (let i = 0; i < 200; i++) {
      const bids = cpuPlanBids({
        rng: new Rng(`sobra${i}`),
        participant: { ...participant('cpu:1', '4-3-3', true), coins: 80 },
        cards: leftovers,
        mysteryCardIds: [],
        openInPosition: 1,
        totalOpenSlots: 3,
        playersPerItem: 3,
        demand: 2,
        round: 'repescagem',
      });
      amounts.push(Object.values(bids)[0] ?? 0);
    }
    amounts.sort((x, y) => x - y);
    expect(amounts[Math.floor(amounts.length * 0.5)]).toBeLessThanOrEqual(1);
    expect(amounts[Math.floor(amounts.length * 0.95)]).toBeLessThanOrEqual(20);
    expect(amounts[amounts.length - 1]).toBeLessThanOrEqual(30);
  });
});

describe('corte dos pacotes grandes', () => {
  it('os melhores do clube no setor ficam sempre no pacote (Beckenbauer na zaga do Bayern)', () => {
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const { packages, cards } = buildClubPackages({ participants: 9, deck: REAL, seed: `corte${i}` });
      const bayern = packages.find((p) => p.club === 'Bayern de Munique' && p.position === 'ZAG');
      if (!bayern) continue;
      seen++;
      expect(bayern.cardIds.length).toBeLessThanOrEqual(PACK_MAX);
      const names = bayern.cardIds.map((id) => cards.find((c) => c.id === id)!.name);
      expect(names, `semente corte${i}`).toContain('Franz Beckenbauer');
    }
    expect(seen).toBeGreaterThan(0);
  });
});
