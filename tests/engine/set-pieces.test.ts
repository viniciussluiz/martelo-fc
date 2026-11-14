import { describe, expect, it } from 'vitest';
import { makeBotClub } from '../../src/engine/bots.js';
import { Dispute } from '../../src/engine/dispute.js';
import { GameRuleError } from '../../src/engine/errors.js';
import { defaultTakers, freeKickChance, penaltyChance, RED_CARD_CHANCE, resolveTakers, simulateMatch, type MatchResult } from '../../src/engine/match.js';
import { Rng } from '../../src/engine/rng.js';
import { DEFAULT_DISPUTE_CONFIG } from '../../src/engine/types.js';
import { DECK, seat } from './helpers.js';

const home = makeBotClub({ id: 'h', name: 'Mandante', seed: 'h', strength: 78 });
const away = makeBotClub({ id: 'a', name: 'Visitante', seed: 'a', strength: 78 });

const N = 3000;
const results: MatchResult[] = Array.from({ length: N }, (_, i) =>
  simulateMatch({ id: `bp${i}`, home, away, neutral: true, withEvents: true, rng: new Rng(`bp${i}`) }),
);
const events = results.flatMap((r) => r.events ?? []);
const of = (kind: string) => events.filter((e) => e.setPiece === kind);
const goalsOf = (kind: string) => of(kind).filter((e) => e.type === 'gol').length;

