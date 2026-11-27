import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAuctionPool } from '../../src/engine/dispute.js';
import { buildClubPackages, PACK_MAX, PACK_MIN, packageLabel, SECTOR_LABEL, SECTOR_NEED } from '../../src/engine/packages.js';
import { AUCTION_FORMATIONS, deckCapacity, deckForScope, FORMATIONS, isPackageMode, legendsDeck, POSITIONS, type Card, type Formation } from '../../src/engine/types.js';
import { CLASSICOS, classicoGroups, classicosForAuction } from '../../src/shared/classicos.js';

/** Leilões “Lendas” (o de jogador só com Lendas e Craques) e “Clássicos” (o de clubes com pacotes de clássicos). */
const root = process.cwd();
const deck = (JSON.parse(readFileSync(join(root, 'data/deck-wikidata.json'), 'utf8')) as { cards: Card[] }).cards;
const national = (JSON.parse(readFileSync(join(root, 'data/deck-selecoes.json'), 'utf8')) as { cards: Card[] }).cards;
const full = [...deck, ...national];
const person = (c: Card) => c.personId ?? c.id;

/** Monta o lote de `n` técnicos (todos na mesma formação) e devolve lote + reserva por posição. */
function poolFor(cards: Card[], n: number, formation: Formation, seed = 's1', legendsFirst = false) {
  const seats = Array.from({ length: n }, () => ({ formation }));
  const { pool, reserve } = buildAuctionPool({ seats, deck: cards, carried: [], extra: 1, extraRatio: 0.5, seed, legendsFirst });
  return { pool, reserve };
}

describe('leilão de lendas', () => {
  it('é leilão de jogador (não de pacotes)', () => {
    expect(isPackageMode('lendas')).toBe(false);
  });

  it('só Lendas e Craques, de todos os clubes, sem cartas de seleção', () => {
    const legends = legendsDeck(full);
    expect(legends.length).toBeGreaterThan(500);
    expect(legends.every((c) => c.tier === 'lenda' || c.tier === 'craque')).toBe(true);
    expect(legends.some((c) => c.series === 'SEL')).toBe(false);
    expect(new Set(legends.map((c) => c.series))).toEqual(new Set(['A', 'B', 'EU']));
  });

  it('aguenta 20 técnicos: cada posição tem o lote cheio, só de Lendas e Craques, com pelo menos uma Lenda', () => {
    const legends = legendsDeck(full);
    expect(deckCapacity(legends)).toBe(20);
    for (const formation of AUCTION_FORMATIONS) {
      const { pool, reserve } = poolFor(legends, 20, formation, 's1', true);
      for (const pos of POSITIONS) {
        const lot = pool.filter((c) => c.position === pos);
        expect(lot.length, `${formation} ${pos}`).toBeGreaterThanOrEqual(20 * FORMATIONS[formation][pos]);
        expect(lot.some((c) => c.tier === 'lenda'), pos).toBe(true);
      }
      expect([...pool, ...reserve].every((c) => c.tier === 'lenda' || c.tier === 'craque')).toBe(true);
      expect(new Set(pool.map(person)).size).toBe(pool.length);
    }
  });

  it('Lendas primeiro: com 4 técnicos o lote é só de Lendas; quando faltam, completa com Craques', () => {
    const legends = legendsDeck(full);
    for (const seed of ['a', 'b', 'c']) {
      const small = poolFor(legends, 4, '4-3-3', seed, true);
      expect(small.pool.every((c) => c.tier === 'lenda'), seed).toBe(true);
    }
    // 20 técnicos: só há umas 19 Lendas laterais para 60 vagas no lote.
    const { pool, reserve } = poolFor(legends, 20, '4-3-3', 'grande', true);
    for (const pos of POSITIONS) {
      const lot = pool.filter((c) => c.position === pos);
      const left = reserve.filter((c) => c.position === pos);
      // Craque no lote só quando nenhuma Lenda da posição ficou de fora.
      if (lot.some((c) => c.tier === 'craque')) expect(left.some((c) => c.tier === 'lenda'), pos).toBe(false);
    }
    const lat = pool.filter((c) => c.position === 'LAT');
    expect(lat.filter((c) => c.tier === 'lenda').length).toBeGreaterThan(10);
    expect(lat.filter((c) => c.tier === 'craque').length).toBeGreaterThan(0);
  });

  it('no leilão de jogador, os terços de força continuam (Lendas não tomam o lote)', () => {
    const { pool } = poolFor(deckForScope(full, 'ALL'), 4, '4-3-3', 'normal');
    const share = pool.filter((c) => c.tier === 'lenda').length / pool.length;
    expect(share).toBeLessThan(0.34);
  });
});

