import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dispute } from '../../src/engine/dispute.js';
import { generateDeck } from '../../src/engine/deck-generator.js';
import { DEFAULT_DISPUTE_CONFIG } from '../../src/engine/types.js';
import { nowIso } from '../../src/server/db.js';
import { api, cleanupDir, sleep, startTestApp, TestClient, type TestEnv } from './harness.js';

let env: TestEnv;
beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

const finished = (r: any) => r?.status === 'post_dispute' && !!r?.continuation;

async function playOnlineCycles(cycles: number, names: string[], cpuCount = 2) {
  const clients = await Promise.all(names.map((n) => TestClient.guest(env.app, n)));
  const [host, ...rest] = clients;
  const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'online', settings: { cpuCount, minHumansToContinue: 2 } }, host!.token);
  for (const c of clients) await c.send({ t: 'room:join', code: data.code });
  await host!.waitFor((r) => r?.members.length === clients.length);
  await host!.send({ t: 'room:start' });
  for (let i = 1; i <= cycles; i++) {
    const end = await host!.waitFor((r) => finished(r) && r!.lastResult!.seq === i, 60_000, `fim do ciclo ${i}`);
    if (i < cycles) {
      for (const c of clients) await c.send({ t: 'continue:vote', disputeId: end!.continuation!.disputeId, choice: 'continue' });
      await host!.waitFor((r) => r?.status === 'in_dispute' && r.cycle === i + 1, 5000);
    }
  }
  return { clients, code: data.code as string };
}

describe('histórico de confrontos', () => {
  it('registra confrontos simétricos por modalidade, sem somar modalidades', async () => {
    const { clients, code } = await playOnlineCycles(2, ['Ouro', 'Prata', 'Bronze']);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    const ab = await api(env.app, 'GET', `/api/users/${a.userId}/h2h/${b.userId}`, undefined, a.token);
    const ba = await api(env.app, 'GET', `/api/users/${b.userId}/h2h/${a.userId}`, undefined, b.token);
    expect(ab.status).toBe(200);
    const R = ab.data.records;
    const S = ba.data.records;
    // 2 ciclos em comum: um confronto de “ciclo” e um de “liga” por disputa.
    expect(R.ciclo.total).toBe(2);
    expect(R.liga.total).toBe(2);
    // Liga em turno e returno: 2 partidas diretas por disputa (mais eventuais jogos de copa).
    expect(R.partida.total).toBeGreaterThanOrEqual(4);
    // Simetria: minhas vitórias = derrotas dele.
    for (const k of ['ciclo', 'liga', 'copa', 'partida', 'eliminatoria', 'lance']) {
      expect(R[k].wins).toBe(S[k].losses);
      expect(R[k].losses).toBe(S[k].wins);
      expect(R[k].draws).toBe(S[k].draws);
      expect(R[k].wins + R[k].draws + R[k].losses).toBe(R[k].total);
    }
    expect(R.partida.goalsFor).toBe(S.partida.goalsAgainst);
    expect(ab.data.timeline).toHaveLength(2);
    expect(ab.data.timeline[0].roomCode).toBe(code);
    expect(ab.data.timeline[0].me.teamName).toBe('Ouro');
    expect(ab.data.lastResults.length).toBeGreaterThan(0);

    // Partida com 3 humanos: cada par tem seus próprios registros.
    const opps = await api(env.app, 'GET', `/api/users/${a.userId}/opponents`, undefined, a.token);
    expect(opps.data.map((o: any) => o.userId).sort()).toEqual([b.userId, c.userId].sort());
    // Nenhum par duplicado no banco.
    const dup = env.app.db
      .prepare('SELECT COUNT(*) AS n FROM (SELECT dispute_id, kind, ref, user_a, user_b, COUNT(*) c FROM confrontations GROUP BY 1,2,3,4,5 HAVING c > 1)')
      .get() as { n: number };
    expect(dup.n).toBe(0);

    // Filtro por competição: só liga.
    const liga = await api(env.app, 'GET', `/api/users/${a.userId}/h2h/${b.userId}?competition=liga`, undefined, a.token);
    expect(liga.data.records.ciclo.total).toBe(0);
    expect(liga.data.records.copa.total).toBe(0);
    expect(liga.data.records.partida.total).toBe(4);
    // Filtro por período no futuro distante elimina nada; período de 1 dia mantém tudo.
    const recent = await api(env.app, 'GET', `/api/users/${a.userId}/h2h/${b.userId}?period=1`, undefined, a.token);
    expect(recent.data.records.ciclo.total).toBe(2);

    for (const x of clients) await x.send({ t: 'room:leave' }).catch(() => undefined);
    clients.forEach((x) => x.close());
  });
});

