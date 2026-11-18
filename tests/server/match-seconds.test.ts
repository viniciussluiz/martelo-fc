import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateDeck } from '../../src/engine/deck-generator.js';
import { Dispute } from '../../src/engine/dispute.js';
import { DEFAULT_DISPUTE_CONFIG } from '../../src/engine/types.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/server/rooms/room-actor.js';
import { TIMINGS } from '../../src/server/rooms/timing.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** O anfitrião escolhe se cada partida dura 20 ou 40 segundos. */
describe('tempo de cada partida', () => {
  it('padrão 40 s; aceita 20 ou 40; trocar o ritmo leva a duração junto, a não ser que ela venha no pedido', () => {
    const base = DEFAULT_SETTINGS.online;
    expect(base.matchSeconds).toBe(40);
    expect(sanitizeSettings('online', base, { matchSeconds: 20 }).matchSeconds).toBe(20);
    expect(() => sanitizeSettings('online', base, { matchSeconds: 30 as never })).toThrow(/Duração da partida inválida/);
    expect(sanitizeSettings('online', base, { matchSeconds: 10 })).toMatchObject({ speed: 'normal', matchSeconds: 10 });
    expect(sanitizeSettings('online', base, { speed: 'turbo' })).toMatchObject({ speed: 'turbo', matchSeconds: 20 });
    expect(sanitizeSettings('online', base, { speed: 'turbo', matchSeconds: 40 })).toMatchObject({ speed: 'turbo', matchSeconds: 40 });
    const turbo = sanitizeSettings('online', base, { speed: 'turbo' });
    expect(sanitizeSettings('online', turbo, { speed: 'normal' }).matchSeconds).toBe(40);
    // Normal com partidas de 20 s: só a partida muda; o leilão segue no ritmo normal.
    expect(sanitizeSettings('online', base, { matchSeconds: 20 })).toMatchObject({ speed: 'normal', matchSeconds: 20 });
  });

  describe('na sala', () => {
    let env: TestEnv;
    beforeAll(async () => {
      // Sem ritmo forçado, para a sala usar o que o anfitrião escolheu.
      env = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-partida-')), undefined, { forceSpeed: null });
    });
    afterAll(async () => {
      await env.stop();
      cleanupDir(env.dir);
    });

    it('a duração escolhida vale para liga e copa, sem mexer nos prazos do leilão', async () => {
      const ana = await TestClient.guest(env.app, 'Ana Relógio');
      const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3 } }, ana.token);
      await ana.send({ t: 'room:join', code: data.code });
      await ana.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
      const room = env.app.rooms.get(data.code)!;
      expect(ana.room!.settings.matchSeconds).toBe(40);
      expect(room.timing.leagueRoundMs).toBe(40_000);
      await ana.send({ t: 'room:settings', settings: { matchSeconds: 20 } });
      await ana.waitFor((r) => r?.settings.matchSeconds === 20, 5000, 'configurar');
      expect(room.timing).toMatchObject({ leagueRoundMs: 20_000, cupMatchdayMs: 20_000, bidMs: TIMINGS.normal.bidMs, ceremonyMs: TIMINGS.normal.ceremonyMs });
      await ana.send({ t: 'room:settings', settings: { speed: 'turbo', matchSeconds: 40 } });
      await ana.waitFor((r) => r?.settings.speed === 'turbo', 5000, 'configurar');
      expect(room.timing).toMatchObject({ leagueRoundMs: 40_000, cupMatchdayMs: 40_000, bidMs: TIMINGS.turbo.bidMs });
      await expect(ana.send({ t: 'room:settings', settings: { matchSeconds: 90 as never } })).rejects.toThrow(/Duração da partida inválida/);
      ana.close();
    });

    it('jogo rápido: 10 s por rodada, 15 s nas 5 últimas da liga; na copa, 10 s nos grupos e 15 s no mata-mata', async () => {
      const bia = await TestClient.guest(env.app, 'Bia Rápida');
      const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3, matchSeconds: 10, cupFormat: 'libertadores' } }, bia.token);
      await bia.send({ t: 'room:join', code: data.code });
      await bia.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
      const room = env.app.rooms.get(data.code)!;
      expect(room.timing).toMatchObject({ leagueRoundMs: 10_000, cupMatchdayMs: 10_000, bidMs: TIMINGS.normal.bidMs });
      // Disputa montada à mão (sem esperar os relógios): o tempo acompanha a rodada que está na tela.
      const seats = [
        { id: 'u:bia', userId: 'bia', name: 'Bia', isCpu: false, formation: '4-3-3' as const },
        { id: 'cpu:1', userId: null, name: 'CPU', isCpu: true, formation: '4-4-2' as const },
      ];
      const d = Dispute.create({ id: 'rapido', seed: 'rapido', config: { ...DEFAULT_DISPUTE_CONFIG, cupFormat: 'libertadores' }, seats, deck: generateDeck() });
      room.dispute = d;
      while (d.phase !== 'league') d.tick();
      const total = d.league!.totalRounds;
      const seen: number[] = [];
      while (d.phase === 'league') {
        d.tick();
        seen.push(room.timing.leagueRoundMs);
      }
      expect(seen).toHaveLength(total);
      expect(seen.slice(0, total - 5).every((ms) => ms === 10_000)).toBe(true);
      expect(seen.slice(total - 5)).toEqual([15_000, 15_000, 15_000, 15_000, 15_000]);
      // Copa: 6 rodadas de grupos e depois o mata-mata.
      const cupSeen: Array<[string, number]> = [];
      while (d.phase === 'cup') {
        const played = d.playCupMatchday();
        room.lastTickMatchIds = played.map((m) => m.id);
        cupSeen.push([played[0]!.id.startsWith('C-G') ? 'grupos' : 'mata-mata', room.timing.cupMatchdayMs]);
      }
      expect(cupSeen.filter(([stage]) => stage === 'grupos')).toHaveLength(6);
      expect(cupSeen.filter(([stage]) => stage === 'grupos').every(([, ms]) => ms === 10_000)).toBe(true);
      expect(cupSeen.filter(([stage]) => stage === 'mata-mata').length).toBeGreaterThan(0);
      expect(cupSeen.filter(([stage]) => stage === 'mata-mata').every(([, ms]) => ms === 15_000)).toBe(true);
      room.dispute = null;
      bia.close();
    });
  });
});
