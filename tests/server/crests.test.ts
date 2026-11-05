import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crestForTeamName, defaultUserCrest, generateCrest, parseCrest, teamInitials, type CrestConfig } from '../../src/shared/crest.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

const RECIPE: CrestConfig = {
  shape: 'redondo',
  pattern: 'listras',
  primary: '#1C2E6B',
  secondary: '#FFFFFF',
  detail: '#FFC81E',
  symbol: 'leao',
  initials: 'UP',
  motto: 'RAÇA',
  stars: 2,
  ribbon: true,
  laurel: false,
  medallion: true,
  border: 'dupla',
};

describe('receita de escudo', () => {
  it('times sem dono têm sempre o mesmo escudo, que sai do nome', () => {
    expect(crestForTeamName('Robô Boleiro')).toEqual(crestForTeamName('Robô Boleiro'));
    expect(crestForTeamName('Robô Boleiro')).not.toEqual(crestForTeamName('Placa-Mãe United'));
    expect(crestForTeamName('Tubarões do Cais').symbol).toBe('tubarao');
    expect(generateCrest('x', 'Leões da Garagem').symbol).toBe('leao');
    // O escudo gerado de um técnico sai do id da conta: trocar o nome muda só a sigla.
    const { initials: _a, motto: _b, ...before } = defaultUserCrest('abc', 'Ana FC');
    const { initials: _c, motto: _d, ...after } = defaultUserCrest('abc', 'Outro Nome FC');
    expect(after).toEqual(before);
  });

  it('sigla do time', () => {
    expect(teamInitials('Tubarões do Cais')).toBe('TC');
    expect(teamInitials('Sociedade Esportiva Pastel')).toBe('SEP');
    expect(teamInitials('Flamengo')).toBe('FLA');
  });

  it('valida cada campo e normaliza as cores', () => {
    expect(parseCrest({ ...RECIPE, primary: '#1c2e6b' }).primary).toBe('#1C2E6B');
    expect(() => parseCrest({ ...RECIPE, shape: 'quadrado' })).toThrow(/Formato/);
    expect(() => parseCrest({ ...RECIPE, primary: 'red' })).toThrow(/Cor principal/);
    expect(() => parseCrest({ ...RECIPE, stars: 9 })).toThrow(/estrelas/);
    expect(() => parseCrest({ ...RECIPE, initials: '' })).toThrow(/sigla/);
    expect(parseCrest({ ...RECIPE, motto: '<b>Muito texto aqui</b>' }).motto).toBe('bMuito tex');
  });
});

describe('escudo do técnico', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await startTestApp();
  });
  afterAll(async () => {
    await env.stop();
    cleanupDir(env.dir);
  });

  it('nasce com o time, aparece no /api/me e no perfil e pode ser trocado', async () => {
    const created = await api(env.app, 'POST', '/api/auth/guest', { displayName: 'Unidos do Pregão', crest: RECIPE });
    expect(created.status).toBe(200);
    expect(created.data.user.crest).toEqual(RECIPE);
    const token = created.data.token as string;
    const me = await api(env.app, 'GET', '/api/me', undefined, token);
    expect(me.data.user.crest).toEqual(RECIPE);

    const bad = await api(env.app, 'PUT', '/api/me/crest', { crest: { ...RECIPE, symbol: 'dragao' } }, token);
    expect(bad.status).toBe(400);
    expect(bad.data.error).toBe('escudo_invalido');

    const next = { ...RECIPE, symbol: 'bola', stars: 0 };
    const saved = await api(env.app, 'PUT', '/api/me/crest', { crest: next }, token);
    expect(saved.status).toBe(200);
    expect(saved.data.user.crest).toEqual(next);
    const profile = await api(env.app, 'GET', `/api/users/${created.data.user.id}/profile`, undefined, token);
    expect(profile.data.user.crest).toEqual(next);
  });

  it('sem escudo montado, ganha um gerado que não muda', async () => {
    const a = await api(env.app, 'POST', '/api/auth/guest', { displayName: 'Sem Escudo FC' });
    expect(a.data.user.crest).toEqual(defaultUserCrest(a.data.user.id, 'Sem Escudo FC'));
    const invalid = await api(env.app, 'POST', '/api/auth/guest', { displayName: 'Torto FC', crest: { shape: 'x' } });
    expect(invalid.status).toBe(400);
  });

  it('a sala mostra o escudo dos técnicos e atualiza na hora quando ele muda', async () => {
    const ana = await TestClient.guest(env.app, 'Ana FC');
    const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'online', settings: {} }, ana.token);
    await ana.send({ t: 'room:join', code: data.code });
    const r = await ana.waitFor((room) => room?.code === data.code, 5000, 'entrar na sala');
    expect(r!.crests[ana.userId]).toEqual(defaultUserCrest(ana.userId, 'Ana FC'));
    await api(env.app, 'PUT', '/api/me/crest', { crest: RECIPE }, ana.token);
    const updated = await ana.waitFor((room) => room?.crests[ana.userId]?.symbol === 'leao', 5000, 'escudo novo na sala');
    expect(updated!.crests[ana.userId]).toEqual(RECIPE);
  });
});
