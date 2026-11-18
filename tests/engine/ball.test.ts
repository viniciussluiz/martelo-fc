import { describe, expect, it } from 'vitest';
import type { MatchView } from '../../src/shared/protocol.js';
import { ballAt, ballState, ballTrail, bannerAt, buildTimeline, holderAt, matchMinute, playerAt, playersAt, type Key } from '../../src/web/lib/ball.js';

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
    // O gol na tela não vem antes do minuto do lance (o do fim do jogo recua para caber antes do apito),
    // e dois gols seguidos não se atropelam.
    expect(tl.goals[0]!.t).toBeGreaterThanOrEqual(30);
    expect(tl.goals[1]!.t).toBeGreaterThan(tl.goals[0]!.t + 1.5);
    expect(tl.goals[2]!.until).toBeLessThanOrEqual(90);
    // No ritmo normal, cada lance aparece a poucos minutos do minuto narrado.
    tl.moments.forEach((t, i) => expect(Math.abs(t - EVENTS![i]!.minute)).toBeLessThanOrEqual(8));
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

  it('os 22 jogadores ficam no gramado e a bola passa pelo pé deles', () => {
    const tl = buildTimeline(match(EVENTS));
    expect(tl.players).toHaveLength(22);
    expect(tl.players.filter((p) => p.side === 'home')).toHaveLength(11);
    for (let t = 0; t <= 90; t += 0.25) {
      for (const p of playersAt(tl, t)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
    // Goleiro de cada lado perto do próprio gol; mandante à esquerda.
    const keeper = (side: 'home' | 'away') => tl.players.find((p) => p.side === side && p.position === 'GOL')!;
    expect(playerAt(tl, keeper('home'), 20).x).toBeLessThan(0.2);
    expect(playerAt(tl, keeper('away'), 20).x).toBeGreaterThan(0.8);
    // Em cada toque, a bola está no pé do jogador (a um passo do centro dele).
    const touches = tl.keys.filter((k) => k.holder && !k.jump && !k.shot);
    expect(touches.length).toBeGreaterThan(25);
    for (const k of touches) {
      const who = tl.players.find((p) => p.side === k.holder!.side && p.idx === k.holder!.idx)!;
      const pos = playerAt(tl, who, k.t);
      expect(Math.hypot((pos.x - k.x) * 105, (pos.y - k.y) * 68)).toBeLessThan(2.5);
    }
    // Os dois times tocam na bola.
    expect(new Set(touches.map((k) => k.holder!.side)).size).toBe(2);
  });

  it('pênalti, falta e escanteio: bola parada no lugar certo, com aviso e batedor na bola', () => {
    const lineup = (tag: string) =>
      (['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'] as const).map((position, i) => ({
        cardId: `${tag}${i}`,
        name: `${tag.toUpperCase()} ${i}`,
        position,
      }));
    const events: MatchView['events'] = [
      { minute: 0, type: 'apito', side: null, text: '' },
      { minute: 15, type: 'gol', side: 'home', cardId: 'h9', setPiece: 'penalti', text: '' },
      { minute: 35, type: 'defesa', side: 'away', cardId: 'a6', setPiece: 'falta', text: '' },
      { minute: 55, type: 'gol', side: 'home', cardId: 'h3', setPiece: 'escanteio', takerId: 'h5', text: '' },
      { minute: 70, type: 'bloqueio', side: 'away', cardId: 'a4', setPiece: 'escanteio', takerId: 'a5', text: '' },
      { minute: 80, type: 'impedimento', side: 'home', cardId: 'h10', text: '' },
      { minute: 90, type: 'fim', side: null, text: '' },
    ];
    const tl = buildTimeline({ ...match(events), lineups: { home: lineup('h'), away: lineup('a') } });
    const [pen, fk, corner, cleared, offside] = [1, 2, 3, 4, 5].map((i) => tl.moments[i]!);
    expect(tl.banners.map((b) => b.text)).toEqual(['Pênalti!', 'Falta!', 'Escanteio!', 'Escanteio!', 'Impedimento!']);
    // Sem capitão marcado na escalação, ninguém leva a braçadeira; marcado, só ele.
    expect(tl.players.some((p) => p.captain)).toBe(false);
    const withCaptain = buildTimeline({ ...match(events), lineups: { home: lineup('h').map((p, i) => (i === 5 ? { ...p, captain: true } : p)), away: lineup('a') } });
    expect(withCaptain.players.filter((p) => p.captain).map((p) => p.cardId)).toEqual(['h5']);
    const who = (t: number) => {
      const h = holderAt(tl.keys, t);
      return h ? tl.players.find((p) => p.side === h.side && p.idx === h.idx)!.cardId : null;
    };

    // Pênalti: bola na marca, batedor escolhido atrás dela, e gol do mandante na rede da direita.
    expect(bannerAt(tl, pen! - 1)?.text).toBe('Pênalti!');
    const spot = ballAt(tl.keys, pen! - 1.5);
    expect(spot.x).toBeCloseTo(1 - 11 / 105, 2);
    expect(spot.y).toBeCloseTo(0.5, 2);
    expect(who(pen! - 0.3)).toBe('h9');
    expect(ballAt(tl.keys, pen! + 0.05).x).toBeGreaterThan(1);

    // Falta do visitante: no campo de ataque dele, fora da área do mandante, com barreira de três a
    // 9,15 m, entre a bola e o gol.
    const ball = ballAt(tl.keys, fk! - 1.5);
    expect(ball.x).toBeGreaterThan(0.13);
    expect(ball.x).toBeLessThan(0.31);
    expect(ball.x > 16.5 / 105 || Math.abs(ball.y - 0.5) > 20.16 / 68).toBe(true);
    const toBall = (p: { x: number; y: number }) => Math.hypot((p.x - ball.x) * 105, (p.y - ball.y) * 68);
    const toGoal = (p: { x: number; y: number }) => Math.hypot(p.x * 105, (p.y - 0.5) * 68);
    const wall = playersAt(tl, fk! - 0.3).filter((p, i) => tl.players[i]!.side === 'home' && toBall(p) > 8 && toBall(p) < 10.5 && toGoal(p) < toGoal(ball));
    expect(wall).toHaveLength(3);
    // Quem sofreu a falta estava com a bola ali mesmo, um instante antes do aviso: a falta não surge do nada.
    const foul = tl.banners.find((x) => x.text === 'Falta!')!;
    const before = ballAt(tl.keys, foul.from - 0.05);
    expect(Math.hypot((before.x - ball.x) * 105, (before.y - ball.y) * 68)).toBeLessThan(3);
    expect(holderAt(tl.keys, foul.from - 0.05)?.side).toBe('away');
    expect(who(fk! - 0.3)).toBe('a6');
    expect(tl.goals.some((g) => Math.abs(g.t - fk!) < 0.5)).toBe(false);

    // Escanteio: a bola sai da bandeirinha, cobrada pelo batedor escolhido, e quem cabeceia faz o gol.
    const flag = tl.keys.find((k) => k.jump && k.t < corner! && k.t > corner! - 6 && k.x > 0.98)!;
    expect(flag.y < 0.02 || flag.y > 0.98).toBe(true);
    expect(tl.keys.some((k) => k.holder && tl.players.find((p) => p.side === k.holder!.side && p.idx === k.holder!.idx)!.cardId === 'h5' && k.x > 0.98)).toBe(true);
    expect(who(corner! - 0.05)).toBe('h3');
    expect(tl.goals.map((g) => g.side)).toEqual(['home', 'home']);
    // Antes do aviso, o ataque já estava na ponta daquele lado e a bola saiu pela linha de fundo ali.
    const cornerBanner = tl.banners.find((x) => x.text === 'Escanteio!')!;
    const gone = ballAt(tl.keys, cornerBanner.from - 0.01);
    expect(gone.x).toBeGreaterThan(0.97);
    expect(gone.y < 0.5).toBe(flag.y < 0.5);
    const cross = ballAt(tl.keys, cornerBanner.from - 1.6);
    expect(cross.x).toBeGreaterThan(0.6);
    // Escanteio afastado e impedimento não mexem no placar.
    expect(ballAt(tl.keys, cleared! + 0.01).x).toBeLessThan(0.5);
    expect(bannerAt(tl, offside! + 0.2)?.text).toBe('Impedimento!');
  });

  it('quem recebe na cara do gol finaliza (para fora ou travado): ninguém toca para trás dali', () => {
    let shots = 0;
    for (let i = 0; i < 40; i++) {
      const tl = buildTimeline(match(EVENTS, `cara-do-gol-${i}`));
      for (let k = 0; k < tl.keys.length - 1; k++) {
        const key = tl.keys[k]!;
        const next = tl.keys[k + 1]!;
        if (!key.holder || key.jump || key.shot) continue;
        const who = tl.players.find((p) => p.side === key.holder!.side && p.idx === key.holder!.idx)!;
        if (who.position === 'GOL') continue;
        const pos = playerAt(tl, who, key.t);
        const dir = who.side === 'home' ? 1 : -1;
        const facingGoal = dir * (pos.x - 0.5) > 0.32 && Math.abs(pos.y - 0.5) < 0.25;
        if (!facingGoal) continue;
        // Bola parada sendo armada (o mesmo ponto, parada) não conta.
        if (next.jump || (Math.abs(next.x - key.x) < 0.004 && Math.abs(next.y - key.y) < 0.004)) continue;
        // Dali, a bola só anda para a frente (chute, ou um toque para quem está mais perto do gol).
        const forward = dir * (next.x - key.x);
        if (next.shot) shots++;
        expect(next.shot || forward > -0.02, `jogo ${i}, minuto ${key.t.toFixed(1)}: de ${pos.x.toFixed(2)} para ${next.x.toFixed(2)}`).toBe(true);
      }
    }
    expect(shots).toBeGreaterThan(20);
  });

  it('a falta muda de lugar de um jogo para o outro: pela esquerda, pela direita e de frente', () => {
    const events: MatchView['events'] = [
      { minute: 0, type: 'apito', side: null, text: '' },
      { minute: 40, type: 'defesa', side: 'home', cardId: 'h9', setPiece: 'falta', text: '' },
      { minute: 90, type: 'fim', side: null, text: '' },
    ];
    const spots = Array.from({ length: 60 }, (_, i) => {
      const tl = buildTimeline({ ...match(events), id: `falta-${i}` });
      return ballAt(tl.keys, tl.moments[1]! - 1.5);
    });
    expect(spots.filter((s) => s.y < 0.32).length).toBeGreaterThan(8);
    expect(spots.filter((s) => s.y > 0.68).length).toBeGreaterThan(8);
    expect(spots.filter((s) => s.y >= 0.34 && s.y <= 0.66).length).toBeGreaterThan(5);
    // Sempre no campo de ataque e nunca dentro da área.
    for (const s of spots) {
      expect(s.x).toBeGreaterThan(0.69);
      expect(s.x < 1 - 16.5 / 105 || Math.abs(s.y - 0.5) > 20.16 / 68).toBe(true);
    }
  });

  it('no turbo os lances encolhem e o jogo todo ainda cabe antes do apito', () => {
    const many: MatchView['events'] = [
      { minute: 0, type: 'apito', side: null, text: '' },
      ...Array.from({ length: 14 }, (_, i) => ({
        minute: 80 + (i % 9),
        type: (i % 3 === 0 ? 'gol' : 'defesa') as 'gol' | 'defesa',
        side: (i % 2 ? 'home' : 'away') as 'home' | 'away',
        ...(i % 4 === 0 ? { setPiece: 'penalti' as const } : {}),
        text: '',
      })),
    ];
    const tl = buildTimeline(match(many), 90 / 8.5);
    expect(tl.goals).toHaveLength(5);
    for (const g of tl.goals) expect(g.until).toBeLessThanOrEqual(90);
    for (let i = 1; i < tl.keys.length; i++) expect(tl.keys[i]!.t).toBeGreaterThan(tl.keys[i - 1]!.t);
    expect(tl.keys[tl.keys.length - 1]!.t).toBeLessThanOrEqual(90);
  });

  it('expulsão: cartão na tela, o jogador sai do gramado e não toca mais na bola', () => {
    const lineup = (tag: string) =>
      (['GOL', 'LAT', 'LAT', 'ZAG', 'ZAG', 'MEI', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'] as const).map((position, i) => ({ cardId: `${tag}${i}`, name: `${tag}${i}`, position }));
    const events: MatchView['events'] = [
      { minute: 0, type: 'apito', side: null, text: '' },
      { minute: 30, type: 'expulsao', side: 'away', cardId: 'a3', text: '' },
      { minute: 60, type: 'gol', side: 'home', cardId: 'h9', text: '' },
      { minute: 90, type: 'fim', side: null, text: '' },
    ];
    const tl = buildTimeline({ ...match(events), lineups: { home: lineup('h'), away: lineup('a') } });
    expect(tl.cards).toHaveLength(1);
    expect(tl.cards[0]).toMatchObject({ side: 'away', cardId: 'a3' });
    expect(bannerAt(tl, tl.cards[0]!.t + 0.3)?.text).toBe('Cartão vermelho!');
    const off = tl.sentOff[0]!;
    expect(tl.players.find((p) => p.side === off.side && p.idx === off.idx)!.cardId).toBe('a3');
    expect(off.t).toBeGreaterThan(tl.cards[0]!.t);
    expect(tl.keys.filter((k) => k.t > off.t && k.holder?.side === 'away' && k.holder.idx === off.idx)).toHaveLength(0);
    expect(tl.keys.filter((k) => k.t > off.t && k.holder?.side === 'away').length).toBeGreaterThan(3);
    expect(tl.goals).toHaveLength(1);
    // Jogo sem narração: o vermelho vem do resultado.
    const quiet = buildTimeline({ ...match(events), events: undefined, redCards: [{ side: 'away', cardId: 'a3', name: 'a3', minute: 30 }], lineups: { home: lineup('h'), away: lineup('a') } });
    expect(quiet.cards).toHaveLength(1);
    expect(quiet.sentOff).toHaveLength(1);
  });
});
