import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDeck } from '../../src/engine/deck-generator.js';
import { Dispute } from '../../src/engine/dispute.js';
import { PACK_MIN } from '../../src/engine/packages.js';
import { DEFAULT_AUCTION_CONFIG, DEFAULT_DISPUTE_CONFIG, deckForScope, isPackageMode, nationalDeck, POSITIONS, type Card } from '../../src/engine/types.js';
import { NATIONAL_TEAMS, nationalTeam } from '../../src/shared/selecoes.js';
import { clubCode } from '../../src/shared/clubs.js';
import { clubGroup, clubRef } from '../../src/tools/escudos/clubs.js';
import { isNationalSide, pickTsdbTeam } from '../../src/tools/escudos/sync.js';
import { buildNationalDeck, NATIONAL_MIN, NATIONAL_QUOTA } from '../../src/tools/wikidata/national.js';
import type { RawDump } from '../../src/tools/wikidata/types.js';
import { seat } from './helpers.js';

const root = process.cwd();
const clubs = (JSON.parse(readFileSync(join(root, 'data/deck-wikidata.json'), 'utf8')) as { cards: Card[] }).cards;
const national = (JSON.parse(readFileSync(join(root, 'data/deck-selecoes.json'), 'utf8')) as { cards: Card[] }).cards;

describe('baralho de seleções', () => {
  it('só cartas de seleção, uma por jogador, com todos os setores fechados em cada seleção', () => {
    validateDeck(national);
    expect(national.every((c) => c.series === 'SEL')).toBe(true);
    expect(new Set(national.map((c) => c.personId)).size).toBe(national.length);
    const teams = [...new Set(national.map((c) => c.club))];
    expect(teams.length).toBeGreaterThanOrEqual(12);
    expect(teams).toEqual(expect.arrayContaining(['Brasil', 'Argentina', 'Alemanha', 'Itália', 'França', 'Espanha', 'Inglaterra', 'Holanda', 'Portugal', 'Uruguai']));
    for (const team of teams) {
      expect(nationalTeam(team)).toBeTruthy();
      for (const pos of POSITIONS) {
        const n = national.filter((c) => c.club === team && c.position === pos).length;
        expect(n).toBeGreaterThanOrEqual(NATIONAL_MIN[pos]);
        expect(n).toBeGreaterThanOrEqual(PACK_MIN[pos]);
        expect(n).toBeLessThanOrEqual(NATIONAL_QUOTA[pos]);
      }
    }
  });

  it('pente-fino: os craques estão na seleção certa e ninguém joga pelo país errado', () => {
    const at = (name: string) => national.find((c) => c.name === name);
    expect(at('Pelé')).toMatchObject({ club: 'Brasil', position: 'ATA', tier: 'lenda' });
    expect(at('Lionel Messi')).toMatchObject({ club: 'Argentina', tier: 'lenda' });
    expect(at('Cristiano Ronaldo')).toMatchObject({ club: 'Portugal', tier: 'lenda' });
    expect(at('Zinédine Zidane')).toMatchObject({ club: 'França' });
    expect(at('Luka Modrić')).toMatchObject({ club: 'Croácia' });
    expect(at('Ivan Rakitić')?.club).toBe('Croácia');
    expect(at('Achraf Hakimi')).toBeUndefined();
    expect(at('Kalidou Koulibaly')).toBeUndefined();
    expect(national.filter((c) => c.name === 'Marcelo Vieira' && c.club === 'Espanha')).toHaveLength(0);
    // Seleção forte tem mais Lendas que seleção média.
    const legends = (team: string) => national.filter((c) => c.club === team && c.tier === 'lenda').length;
    expect(legends('Brasil')).toBeGreaterThan(legends('Irlanda'));
  });

  it('o arquivo é o que o gerador produz hoje (npm run deck:selecoes)', () => {
    const raw = JSON.parse(readFileSync(join(root, 'data/wikidata-raw.json'), 'utf8')) as RawDump;
    const { cards, report } = buildNationalDeck(raw, clubs, 2026);
    expect(cards).toEqual(national);
    expect(report.teams.length).toBe(new Set(national.map((c) => c.club)).size);
  });

  it('as cartas de seleção ficam fora dos leilões de jogador e de clubes', () => {
    const all = [...clubs, ...national];
    expect(deckForScope(all, 'ALL').some((c) => c.series === 'SEL')).toBe(false);
    expect(deckForScope(all, 'EU').some((c) => c.series === 'SEL')).toBe(false);
    expect(nationalDeck(all)).toHaveLength(national.length);
    expect(isPackageMode('selecoes')).toBe(true);
    expect(isPackageMode('clubes')).toBe(true);
    expect(isPackageMode('jogador')).toBe(false);
  });

  it('leilão de seleções: pacotes por seleção e setor, e a disputa vai até o fim', () => {
    const d = Dispute.create({
      id: 'sel-1',
      seed: 'sel-1',
      config: { ...DEFAULT_DISPUTE_CONFIG, cupFormat: 'copa8', carryOverPreviousCycle: false, auction: { ...DEFAULT_AUCTION_CONFIG, mode: 'selecoes', mysteryChance: 0 } },
      seats: [seat('u:ana'), seat('u:beto', { formation: '4-4-2' }), seat('cpu:1', { isCpu: true, cpuStyle: 'agressivo' }), seat('cpu:2', { isCpu: true, cpuStyle: 'poupador' })],
      deck: nationalDeck([...clubs, ...national]),
    });
    expect(d.auction.isClubs).toBe(true);
    expect(d.auction.state.mode).toBe('selecoes');
    const packages = Object.values(d.auction.state.packages!);
    // 4 técnicos → 5 pacotes por setor, cada um de uma seleção.
    for (const pos of POSITIONS) {
      const sector = packages.filter((p) => p.position === pos);
      expect(sector).toHaveLength(5);
      for (const p of sector) {
        expect(p.mixed).toBeFalsy();
        expect(nationalTeam(p.club)).toBeTruthy();
        expect(p.cardIds.every((id) => d.cards[id]!.club === p.club && d.cards[id]!.series === 'SEL')).toBe(true);
      }
    }
    const result = d.runToEnd();
    expect(result.outcomes).toHaveLength(4);
    for (const p of d.participants) expect(p.roster.every((r) => d.cards[r.cardId]!.series === 'SEL')).toBe(true);
  });

  it('escudos: seleção tem sigla e é buscada no TheSportsDB pelo nome, só entre seleções', () => {
    expect(clubCode('Brasil')).toBe('BRA');
    expect(clubGroup('Brasil')).toBe('SEL');
    expect(clubGroup('Flamengo')).toBe('BR');
    expect(clubRef('Holanda').tsdb).toContain('Netherlands');
    expect(new Set(NATIONAL_TEAMS.map((t) => t.code)).size).toBe(NATIONAL_TEAMS.length);
    const brazil = { strTeam: 'Brazil', strTeamAlternate: 'Brasil', strSport: 'Soccer', strLeague: 'FIFA World Cup', strLeague2: 'Copa America', strBadge: 'x' };
    const club = { strTeam: 'Brazil', strTeamAlternate: '', strSport: 'Soccer', strLeague: 'Some Amateur League', strBadge: 'x' };
    expect(isNationalSide(brazil)).toBe(true);
    expect(isNationalSide(club)).toBe(false);
    expect(pickTsdbTeam('Brasil', [brazil])).toBe(brazil);
  });
});
