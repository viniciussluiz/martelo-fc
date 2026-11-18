import { describe, expect, it } from 'vitest';
import { Dispute } from '../../src/engine/dispute.js';
import { DEFAULT_DISPUTE_CONFIG, type CupFormat } from '../../src/engine/types.js';
import { DECK, seat } from './helpers.js';

function makeDispute(id: string, cupFormat: CupFormat = 'copa8', carried = [] as typeof DECK) {
  return Dispute.create({
    id,
    seed: id,
    config: { ...DEFAULT_DISPUTE_CONFIG, cupFormat },
    seats: [
      seat('u:ana'),
      seat('u:beto', { formation: '4-4-2' }),
      seat('cpu:1', { isCpu: true, cpuStyle: 'agressivo' }),
      seat('cpu:2', { isCpu: true, cpuStyle: 'poupador', formation: '4-4-2' }),
    ],
    deck: DECK,
    carried,
  });
}

describe('disputa completa', () => {
  it.each(['copa8', 'libertadores', 'mundial', 'nenhuma'] as CupFormat[])('formato %s: leilão → cerimônia → liga → copa → resultado', (format) => {
    const d = makeDispute(`d-${format}`, format);
    expect(d.phase).toBe('auction');
    const result = d.runToEnd();
    expect(d.phase).toBe('finished');
    expect(result.leagueTable).toHaveLength(20);
    expect(result.outcomes).toHaveLength(4);
    expect(result.outcomes.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
    // Títulos coerentes com a tabela e com a copa.
    const leagueChamp = result.outcomes.find((o) => o.titles.includes('liga'));
    if (leagueChamp) expect(result.leagueChampionTeamId).toBe(leagueChamp.participantId);
    if (format === 'nenhuma') {
      expect(result.cupChampionTeamId).toBeNull();
      expect(result.outcomes.every((o) => o.cupReach === null)).toBe(true);
    } else {
      expect(result.cupChampionTeamId).toBeTruthy();
    }
    // Confrontos diretos entre participantes: 2 por par na liga (4 participantes → 12).
    expect(result.directMatches.filter((m) => m.competition === 'liga')).toHaveLength(12);
    expect(d.state.awards!.length).toBeGreaterThan(2);
  });

  it.each([1, 4, 9, 20])('só Libertadores com %i técnico(s): sem liga, todos na fase de grupos', (n) => {
    const seats = Array.from({ length: n }, (_, i) => seat(i === 0 ? 'u:ana' : `cpu:${i}`, { isCpu: i > 0, formation: i % 2 ? '4-4-2' : '4-3-3' }));
    const d = Dispute.create({
      id: `so-liberta-${n}`,
      seed: `so-liberta-${n}`,
      config: { ...DEFAULT_DISPUTE_CONFIG, cupFormat: 'libertadores', skipLeague: true },
      seats,
      deck: DECK,
    });
    while (d.phase === 'auction') d.tick();
    expect(d.phase).toBe('ceremony');
    d.tick();
    expect(d.phase).toBe('cup');
    expect(d.league).toBeNull();
    const groups = d.cup!.state.groups;
    expect(groups).toHaveLength(8);
    expect(groups.every((g) => g.teamIds.length === 4)).toBe(true);
    const inGroups = groups.flatMap((g) => g.teamIds);
    expect(new Set(inGroups).size).toBe(32);
    for (const s of seats) expect(inGroups).toContain(s.id);
    // Técnicos espalhados: nenhum grupo com mais técnicos que o necessário.
    const perGroup = groups.map((g) => g.teamIds.filter((id) => seats.some((s) => s.id === id)).length);
    expect(Math.max(...perGroup) - Math.min(...perGroup)).toBeLessThanOrEqual(1);

    const result = d.runToEnd();
    expect(result.leagueChampionTeamId).toBeNull();
    expect(result.leagueTable).toEqual([]);
    expect(result.cupName).toBe('Taça Libertadores');
    expect(result.cupChampionTeamId).toBeTruthy();
    expect(result.headline).toContain('Taça Libertadores');
    expect(result.outcomes).toHaveLength(n);
    expect(result.outcomes.map((o) => o.rank)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(result.outcomes.every((o) => o.cupReach !== null && !o.titles.includes('liga'))).toBe(true);
    expect(result.directMatches.every((m) => m.competition === 'copa')).toBe(true);
    // A posição é a colocação geral na copa: quem foi mais longe fica na frente, sem empate.
    const positions = result.outcomes.map((o) => o.leaguePosition);
    expect(new Set(positions).size).toBe(n);
    expect(positions.every((p) => p >= 1 && p <= 32)).toBe(true);
    const champion = result.outcomes.find((o) => o.titles.includes('copa'));
    if (champion) expect(champion.leaguePosition).toBe(1);
  });

  it('“sem liga” não vale na Copa dos 8: a liga acontece normalmente', () => {
    const d = Dispute.create({ id: 'c8', seed: 'c8', config: { ...DEFAULT_DISPUTE_CONFIG, cupFormat: 'copa8', skipLeague: true }, seats: [seat('u:ana'), seat('cpu:1', { isCpu: true })], deck: DECK });
    expect(d.runToEnd().leagueTable).toHaveLength(20);
  });

  it('a disputa é restaurável a partir do snapshot em qualquer fase', () => {
    const a = makeDispute('snap');
    const b = makeDispute('snap');
    for (let i = 0; i < 60; i++) {
      a.tick();
      b.tick();
    }
    const restored = Dispute.fromJSON(JSON.parse(JSON.stringify(b.toJSON())));
    const ra = a.runToEnd();
    const rb = restored.runToEnd();
    expect(rb.leagueTable).toEqual(ra.leagueTable);
    expect(rb.outcomes).toEqual(ra.outcomes);
  });

  it('táticas são validadas', () => {
    const d = makeDispute('tat');
    expect(() => d.setTactic('u:ana', 'xyz' as never)).toThrow(/Tática inválida/);
    expect(() => d.setTactic('u:ninguem', 'ataque')).toThrow();
    d.setTactic('u:ana', 'ataque');
    expect(d.state.tactics['u:ana']).toBe('ataque');
  });
});

describe('continuidade: novo ciclo reaproveita os jogadores', () => {
  it('todas as cartas adquiridas no ciclo anterior voltam ao leilão do novo ciclo', () => {
    const first = makeDispute('ciclo-1');
    first.runToEnd();
    const acquired = first.acquiredCards();
    expect(acquired.length).toBe(44);
    const second = makeDispute('ciclo-2', 'copa8', acquired);
    const poolIds = new Set(Object.values(second.auction.state.levas).flat(2));
    for (const c of acquired) expect(poolIds.has(c.id)).toBe(true);
    expect(second.state.carriedCardIds).toHaveLength(44);
    // Dados operacionais zerados: moedas cheias e elencos vazios.
    expect(second.participants.every((p) => p.coins === 100 && p.roster.length === 0)).toBe(true);
    second.runToEnd();
  });

  it('com menos técnicos no novo ciclo, o lote cresce para caber todas as herdadas', () => {
    const first = makeDispute('ciclo-a');
    first.runToEnd();
    const acquired = first.acquiredCards();
    const second = Dispute.create({
      id: 'ciclo-b',
      seed: 'ciclo-b',
      config: DEFAULT_DISPUTE_CONFIG,
      seats: [seat('u:ana'), seat('cpu:1', { isCpu: true })],
      deck: DECK,
      carried: acquired,
    });
    const meis = second.auction.state.levas.MEI.flat();
    expect(meis.length).toBe(acquired.filter((c) => c.position === 'MEI').length);
    const res = second.runToEnd();
    expect(res.outcomes).toHaveLength(2);
  });

  it('política configurável: sem reaproveitamento o pool vem só do baralho', () => {
    const first = makeDispute('ciclo-x');
    first.runToEnd();
    const second = Dispute.create({
      id: 'ciclo-y',
      seed: 'ciclo-y',
      config: { ...DEFAULT_DISPUTE_CONFIG, carryOverPreviousCycle: false },
      seats: [seat('u:ana'), seat('cpu:1', { isCpu: true })],
      deck: DECK,
      carried: first.acquiredCards(),
    });
    expect(second.state.carriedCardIds).toHaveLength(0);
  });
});
