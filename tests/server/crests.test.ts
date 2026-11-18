import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  colorDistance,
  crestForTeamName,
  crestLuminance,
  defaultKits,
  defaultUserCrest,
  generateCrest,
  KIT_CLASH,
  kitsOf,
  matchKits,
  parseCrest,
  teamInitials,
  type CrestConfig,
} from '../../src/shared/crest.js';
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

  it('uniformes saem do escudo: o 1 na cor principal, o 2 ao contrário (claro × escuro)', () => {
    // Principal escura: o 2 é claro (aqui, o branco do próprio escudo).
    const navy = defaultKits(RECIPE);
    expect(navy.home.shirt).toBe('#1C2E6B');
    expect(navy.away.shirt).toBe('#FFFFFF');
    expect(navy.away.trim).toBe('#1C2E6B');
    // Principal clara: o 2 é escuro; sem cor escura no escudo, vai de preto.
    expect(defaultKits({ primary: '#FFFFFF', secondary: '#1A1A1A', detail: '#D2392B' }).away.shirt).toBe('#1A1A1A');
    expect(defaultKits({ primary: '#FFC81E', secondary: '#FFFFFF', detail: '#F3E3B5' }).away.shirt).toBe('#1A1A1A');
    expect(defaultKits({ primary: '#1A1A1A', secondary: '#7D1C2C', detail: '#1C2E6B' }).away.shirt).toBe('#FFFFFF');
    // Em qualquer escudo gerado: 1 e 2 em lados opostos de claro/escuro, e o detalhe se destaca da camisa.
    for (let i = 0; i < 200; i++) {
      const crest = generateCrest(`kit${i}`, 'Time');
      const k = defaultKits(crest);
      expect(k.home.shirt).toBe(crest.primary);
      expect(crestLuminance(k.home.shirt) < 0.5).not.toBe(crestLuminance(k.away.shirt) < 0.5);
      expect(colorDistance(k.home.shirt, k.home.trim)).toBeGreaterThanOrEqual(60);
      expect(colorDistance(k.away.shirt, k.away.trim)).toBeGreaterThanOrEqual(60);
    }
    // Sem uniforme escolhido, vale o do escudo; escolhido, vale o do técnico.
    expect(kitsOf(RECIPE)).toEqual(navy);
    const mine = { home: { shirt: '#D2392B', trim: '#FFFFFF' }, away: { shirt: '#FFFFFF', trim: '#D2392B' } };
    expect(kitsOf({ ...RECIPE, kits: mine })).toEqual(mine);
  });

  it('na partida, o visitante troca para o uniforme 2 quando as camisas se confundem', () => {
    const red = { home: { shirt: '#D2392B', trim: '#FFFFFF' }, away: { shirt: '#FFFFFF', trim: '#D2392B' } };
    const blue = { home: { shirt: '#1C2E6B', trim: '#FFFFFF' }, away: { shirt: '#FFFFFF', trim: '#1C2E6B' } };
    const maroon = { home: { shirt: '#C8302A', trim: '#FFC81E' }, away: { shirt: '#F3E3B5', trim: '#7D1C2C' } };
    expect(matchKits(red, blue)).toEqual({ home: red.home, away: blue.home });
    expect(matchKits(red, maroon)).toEqual({ home: red.home, away: maroon.away });
    // Mesmo time dos dois lados: o visitante vai de 2.
    const same = matchKits(red, red);
    expect(colorDistance(same.home.shirt, same.away.shirt)).toBeGreaterThanOrEqual(KIT_CLASH);
  });

  it('uniformes escolhidos são validados junto com o escudo', () => {
    const kits = { home: { shirt: '#d2392b', trim: '#FFFFFF' }, away: { shirt: '#FFFFFF', trim: '#D2392B' } };
    expect(parseCrest({ ...RECIPE, kits }).kits).toEqual({ home: { shirt: '#D2392B', trim: '#FFFFFF' }, away: kits.away });
    expect(parseCrest(RECIPE).kits).toBeUndefined();
    expect(() => parseCrest({ ...RECIPE, kits: { home: kits.home } })).toThrow(/Uniforme 2/);
    // Desenho da camisa, patrocínios e marca: só os da lista; “liso” e “nenhum” nem são guardados.
    const full = { home: { ...kits.home, pattern: 'xadrez' }, away: { ...kits.away, pattern: 'liso' }, master: 'pagartu', brand: 'capivara' };
    expect(parseCrest({ ...RECIPE, kits: full }).kits).toEqual({
      home: { shirt: '#D2392B', trim: '#FFFFFF', pattern: 'xadrez' },
      away: kits.away,
      master: 'pagartu',
      brand: 'capivara',
    });
    expect(() => parseCrest({ ...RECIPE, kits: { ...full, home: { ...kits.home, pattern: 'bolinhas' } } })).toThrow(/Desenho do uniforme 1/);
    expect(() => parseCrest({ ...RECIPE, kits: { ...full, master: 'banco-de-verdade' } })).toThrow(/Patrocínio master/);
    expect(() => parseCrest({ ...RECIPE, kits: { ...full, brand: 'outra' } })).toThrow(/Material esportivo/);
    expect(() => parseCrest({ ...RECIPE, kits: { ...kits, away: { shirt: 'azul', trim: '#FFFFFF' } } })).toThrow(/camisa do uniforme 2/);
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
    // Uniformes: salvos com o escudo e entregues junto com ele.
    const kits = { home: { shirt: '#2E8B3A', trim: '#FFFFFF' }, away: { shirt: '#FFFFFF', trim: '#2E8B3A' } };
    const withKits = await api(env.app, 'PUT', '/api/me/crest', { crest: { ...next, kits } }, token);
    expect(withKits.status).toBe(200);
    expect(withKits.data.user.crest.kits).toEqual(kits);
    expect((await api(env.app, 'GET', '/api/me', undefined, token)).data.user.crest.kits).toEqual(kits);
    const badKit = await api(env.app, 'PUT', '/api/me/crest', { crest: { ...next, kits: { home: kits.home } } }, token);
    expect(badKit.status).toBe(400);
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
