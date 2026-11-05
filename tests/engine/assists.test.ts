import { describe, expect, it } from 'vitest';
import { makeBotClub } from '../../src/engine/bots.js';
import { aggregateAssists, aggregateScorers, playerStats } from '../../src/engine/league.js';
import { ASSIST_RATE, simulateMatch, type MatchResult } from '../../src/engine/match.js';
import { Rng } from '../../src/engine/rng.js';

const home = makeBotClub({ id: 'h', name: 'Mandante', seed: 'h', strength: 78 });
const away = makeBotClub({ id: 'a', name: 'Visitante', seed: 'a', strength: 76 });

function play(n: number): MatchResult[] {
  return Array.from({ length: n }, (_, i) => simulateMatch({ id: `j${i}`, home, away, withEvents: true, rng: new Rng(`j${i}`) }));
}

describe('assistências', () => {
  const results = play(400);
  const goals = results.flatMap((r) => r.goals.map((g) => ({ g, r })));

  it('quem dá o passe é do mesmo time e nunca é o próprio goleador', () => {
    expect(goals.length).toBeGreaterThan(500);
    for (const { g } of goals) {
      if (!g.assistCardId) continue;
      expect(g.assistCardId).not.toBe(g.cardId);
      const team = g.side === 'home' ? home : away;
      expect(team.squad.some((p) => p.cardId === g.assistCardId && p.name === g.assistName)).toBe(true);
    }
  });

  it('cerca de 7 em cada 10 gols têm assistência, mais de meias e laterais que de goleiros', () => {
    const withAssist = goals.filter(({ g }) => g.assistCardId);
    const rate = withAssist.length / goals.length;
    expect(rate).toBeGreaterThan(ASSIST_RATE - 0.08);
    expect(rate).toBeLessThan(ASSIST_RATE + 0.08);
    const pos = (id: string) => [...home.squad, ...away.squad].find((p) => p.cardId === id)!.position;
    const byPos = (p: string) => withAssist.filter(({ g }) => pos(g.assistCardId!) === p).length;
    expect(byPos('MEI')).toBeGreaterThan(byPos('GOL'));
    expect(byPos('LAT')).toBeGreaterThan(byPos('GOL'));
  });

  it('não mexe no placar: o mesmo jogo repete placar, goleadores e passes', () => {
    const again = play(40);
    expect(again).toEqual(results.slice(0, 40));
  });

  it('a narração do gol cita o passe', () => {
    const r = results.find((x) => x.goals.some((g) => g.assistName))!;
    const g = r.goals.find((x) => x.assistName)!;
    expect(r.events!.some((e) => e.type === 'gol' && e.text.includes(`Assistência de ${g.assistName}`))).toBe(true);
  });

  it('garçons e estatísticas por jogador somam o mesmo que os gols', () => {
    const top = aggregateAssists(results, 50);
    const total = goals.filter(({ g }) => g.assistCardId).length;
    expect(top.reduce((n, x) => n + x.assists, 0)).toBe(total);
    expect(top[0]!.assists).toBeGreaterThanOrEqual(top[1]!.assists);
    const stats = playerStats(results, new Set(['h']));
    expect(Object.keys(stats)).toEqual(['h']);
    const homeGoals = results.reduce((n, r) => n + r.homeGoals, 0);
    expect(Object.values(stats.h!).reduce((n, [g]) => n + g, 0)).toBe(homeGoals);
    expect(aggregateScorers(results, 3)[0]!.goals).toBeGreaterThan(0);
  });
});
