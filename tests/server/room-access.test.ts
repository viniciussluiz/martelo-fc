import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublicRoomView } from '../../src/shared/protocol.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

/** Sala aberta × fechada (com senha), sala oculta e a lista de salas em andamento. */
let env: TestEnv;
beforeAll(async () => {
  env = await startTestApp();
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

async function createRoom(host: TestClient, body: Record<string, unknown> = {}) {
  const res = await api(env.app, 'POST', '/api/rooms', { mode: 'online', ...body }, host.token);
  expect(res.status).toBe(200);
  const code = res.data.code as string;
  await host.send({ t: 'room:join', code });
  await host.waitFor((r) => r?.code === code, 5000, 'anfitrião na sala');
  return code;
}

const listed = async (c: TestClient) => ((await api(env.app, 'GET', '/api/public-rooms', undefined, c.token)).data.rooms as PublicRoomView[]).map((r) => r.code);

describe('acesso à sala', () => {
  it('sala aberta: entra quem tem o código e ela aparece na lista', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Aberta');
    const beto = await TestClient.guest(env.app, 'Beto Visita');
    const code = await createRoom(ana);
    expect(ana.room!.locked).toBe(false);
    const rooms = (await api(env.app, 'GET', '/api/public-rooms', undefined, beto.token)).data.rooms as PublicRoomView[];
    const row = rooms.find((r) => r.code === code)!;
    expect(row).toMatchObject({ hostName: 'Ana Aberta', status: 'lobby', humans: 1, locked: false, phase: null });
    await beto.send({ t: 'room:join', code });
    await beto.waitFor((r) => r?.code === code, 5000, 'entrar sem senha');
    ana.close();
    beto.close();
  });

  it('sala fechada: sem senha ou com a senha errada não entra; com a certa entra, e quem já é da sala volta sem senha', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Fechada');
    const beto = await TestClient.guest(env.app, 'Beto Senha');
    const code = await createRoom(ana, { password: 'gol123' });
    expect(ana.room!.locked).toBe(true);
    // A senha (nem o hash) nunca vai para a tela de ninguém.
    expect(JSON.stringify(ana.room)).not.toContain('gol123');
    expect(JSON.stringify(ana.room)).not.toContain('scrypt');
    expect((await api(env.app, 'GET', `/api/rooms/${code}`, undefined, beto.token)).data.locked).toBe(true);
    await expect(beto.send({ t: 'room:join', code })).rejects.toThrow(/fechada/);
    await expect(beto.send({ t: 'room:join', code, password: 'errada' })).rejects.toThrow(/Senha incorreta/);
    await beto.send({ t: 'room:join', code, password: 'gol123' });
    await beto.waitFor((r) => r?.code === code && r.members.length === 2, 5000, 'entrar com a senha');
    // Saiu e voltou: já é da sala, não precisa da senha de novo.
    await beto.send({ t: 'room:leave' });
    await beto.send({ t: 'room:join', code });
    await beto.waitFor((r) => r?.code === code, 5000, 'voltar sem senha');
    // No banco fica só o hash.
    const stored = env.app.db.prepare('SELECT password_hash FROM rooms WHERE code = ?').pluck().get(code) as string;
    expect(stored).toMatch(/^scrypt\$/);
    ana.close();
    beto.close();
  });

  it('o anfitrião põe, troca e tira a senha no lobby; só ele', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Dona');
    const beto = await TestClient.guest(env.app, 'Beto Membro');
    const caio = await TestClient.guest(env.app, 'Caio Fora');
    const code = await createRoom(ana);
    await beto.send({ t: 'room:join', code });
    await beto.waitFor((r) => r?.code === code, 5000, 'entrar');
    await expect(beto.send({ t: 'room:password', password: 'minha' })).rejects.toThrow(/anfitrião/);
    await expect(ana.send({ t: 'room:password', password: 'ab' })).rejects.toThrow(/de 3 a 32/);
    await ana.send({ t: 'room:password', password: 'trave9' });
    await beto.waitFor((r) => r?.locked === true, 5000, 'sala fechada para todos verem');
    await expect(caio.send({ t: 'room:join', code })).rejects.toThrow(/fechada/);
    await ana.send({ t: 'room:password', password: null });
    await beto.waitFor((r) => r?.locked === false, 5000, 'sala aberta de novo');
    await caio.send({ t: 'room:join', code });
    await caio.waitFor((r) => r?.code === code, 5000, 'entrar depois de aberta');
    for (const c of [ana, beto, caio]) c.close();
  });

  it('muitas senhas erradas: tem de esperar', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Cofre');
    const beto = await TestClient.guest(env.app, 'Beto Chute');
    const code = await createRoom(ana, { password: 'segredo' });
    for (let i = 0; i < 8; i++) await expect(beto.send({ t: 'room:join', code, password: `x${i}` })).rejects.toThrow(/Senha incorreta/);
    await expect(beto.send({ t: 'room:join', code, password: 'segredo' })).rejects.toThrow(/Muitas senhas erradas/);
    ana.close();
    beto.close();
  });

  it('sala oculta não aparece na lista (e volta a aparecer quando o anfitrião mostra); a de um jogador nunca aparece', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Oculta');
    const beto = await TestClient.guest(env.app, 'Beto Lista');
    const solo = await TestClient.guest(env.app, 'Solo Só');
    const code = await createRoom(ana, { settings: { hidden: true } });
    expect(ana.room!.settings.hidden).toBe(true);
    expect(await listed(beto)).not.toContain(code);
    // Oculta não é fechada: com o código, entra.
    await beto.send({ t: 'room:join', code });
    await beto.waitFor((r) => r?.code === code, 5000, 'entrar pelo código');
    await ana.send({ t: 'room:settings', settings: { hidden: false } });
    await ana.waitFor((r) => r?.settings.hidden === false, 5000, 'mostrar');
    expect(await listed(solo)).toContain(code);
    const single = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3 }, password: 'naovale' }, solo.token);
    await solo.send({ t: 'room:join', code: single.data.code });
    await solo.waitFor((r) => r?.code === single.data.code, 5000, 'single player');
    expect(solo.room!.locked).toBe(false);
    expect(await listed(beto)).not.toContain(single.data.code);
    // Sala em que ninguém está conectado some da lista.
    ana.close();
    beto.close();
    await new Promise((r) => setTimeout(r, 150));
    expect(await listed(solo)).not.toContain(code);
    solo.close();
  });

  it('senha fora do tamanho ao criar a sala: erro 400', async () => {
    const ana = await TestClient.guest(env.app, 'Ana Curta');
    const res = await api(env.app, 'POST', '/api/rooms', { mode: 'online', password: 'a' }, ana.token);
    expect(res.status).toBe(400);
    ana.close();
  });
});
