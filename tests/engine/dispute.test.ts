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
