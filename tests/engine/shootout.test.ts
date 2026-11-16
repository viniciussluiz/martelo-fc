import { describe, expect, it } from 'vitest';
import { penaltyShootout, simulateMatch, type PenaltyKick, type TeamSheet } from '../../src/engine/match.js';
import { Rng } from '../../src/engine/rng.js';
import { kickMs, shootoutAt, shootoutMs } from '../../src/shared/shootout.js';

const POS = ['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'] as const;
const sheet = (id: string, level = 85): TeamSheet => ({
  teamId: id,
  name: `Time ${id}`,
  squad: POS.map((position, i) => ({ cardId: `${id}${i}`, name: `${id.toUpperCase()}${i}`, position, levelMin: level - 3 + (i % 3), levelMax: level + 3 + (i % 3) })),
});

/** Confere uma disputa: alternância, placar, e que ela para exatamente quando se decide. */
function check(kicks: PenaltyKick[], home: number, away: number) {
  expect(kicks.length).toBeGreaterThanOrEqual(6);
  kicks.forEach((k, i) => expect(k.side, `cobrança ${i + 1}`).toBe(i % 2 === 0 ? kicks[0]!.side : kicks[1]!.side));
  expect(kicks[0]!.side).not.toBe(kicks[1]!.side);
  const goals = (side: 'home' | 'away', upTo = kicks.length) => kicks.slice(0, upTo).filter((k) => k.side === side && k.outcome === 'gol').length;
  const taken = (side: 'home' | 'away', upTo: number) => kicks.slice(0, upTo).filter((k) => k.side === side).length;
  expect(goals('home')).toBe(home);
  expect(goals('away')).toBe(away);
  expect(home).not.toBe(away);
  const decided = (n: number) => {
    const h = goals('home', n);
    const a = goals('away', n);
    const th = taken('home', n);
    const ta = taken('away', n);
    if (th <= 5 && ta <= 5) return h - a > 5 - ta || a - h > 5 - th;
    return th === ta && h !== a;
  };
  // Não estava decidida antes da última cobrança e está depois dela.
  for (let n = 1; n < kicks.length; n++) expect(decided(n), `decidida cedo demais na cobrança ${n}`).toBe(false);
  expect(decided(kicks.length)).toBe(true);
  for (const k of kicks) expect(k.text).toContain(k.name);
}

describe('disputa de pênaltis cobrança por cobrança', () => {
  it('toda disputa alterna os times, bate com o placar e para quando se decide', () => {
    let alternadas = 0;
    let cedo = 0;
    for (let i = 0; i < 400; i++) {
      const s = penaltyShootout(new Rng(`p${i}`), sheet('a'), sheet('b'));
      check(s.kicks, s.home, s.away);
      if (s.kicks.length > 10) alternadas++;
      if (s.kicks.length < 10) cedo++;
    }
    expect(alternadas).toBeGreaterThan(0);
    expect(cedo).toBeGreaterThan(0);
  });

  it('o batedor escolhido abre a série do time, o goleiro fica por último e expulso não bate', () => {
    const s = penaltyShootout(new Rng('ordem'), sheet('a'), sheet('b'), { home: 'a5' });
    expect(s.kicks.find((k) => k.side === 'home')!.cardId).toBe('a5');
    const firstFive = s.kicks.filter((k) => k.side === 'away').slice(0, 5);
    expect(firstFive.every((k) => k.cardId !== 'b0')).toBe(true);
    // Sem escolha, quem abre é um atacante.
    expect(['b8', 'b9', 'b10']).toContain(firstFive[0]!.cardId);
    for (let i = 0; i < 300; i++) {
      const m = simulateMatch({ id: `K-${i}`, home: sheet('a'), away: sheet('b'), needWinner: true, withEvents: true, rng: new Rng(`jogo${i}`) });
      if (!m.penalties) {
        expect(m.penaltyKicks).toBeUndefined();
        continue;
      }
      check(m.penaltyKicks!, m.penalties.home, m.penalties.away);
      const out = new Set((m.redCards ?? []).map((r) => r.cardId));
      expect(m.penaltyKicks!.every((k) => !out.has(k.cardId))).toBe(true);
      expect(m.events!.at(-1)!.type).toBe('penaltis');
    }
  });

  it('na tela: 1,5 s por cobrança no ritmo normal, mais rápido nas rodadas curtas e nas alternadas longas', () => {
    expect(kickMs(10, 40_000)).toBe(1500);
    expect(kickMs(10, 20_000)).toBeCloseTo(1020, 0);
    expect(kickMs(20, 40_000)).toBe(900);
    expect(shootoutMs(0, 40_000)).toBe(0);
    expect(shootoutMs(10, 40_000)).toBe(19_200);
    expect(shootoutMs(9, 20)).toBeLessThan(15);
    const at = (ms: number) => shootoutAt(10, 40_000, ms);
    expect(at(-1).started).toBe(false);
    expect(at(500)).toMatchObject({ started: true, done: 0, current: null });
    // 1ª cobrança no ar: conta no placar quando a bola chega.
    expect(at(1800 + 300)).toMatchObject({ done: 0, current: 0 });
    expect(at(1800 + 1000)).toMatchObject({ done: 1, current: 0 });
    expect(at(1800 + 15_000 - 1)).toMatchObject({ done: 10, current: 9, over: false });
    expect(at(1800 + 15_000)).toMatchObject({ done: 10, current: null, over: true });
  });
});
