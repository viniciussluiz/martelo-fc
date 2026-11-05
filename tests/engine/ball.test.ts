import { describe, expect, it } from 'vitest';
import type { MatchView } from '../../src/shared/protocol.js';
import { ballAt, ballState, ballTrail, buildTimeline, matchMinute, type Key } from '../../src/web/lib/ball.js';

const match = (events: MatchView['events'], id = 'L-1-1'): MatchView => {
  const goals = (events ?? []).filter((e) => e.type === 'gol').map((e) => ({ side: e.side!, cardId: 'x', name: 'Fulano', minute: e.minute }));
  return {
    id,
    homeId: 'a',
    awayId: 'b',
    homeName: 'Casa',
    awayName: 'Fora',
    homeGoals: goals.filter((g) => g.side === 'home').length,
    awayGoals: goals.filter((g) => g.side === 'away').length,
    goals,
    events,
  };
};

const EVENTS: MatchView['events'] = [
  { minute: 0, type: 'apito', side: null, text: '' },
  { minute: 12, type: 'chance', side: 'away', text: '' },
  { minute: 30, type: 'gol', side: 'home', text: '' },
  { minute: 31, type: 'gol', side: 'away', text: '' },
  { minute: 55, type: 'trave', side: 'home', text: '' },
  { minute: 70, type: 'defesa', side: 'away', text: '' },
  { minute: 88, type: 'gol', side: 'away', text: '' },
  { minute: 90, type: 'fim', side: null, text: '' },
];

describe('bola do jogo ao vivo', () => {
  it('entra no gol certo no minuto de cada gol (mandante ataca para a direita)', () => {
    const tl = buildTimeline(match(EVENTS));
    expect(tl.goals.map((g) => g.side)).toEqual(['home', 'away', 'away']);
    for (const g of tl.goals) {
      const p = ballAt(tl.keys, g.t + 0.01);
      if (g.side === 'home') expect(p.x).toBeGreaterThan(1);
      else expect(p.x).toBeLessThan(0);
      expect(p.y).toBeGreaterThan(0.44);
      expect(p.y).toBeLessThan(0.56);
    }
    // O gol na tela nunca vem antes do minuto do lance, e dois gols seguidos não se atropelam.
    tl.goals.forEach((g, i) => expect(g.t).toBeGreaterThanOrEqual([30, 31, 88][i]!));
    expect(tl.goals[1]!.t).toBeGreaterThan(tl.goals[0]!.t + 1.5);
    // No ritmo normal, cada lance aparece no máximo poucos minutos depois do minuto narrado.
    tl.moments.forEach((t, i) => expect(t - EVENTS![i]!.minute).toBeLessThanOrEqual(4));
  });

  it('trajeto contínuo, dentro do campo fora dos lances, e igual para todo mundo', () => {
    const a = buildTimeline(match(EVENTS));
    const b = buildTimeline(match(EVENTS));
    expect(a).toEqual(b);
    for (let i = 1; i < a.keys.length; i++) expect(a.keys[i]!.t).toBeGreaterThan(a.keys[i - 1]!.t);
    for (let t = 0; t <= 90; t += 0.5) {
      const p = ballAt(a.keys, t);
      expect(p.x).toBeGreaterThanOrEqual(-0.04);
      expect(p.x).toBeLessThanOrEqual(1.04);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    expect(buildTimeline(match(EVENTS, 'outro')).keys).not.toEqual(a.keys);
  });

  it('jogo sem narração usa só os gols; o relógio vai de 0 a 90', () => {
    const m = { ...match(EVENTS), events: undefined };
    expect(buildTimeline(m).goals).toHaveLength(3);
    expect(matchMinute(1000, 1000, 17_000)).toBe(0);
    expect(matchMinute(9500, 1000, 17_000)).toBeCloseTo(45);
    expect(matchMinute(99_000, 1000, 17_000)).toBe(90);
  });

  it('bola longa sobe e chute vai rasteiro; o toque marca onde a bola saiu', () => {
    const keys: Key[] = [
      { t: 0, x: 0.2, y: 0.5 },
      { t: 2, x: 0.75, y: 0.2 }, // lançamento de ~65 m
      { t: 3, x: 0.8, y: 0.25 }, // domínio curto
      { t: 4, x: 1.03, y: 0.5, shot: true }, // chute
    ];
    const longPass = ballState(keys, 1);
    expect(longPass.h).toBeGreaterThan(0.8);
    expect(longPass.kick).toEqual({ t: 0, x: 0.2, y: 0.5 });
    expect(ballState(keys, 2.5).h).toBe(0);
    const shot = ballState(keys, 3.5);
    expect(shot.shot).toBe(true);
    expect(shot.h).toBeLessThan(0.15);
    // Chutada, a bola anda mais no começo do trecho do que no fim (perde velocidade).
    const p1 = ballAt(keys, 0.5).x - 0.2;
    const p2 = ballAt(keys, 2).x - ballAt(keys, 1.5).x;
    expect(p1).toBeGreaterThan(p2);
  });

  it('o rastro não atravessa o campo quando a bola reaparece no meio', () => {
    const keys: Key[] = [
      { t: 0, x: 0.5, y: 0.5 },
      { t: 1, x: 1.03, y: 0.5, shot: true },
      { t: 2, x: 1.03, y: 0.5 },
      { t: 2.5, x: 0.5, y: 0.5, jump: true },
      { t: 4, x: 0.6, y: 0.4 },
    ];
    const pts = ballTrail(keys, 2.6, 1, 10);
    for (const p of pts) expect(p.x).toBeLessThan(0.7);
    const before = ballTrail(keys, 1.2, 0.5, 5);
    expect(before[0]!.x).toBeGreaterThan(1);
    expect(before[5]!.x).toBeLessThan(before[0]!.x);
  });
});

