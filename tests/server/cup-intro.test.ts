import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TIMINGS } from '../../src/server/rooms/timing.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Entre a liga e a copa: a sala mostra o campeão da liga, conta o tempo e o anfitrião pode começar a copa já. */
let env: TestEnv;
const original = TIMINGS.test.cupIntroMs;
beforeAll(async () => {
  // No ritmo de teste o intervalo dura 20 ms; aqui ele precisa ficar aberto até o anfitrião agir.
  TIMINGS.test.cupIntroMs = 60_000;
  env = await startTestApp();
});
afterAll(async () => {
  TIMINGS.test.cupIntroMs = original;
  await env.stop();
  cleanupDir(env.dir);
});

describe('intervalo antes da copa', () => {
  it('fim da liga abre o intervalo com contagem; só o anfitrião encurta; a copa começa em seguida', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Anfitriã');
    const beto = await TestClient.guest(env.app, 'Beto Visita');
    const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'online', settings: { cpuCount: 2 } }, ana.token);
    for (const c of [ana, beto]) {
      await c.send({ t: 'room:join', code: data.code });
      await c.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
    }
    await ana.send({ t: 'room:start' });
    // Durante a liga não há intervalo.
    const league = await ana.waitFor((r) => r?.dispute?.phase === 'league', 90_000, 'liga');
    expect(league!.dispute!.cupIntro).toBeNull();
    const intro = await ana.waitFor((r) => r?.dispute?.phase === 'cup' && !!r.dispute.cupIntro, 60_000, 'intervalo');
    const d = intro!.dispute!;
    // A liga terminou, o campeão está no topo da tabela e a copa ainda não jogou.
    expect(d.league!.round).toBe(d.league!.totalRounds);
    expect(d.league!.table[0]!.position).toBe(1);
    expect(d.cup!.lastResults).toEqual([]);
    expect(d.cupIntro!.startsAt - Date.now()).toBeGreaterThan(30_000);
    // Quem não é anfitrião não encurta.
    await expect(beto.send({ t: 'cup:start-now' })).rejects.toThrow();
    expect(beto.room!.dispute!.cupIntro).not.toBeNull();
    await ana.send({ t: 'cup:start-now' });
    const started = await ana.waitFor((r) => !!r?.dispute?.cup && r.dispute.cup.lastResults.length > 0, 5000, 'copa começou');
    expect(started!.dispute!.cupIntro).toBeNull();
    // Depois que a copa começou, não há mais o que encurtar.
    await expect(ana.send({ t: 'cup:start-now' })).rejects.toThrow(/copa já começou/);
    ana.close();
    beto.close();
  }, 180_000);
});
