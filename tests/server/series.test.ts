import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../../src/server/config.js';
import type { Card } from '../../src/engine/types.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/**
 * Sala escolhe os clubes das cartas (Série A, Série B, Europa…). Usa o baralho fictício
 * com os cartões divididos em grupos, para o teste não depender dos dados do Wikidata.
 */
let env: TestEnv;
const group = new Map<string, 'A' | 'B' | 'EU'>();

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'martelo-series-'));
  const fictional = JSON.parse(readFileSync(join(ROOT_DIR, 'data/deck.json'), 'utf8')) as { cards: Card[] };
  // Duas cópias do baralho (uma “Série A”, outra “Europa”) e um terço também na “Série B”.
  const cards: Card[] = [];
  fictional.cards.forEach((c, i) => {
    cards.push({ ...c, id: `${c.id}-a`, series: 'A', club: 'Clube A' });
    cards.push({ ...c, id: `${c.id}-eu`, series: 'EU', club: 'Clube Europa' });
    if (i % 3 === 0) cards.push({ ...c, id: `${c.id}-b`, series: 'B', club: 'Clube B' });
  });
  for (const c of cards) group.set(c.id, c.series!);
  const deckPath = join(dir, 'deck-grupos.json');
  writeFileSync(deckPath, JSON.stringify({ id: 'teste', name: 'Baralho de teste', cards }));
  env = await startTestApp(dir, deckPath);
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

function poolGroups(code: string): Set<string> {
  const room = env.app.rooms.get(code)!;
  const ids = Object.values(room.dispute!.auction.state.levas).flat(2) as string[];
  return new Set(ids.filter((id) => !id.startsWith('fill-')).map((id) => group.get(id) ?? '?'));
}

describe('clubes das cartas escolhidos na sala', () => {
  it('a sala mostra o baralho e os grupos; o padrão é usar tudo', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Grupos');
    await soloRoom(ana);
    expect(ana.room!.settings.series).toBe('ALL');
    expect(ana.room!.deck.name).toBe('Baralho de teste');
    expect(ana.room!.deck.groups.A).toBeGreaterThan(0);
    expect(ana.room!.deck.groups.EU).toBeGreaterThan(0);
    expect(ana.room!.deck.clubs.B).toEqual(['Clube B']);
    ana.close();
  });

  it('rejeita grupo inválido', async () => {
    const bia = await TestClient.guest(env.app, 'Bia Grupos');
    await soloRoom(bia);
    await expect(bia.send({ t: 'room:settings', settings: { series: 'Z' as never } })).rejects.toThrow(/Grupo de clubes inválido/);
    expect(bia.room!.settings.series).toBe('ALL');
    bia.close();
  });

  for (const scope of ['A', 'B', 'EU'] as const) {
    it(`com “${scope}”, o leilão só tem cartas desse grupo`, async () => {
      const c = await TestClient.guest(env.app, `Técnico ${scope}`);
      const code = await soloRoom(c);
      await c.send({ t: 'room:settings', settings: { series: scope } });
      await c.waitFor((r) => r?.settings.series === scope, 5000, 'configurar');
      await c.send({ t: 'room:start' });
      await c.waitFor((r) => r?.dispute?.phase === 'auction', 5000, 'leilão');
      expect([...poolGroups(code)]).toEqual([scope]);
      c.close();
    });
  }

  it('com “Séries A e B”, nada da Europa', async () => {
    const d = await TestClient.guest(env.app, 'Duda Grupos');
    const code = await soloRoom(d, { series: 'AB' });
    expect(d.room!.settings.series).toBe('AB');
    await d.send({ t: 'room:start' });
    await d.waitFor((r) => r?.dispute?.phase === 'auction', 5000, 'leilão');
    const groups = poolGroups(code);
    expect(groups.has('EU')).toBe(false);
    expect(groups.has('A')).toBe(true);
    d.close();
  });
});