describe('Sala de Troféus e conquistas', () => {
  it('desbloqueia com base no histórico persistido, sem duplicar, com progresso e segredos', async () => {
    const { clients } = await playOnlineCycles(2, ['Tigre', 'Leão'], 1);
    const [a] = clients as [TestClient];
    const trophies = await api(env.app, 'GET', `/api/users/${a.userId}/trophies`, undefined, a.token);
    expect(trophies.status).toBe(200);
    const t = trophies.data;
    const byId = Object.fromEntries(t.trophies.map((x: any) => [x.id, x]));
    expect(byId['com-a-turma'].unlocked).toBe(true);
    expect(byId['mais-uma'].unlocked).toBe(true);
    expect(byId['mais-uma'].unlockedAt).toBeTruthy();
    expect(t.stats.disputes).toBe(2);
    expect(t.stats.continuedCycles).toBe(1);
    // Progresso proporcional (ex.: 25 arremates).
    expect(byId['arremates-25'].progress.target).toBe(25);
    expect(byId['arremates-25'].progress.current).toBe(Math.min(25, t.stats.cardsWon));
    // Secretas bloqueadas não revelam o critério.
    const secret = t.trophies.find((x: any) => x.secret && !x.unlocked);
    if (secret) expect(secret.criteria).toBe('???');
    // O mesmo desbloqueio também chegou em tempo real pelo WebSocket.
    expect(a.unlocked).toContain('com-a-turma');

    // Reavaliar não duplica nada.
    const before = (env.app.db.prepare('SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ?').get(a.userId) as any).n;
    const again = env.app.achievements.evaluate(a.userId, null);
    expect(again).toHaveLength(0);
    const after = (env.app.db.prepare('SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ?').get(a.userId) as any).n;
    expect(after).toBe(before);

    // Perfil consistente com as estatísticas.
    const profile = await api(env.app, 'GET', `/api/users/${a.userId}/profile`, undefined, a.token);
    expect(profile.data.stats.disputes).toBe(2);
    expect(profile.data.recent).toHaveLength(2);
    expect(profile.data.trophiesUnlocked).toBe(after);
    for (const x of clients) await x.send({ t: 'room:leave' }).catch(() => undefined);
    clients.forEach((x) => x.close());
  });
});

