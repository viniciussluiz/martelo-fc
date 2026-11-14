import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/server/rooms/room-actor.js';
import { TIMINGS } from '../../src/server/rooms/timing.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** O anfitrião escolhe se cada partida dura 20 ou 40 segundos. */
describe('tempo de cada partida', () => {
  it('padrão 40 s; aceita 20 ou 40; trocar o ritmo leva a duração junto, a não ser que ela venha no pedido', () => {
    const base = DEFAULT_SETTINGS.online;
    expect(base.matchSeconds).toBe(40);
    expect(sanitizeSettings('online', base, { matchSeconds: 20 }).matchSeconds).toBe(20);
    expect(() => sanitizeSettings('online', base, { matchSeconds: 30 as never })).toThrow(/20 ou 40/);
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
      await expect(ana.send({ t: 'room:settings', settings: { matchSeconds: 90 as never } })).rejects.toThrow(/20 ou 40/);
      ana.close();
    });
  });
});
