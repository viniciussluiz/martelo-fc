import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

let env: TestEnv;

beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

async function soloRoom(host: TestClient, settings: Record<string, unknown>) {
  const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings }, host.token);
  await host.send({ t: 'room:join', code: data.code });
  await host.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
  return data.code as string;
}

describe('leilão de clubes na sala', () => {
  it('lote de pacotes sem nomes, convocação só com os seus e ciclo completo', async () => {
    const ana = await TestClient.guest(env.app, 'Ana FC');
    ana.strategy = 'manual';
    const code = await soloRoom(ana, { cpuCount: 3, auctionMode: 'clubes' });
    expect(ana.room!.settings.auctionMode).toBe('clubes');
    await ana.send({ t: 'room:start' });
    const r = await ana.waitFor((x) => x?.dispute?.auction?.step?.kind === 'bid', 5000, 'primeiro lote');
    const d = r!.dispute!;
    expect(d.auctionMode).toBe('clubes');
    const step = d.auction!.step!;
    if (step.kind !== 'bid') throw new Error('esperava lote');
    // Cinco pacotes de goleiros (4 técnicos + 1): clube e tamanho, sem nenhum nome de jogador.
    expect(step.cardIds).toHaveLength(5);
    for (const id of step.cardIds) {
      expect(d.packages[id]).toMatchObject({ position: 'GOL' });
      expect(d.packages[id]!.size).toBeGreaterThan(0);
      expect(d.packages[id]!.cardIds).toBeUndefined();
    }
    expect(Object.keys(d.cards)).toHaveLength(0);
    expect(step.myOpenSlots).toBe(1);

    // Dois pacotes no mesmo setor: recusado pelo servidor.
    await expect(ana.send({ t: 'bid:set', stepId: step.stepId, bids: { [step.cardIds[0]!]: 2, [step.cardIds[1]!]: 2 } })).rejects.toThrow(/um pacote/);

    // Daqui em diante a Ana joga sozinha (lança, convoca e fica pronta).
    ana.strategy = 'bid';
    ana.fire({ t: 'bid:set', stepId: step.stepId, bids: { [step.cardIds[0]!]: 5 }, seal: true });
    const conv = await ana.waitFor((x) => x?.dispute?.auction?.step?.kind === 'convocacao', 20_000, 'convocação');
    const cd = conv!.dispute!;
    const cstep = cd.auction!.step!;
    if (cstep.kind === 'convocacao') {
      const mine = Object.values(cstep.myPackages);
      expect(mine).toHaveLength(5);
      // Só os próprios pacotes trazem nomes, e nenhuma carta mostra faixa ou nível.
      for (const [id, pk] of Object.entries(cd.packages)) expect(!!pk.cardIds).toBe(mine.includes(id));
      expect(Object.values(cd.cards).every((c) => c.levelMin === undefined && c.tier === undefined)).toBe(true);
    }

    const done = await ana.waitFor((x) => x?.status === 'post_dispute' && !!x.continuation, 30_000, 'fim do ciclo');
    expect(done!.lastResult!.outcomes).toHaveLength(4);
    // Próximo ciclo: pacotes sorteados de novo (nada herdado).
    await ana.send({ t: 'continue:vote', disputeId: done!.lastResult!.disputeId, choice: 'continue' });
    const next = await ana.waitFor((x) => x?.status === 'in_dispute' && x.cycle === 2, 5000, 'ciclo 2');
    expect(next!.dispute!.carriedCount).toBe(0);
    expect(next!.dispute!.auctionMode).toBe('clubes');
    expect(env.app.rooms.get(code)).toBeTruthy();
    ana.close();
  });

  it('quem sai no meio da disputa solo encerra a partida', async () => {
    const bia = await TestClient.guest(env.app, 'Bia FC');
    bia.strategy = 'manual';
    const code = await soloRoom(bia, { cpuCount: 2, auctionMode: 'clubes' });
    await bia.send({ t: 'room:start' });
    await bia.waitFor((x) => x?.dispute?.phase === 'auction', 5000, 'leilão');
    await bia.send({ t: 'room:leave' });
    await bia.waitFor((_, c) => !!c.left, 5000, 'sair');
    const row = env.app.db.prepare(`SELECT status FROM disputes WHERE room_id = (SELECT id FROM rooms WHERE code = ?)`).get(code) as { status: string };
    expect(row.status).toBe('aborted');
    bia.close();
  });

  it('valida o tipo de leilão', async () => {
    const caio = await TestClient.guest(env.app, 'Caio FC');
    await soloRoom(caio, {});
    expect(caio.room!.settings.auctionMode).toBe('jogador');
    await expect(caio.send({ t: 'room:settings', settings: { auctionMode: 'leilao-doido' as never } })).rejects.toThrow(/Tipo de leilão/);
    await caio.send({ t: 'room:settings', settings: { auctionMode: 'clubes' } });
    await caio.waitFor((x) => x?.settings.auctionMode === 'clubes', 2000, 'modo clubes');
    caio.close();
  });
});
