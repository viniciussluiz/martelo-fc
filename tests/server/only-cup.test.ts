import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Sala “Só Libertadores”: sem liga, todos os técnicos vão do leilão direto para a fase de grupos. */
let env: TestEnv;
beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

async function soloRoom(host: TestClient, settings: Record<string, unknown> = {}) {
  const { status, data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3, ...settings } }, host.token);
  expect(status).toBe(200);
  await host.send({ t: 'room:join', code: data.code });
  await host.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
  return data.code as string;
}

describe('só Libertadores', () => {
  it('“sem liga” só fica ligado na Libertadores', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Config');
    await soloRoom(ana);
    await ana.send({ t: 'room:settings', settings: { cupFormat: 'libertadores', skipLeague: true } });
    await ana.waitFor((r) => r?.settings.skipLeague === true, 5000, 'ligar');
    expect(ana.room!.settings.cupFormat).toBe('libertadores');
    // Trocar para outro formato volta a ter liga.
    await ana.send({ t: 'room:settings', settings: { cupFormat: 'copa8' } });
    await ana.waitFor((r) => r?.settings.cupFormat === 'copa8', 5000, 'trocar');
    expect(ana.room!.settings.skipLeague).toBe(false);
    await ana.send({ t: 'room:settings', settings: { skipLeague: true } });
    await ana.waitFor((r) => r?.settings.cupFormat === 'copa8', 5000, 'recusar');
    expect(ana.room!.settings.skipLeague).toBe(false);
    ana.close();
  });

  it('do leilão direto para os grupos; o ciclo fecha só com o campeão da copa', async () => {
    const bia = await TestClient.guest(env.app, 'Bia Liberta');
    bia.strategy = 'bid';
    await soloRoom(bia, { cupFormat: 'libertadores', skipLeague: true });
    expect(bia.room!.settings.skipLeague).toBe(true);
    await bia.send({ t: 'room:start' });
    const cup = await bia.waitFor((r) => r?.dispute?.phase === 'cup', 60_000, 'copa');
    const d = cup!.dispute!;
    expect(d.league).toBeNull();
    expect(d.cupIntro).toBeNull();
    expect(d.cup!.name).toBe('Taça Libertadores');
    expect(d.cup!.groups).toHaveLength(8);
    expect(d.cup!.groups.flatMap((g) => g.teamIds)).toContain(d.you);

    // Mata-mata em ida e volta: o jogo de volta leva o placar da ida, para o placar mostrar o agregado.
    const volta = await bia.waitFor((r) => !!r?.dispute?.cup?.lastResults.some((m) => m.firstLeg), 60_000, 'jogo de volta');
    const cupNow = volta!.dispute!.cup!;
    for (const m of cupNow.lastResults.filter((x) => x.firstLeg)) {
      expect(m.stage).toMatch(/ · volta$/);
      const tie = cupNow.ties.find((t) => (t.aId === m.homeId && t.bId === m.awayId) || (t.aId === m.awayId && t.bId === m.homeId))!;
      // Ida + volta = o agregado do confronto (o mando se inverte na volta).
      const agg = { home: m.firstLeg!.home + m.homeGoals, away: m.firstLeg!.away + m.awayGoals };
      expect(tie.aggregate).toEqual(tie.aId === m.homeId ? { a: agg.home, b: agg.away } : { a: agg.away, b: agg.home });
    }

    const done = await bia.waitFor((r) => r?.status === 'post_dispute' && !!r.continuation, 60_000, 'fim do ciclo');
    const res = done!.lastResult!;
    expect(res.leagueChampionTeamId).toBeNull();
    expect(res.leagueTable).toEqual([]);
    expect(res.cupChampionName).toBeTruthy();
    expect(res.outcomes).toHaveLength(4);
    expect(res.outcomes.every((o) => o.cupReach !== null)).toBe(true);
    // Histórico e Sala de Troféus gravados sem título de liga.
    const rows = env.app.db.prepare('SELECT league_title, cup_reach, league_position FROM dispute_participants WHERE dispute_id = ?').all(res.disputeId) as Array<{
      league_title: number;
      cup_reach: string | null;
      league_position: number;
    }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.league_title === 0 && !!r.cup_reach && r.league_position >= 1)).toBe(true);
    bia.close();
  });
});
