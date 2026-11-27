import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../../src/server/config.js';
import type { Card } from '../../src/engine/types.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Jogadores pouco conhecidos (deck-ajustes.json → ocultar): fora do leilão de jogadores, dentro dos pacotes. */
let env: TestEnv;

beforeAll(async () => {
  env = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-ocultos-')), join(ROOT_DIR, 'data/deck-wikidata.json'));
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

async function start(client: TestClient, settings: Record<string, unknown>) {
  const { status, data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 9, ...settings } }, client.token);
  expect(status).toBe(200);
  await client.send({ t: 'room:join', code: data.code });
  await client.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
  await client.send({ t: 'room:start' });
  await client.waitFor((r) => r?.dispute?.phase === 'auction' && !!r.dispute.auction?.step, 5000, 'leilão');
  return env.app.rooms.get(data.code)!.dispute!.auction.state;
}

describe('jogadores ocultos', () => {
  it('nunca entram no leilão de jogadores, nem com a sala cheia de CPUs e só a Série B', async () => {
    for (const series of ['ALL', 'B'] as const) {
      const ana = await TestClient.guest(env.app, `Ana ${series}`);
      const state = await start(ana, { series });
      const cards = Object.values(state.cards).filter((c: Card) => !c.id.startsWith('fill-')) as Card[];
      expect(cards.length).toBeGreaterThan(100);
      expect(cards.filter((c) => c.packagesOnly).map((c) => c.name)).toEqual([]);
      ana.close();
    }
  });

  it('continuam nos pacotes do leilão de clubes', async () => {
    const bia = await TestClient.guest(env.app, 'Bia Clubes');
    const state = await start(bia, { auctionMode: 'clubes' });
    const cards = Object.values(state.cards) as Card[];
    expect(cards.some((c) => c.packagesOnly)).toBe(true);
    bia.close();
  });
});
