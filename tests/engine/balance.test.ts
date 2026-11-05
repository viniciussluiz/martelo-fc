import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { balancedLevas, lotSizes } from '../../src/engine/auction.js';
import { bandQuota, buildAuctionPool } from '../../src/engine/dispute.js';
import { Rng } from '../../src/engine/rng.js';
import { deckForScope, POSITIONS, QUALITY_BANDS, qualityBand, type Card, type Formation, type QualityBand } from '../../src/engine/types.js';
import { ROOT_DIR } from '../../src/server/config.js';
import { DECK, fakeCards } from './helpers.js';

const REAL: Card[] = (JSON.parse(readFileSync(join(ROOT_DIR, 'data/deck-wikidata.json'), 'utf8')) as { cards: Card[] }).cards;

function bands(cards: Card[]): Record<QualityBand, number> {
  const out: Record<QualityBand, number> = { bom: 0, medio: 0, ruim: 0 };
  for (const c of cards) out[qualityBand(c.tier)]++;
  return out;
}

const seatsOf = (n: number, formation: Formation = '4-3-3') => Array.from({ length: n }, () => ({ formation }));

describe('lote equilibrado: 1/3 bons, 1/3 médios, 1/3 ruins em cada posição', () => {
  it('opções de sobra: metade a mais que as vagas (4 técnicos → 6 goleiros)', () => {
    expect(lotSizes(seatsOf(4), 1, {}, 0.5)).toEqual({ GOL: 6, LAT: 12, ZAG: 12, MEI: 18, ATA: 18 });
    expect(lotSizes(seatsOf(1), 1, {}, 0.5)).toEqual({ GOL: 2, LAT: 3, ZAG: 3, MEI: 5, ATA: 5 });
    expect(lotSizes(seatsOf(3), 1, {}, 0.5).GOL).toBe(5);
  });

  it('faixas: Lenda e Craque são bons, Titular é médio, Operário e Perna-de-pau são ruins', () => {
    expect(['lenda', 'craque', 'titular', 'operario', 'perna'].map((t) => qualityBand(t as Card['tier']))).toEqual(['bom', 'bom', 'medio', 'ruim', 'ruim']);
  });

  for (const scope of ['ALL', 'AB', 'A', 'EU'] as const) {
    it(`baralho real (${scope}): cada posição tem ⌊n/3⌋ ou ⌈n/3⌉ de cada faixa e pelo menos uma Lenda`, () => {
      const deck = deckForScope(REAL, scope);
      for (const players of [1, 2, 4, 8, 12, 20]) {
        for (let s = 0; s < 4; s++) {
          const seats = seatsOf(players, s % 2 ? '4-4-2' : '4-3-3');
          const ratio = s < 2 ? 0.5 : 0;
          const sizes = lotSizes(seats, 1, {}, ratio);
          const { pool } = buildAuctionPool({ seats, deck, carried: [], extra: 1, extraRatio: ratio, seed: `${scope}-${players}-${s}` });
          for (const pos of POSITIONS) {
            const lot = pool.filter((c) => c.position === pos);
            expect(lot, `${scope} ${players} ${pos}`).toHaveLength(sizes[pos]);
            expect(lot.some((c) => c.tier === 'lenda'), `${scope} ${players} técnicos, ${pos}: Lenda`).toBe(true);
            for (const band of QUALITY_BANDS) {
              const n = bands(lot)[band];
              expect(n, `${scope} ${players} técnicos, ${pos}, ${band}`).toBeGreaterThanOrEqual(Math.floor(sizes[pos] / 3));
              expect(n, `${scope} ${players} técnicos, ${pos}, ${band}`).toBeLessThanOrEqual(Math.ceil(sizes[pos] / 3));
            }
          }
        }
      }
    });
  }

  it('só Série B (quase sem Craques): o terço “bom” vem dos melhores que existem', () => {
    const deck = deckForScope(REAL, 'B');
    const seats = seatsOf(8);
    const { pool, reserve } = buildAuctionPool({ seats, deck, carried: [], extra: 1, seed: 'serie-b' });
    const lat = pool.filter((c) => c.position === 'LAT');
    expect(lat).toHaveLength(lotSizes(seats, 1).LAT);
    const avg = (c: Card) => (c.levelMin + c.levelMax) / 2;
    // Todos os bons do baralho que existem entram, e o resto do terço é o topo do que sobrou.
    const goodInDeck = reserve.filter((c) => c.position === 'LAT' && qualityBand(c.tier) === 'bom');
    expect(goodInDeck).toHaveLength(0);
    const best = Math.max(...reserve.filter((c) => c.position === 'LAT').map(avg));
    const top = lat.map(avg).sort((a, b) => b - a).slice(0, Math.floor(lat.length / 3));
    expect(Math.min(...top)).toBeGreaterThanOrEqual(best - 8);
  });

  it('ciclo seguinte: as herdadas voltam todas e as novas puxam o lote para os terços', () => {
    const goods = REAL.filter((c) => c.position === 'MEI' && qualityBand(c.tier) === 'bom').slice(0, 6);
    const seats = seatsOf(4);
    const { pool } = buildAuctionPool({ seats, deck: REAL, carried: goods, extra: 1, seed: 'herdadas' });
    const mei = pool.filter((c) => c.position === 'MEI');
    expect(mei).toHaveLength(13);
    // 6 bons herdados + 7 novos: nenhum bom novo; médios e ruins dividem o resto.
    expect(bands(mei)).toEqual({ bom: 6, medio: expect.any(Number), ruim: expect.any(Number) });
    expect(Math.abs(bands(mei).medio - bands(mei).ruim)).toBeLessThanOrEqual(1);
    expect(bandQuota([], 7, new Rng('q'))).toSatisfy((q: Record<QualityBand, number>) => Object.values(q).sort().join() === '2,2,3');
  });

  it('Lenda garantida mesmo no lote de 2 cartas e quando as herdadas já enchem o lote', () => {
    for (let s = 0; s < 20; s++) {
      const { pool } = buildAuctionPool({ seats: seatsOf(1), deck: REAL, carried: [], extra: 1, seed: `um-${s}` });
      const gol = pool.filter((c) => c.position === 'GOL');
      expect(gol).toHaveLength(2);
      expect(gol.some((c) => c.tier === 'lenda')).toBe(true);
    }
    // 14 meias herdados, nenhum Lenda, lote de 13: entra 1 carta a mais, e ela é Lenda.
    const carried = REAL.filter((c) => c.position === 'MEI' && c.tier !== 'lenda').slice(0, 14);
    const { pool } = buildAuctionPool({ seats: seatsOf(4), deck: REAL, carried, extra: 1, seed: 'cheio' });
    const mei = pool.filter((c) => c.position === 'MEI');
    expect(mei).toHaveLength(15);
    expect(mei.filter((c) => c.tier === 'lenda')).toHaveLength(1);
    // Com uma Lenda entre as herdadas, nada a mais.
    const withLegend = [...carried.slice(0, 12), REAL.find((c) => c.position === 'MEI' && c.tier === 'lenda')!];
    const again = buildAuctionPool({ seats: seatsOf(4), deck: REAL, carried: withLegend, extra: 1, seed: 'cheio' }).pool;
    expect(again.filter((c) => c.position === 'MEI')).toHaveLength(13);
  });

  it('baralho sem Lenda na posição (só Série B): segue sem inventar, com os melhores que existem', () => {
    const deck = deckForScope(REAL, 'B');
    const { pool } = buildAuctionPool({ seats: seatsOf(4), deck, carried: [], extra: 1, seed: 'b' });
    expect(pool.filter((c) => c.position === 'GOL')).toHaveLength(5);
    expect(pool.every((c) => c.series === 'B')).toBe(true);
    expect(pool.filter((c) => c.position === 'ATA' && c.tier === 'lenda')).toHaveLength(1);
  });

  it('cada leva também sai equilibrada e do mesmo tamanho', () => {
    const cards = [
      ...fakeCards('ATA', 21, 'b').map((c) => ({ ...c, tier: 'craque' as const })),
      ...fakeCards('ATA', 20, 'm').map((c) => ({ ...c, tier: 'titular' as const })),
      ...fakeCards('ATA', 20, 'r').map((c) => ({ ...c, tier: 'perna' as const })),
    ];
    const byId = new Map(cards.map((c) => [c.id, c]));
    const levas = balancedLevas(cards, 12, new Rng('levas'));
    expect(levas.map((l) => l.length)).toEqual([11, 10, 10, 10, 10, 10]);
    for (const leva of levas) {
      const b = bands(leva.map((id) => byId.get(id)!));
      expect(Math.max(...Object.values(b)) - Math.min(...Object.values(b))).toBeLessThanOrEqual(1);
    }
    expect(new Set(levas.flat()).size).toBe(61);
  });

  it('baralho fictício também sai equilibrado', () => {
    const seats = seatsOf(4);
    const sizes = lotSizes(seats, 1);
    const { pool } = buildAuctionPool({ seats, deck: DECK, carried: [], extra: 1, seed: 'ficticio' });
    for (const pos of POSITIONS) {
      const b = bands(pool.filter((c) => c.position === pos));
      for (const band of QUALITY_BANDS) expect(b[band], `${pos} ${band}`).toBeGreaterThanOrEqual(Math.floor(sizes[pos] / 3));
    }
  });
});
