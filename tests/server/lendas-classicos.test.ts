import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../../src/server/config.js';
import type { Card } from '../../src/engine/types.js';
import { CLASSICOS } from '../../src/shared/classicos.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Leilões “Lendas” (o de jogador só com Lendas e Craques) e “Clássicos” (o de clubes com pacotes de clássicos). */
let env: TestEnv;
let bare: TestEnv;

beforeAll(async () => {
  env = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-lendas-')), join(ROOT_DIR, 'data/deck-wikidata.json'), {
    nationalDeckPath: join(ROOT_DIR, 'data/deck-selecoes.json'),
  });
  // Baralho fictício: sem os clubes dos clássicos.
  bare = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-lendas-ficticio-')));
});
afterAll(async () => {
  await env.stop();
  await bare.stop();
  cleanupDir(env.dir);
  cleanupDir(bare.dir);
});

async function soloRoom(app: TestEnv, host: TestClient, settings: Record<string, unknown> = {}) {
  const { status, data } = await api(app.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3, ...settings } }, host.token);
  expect(status).toBe(200);
  await host.send({ t: 'room:join', code: data.code });
  await host.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
  return data.code as string;
}

/** Todas as cartas sorteadas para o leilão (lote e reserva do Monte), sem as reservas genéricas. */
function auctionCards(app: TestEnv, code: string): Card[] {
  const s = app.app.rooms.get(code)!.dispute!.auction.state;
  return Object.values(s.cards).filter((c) => !c.id.startsWith('fill-'));
}

describe('leilão de lendas', () => {
  it('só Lendas e Craques de todos os clubes, mesmo com um grupo de clubes salvo na sala; é leilão carta a carta', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Lendas');
    const code = await soloRoom(env, ana, { series: 'B' });
    expect(ana.room!.deck.themes.lendas).toBe(20);
    await ana.send({ t: 'room:settings', settings: { auctionMode: 'lendas' } });
    await ana.waitFor((r) => r?.settings.auctionMode === 'lendas', 5000, 'configurar');
    await ana.send({ t: 'room:start' });
    await ana.waitFor((r) => r?.dispute?.phase === 'auction' && !!r.dispute.auction?.step, 5000, 'leilão');
    const d = ana.room!.dispute!;
    expect(d.auctionMode).toBe('lendas');
    expect(Object.keys(d.packages)).toHaveLength(0);
    expect(d.auction!.step!.kind).toBe('bid');
    const cards = auctionCards(env, code);
    expect(cards.every((c) => c.tier === 'lenda' || c.tier === 'craque')).toBe(true);
    // Série B salva na sala não vale aqui: entram os grandes da Europa e da Série A.
    expect(new Set(cards.map((c) => c.series))).toEqual(new Set(['A', 'B', 'EU']));
    // Lendas primeiro: com 4 técnicos há Lenda de sobra em todas as posições, então o lote é só de Lendas.
    const state = env.app.rooms.get(code)!.dispute!.auction.state;
    const lot = (Object.values(state.levas).flat(2) as string[]).map((id) => state.cards[id]!);
    expect(lot.length).toBeGreaterThan(50);
    expect(lot.every((c) => c.tier === 'lenda')).toBe(true);
    ana.close();
  });
});

describe('leilão de clássicos', () => {
  it('cada pacote é o setor de um clássico, com os dois clubes; cada clube num clássico só', async () => {
    const bia = await TestClient.guest(env.app, 'Bia Clássicos');
    const code = await soloRoom(env, bia);
    expect(bia.room!.deck.themes.classicos).toBe(18);
    await bia.send({ t: 'room:settings', settings: { auctionMode: 'classicos' } });
    await bia.waitFor((x) => x?.settings.auctionMode === 'classicos', 5000, 'configurar');
    await bia.send({ t: 'room:start' });
    await bia.waitFor((x) => x?.dispute?.phase === 'auction' && !!x.dispute.auction?.step, 5000, 'leilão');
    const d = bia.room!.dispute!;
    expect(d.auctionMode).toBe('classicos');
    const packages = Object.values(d.packages);
    // 4 técnicos → 5 pacotes em cada um dos 5 setores, todos de clássico.
    expect(packages).toHaveLength(25);
    const clubIn = new Map<string, string>();
    for (const p of packages) {
      const classico = CLASSICOS.find((c) => c.nome === p.club);
      expect(classico, p.club).toBeTruthy();
      expect(p.clubs).toEqual([...classico!.clubes]);
      expect(p.label).toMatch(new RegExp(`^${p.club} · `));
      for (const club of p.clubs!) {
        expect(clubIn.get(club) ?? p.club, club).toBe(p.club);
        clubIn.set(club, p.club);
      }
    }
    // Os jogadores de cada pacote são dos dois clubes, e ninguém aparece em dois pacotes.
    const state = env.app.rooms.get(code)!.dispute!.auction.state;
    const people = new Set<string>();
    for (const pk of Object.values(state.packages ?? {})) {
      for (const id of pk.cardIds) {
        const c = state.cards[id]!;
        expect(pk.clubs).toContain(c.club);
        const who = c.personId ?? c.id;
        expect(people.has(who), c.name).toBe(false);
        people.add(who);
      }
    }
    bia.close();
  });

  it('joga um ciclo inteiro: convocação no automático e sobras para os times da liga', async () => {
    const caio = await TestClient.guest(env.app, 'Caio Clássicos');
    await soloRoom(env, caio, { auctionMode: 'classicos' });
    await caio.send({ t: 'room:start' });
    const r = await caio.waitFor((x) => x?.status === 'post_dispute' && !!x.lastResult, 60_000, 'fim do ciclo');
    expect(r!.lastResult!.outcomes).toHaveLength(4);
    caio.close();
  }, 90_000);

  it('não tem limite de técnicos: 10 técnicos começam normalmente', async () => {
    const duda = await TestClient.guest(env.app, 'Duda Dez');
    await soloRoom(env, duda, { auctionMode: 'classicos', cpuCount: 9 });
    await duda.send({ t: 'room:start' });
    await duda.waitFor((x) => x?.dispute?.phase === 'auction', 5000, 'leilão');
    expect(Object.values(duda.room!.dispute!.packages).filter((p) => p.position === 'GOL')).toHaveLength(11);
    duda.close();
  });

  it('baralho sem os clubes dos clássicos (fictício): a sala não começa nesse modo', async () => {
    const gil = await TestClient.guest(bare.app, 'Gil Fictício');
    await soloRoom(bare, gil, { auctionMode: 'classicos' });
    expect(gil.room!.deck.themes.classicos).toBe(0);
    await expect(gil.send({ t: 'room:start' })).rejects.toThrow(/não tem os clubes dos clássicos/);
    gil.close();
  });
});
