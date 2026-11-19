import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { AdminCardView } from '../../src/shared/protocol.js';
import { plainTier } from '../../src/server/services/deck-admin.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Página de admin: só o dono vê o baralho e ajusta Lenda e nível; os ajustes valem para as próximas disputas e sobrevivem a reiniciar. */
const dir = mkdtempSync(join(tmpdir(), 'martelo-admin-'));
const OWNER = 'dono@leilaofc.test';
let env: TestEnv;
afterAll(async () => {
  await env?.stop();
  cleanupDir(dir);
});

const deckCard = (id: string) => env.app.rooms.deps.deck.find((c) => c.id === id)!;

describe('página de admin', () => {
  let ownerToken = '';
  let guestToken = '';

  it('só o dono (conta registrada em ADMIN_USERS) acessa', async () => {
    env = await startTestApp(dir, undefined, { adminUsers: [OWNER] });
    const reg = await api(env.app, 'POST', '/api/auth/register', { email: OWNER, password: 'senha-forte-1', displayName: 'Dono FC' });
    expect(reg.status).toBe(200);
    ownerToken = reg.data.token;
    const other = await api(env.app, 'POST', '/api/auth/register', { email: 'outro@leilaofc.test', password: 'senha-forte-2', displayName: 'Outro FC' });
    const guest = await TestClient.guest(env.app, 'Convidado FC');
    guestToken = guest.token;
    guest.close();

    expect((await api(env.app, 'GET', '/api/admin/cards')).status).toBe(401);
    expect((await api(env.app, 'GET', '/api/admin/cards', undefined, guestToken)).status).toBe(403);
    expect((await api(env.app, 'GET', '/api/admin/cards', undefined, other.data.token)).status).toBe(403);
    // A tela sabe quem é dono (para mostrar o atalho), e ninguém mais recebe o selo.
    expect((await api(env.app, 'GET', '/api/me', undefined, ownerToken)).data.user.admin).toBe(true);
    expect((await api(env.app, 'GET', '/api/me', undefined, other.data.token)).data.user.admin).toBe(false);

    const list = await api<{ cards: AdminCardView[] }>(env.app, 'GET', '/api/admin/cards', undefined, ownerToken);
    expect(list.status).toBe(200);
    expect(list.data.cards).toHaveLength(env.app.rooms.deps.deck.length);
    expect(list.data.cards.every((c) => c.original === null)).toBe(true);
  });

  it('marca e desmarca Lenda, muda o nível, e o baralho das próximas disputas acompanha', async () => {
    const list = (await api<{ cards: AdminCardView[] }>(env.app, 'GET', '/api/admin/cards', undefined, ownerToken)).data.cards;
    const titular = list.find((c) => c.tier === 'titular')!;
    const before = deckCard(titular.id);

    // Vira Lenda: a faixa vai para Lenda e o nível fica como estava.
    const up = await api<{ card: AdminCardView }>(env.app, 'PATCH', `/api/admin/cards/${titular.id}`, { legend: true }, ownerToken);
    expect(up.status).toBe(200);
    expect(up.data.card).toMatchObject({ tier: 'lenda', levelMin: titular.levelMin, levelMax: titular.levelMax });
    expect(up.data.card.original).toEqual({ levelMin: titular.levelMin, levelMax: titular.levelMax, tier: 'titular' });
    expect(deckCard(titular.id).tier).toBe('lenda');
    // Troca o objeto, nunca altera o antigo: disputa já em andamento segue com a carta com que começou.
    expect(before.tier).toBe('titular');

    // Nível novo de Lenda: continua Lenda.
    const lvl = await api<{ card: AdminCardView }>(env.app, 'PATCH', `/api/admin/cards/${titular.id}`, { levelMin: 91, levelMax: 97 }, ownerToken);
    expect(lvl.data.card).toMatchObject({ tier: 'lenda', levelMin: 91, levelMax: 97 });

    // Deixa de ser Lenda: a faixa sai do nível, nunca acima de Craque.
    const down = await api<{ card: AdminCardView }>(env.app, 'PATCH', `/api/admin/cards/${titular.id}`, { legend: false }, ownerToken);
    expect(down.data.card.tier).toBe('craque');
    expect(plainTier(91, 97)).toBe('craque');

    // Nível de quem não é Lenda: a faixa acompanha.
    const low = await api<{ card: AdminCardView }>(env.app, 'PATCH', `/api/admin/cards/${titular.id}`, { levelMin: 60, levelMax: 66 }, ownerToken);
    expect(low.data.card.tier).toBe('perna');
    expect(deckCard(titular.id)).toMatchObject({ levelMin: 60, levelMax: 66, tier: 'perna' });
  });

  it('recusa nível impossível, carta que não existe e quem não é dono', async () => {
    const id = env.app.rooms.deps.deck[0]!.id;
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { levelMin: 90, levelMax: 80 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { levelMin: 0 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { levelMax: 101 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { legend: 'sim' }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', '/api/admin/cards/nao-existe', { legend: true }, ownerToken)).status).toBe(404);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { legend: true }, guestToken)).status).toBe(403);
    expect(deckCard(id).tier).toBe(env.app.rooms.deps.deck[0]!.tier);
  });

  it('os ajustes sobrevivem a reiniciar o servidor; desfazer volta ao arquivo', async () => {
    const edited = (await api<{ cards: AdminCardView[] }>(env.app, 'GET', '/api/admin/cards', undefined, ownerToken)).data.cards.filter((c) => c.original);
    expect(edited).toHaveLength(1);
    const id = edited[0]!.id;
    await env.stop();
    env = await startTestApp(dir, undefined, { adminUsers: [OWNER] });
    expect(deckCard(id)).toMatchObject({ levelMin: 60, levelMax: 66, tier: 'perna' });

    const login = await api(env.app, 'POST', '/api/auth/login', { email: OWNER, password: 'senha-forte-1' });
    ownerToken = login.data.token;
    const reset = await api<{ card: AdminCardView }>(env.app, 'DELETE', `/api/admin/cards/${id}`, undefined, ownerToken);
    expect(reset.status).toBe(200);
    expect(reset.data.card.original).toBeNull();
    expect(reset.data.card.tier).toBe('titular');
    expect(env.app.db.prepare('SELECT COUNT(*) FROM card_overrides').pluck().get()).toBe(0);
    // Voltar à mão para o que o arquivo tem também apaga o ajuste.
    const card = deckCard(id);
    await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { legend: true }, ownerToken);
    await api(env.app, 'PATCH', `/api/admin/cards/${id}`, { legend: false }, ownerToken);
    expect(deckCard(id)).toMatchObject({ levelMin: card.levelMin, levelMax: card.levelMax, tier: 'titular' });
    expect(env.app.db.prepare('SELECT COUNT(*) FROM card_overrides').pluck().get()).toBe(0);
  });
});