describe('leilão de clássicos', () => {
  const clubsDeck = deckForScope(full, 'ALL');
  const auction = (participants: number, seed: string) =>
    buildClubPackages({ participants, deck: clubsDeck, seed, groups: classicoGroups(classicosForAuction(clubsDeck, seed)) });

  it('é leilão de pacotes; os clubes de cada clássico existem no baralho e os ids não se repetem', () => {
    expect(isPackageMode('classicos')).toBe(true);
    const clubs = new Set(deck.map((c) => c.club));
    for (const c of CLASSICOS) for (const club of c.clubes) expect(clubs.has(club), `${c.nome}: ${club}`).toBe(true);
    expect(new Set(CLASSICOS.map((c) => c.id)).size).toBe(CLASSICOS.length);
  });

  it('cada leilão sorteia 18 clássicos, 9 do Brasil e 9 da Europa, com cada clube em um só', () => {
    const rio = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const picked = classicosForAuction(clubsDeck, seed);
      expect(picked).toHaveLength(18);
      expect(picked.filter((c) => c.regiao === 'BR')).toHaveLength(9);
      const clubs = picked.flatMap((c) => c.clubes);
      expect(new Set(clubs).size, seed).toBe(clubs.length);
      rio.add(picked.find((c) => c.clubes.includes('Flamengo'))!.nome);
    }
    // O sorteio troca a combinação de um leilão para outro.
    expect(rio.size).toBeGreaterThan(1);
    // Baralho sem os clubes (o fictício): nenhum clássico.
    expect(classicosForAuction(clubsDeck.filter((c) => c.series === 'B' && c.club !== 'Sport'), 'x')).toHaveLength(0);
  });

  it('pacote = os jogadores dos dois clubes, juntando o pacote de cada um (até 20), com o nome do clássico', () => {
    const { packages, cards } = auction(4, 's1');
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(packages).toHaveLength(25);
    for (const p of packages) {
      expect(p.mixed, p.id).toBeFalsy();
      const classico = CLASSICOS.find((c) => c.nome === p.club)!;
      expect(classico, p.club).toBeTruthy();
      expect(p.clubs).toEqual([...classico.clubes]);
      expect(p.cardIds.length).toBeGreaterThanOrEqual(PACK_MIN[p.position]);
      expect(p.cardIds.length).toBeLessThanOrEqual(2 * PACK_MAX);
      for (const id of p.cardIds) expect(classico.clubes).toContain(byId.get(id)!.club);
      for (const club of classico.clubes) expect(p.cardIds.filter((id) => byId.get(id)!.club === club).length).toBeLessThanOrEqual(PACK_MAX);
    }
    const fla = packages.find((p) => p.club === 'Fla-Flu');
    if (fla) expect(packageLabel(fla)).toBe(`Fla-Flu · ${SECTOR_LABEL[fla.position].toLowerCase()}`);
    // Ninguém em dois pacotes (Romário no Flamengo e no Vasco aparece uma vez só).
    expect(new Set(cards.map(person)).size).toBe(cards.length);
    // Metade Brasil, metade Europa em cada setor (5 pacotes: 2 e 3).
    for (const pos of POSITIONS) {
      const br = packages.filter((p) => p.position === pos && CLASSICOS.find((c) => c.nome === p.club)!.regiao === 'BR').length;
      expect([2, 3], pos).toContain(br);
    }
  });

  it('não trava: até 15 técnicos só clássicos; acima disso, os pacotes que faltam saem combinados', () => {
    for (const n of [10, 15, 16, 20]) {
      for (const seed of ['a', 'b', 'c']) {
        const { packages, cards } = auction(n, `n${n}${seed}`);
        for (const pos of POSITIONS) {
          const sector = packages.filter((p) => p.position === pos);
          expect(sector, `${n} ${pos}`).toHaveLength(n + 1);
          const mixed = sector.filter((p) => p.mixed).length;
          // Até 15, todo pacote é de clássico. Com mais, a zaga é a primeira a precisar de combinado
          // (Atletiba e Ba-Vi não fecham um pacote de zagueiros), e nunca falta pacote.
          if (n <= 15) expect(mixed, `${n} ${pos}`).toBe(0);
          else expect(mixed, `${n} ${pos}`).toBeLessThanOrEqual(n - 15);
          for (const p of sector) expect(p.cardIds.length).toBeGreaterThanOrEqual(SECTOR_NEED[pos]);
        }
        expect(new Set(cards.map(person)).size).toBe(cards.length);
      }
    }
  });
});
