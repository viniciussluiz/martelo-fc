import { describe, expect, it } from 'vitest';
import { makeBotClub, makeContinentalBots } from '../../src/engine/bots.js';
import { Cup } from '../../src/engine/cup.js';
import { computeStandings, doubleRoundRobin, League, type LeagueTeam } from '../../src/engine/league.js';
import { simulateMatch, type MatchResult } from '../../src/engine/match.js';
import { Rng } from '../../src/engine/rng.js';

function teams(n: number, prefix = 't', strength = (i: number) => 70 + (i % 5)): LeagueTeam[] {
  return Array.from({ length: n }, (_, i) => {
    const b = makeBotClub({ id: `${prefix}${i + 1}`, name: `Time ${i + 1}`, seed: `${prefix}${i}`, strength: strength(i) });
    return { teamId: b.teamId, name: b.name, squad: b.squad, participantId: null, human: false };
  });
}

describe('tabela de jogos', () => {
  it('20 times: 38 rodadas, cada par se enfrenta 2× com mando trocado e ninguém joga 2× na rodada', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const rounds = doubleRoundRobin(ids, new Rng('rr'));
    expect(rounds).toHaveLength(38);
    const pairs = new Map<string, number>();
    for (const r of rounds) {
      expect(r).toHaveLength(10);
      const seen = new Set<string>();
      for (const f of r) {
        expect(seen.has(f.homeId) || seen.has(f.awayId)).toBe(false);
        seen.add(f.homeId);
        seen.add(f.awayId);
        pairs.set(`${f.homeId}>${f.awayId}`, (pairs.get(`${f.homeId}>${f.awayId}`) ?? 0) + 1);
      }
    }
    expect(pairs.size).toBe(20 * 19);
    expect([...pairs.values()].every((v) => v === 1)).toBe(true);
  });

  it('número ímpar de times usa folga', () => {
    const rounds = doubleRoundRobin(['a', 'b', 'c'], new Rng('x'));
    expect(rounds).toHaveLength(6);
    expect(rounds.flat()).toHaveLength(6);
  });
});

