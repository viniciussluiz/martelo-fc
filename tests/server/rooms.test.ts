import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanupDir, sleep, startTestApp, TestClient, type TestEnv } from './harness.js';

let env: TestEnv;

beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

async function createRoom(host: TestClient, mode: 'solo' | 'online', settings: Record<string, unknown> = {}) {
  const { status, data } = await api(env.app, 'POST', '/api/rooms', { mode, settings }, host.token);
  expect(status).toBe(200);
  await host.send({ t: 'room:join', code: data.code });
  await host.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
  return data.code as string;
}

const finished = (r: any) => r?.status === 'post_dispute' && !!r?.continuation;

describe('partida rápida (solo) com continuidade', () => {
  it('joga um ciclo completo, mostra o resumo e continua na mesma sala com os jogadores reaproveitados', async () => {
    const ana = await TestClient.guest(env.app, 'Ana FC');
    const code = await createRoom(ana, 'solo', { cpuCount: 3 });
    await ana.send({ t: 'room:start' });
    await ana.waitFor((r) => r?.dispute?.phase === 'auction', 5000, 'leilão');

    // Sigilo: durante o leilão nenhuma carta mostra a faixa de nível.
    const d0 = ana.room!.dispute!;
    expect(Object.values(d0.cards).every((c) => c.levelMin === undefined)).toBe(true);

    const r1 = await ana.waitFor(finished, 30_000, 'fim do ciclo 1');
    expect(r1!.lastResult).toBeTruthy();
    expect(r1!.lastResult!.outcomes).toHaveLength(4);
    expect(r1!.continuation!.eligible).toEqual([ana.userId]);
    const firstId = r1!.lastResult!.disputeId;

    // Histórico persistido: a disputa 1 está concluída e tem participantes gravados.
    const row = env.app.db.prepare('SELECT status, state_json, result_json FROM disputes WHERE id = ?').get(firstId) as any;
    expect(row.status).toBe('finished');
    expect(row.state_json).toBeNull(); // dado operacional descartado
    expect(JSON.parse(row.result_json).outcomes).toHaveLength(4);
    const acquired = (env.app.db.prepare('SELECT card_id FROM dispute_rosters WHERE dispute_id = ?').pluck().all(firstId) as string[]).filter((id) => !id.startsWith('fill-'));
    expect(acquired.length).toBe(44);

    await ana.send({ t: 'continue:vote', disputeId: firstId, choice: 'continue' });
    const r2 = await ana.waitFor((r) => r?.status === 'in_dispute' && r.cycle === 2, 5000, 'ciclo 2');
    expect(r2!.code).toBe(code);
    expect(r2!.dispute!.seq).toBe(2);
    expect(r2!.dispute!.carriedCount).toBe(44);
    // Dados operacionais zerados para o novo leilão.
    expect(r2!.dispute!.participants.every((p) => p.coins === 100 && p.roster.length === 0)).toBe(true);
    // Todas as cartas adquiridas no ciclo anterior estão no pool do novo leilão.
    const room = env.app.rooms.get(code)!;
    const pool = new Set(Object.values(room.dispute!.auction.state.levas).flat(2));
    for (const id of acquired) expect(pool.has(id)).toBe(true);
    // Histórico da sala preservado.
    expect(r2!.history.map((h) => [h.seq, h.status])).toEqual([
      [2, 'active'],
      [1, 'finished'],
    ]);

    const r3 = await ana.waitFor(finished, 30_000, 'fim do ciclo 2');
    expect(r3!.lastResult!.seq).toBe(2);
    expect(ana.unlocked).toContain('mais-uma');
    // Sair encerra a sala solo.
    await ana.send({ t: 'continue:vote', disputeId: r3!.lastResult!.disputeId, choice: 'leave' });
    await ana.waitFor((_, c) => !!c.left, 5000, 'sair');
    await sleep(20);
    expect(env.app.rooms.get(code)).toBeUndefined();
    const status = (env.app.db.prepare('SELECT status FROM rooms WHERE code = ?').get(code) as any).status;
    expect(status).toBe('closed');
    ana.close();
  });
});

