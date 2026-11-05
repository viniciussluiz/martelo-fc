import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAGUE_BOT_SPREAD, makeLeagueBots } from '../../src/engine/bots.js';
import { Dispute } from '../../src/engine/dispute.js';
import { expectedGoals } from '../../src/engine/match.js';
import { DEFAULT_DISPUTE_CONFIG, type Card } from '../../src/engine/types.js';
import { seat } from './helpers.js';

const REAL: Card[] = JSON.parse(readFileSync(join(__dirname, '../../data/deck-wikidata.json'), 'utf8')).cards;
const mid = (p: { levelMin: number; levelMax: number }) => (p.levelMin + p.levelMax) / 2;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe('placar realista', () => {
  it('times iguais: ~1,3 gol para cada lado; 10 pontos de diferença: favorito faz 2 a 4 vezes mais', () => {
    expect(expectedGoals(80, 80, 0, 0, 0)).toBeCloseTo(1.28, 2);
    const strong = expectedGoals(85, 75, 10, 0, 0);
    const weak = expectedGoals(75, 85, -10, 0, 0);
    expect(strong).toBeLessThan(2.6);
    expect(strong / weak).toBeGreaterThan(2);
    expect(strong / weak).toBeLessThan(4);
  });
});

describe('clubes do jogo na liga', () => {
  it('são calibrados pela média dos elencos do leilão', () => {
    const bots = makeLeagueBots(16, 'calibra', 84);
    const levels = bots.map((b) => mean(b.squad.map(mid)));
    expect(Math.max(...levels)).toBeGreaterThan(84 + LEAGUE_BOT_SPREAD[1] - 4);
    expect(Math.min(...levels)).toBeLessThan(84 + LEAGUE_BOT_SPREAD[0] + 4);
    expect(mean(levels)).toBeGreaterThan(84 - 9);
    expect(mean(levels)).toBeLessThan(84 - 3);
  });

  it('a liga não vira passeio: campeão com saldo e pontos de campeonato de verdade', () => {
    const champs: Array<{ gd: number; pts: number; lost: number }> = [];
    const goals: number[] = [];
    let botTop = 0;
    for (let r = 0; r < 8; r++) {
      const seats = Array.from({ length: 4 }, (_, i) =>
        seat(`cpu:${i + 1}`, { isCpu: true, formation: i % 2 ? '4-4-2' : '4-3-3', cpuStyle: (['agressivo', 'equilibrado', 'poupador'] as const)[i % 3] }),
      );
      const config = { ...DEFAULT_DISPUTE_CONFIG, cupFormat: 'nenhuma' as const };
      const d = Dispute.create({ id: `b${r}`, seed: `liga-${r}`, config, seats, deck: REAL });
      d.runToEnd();
      const table = d.league!.standings();
      champs.push({ gd: table[0]!.goalDiff, pts: table[0]!.points, lost: table[0]!.lost });
      goals.push(mean(Object.values(d.league!.state.results).map((m) => m.homeGoals + m.awayGoals)));
      // Algum clube do jogo entre os 4 primeiros.
      if (table.slice(0, 4).some((row) => !row.teamId.startsWith('cpu:'))) botTop++;
    }
    expect(mean(goals)).toBeGreaterThan(2.3);
    expect(mean(goals)).toBeLessThan(3.3);
    expect(mean(champs.map((c) => c.gd))).toBeLessThan(75);
    expect(mean(champs.map((c) => c.pts))).toBeLessThan(95);
    expect(mean(champs.map((c) => c.lost))).toBeGreaterThan(2);
    expect(botTop).toBeGreaterThanOrEqual(5);
  });
});