describe('classificação', () => {
  const t = [
    { teamId: 'a', name: 'A', participantId: null },
    { teamId: 'b', name: 'B', participantId: null },
    { teamId: 'c', name: 'C', participantId: null },
  ];
  const m = (id: string, homeId: string, awayId: string, hg: number, ag: number): MatchResult => ({ id, homeId, awayId, homeGoals: hg, awayGoals: ag, goals: [] });

  it('soma 3/1/0 e ordena por pontos, vitórias, saldo e gols', () => {
    const rows = computeStandings(t, [m('1', 'a', 'b', 2, 0), m('2', 'b', 'c', 1, 1), m('3', 'c', 'a', 3, 3)], ['a', 'b', 'c']);
    expect(rows.map((r) => [r.teamId, r.points, r.goalDiff])).toEqual([
      ['a', 4, 2],
      ['c', 2, 0],
      ['b', 1, -2],
    ]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('empate total usa o sorteio prévio', () => {
    const rows = computeStandings(t, [m('1', 'a', 'b', 1, 1)], ['b', 'a', 'c']);
    expect(rows[0]!.teamId).toBe('b');
  });
});

describe('liga', () => {
  it('joga 38 rodadas e todos fazem 38 jogos', () => {
    const league = League.create(teams(20), 'liga');
    while (!league.done) league.playRound();
    const table = league.standings();
    expect(table).toHaveLength(20);
    expect(table.every((r) => r.played === 38)).toBe(true);
    const totalPoints = table.reduce((s, r) => s + r.points, 0);
    const draws = Object.values(league.state.results).filter((r) => r.homeGoals === r.awayGoals).length;
    expect(totalPoints).toBe(380 * 3 - draws);
    expect(league.topScorers(3)[0]!.goals).toBeGreaterThan(0);
  });
});

describe('partidas', () => {
  it('time mais forte vence mais vezes', () => {
    const strong = makeBotClub({ id: 's', name: 'Forte', seed: 'f', strength: 90 });
    const weak = makeBotClub({ id: 'w', name: 'Fraco', seed: 'w', strength: 60 });
    let strongWins = 0;
    for (let i = 0; i < 300; i++) {
      const r = simulateMatch({ id: `m${i}`, home: strong, away: weak, rng: new Rng(`m${i}`) });
      if (r.homeGoals > r.awayGoals) strongWins++;
    }
    expect(strongWins / 300).toBeGreaterThan(0.7);
  });

  it('tática de ataque gera mais gols que retranca', () => {
    const a = makeBotClub({ id: 'a', name: 'A', seed: 'a', strength: 75 });
    const b = makeBotClub({ id: 'b', name: 'B', seed: 'b', strength: 75 });
    let attack = 0;
    let defense = 0;
    for (let i = 0; i < 400; i++) {
      const r1 = simulateMatch({ id: `x${i}`, home: a, away: b, homeTactic: 'ataque', awayTactic: 'ataque', rng: new Rng(`x${i}`) });
      const r2 = simulateMatch({ id: `y${i}`, home: a, away: b, homeTactic: 'retranca', awayTactic: 'retranca', rng: new Rng(`x${i}`) });
      attack += r1.homeGoals + r1.awayGoals;
      defense += r2.homeGoals + r2.awayGoals;
    }
    expect(attack).toBeGreaterThan(defense * 1.2);
  });

  it('jogo eliminatório único sempre tem vencedor (pênaltis)', () => {
    const a = makeBotClub({ id: 'a', name: 'A', seed: 'a', strength: 75 });
    for (let i = 0; i < 200; i++) {
      const r = simulateMatch({ id: `p${i}`, home: a, away: a, needWinner: true, withEvents: true, rng: new Rng(`p${i}`) });
      if (r.homeGoals === r.awayGoals) {
        expect(r.penalties).toBeDefined();
        expect(r.penalties!.home).not.toBe(r.penalties!.away);
      }
      expect(r.goals).toHaveLength(r.homeGoals + r.awayGoals);
      expect(r.events!.at(0)!.type).toBe('apito');
    }
  });
});

describe('Copa dos 8', () => {
  it('cruza 1×8, 4×5, 2×7, 3×6; ida e volta; final em jogo único', () => {
    const q = teams(8, 'q');
    const cup = Cup.create('copa8', q, [], 'c8');
    const qf = cup.state.ties.filter((t) => t.stage === 'quartas');
    expect(qf.map((t) => [t.bId, t.aId])).toEqual([
      ['q1', 'q8'],
      ['q4', 'q5'],
      ['q2', 'q7'],
      ['q3', 'q6'],
    ]);
    expect(qf.every((t) => t.twoLegs)).toBe(true);
    let days = 0;
    while (!cup.done) {
      cup.playNextMatchday();
      days++;
    }
    expect(days).toBe(5); // 2 quartas + 2 semi + 1 final
    const final = cup.state.ties.find((t) => t.stage === 'final')!;
    expect(final.twoLegs).toBe(false);
    expect(cup.state.championId).toBe(final.winnerId);
    expect(cup.state.reached[cup.state.championId!]).toBe('campeao');
    expect(cup.state.reached[cup.state.runnerUpId!]).toBe('final');
    // Todo confronto de ida e volta tem vencedor coerente com agregado/pênaltis.
    for (const t of cup.state.ties.filter((x) => x.twoLegs)) {
      const { a, b } = t.aggregate!;
      if (a !== b) expect(t.winnerId).toBe(a > b ? t.aId : t.bId);
      else expect(t.penalties).toBeDefined();
    }
  });
});

describe('copas com grupos', () => {
  it('Taça Continental: 32 times, 8 grupos, 6 rodadas de grupo e mata-mata de ida e volta', () => {
    const q = teams(8, 'q');
    const extras = makeContinentalBots(24, 'lib').map((b) => ({ teamId: b.teamId, name: b.name, squad: b.squad, participantId: null, human: false }));
    const cup = Cup.create('libertadores', q, extras, 'lib');
    expect(cup.state.groups).toHaveLength(8);
    expect(cup.state.groups.every((g) => g.teamIds.length === 4)).toBe(true);
    // Cada grupo tem exatamente um time vindo da liga.
    expect(cup.state.groups.map((g) => g.teamIds[0])).toEqual(q.map((t) => t.teamId));
    let days = 0;
    while (!cup.done) {
      cup.playNextMatchday();
      days++;
    }
    expect(days).toBe(6 + 2 + 2 + 2 + 1);
    expect(cup.state.ties.filter((t) => t.stage === 'oitavas')).toHaveLength(8);
    expect(cup.state.championId).toBeTruthy();
  });

  it('Torneio Mundial: grupos em turno único e mata-mata em jogo único', () => {
    const q = teams(8, 'q');
    const extras = makeContinentalBots(24, 'mun').map((b) => ({ teamId: b.teamId, name: b.name, squad: b.squad, participantId: null, human: false }));
    const cup = Cup.create('mundial', q, extras, 'mun');
    let days = 0;
    while (!cup.done) {
      cup.playNextMatchday();
      days++;
    }
    expect(days).toBe(3 + 1 + 1 + 1 + 1);
    expect(cup.state.ties.every((t) => !t.twoLegs)).toBe(true);
  });
});
