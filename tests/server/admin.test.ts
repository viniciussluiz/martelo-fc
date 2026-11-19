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
    expect(up.data.card.original).toEqual({ levelMin: titular.levelMin, levelMax: titular.levelMax, tier: 'titular', name: titular.name, position: titular.position, club: titular.club, year: titular.year });
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

  it('cria jogador em clube do baralho e em clube novo; entra no baralho na hora e sobrevive a reiniciar; só o criado se exclui', async () => {
    const deck = () => env.app.rooms.deps.deck;
    const sample = deck()[0]!;
    const totalBefore = env.app.deckInfo.total;

    // Clube do baralho: pega o grupo e as cores do clube.
    const a = await api<{ card: AdminCardView }>(
      env.app,
      'POST',
      '/api/admin/cards',
      { name: 'Craque Inventado', position: 'ATA', club: sample.club.toUpperCase(), year: 2024, levelMin: 88, levelMax: 94, legend: true },
      ownerToken,
    );
    expect(a.status).toBe(200);
    expect(a.data.card).toMatchObject({ name: 'Craque Inventado', club: sample.club, tier: 'lenda', custom: true, original: null });
    expect(a.data.card.series).toBe(sample.series);
    expect(a.data.card.id).toMatch(/^adm-/);
    expect(deck().find((c) => c.id === a.data.card.id)).toMatchObject({ club: sample.club, levelMin: 88, levelMax: 94, tier: 'lenda' });
    // O resumo do baralho (o que o lobby mostra) já conta a carta nova.
    expect(env.app.deckInfo.total).toBe(totalBefore + 1);

    // Clube novo: precisa do grupo; sem Lenda, a faixa sai do nível.
    expect((await api(env.app, 'POST', '/api/admin/cards', { name: 'Zé Novo', position: 'MEI', club: 'Clube Inexistente FC', year: 2020, levelMin: 70, levelMax: 76, legend: false }, ownerToken)).status).toBe(400);
    const b = await api<{ card: AdminCardView }>(
      env.app,
      'POST',
      '/api/admin/cards',
      { name: 'Zé Novo', position: 'MEI', club: 'Clube Inexistente FC', newClub: { series: 'EU', kit: ['#112233', '#ffffff'] }, year: 2020, levelMin: 70, levelMax: 76, legend: false },
      ownerToken,
    );
    expect(b.status).toBe(200);
    expect(b.data.card).toMatchObject({ club: 'Clube Inexistente FC', series: 'EU', tier: 'operario' });
    expect(deck().find((c) => c.id === b.data.card.id)!.kit).toEqual(['#112233', '#FFFFFF']);
    expect(env.app.deckInfo.groups.EU).toBe(1);
    expect(env.app.deckInfo.clubs.EU).toEqual(['Clube Inexistente FC']);

    // Recusas: repetido, posição, ano, nível e quem não é dono.
    const base = { name: 'Zé Novo', position: 'MEI', club: 'Clube Inexistente FC', year: 2020, levelMin: 70, levelMax: 76, legend: false };
    expect((await api(env.app, 'POST', '/api/admin/cards', base, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'POST', '/api/admin/cards', { ...base, name: 'Outro', position: 'PIV' }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'POST', '/api/admin/cards', { ...base, name: 'Outro', year: 1800 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'POST', '/api/admin/cards', { ...base, name: 'Outro', levelMin: 80, levelMax: 70 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'POST', '/api/admin/cards', { ...base, name: 'Outro' }, guestToken)).status).toBe(403);

    // Ajuste de nível no criado funciona como em qualquer carta.
    const adj = await api<{ card: AdminCardView }>(env.app, 'PATCH', `/api/admin/cards/${b.data.card.id}`, { levelMin: 84, levelMax: 90 }, ownerToken);
    expect(adj.data.card).toMatchObject({ tier: 'craque', custom: true });

    // Reiniciar: os criados voltam (com o ajuste).
    await env.stop();
    env = await startTestApp(dir, undefined, { adminUsers: [OWNER] });
    ownerToken = (await api(env.app, 'POST', '/api/auth/login', { email: OWNER, password: 'senha-forte-1' })).data.token;
    expect(deck().find((c) => c.id === a.data.card.id)).toMatchObject({ tier: 'lenda', club: sample.club });
    expect(deck().find((c) => c.id === b.data.card.id)).toMatchObject({ levelMin: 84, levelMax: 90, tier: 'craque' });
    const list = (await api<{ cards: AdminCardView[] }>(env.app, 'GET', '/api/admin/cards', undefined, ownerToken)).data.cards;
    expect(list.filter((c) => c.custom).map((c) => c.name).sort()).toEqual(['Craque Inventado', 'Zé Novo']);

    // Excluir: só o criado; a carta do arquivo não se exclui.
    expect((await api(env.app, 'DELETE', `/api/admin/custom-cards/${sample.id}`, undefined, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'DELETE', `/api/admin/custom-cards/${b.data.card.id}`, undefined, ownerToken)).status).toBe(200);
    expect(deck().some((c) => c.id === b.data.card.id)).toBe(false);
    expect(env.app.db.prepare('SELECT COUNT(*) FROM card_overrides WHERE card_id = ?').pluck().get(b.data.card.id)).toBe(0);
    // Depois de excluir, as outras cartas continuam editáveis (o índice foi refeito).
    const last = deck()[deck().length - 1]!;
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${last.id}`, { legend: true }, ownerToken)).data.card.id).toBe(last.id);
  });

  it('faces para gerar: quem vira Lenda sem face entra na lista; deixa de ser Lenda, sai; dá para tirar e pôr todas', async () => {
    type Faces = { items: Array<{ key: string; name: string; club: string; year: number; position: string }>; missing: number };
    const get = async () => (await api<{ faces: Faces }>(env.app, 'GET', '/api/admin/cards', undefined, ownerToken)).data.faces;
    // O jogador criado como Lenda no teste anterior já entrou.
    expect((await get()).items.map((i) => i.name)).toContain('Craque Inventado');

    const plain = env.app.rooms.deps.deck.find((c) => c.tier === 'titular')!;
    const up = await api<{ faces: Faces }>(env.app, 'PATCH', `/api/admin/cards/${plain.id}`, { legend: true }, ownerToken);
    const item = up.data.faces.items.find((i) => i.key === plain.id)!;
    expect(item).toMatchObject({ name: plain.name, club: plain.club, year: plain.year, position: plain.position });
    // Marcar de novo não repete.
    await api(env.app, 'PATCH', `/api/admin/cards/${plain.id}`, { levelMin: 92, levelMax: 98 }, ownerToken);
    expect((await get()).items.filter((i) => i.key === plain.id)).toHaveLength(1);
    // Deixou de ser Lenda: sai.
    const down = await api<{ faces: Faces }>(env.app, 'PATCH', `/api/admin/cards/${plain.id}`, { legend: false }, ownerToken);
    expect(down.data.faces.items.some((i) => i.key === plain.id)).toBe(false);
    // Tirar da lista à mão.
    await api(env.app, 'PATCH', `/api/admin/cards/${plain.id}`, { legend: true }, ownerToken);
    const dismissed = await api<{ faces: Faces }>(env.app, 'DELETE', `/api/admin/faces/${plain.id}`, undefined, ownerToken);
    expect(dismissed.data.faces.items.some((i) => i.key === plain.id)).toBe(false);
    // Pôr todas as Lendas sem face do baralho (o baralho de teste não tem retratos).
    const before = await get();
    expect(before.missing).toBeGreaterThan(0);
    const filled = await api<{ faces: Faces }>(env.app, 'POST', '/api/admin/faces/fill', undefined, ownerToken);
    expect(filled.data.faces.missing).toBe(0);
    expect(filled.data.faces.items.length).toBe(before.items.length + before.missing);
    // Excluir o jogador criado tira ele da lista. Só o dono mexe na lista.
    const custom = env.app.rooms.deps.deck.find((c) => c.name === 'Craque Inventado')!;
    const gone = await api<{ faces: Faces }>(env.app, 'DELETE', `/api/admin/custom-cards/${custom.id}`, undefined, ownerToken);
    expect(gone.data.faces.items.some((i) => i.key === custom.id)).toBe(false);
    expect((await api(env.app, 'POST', '/api/admin/faces/fill', undefined, guestToken)).status).toBe(403);
    expect((await api(env.app, 'DELETE', `/api/admin/faces/${plain.id}`, undefined, guestToken)).status).toBe(403);
  });

  it('edita nome, posição, ano e clube (leva o grupo e as cores do clube); sobrevive a reiniciar; desfazer volta tudo', async () => {
    const deck = () => env.app.rooms.deps.deck;
    const count = (id: string) => env.app.db.prepare('SELECT COUNT(*) FROM card_overrides WHERE card_id = ?').pluck().get(id);
    // Um clube com grupo e cores (o baralho de teste não tem): um jogador criado num clube novo.
    const owner = await api<{ card: AdminCardView }>(
      env.app,
      'POST',
      '/api/admin/cards',
      { name: 'Dono das Cores', position: 'MEI', club: 'Clube das Cores', newClub: { series: 'B', kit: ['#000000', '#ffcc00'] }, year: 2010, levelMin: 70, levelMax: 76, legend: false },
      ownerToken,
    );
    expect(owner.status).toBe(200);

    const target = { ...deck().find((c) => !c.id.startsWith('adm-') && c.tier !== 'lenda' && c.position !== 'GOL')! };
    const before = deckCard(target.id);
    const r = await api<{ card: AdminCardView }>(
      env.app,
      'PATCH',
      `/api/admin/cards/${target.id}`,
      { name: 'Nome Novo', position: 'GOL', year: 1999, club: 'clube das cores' },
      ownerToken,
    );
    expect(r.status).toBe(200);
    expect(r.data.card).toMatchObject({ name: 'Nome Novo', position: 'GOL', year: 1999, club: 'Clube das Cores', series: 'B', levelMin: target.levelMin, tier: target.tier });
    expect(r.data.card.original).toMatchObject({ name: target.name, club: target.club, year: target.year, position: target.position });
    expect(deckCard(target.id)).toMatchObject({ kit: ['#000000', '#FFCC00'], series: 'B', hint: 'Clube das Cores (1999).' });
    // Objeto novo: disputa em andamento segue com a carta antiga.
    expect(before.name).toBe(target.name);
    expect(env.app.deckInfo.clubs.B).toContain('Clube das Cores');

    // Clube novo sem grupo, repetido e posição/ano/nome inválidos: recusa e nada muda.
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${target.id}`, { club: 'Clube Que Não Existe' }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${owner.data.card.id}`, { name: 'nome novo', year: 1999 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${target.id}`, { position: 'PIV' }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${target.id}`, { year: 1800 }, ownerToken)).status).toBe(400);
    expect((await api(env.app, 'PATCH', `/api/admin/cards/${target.id}`, { name: 'X' }, ownerToken)).status).toBe(400);
    expect(deckCard(target.id)).toMatchObject({ name: 'Nome Novo', club: 'Clube das Cores' });

    // Clube novo com o grupo e as cores.
    const nc = await api<{ card: AdminCardView }>(
      env.app,
      'PATCH',
      `/api/admin/cards/${target.id}`,
      { club: 'Clube Que Não Existe', newClub: { series: 'EU', kit: ['#123456', '#abcdef'] } },
      ownerToken,
    );
    expect(nc.data.card).toMatchObject({ club: 'Clube Que Não Existe', series: 'EU' });
    expect(deckCard(target.id).kit).toEqual(['#123456', '#ABCDEF']);

    // Reiniciar: a edição continua.
    await env.stop();
    env = await startTestApp(dir, undefined, { adminUsers: [OWNER] });
    ownerToken = (await api(env.app, 'POST', '/api/auth/login', { email: OWNER, password: 'senha-forte-1' })).data.token;
    expect(deckCard(target.id)).toMatchObject({ name: 'Nome Novo', position: 'GOL', year: 1999, club: 'Clube Que Não Existe', series: 'EU', kit: ['#123456', '#ABCDEF'] });

    // Desfazer volta tudo ao arquivo (inclusive a dica, o grupo e as cores).
    const reset = await api<{ card: AdminCardView }>(env.app, 'DELETE', `/api/admin/cards/${target.id}`, undefined, ownerToken);
    expect(reset.data.card.original).toBeNull();
    expect(deckCard(target.id)).toEqual(target);
    expect(count(target.id)).toBe(0);

    // Voltar à mão também apaga o ajuste.
    await api(env.app, 'PATCH', `/api/admin/cards/${target.id}`, { name: 'Outro Nome', club: 'Clube das Cores', year: 2001 }, ownerToken);
    expect(count(target.id)).toBe(1);
    await api(env.app, 'PATCH', `/api/admin/cards/${target.id}`, { name: target.name, club: target.club, year: target.year }, ownerToken);
    expect(deckCard(target.id)).toEqual(target);
    expect(count(target.id)).toBe(0);
  });

  it('editar jogador criado muda o próprio jogador (sem ajuste à parte); virar Lenda pela edição entra na lista de faces', async () => {
    const custom = env.app.rooms.deps.deck.find((c) => c.name === 'Dono das Cores')!;
    const r = await api<{ card: AdminCardView; faces: { items: Array<{ key: string; name: string }> } }>(
      env.app,
      'PATCH',
      `/api/admin/cards/${custom.id}`,
      { name: 'Dono Renomeado', position: 'ATA', club: 'Clube das Cores', year: 2012, levelMin: 90, levelMax: 95, legend: true },
      ownerToken,
    );
    expect(r.status).toBe(200);
    expect(r.data.card).toMatchObject({ name: 'Dono Renomeado', position: 'ATA', year: 2012, tier: 'lenda', custom: true, original: null });
    expect(r.data.faces.items.find((i) => i.key === custom.id)?.name).toBe('Dono Renomeado');
    const json = JSON.parse(env.app.db.prepare('SELECT card_json FROM custom_cards WHERE id = ?').pluck().get(custom.id) as string);
    expect(json).toMatchObject({ name: 'Dono Renomeado', year: 2012, tier: 'lenda', series: 'B', kit: ['#000000', '#FFCC00'], hint: 'Clube das Cores (2012).' });
    expect(env.app.db.prepare('SELECT COUNT(*) FROM card_overrides WHERE card_id = ?').pluck().get(custom.id)).toBe(0);
    // Salvar de novo sem mudar nada (o formulário manda tudo): não repete na lista.
    const again = await api<{ faces: { items: Array<{ key: string }> } }>(
      env.app,
      'PATCH',
      `/api/admin/cards/${custom.id}`,
      { name: 'Dono Renomeado', position: 'ATA', club: 'Clube das Cores', year: 2012, levelMin: 90, levelMax: 95, legend: true },
      ownerToken,
    );
    expect(again.data.faces.items.filter((i) => i.key === custom.id)).toHaveLength(1);

    await env.stop();
    env = await startTestApp(dir, undefined, { adminUsers: [OWNER] });
    expect(env.app.rooms.deps.deck.find((c) => c.id === custom.id)).toMatchObject({ name: 'Dono Renomeado', tier: 'lenda', levelMin: 90 });
  });
});

describe('chave do retrato', () => {
  it('cartas do Wikidata usam o QID da pessoa (clube e seleção); jogador criado, o id da carta', async () => {
    const { legendArtFile, legendArtKey } = await import('../../src/shared/legend-art.js');
    expect(legendArtKey('wd-Q12897-Q131465-1967')).toBe('Q12897');
    expect(legendArtKey('sel-Q12897-BRA')).toBe('Q12897');
    expect(legendArtFile('wd-Q12897-Q131465-1967')).toBe('pele');
    expect(legendArtKey('adm-1a2b3c4d')).toBe('adm-1a2b3c4d');
    expect(legendArtFile('adm-1a2b3c4d')).toBeNull();
  });

  it('exceção por carta: Robinho no Real Madrid fica sem face; as outras versões dele continuam com o retrato', async () => {
    const { legendArtFile, legendArtKey } = await import('../../src/shared/legend-art.js');
    expect(legendArtFile('wd-Q58441-Q8682-2008')).toBeNull();
    expect(legendArtKey('wd-Q58441-Q8682-2008')).toBe('wd-Q58441-Q8682-2008');
    expect(legendArtFile('wd-Q58441-Q80955-2004')).toBe('robinho');
    expect(legendArtFile('wd-Q58441-Q270995-2016')).toBe('robinho');
  });
});
