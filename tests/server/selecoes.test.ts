import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../../src/server/config.js';
import { nationalTeam } from '../../src/shared/selecoes.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Modo “Seleções”: o servidor soma as cartas de seleção ao baralho real e a sala leiloa setores de seleções. */
let env: TestEnv;
let bare: TestEnv;

beforeAll(async () => {
  env = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-selecoes-')), join(ROOT_DIR, 'data/deck-wikidata.json'), {
    nationalDeckPath: join(ROOT_DIR, 'data/deck-selecoes.json'),
  });
  // Baralho sem cartas de seleção (o fictício).
  bare = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-sem-selecoes-')));
});
afterAll(async () => {
  await env.stop();
  await bare.stop();
  cleanupDir(env.dir);
  cleanupDir(bare.dir);
});

async function soloRoom(app: TestEnv, host: TestClient) {
  const { status, data } = await api(app.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3 } }, host.token);
  expect(status).toBe(200);
  await host.send({ t: 'room:join', code: data.code });
  await host.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
  return data.code as string;
}

describe('leilão de seleções', () => {
  it('a sala mostra as seleções do baralho e leiloa pacotes de seleção', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Seleções');
    await soloRoom(env, ana);
    expect(ana.room!.deck.groups.SEL).toBeGreaterThan(300);
    expect(ana.room!.deck.clubs.SEL).toEqual(expect.arrayContaining(['Brasil', 'Argentina', 'Alemanha']));
    // As cartas de seleção não entram na conta dos grupos de clubes.
    expect(ana.room!.deck.clubs.A).not.toContain('Brasil');
    await ana.send({ t: 'room:settings', settings: { auctionMode: 'selecoes' } });
    await ana.waitFor((r) => r?.settings.auctionMode === 'selecoes', 5000, 'configurar');
    await ana.send({ t: 'room:start' });
    await ana.waitFor((r) => r?.dispute?.phase === 'auction' && !!r.dispute.auction?.step, 5000, 'leilão');
    const d = ana.room!.dispute!;
    expect(d.auctionMode).toBe('selecoes');
    const packages = Object.values(d.packages);
    // 4 técnicos → 5 pacotes em cada um dos 5 setores.
    expect(packages).toHaveLength(25);
    for (const p of packages) expect(nationalTeam(p.club), p.club).toBeTruthy();
    ana.close();
  });

  it('o leilão de clubes continua sem seleções', async () => {
    const bia = await TestClient.guest(env.app, 'Bia Clubes');
    await soloRoom(env, bia);
    await bia.send({ t: 'room:settings', settings: { auctionMode: 'clubes' } });
    await bia.send({ t: 'room:start' });
    await bia.waitFor((r) => r?.dispute?.phase === 'auction' && !!r.dispute.auction?.step, 5000, 'leilão');
    expect(bia.room!.dispute!.auctionMode).toBe('clubes');
    for (const p of Object.values(bia.room!.dispute!.packages)) expect(nationalTeam(p.club), p.club).toBeUndefined();
    bia.close();
  });

  it('baralho sem cartas de seleção: a sala não começa nesse modo', async () => {
    const caio = await TestClient.guest(bare.app, 'Caio Sem Seleção');
    await soloRoom(bare, caio);
    expect(caio.room!.deck.groups.SEL).toBeUndefined();
    await caio.send({ t: 'room:settings', settings: { auctionMode: 'selecoes' } });
    await expect(caio.send({ t: 'room:start' })).rejects.toThrow(/não tem cartas de seleção/);
    expect(caio.room!.status).toBe('lobby');
    caio.close();
  });
});