describe('bola parada', () => {
  it('pênalti é raro e quase sempre vira gol', () => {
    const pens = of('penalti');
    const perMatch = pens.length / N;
    expect(perMatch).toBeGreaterThan(0.12);
    expect(perMatch).toBeLessThan(0.35);
    const rate = goalsOf('penalti') / pens.length;
    expect(rate).toBeGreaterThan(0.7);
    expect(rate).toBeLessThan(0.88);
    for (const r of [40, 60, 78, 90, 99]) expect(penaltyChance(r)).toBeGreaterThan(0.6);
  });

  it('falta na entrada da área aparece bem mais que pênalti e entra perto de 30% das vezes', () => {
    const fks = of('falta');
    expect(fks.length).toBeGreaterThan(of('penalti').length * 3);
    const rate = goalsOf('falta') / fks.length;
    expect(rate).toBeGreaterThan(0.24);
    expect(rate).toBeLessThan(0.36);
    for (const r of [40, 60, 78, 90, 99]) {
      expect(freeKickChance(r)).toBeGreaterThanOrEqual(0.2);
      expect(freeKickChance(r)).toBeLessThanOrEqual(0.4);
    }
  });

  it('todo jogo narrado tem escanteio; parte dos gols sai deles, com assistência de quem cobrou', () => {
    for (const r of results.slice(0, 200)) expect(r.events!.some((e) => e.setPiece === 'escanteio')).toBe(true);
    const cornerGoals = results.flatMap((r) => r.goals.filter((g) => g.kind === 'escanteio').map((g) => ({ g, r })));
    const all = results.reduce((n, r) => n + r.goals.length, 0);
    expect(cornerGoals.length / all).toBeGreaterThan(0.06);
    expect(cornerGoals.length / all).toBeLessThan(0.2);
    const takers = { home: defaultTakers(home.squad).escanteio, away: defaultTakers(away.squad).escanteio };
    for (const { g, r } of cornerGoals) {
      expect(g.cardId).not.toBe(takers[g.side]);
      // Se o cobrador já tinha sido expulso, o gol fica sem assistência.
      const sentOff = r.redCards?.some((c) => c.side === g.side && c.cardId === takers[g.side] && g.minute >= c.minute);
      expect(g.assistCardId).toBe(sentOff ? undefined : takers[g.side]);
    }
  });

  it('a média de gols continua a de sempre (≈ 2,6 por jogo entre times iguais em campo neutro)', () => {
    const mean = results.reduce((n, r) => n + r.homeGoals + r.awayGoals, 0) / N;
    expect(mean).toBeGreaterThan(2.3);
    expect(mean).toBeLessThan(2.9);
  });

  it('o placar não depende da narração e bate com os gols', () => {
    for (let i = 0; i < 60; i++) {
      const quiet = simulateMatch({ id: `bp${i}`, home, away, neutral: true, rng: new Rng(`bp${i}`) });
      const loud = results[i]!;
      expect(quiet.goals).toEqual(loud.goals);
      expect(quiet.events).toBeUndefined();
      expect(loud.events!.filter((e) => e.type === 'gol')).toHaveLength(loud.goals.length);
      expect(loud.goals.filter((g) => g.side === 'home')).toHaveLength(loud.homeGoals);
    }
  });

  it('quem o técnico escolhe é quem bate; escolha de fora do elenco é ignorada', () => {
    const pen = home.squad.find((p) => p.position === 'ZAG')!.cardId;
    const fk = home.squad.find((p) => p.position === 'LAT')!.cardId;
    const chosen = { penalti: pen, falta: fk, escanteio: 'nao-existe' };
    expect(resolveTakers(home.squad, chosen)).toEqual({ penalti: pen, falta: fk, escanteio: defaultTakers(home.squad).escanteio });
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      const r = simulateMatch({ id: `tk${i}`, home, away, homeTakers: chosen, withEvents: true, rng: new Rng(`tk${i}`) });
      for (const e of r.events!) {
        if (e.side !== 'home') continue;
        if (e.setPiece === 'penalti') expect(e.cardId).toBe(pen);
        if (e.setPiece === 'falta') expect(e.cardId).toBe(fk);
        if (e.setPiece === 'penalti' || e.setPiece === 'falta') seen++;
      }
      for (const g of r.goals) {
        if (g.side === 'home' && g.kind === 'penalti') expect(g.cardId).toBe(pen);
        if (g.kind === 'penalti' || g.kind === 'falta') expect(g.assistCardId).toBeUndefined();
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('batedores na disputa: só depois do leilão, só jogadores do próprio time, e valem nos jogos', () => {
    const d = Dispute.create({
      id: 'bp-d',
      seed: 'bp-d',
      config: { ...DEFAULT_DISPUTE_CONFIG, cupFormat: 'copa8' },
      seats: [seat('u:ana'), seat('cpu:1', { isCpu: true, cpuStyle: 'agressivo' })],
      deck: DECK,
    });
    expect(() => d.setSetPieces('u:ana', { penalti: 'x' })).toThrow(GameRuleError);
    while (d.phase === 'auction') d.tick();
    expect(d.phase).toBe('ceremony');
    // Sem escolha, vale a indicação do jogo.
    expect(d.takersOf('u:ana')).toEqual(defaultTakers(d.squadOf('u:ana')));
    const mine = d.participant('u:ana').roster;
    const rival = d.participant('cpu:1').roster[0]!.cardId;
    expect(() => d.setSetPieces('u:ana', { penalti: rival })).toThrow(GameRuleError);
    const zag = mine.find((r) => r.position === 'ZAG')!.cardId;
    const lat = mine.find((r) => r.position === 'LAT')!.cardId;
    d.setSetPieces('u:ana', { penalti: zag });
    d.setSetPieces('u:ana', { falta: lat });
    expect(d.takersOf('u:ana')).toMatchObject({ penalti: zag, falta: lat });
    // Sobrevive ao snapshot e vale na liga.
    const back = Dispute.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
    expect(back.takersOf('u:ana')).toMatchObject({ penalti: zag, falta: lat });
    back.runToEnd();
    const games = [...Object.values(back.league!.state.results), ...Object.values(back.cup?.state.results ?? {})];
    const kicks = games.flatMap((m) => m.goals.filter((g) => (g.kind === 'penalti' || g.kind === 'falta') && (g.side === 'home' ? m.homeId : m.awayId) === 'u:ana'));
    expect(kicks.length).toBeGreaterThan(0);
    for (const g of kicks) expect(g.cardId).toBe(g.kind === 'penalti' ? zag : lat);
  });

  it('expulsão é rara, aparece na narração e o expulso não joga mais', () => {
    const M = 12000;
    let reds = 0;
    let games = 0;
    let checked = 0;
    for (let i = 0; i < M; i++) {
      const loud = i < 3000;
      const r = simulateMatch({ id: `rc${i}`, home, away, neutral: true, withEvents: loud, rng: new Rng(`rc${i}`) });
      if (!r.redCards) continue;
      games++;
      reds += r.redCards.length;
      for (const c of r.redCards) {
        expect(c.minute).toBeGreaterThanOrEqual(15);
        const team = c.side === 'home' ? home : away;
        expect(team.squad.some((p) => p.cardId === c.cardId && p.name === c.name)).toBe(true);
        // Depois do vermelho: nem gol, nem assistência, nem lance narrado do expulso.
        for (const g of r.goals.filter((g) => g.side === c.side && g.minute >= c.minute)) {
          expect(g.cardId).not.toBe(c.cardId);
          expect(g.assistCardId).not.toBe(c.cardId);
        }
        if (loud) {
          expect(r.events!.filter((e) => e.type === 'expulsao' && e.cardId === c.cardId && e.side === c.side)).toHaveLength(1);
          for (const e of r.events!.filter((e) => e.side === c.side && e.minute >= c.minute && e.type !== 'expulsao')) {
            expect(e.cardId).not.toBe(c.cardId);
            expect(e.takerId).not.toBe(c.cardId);
          }
          checked++;
        }
      }
    }
    // ≈ 3% dos jogos têm um vermelho (1,5% por time).
    expect(reds / M).toBeGreaterThan(RED_CARD_CHANCE * 2 * 0.7);
    expect(reds / M).toBeLessThan(RED_CARD_CHANCE * 2 * 1.3);
    expect(games / M).toBeLessThan(0.05);
    expect(checked).toBeGreaterThan(30);
  });
});