describe('idempotência da finalização', () => {
  it('finalizar a mesma disputa duas vezes não duplica resultados, confrontos nem troféus', async () => {
    const db = env.app.db;
    const u1 = env.app.auth.createGuest('Idem Um').user;
    const u2 = env.app.auth.createGuest('Idem Dois').user;
    const roomId = 'room-idem';
    db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES (?, 'IDEM01', 'online', ?, 'in_dispute', '{}', 1, ?, ?)`).run(
      roomId,
      u1.id,
      nowIso(),
      nowIso(),
    );
    const dispute = Dispute.create({
      id: 'disp-idem',
      seed: 'idem',
      config: DEFAULT_DISPUTE_CONFIG,
      seats: [
        { id: `u:${u1.id}`, userId: u1.id, name: 'Idem Um', isCpu: false, formation: '4-3-3' },
        { id: `u:${u2.id}`, userId: u2.id, name: 'Idem Dois', isCpu: false, formation: '4-4-2' },
        { id: 'cpu:1', userId: null, name: 'CPU', isCpu: true, formation: '4-3-3' },
      ],
      deck: generateDeck(),
    });
    dispute.runToEnd();
    db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, started_at) VALUES ('disp-idem', ?, 1, 'active', 'cup', 'idem', '{}', ?)`).run(roomId, nowIso());
    const count = () => ({
      p: (db.prepare(`SELECT COUNT(*) n FROM dispute_participants WHERE dispute_id = 'disp-idem'`).get() as any).n,
      c: (db.prepare(`SELECT COUNT(*) n FROM confrontations WHERE dispute_id = 'disp-idem'`).get() as any).n,
      m: (db.prepare(`SELECT COUNT(*) n FROM matches WHERE dispute_id = 'disp-idem'`).get() as any).n,
      a: (db.prepare(`SELECT COUNT(*) n FROM user_achievements WHERE user_id IN (?, ?)`).get(u1.id, u2.id) as any).n,
    });
    const first = env.app.results.finalizeDispute({ disputeId: 'disp-idem', dispute, abandoned: new Set() });
    expect(first.alreadyProcessed).toBe(false);
    const c1 = count();
    expect(c1.p).toBe(3);
    expect(c1.c).toBeGreaterThan(0);
    // Retentativas/mensagens duplicadas (inclusive concorrentes).
    const again = [1, 2, 3].map(() => env.app.results.finalizeDispute({ disputeId: 'disp-idem', dispute, abandoned: new Set() }));
    expect(again.every((r) => r.alreadyProcessed)).toBe(true);
    expect(count()).toEqual(c1);
  });

  it('quem abandona a disputa não entra em confrontos nem conquistas', async () => {
    const db = env.app.db;
    const u1 = env.app.auth.createGuest('Fica').user;
    const u2 = env.app.auth.createGuest('Sai').user;
    db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES ('room-ab', 'ABAN01', 'online', ?, 'in_dispute', '{}', 1, ?, ?)`).run(
      u1.id,
      nowIso(),
      nowIso(),
    );
    const dispute = Dispute.create({
      id: 'disp-ab',
      seed: 'ab',
      config: DEFAULT_DISPUTE_CONFIG,
      seats: [
        { id: `u:${u1.id}`, userId: u1.id, name: 'Fica', isCpu: false, formation: '4-3-3' },
        { id: `u:${u2.id}`, userId: u2.id, name: 'Sai', isCpu: false, formation: '4-3-3' },
      ],
      deck: generateDeck(),
    });
    dispute.runToEnd();
    db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, started_at) VALUES ('disp-ab', 'room-ab', 1, 'active', 'cup', 'ab', '{}', ?)`).run(nowIso());
    env.app.results.finalizeDispute({ disputeId: 'disp-ab', dispute, abandoned: new Set([`u:${u2.id}`]) });
    expect((db.prepare(`SELECT COUNT(*) n FROM confrontations WHERE dispute_id = 'disp-ab'`).get() as any).n).toBe(0);
    expect((db.prepare(`SELECT abandoned FROM dispute_participants WHERE dispute_id = 'disp-ab' AND user_id = ?`).get(u2.id) as any).abandoned).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) n FROM user_achievements WHERE user_id = ?`).get(u2.id) as any).n).toBe(0);
    const stats = env.app.achievements.trophyRoom(u2.id).stats;
    expect(stats.disputes).toBe(0);
  });
});

describe('reinício do servidor', () => {
  it('restaura a sala e a disputa em andamento a partir do snapshot', async () => {
    const dir = env.dir + '-restart';
    const { startTestApp: start } = await import('./harness.js');
    let e1 = await start(dir);
    const a = await TestClient.guest(e1.app, 'Phoenix');
    a.strategy = 'manual';
    const { data } = await api(e1.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 2 } }, a.token);
    await a.send({ t: 'room:join', code: data.code });
    await a.send({ t: 'room:start' });
    const r = await a.waitFor((x) => x?.dispute?.auction?.step?.kind === 'bid');
    const disputeId = r!.dispute!.id;
    a.close();
    await sleep(50);
    await e1.stop();

    const e2 = await start(dir);
    const restored = e2.app.rooms.get(data.code);
    expect(restored).toBeTruthy();
    expect(restored!.status).toBe('in_dispute');
    expect(restored!.paused).toBe(true);
    expect(restored!.disputeId).toBe(disputeId);
    const a2 = new TestClient(e2.app, a.token, a.userId, 'Phoenix 2');
    await a2.connect();
    await a2.send({ t: 'room:join', code: data.code });
    await a2.waitFor(finished, 60_000, 'fim após reinício');
    expect(e2.app.db.prepare('SELECT status FROM disputes WHERE id = ?').pluck().get(disputeId)).toBe('finished');
    a2.close();
    await e2.stop();
    cleanupDir(dir);
  });
});