describe('sala online com vários técnicos', () => {
  it('quem aceita continua; quem desiste sai; o próximo ciclo começa só com quem ficou', async () => {
    const a = await TestClient.guest(env.app, 'Alfa');
    const b = await TestClient.guest(env.app, 'Bravo');
    const c = await TestClient.guest(env.app, 'Charlie');
    const code = await createRoom(a, 'online', { cpuCount: 1 });
    await b.send({ t: 'room:join', code });
    await c.send({ t: 'room:join', code });
    await a.waitFor((r) => r?.members.length === 3, 5000, '3 membros');
    // Só o anfitrião inicia.
    await expect(b.send({ t: 'room:start' })).rejects.toThrow(/anfitrião/);
    await a.send({ t: 'room:start' });
    const end = await a.waitFor(finished, 40_000, 'fim do ciclo');
    const disputeId = end!.continuation!.disputeId;
    expect(end!.continuation!.eligible.sort()).toEqual([a.userId, b.userId, c.userId].sort());

    await b.send({ t: 'continue:vote', disputeId, choice: 'continue' });
    await a.waitFor((r) => r?.continuation?.responses[b.userId] === 'continue', 5000, 'voto de B visível');
    await c.send({ t: 'continue:vote', disputeId, choice: 'leave' });
    await a.send({ t: 'continue:vote', disputeId, choice: 'continue' });
    const next = await a.waitFor((r) => r?.status === 'in_dispute' && r.cycle === 2, 5000, 'ciclo 2');
    const humans = next!.dispute!.participants.filter((p) => !p.isCpu).map((p) => p.userId).sort();
    expect(humans).toEqual([a.userId, b.userId].sort());
    expect(next!.members.find((m) => m.userId === c.userId)).toBeUndefined();
    expect(c.left).toBeTruthy();
    // Voto tardio/duplicado não reinicia nada.
    await expect(a.send({ t: 'continue:vote', disputeId, choice: 'continue' })).rejects.toThrow(/encerrada/);
    const count = (env.app.db.prepare('SELECT COUNT(*) AS n FROM disputes d JOIN rooms r ON r.id = d.room_id WHERE r.code = ?').get(code) as any).n;
    expect(count).toBe(2);
    await a.send({ t: 'room:leave' });
    await b.send({ t: 'room:leave' });
    [a, b, c].forEach((x) => x.close());
  });

  it('sem resposta no prazo: inativo; abaixo do mínimo a sala volta ao lobby preservando o histórico', async () => {
    const a = await TestClient.guest(env.app, 'Delta');
    const b = await TestClient.guest(env.app, 'Eco');
    const code = await createRoom(a, 'online', { cpuCount: 2, continuationTimeoutSec: 15, minHumansToContinue: 2 });
    await b.send({ t: 'room:join', code });
    await a.waitFor((r) => r?.members.length === 2);
    await a.send({ t: 'room:start' });
    const end = await a.waitFor(finished, 40_000, 'fim');
    await a.send({ t: 'continue:vote', disputeId: end!.continuation!.disputeId, choice: 'continue' });
    // B não responde: prazo de 15 s × 0,02 = 300 ms no modo de teste.
    const lobby = await a.waitFor((r) => r?.status === 'lobby', 5000, 'volta ao lobby');
    expect(lobby!.members.map((m) => m.userId)).toEqual([a.userId]);
    expect(lobby!.history[0]!.status).toBe('finished');
    expect(lobby!.lastResult).toBeTruthy();
    expect(b.left).toMatch(/Tempo esgotado/);
    // B pode voltar pelo código e a sala segue com o mesmo histórico.
    await b.send({ t: 'room:join', code });
    await a.waitFor((r) => r?.members.length === 2, 5000, 'B voltou');
    await a.send({ t: 'room:start' });
    await a.waitFor((r) => r?.status === 'in_dispute' && r.cycle === 2, 5000, 'ciclo 2');
    await a.send({ t: 'room:leave' });
    await b.send({ t: 'room:leave' });
    a.close();
    b.close();
  });

  it('o anfitrião pode iniciar sem esperar; duas solicitações simultâneas criam um único ciclo', async () => {
    const a = await TestClient.guest(env.app, 'Foxtrot');
    const b = await TestClient.guest(env.app, 'Golf');
    const c = await TestClient.guest(env.app, 'Hotel');
    const code = await createRoom(a, 'online', { cpuCount: 0, minHumansToContinue: 2, continuationTimeoutSec: 600 });
    for (const x of [b, c]) await x.send({ t: 'room:join', code });
    await a.waitFor((r) => r?.members.length === 3);
    await a.send({ t: 'room:start' });
    const end = await a.waitFor(finished, 40_000, 'fim');
    const disputeId = end!.continuation!.disputeId;
    await b.send({ t: 'continue:vote', disputeId, choice: 'continue' });
    await a.waitFor((r) => r?.continuation?.responses[b.userId] === 'continue');
    // Duas chamadas ao mesmo tempo: só uma pode passar.
    const results = await Promise.allSettled([
      a.send({ t: 'continue:start-now', disputeId }),
      a.send({ t: 'continue:start-now', disputeId }),
      b.send({ t: 'continue:vote', disputeId, choice: 'continue' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    await a.waitFor((r) => r?.status === 'in_dispute' && r.cycle === 2, 5000, 'ciclo 2');
    await sleep(50);
    const seqs = env.app.db.prepare('SELECT seq FROM disputes d JOIN rooms r ON r.id = d.room_id WHERE r.code = ? ORDER BY seq').pluck().all(code);
    expect(seqs).toEqual([1, 2]);
    // C não respondeu e o anfitrião iniciou: C fica fora do ciclo 2.
    const humans = a.room!.dispute!.participants.filter((p) => !p.isCpu).map((p) => p.userId);
    expect(humans.sort()).toEqual([a.userId, b.userId].sort());
    // A restrição UNIQUE (room_id, seq) protege também no banco.
    const roomId = env.app.rooms.get(code)!.id;
    expect(() =>
      env.app.db
        .prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, started_at) VALUES ('x', ?, 2, 'active', 'auction', 's', '{}', 'now')`)
        .run(roomId),
    ).toThrow(/UNIQUE/);
    for (const x of [a, b]) await x.send({ t: 'room:leave' });
    [a, b, c].forEach((x) => x.close());
  });
});

describe('desconexões e reconexões', () => {
  it('quem cai no meio do leilão não trava a sala e, ao voltar, recebe o estado completo', async () => {
    const a = await TestClient.guest(env.app, 'India');
    const b = await TestClient.guest(env.app, 'Juliet');
    const code = await createRoom(a, 'online', { cpuCount: 1 });
    await b.send({ t: 'room:join', code });
    await a.waitFor((r) => r?.members.length === 2);
    b.strategy = 'manual';
    await a.send({ t: 'room:start' });
    await b.waitFor((r) => r?.dispute?.auction?.step?.kind === 'bid', 5000, 'primeiro envelope');
    b.close();
    // A sala segue: o envelope de B fecha por tempo e o leilão avança.
    await a.waitFor((r) => !!r?.dispute?.auction?.progress.find((p) => p.position === 'LAT' && p.state !== 'depois'), 15_000, 'avançou para laterais');
    expect(a.room!.members.find((m) => m.userId === b.userId)!.connected).toBe(false);
    // B volta com a mesma sessão.
    const b2 = new TestClient(env.app, b.token, b.userId, 'Juliet (volta)');
    await b2.connect();
    await b2.send({ t: 'room:join', code });
    const st = await b2.waitFor((r) => !!r?.dispute, 5000, 'estado após reconectar');
    expect(st!.dispute!.you).toBe(`u:${b.userId}`);
    await a.waitFor((r) => r?.members.find((m) => m.userId === b.userId)?.connected === true, 5000);
    await a.waitFor(finished, 40_000, 'fim');
    for (const x of [a, b2]) await x.send({ t: 'room:leave' });
    a.close();
    b2.close();
  });

  it('se todos caem, a disputa pausa; ao voltar, ela continua de onde parou', async () => {
    const a = await TestClient.guest(env.app, 'Kilo');
    const code = await createRoom(a, 'solo', { cpuCount: 2 });
    a.strategy = 'manual';
    await a.send({ t: 'room:start' });
    await a.waitFor((r) => r?.dispute?.auction?.step?.kind === 'bid', 5000);
    const stepBefore = a.room!.dispute!.auction!.step!.stepId;
    a.close();
    await sleep(1600); // > tempo do envelope em modo de teste
    const actor = env.app.rooms.get(code)!;
    expect(actor.paused).toBe(true);
    expect(actor.dispute!.auction.step!.stepId).toBe(stepBefore);
    const a2 = new TestClient(env.app, a.token, a.userId, 'Kilo 2');
    await a2.connect();
    await a2.send({ t: 'room:join', code });
    await a2.waitFor((r) => r?.dispute?.paused === false, 5000);
    await a2.waitFor(finished, 40_000, 'fim após retomar');
    await a2.send({ t: 'room:leave' });
    a2.close();
  });

  it('se todos os humanos saem da sala no meio da disputa, ela é encerrada sem resultado', async () => {
    const a = await TestClient.guest(env.app, 'Lima');
    const code = await createRoom(a, 'solo', { cpuCount: 2 });
    a.strategy = 'manual';
    await a.send({ t: 'room:start' });
    await a.waitFor((r) => r?.dispute?.phase === 'auction');
    const disputeId = a.room!.dispute!.id;
    await a.send({ t: 'room:leave' });
    await sleep(30);
    const row = env.app.db.prepare('SELECT status FROM disputes WHERE id = ?').get(disputeId) as any;
    expect(row.status).toBe('aborted');
    expect(env.app.rooms.get(code)).toBeUndefined();
    const n = (env.app.db.prepare('SELECT COUNT(*) AS n FROM dispute_participants WHERE dispute_id = ?').get(disputeId) as any).n;
    expect(n).toBe(0);
    a.close();
  });
});

describe('validação no servidor', () => {
  it('rejeita lances inválidos, passos encerrados e ações de quem não participa', async () => {
    const a = await TestClient.guest(env.app, 'Mike');
    const spectator = await TestClient.guest(env.app, 'November');
    const code = await createRoom(a, 'online', { cpuCount: 1 });
    a.strategy = 'manual';
    spectator.strategy = 'manual';
    await a.send({ t: 'room:start' });
    const r = await a.waitFor((x) => x?.dispute?.auction?.step?.kind === 'bid', 5000);
    const step = r!.dispute!.auction!.step as any;
    const [c1, c2] = step.cardIds;
    await expect(a.send({ t: 'bid:set', stepId: step.stepId, bids: { [c1]: 5, [c2]: 5 } })).rejects.toThrow(/só pode dar lance/);
    await expect(a.send({ t: 'bid:set', stepId: step.stepId, bids: { [c1]: 500 } })).rejects.toThrow(/moedas/);
    await expect(a.send({ t: 'bid:set', stepId: 'velho', bids: { [c1]: 5 } })).rejects.toThrow(/já foi fechado/);
    // Quem entra no meio assiste, mas não joga.
    await spectator.send({ t: 'room:join', code });
    const sv = await spectator.waitFor((x) => !!x?.dispute, 5000);
    expect(sv!.dispute!.you).toBeNull();
    await expect(spectator.send({ t: 'bid:set', stepId: step.stepId, bids: { [c1]: 1 } })).rejects.toThrow(/assistindo/);
    // Lance válido fica visível só para o próprio técnico.
    await a.send({ t: 'bid:set', stepId: step.stepId, bids: { [c1]: 7 } });
    await a.waitFor((x) => (x?.dispute?.auction?.step as any)?.myBids?.[c1] === 7, 3000);
    await sleep(30);
    const spectatorStep = spectator.room?.dispute?.auction?.step as any;
    if (spectatorStep?.kind === 'bid') expect(spectatorStep.myBids).toEqual({});
    expect(JSON.stringify(spectator.room)).not.toContain('"levelMin"');
    for (const x of [a, spectator]) await x.send({ t: 'room:leave' });
    a.close();
    spectator.close();
  });
});
