import { mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mailer, MailMessage } from '../../src/server/mail.js';
import { api, cleanupDir, startTestApp, type TestEnv } from './harness.js';

/** Conta com usuário e senha: o mesmo time em qualquer aparelho. */
let env: TestEnv;
beforeAll(async () => {
  env = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-contas-')));
});
afterAll(async () => {
  await env.stop();
  cleanupDir(env.dir);
});

describe('login e cadastro', () => {
  it('conta criada num aparelho entra em outro com usuário e senha, com o mesmo time', async () => {
    const created = await api(env.app, 'POST', '/api/auth/register', { email: 'ana.tecnica@exemplo.com', password: 'segredo123', displayName: 'Unidos da Ana' });
    expect(created.status).toBe(200);
    expect(created.data.user).toMatchObject({ username: null, displayName: 'Unidos da Ana', isGuest: false });
    // “Outro aparelho”: não tem o token, só usuário e senha.
    const other = await api(env.app, 'POST', '/api/auth/login', { email: 'ana.tecnica@exemplo.com', password: 'segredo123' });
    // O e-mail vale em qualquer caixa, e sem e-mail não há cadastro.
    expect((await api(env.app, 'POST', '/api/auth/login', { email: ' ANA.Tecnica@Exemplo.com ', password: 'segredo123' })).status).toBe(200);
    expect((await api(env.app, 'POST', '/api/auth/register', { password: 'segredo123', displayName: 'Sem E-mail' })).status).toBe(400);
    expect(other.status).toBe(200);
    expect(other.data.user.id).toBe(created.data.user.id);
    expect(other.data.token).not.toBe(created.data.token);
    // As duas sessões valem ao mesmo tempo e veem a mesma conta.
    for (const token of [created.data.token, other.data.token]) {
      const me = await api(env.app, 'GET', '/api/me', undefined, token);
      expect(me.status).toBe(200);
      expect(me.data.user.id).toBe(created.data.user.id);
    }
    // Sair num aparelho não derruba o outro.
    expect((await api(env.app, 'POST', '/api/auth/logout', {}, other.data.token)).status).toBe(200);
    expect((await api(env.app, 'GET', '/api/me', undefined, other.data.token)).status).toBe(401);
    expect((await api(env.app, 'GET', '/api/me', undefined, created.data.token)).status).toBe(200);
  });

  it('senha errada, usuário que não existe e usuário repetido são recusados', async () => {
    await api(env.app, 'POST', '/api/auth/register', { email: 'beto@exemplo.com', password: 'segredo123', displayName: 'Beto FC' });
    expect((await api(env.app, 'POST', '/api/auth/login', { email: 'beto@exemplo.com', password: 'errada123' })).status).toBe(401);
    expect((await api(env.app, 'POST', '/api/auth/login', { email: 'ninguem@exemplo.com', password: 'segredo123' })).status).toBe(401);
    const again = await api(env.app, 'POST', '/api/auth/register', { email: 'beto@exemplo.com', password: 'outra1234', displayName: 'Outro Beto' });
    expect(again.status).toBe(409);
    expect((await api(env.app, 'POST', '/api/auth/register', { email: 'curta@exemplo.com', password: '123', displayName: 'Senha Curta' })).status).toBe(400);
  });

  it('convidado vira conta sem trocar de time e depois entra em outro aparelho', async () => {
    const guest = await api(env.app, 'POST', '/api/auth/guest', { displayName: 'Time do Caio' });
    expect(guest.data.user.isGuest).toBe(true);
    const up = await api(env.app, 'POST', '/api/auth/upgrade', { email: 'caio@exemplo.com', password: 'segredo123' }, guest.data.token);
    expect(up.status).toBe(200);
    expect(up.data.user).toMatchObject({ id: guest.data.user.id, username: null, isGuest: false, displayName: 'Time do Caio' });
    const other = await api(env.app, 'POST', '/api/auth/login', { email: 'caio@exemplo.com', password: 'segredo123' });
    expect(other.data.user.id).toBe(guest.data.user.id);
    // Convidado sem conta não tem como entrar em outro lugar: não existe usuário para ele.
    const lonely = await api(env.app, 'POST', '/api/auth/guest', { displayName: 'Só Aqui' });
    expect(lonely.data.user.username).toBeNull();
  });
});

describe('e-mail da conta, troca e recuperação de senha', () => {
  let mailEnv: TestEnv;
  const outbox: MailMessage[] = [];
  const mailer: Mailer = {
    configured: true,
    async send(m) {
      outbox.push(m);
    },
  };
  const lastToken = () => new URL(/https?:\/\/\S+/.exec(outbox[outbox.length - 1]!.text)![0]).searchParams.get('token')!;

  beforeAll(async () => {
    mailEnv = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-email-')), undefined, { mailer, publicUrl: 'https://leilao.test' });
  });
  afterAll(async () => {
    await mailEnv.stop();
    cleanupDir(mailEnv.dir);
  });

  it('sem envio de e-mail configurado, o site não oferece a recuperação', async () => {
    expect((await api(env.app, 'GET', '/api/auth/options')).data).toEqual({ recovery: false });
    expect((await api(env.app, 'POST', '/api/auth/forgot', { identifier: 'ana.tecnica' })).status).toBe(503);
    expect((await api(mailEnv.app, 'GET', '/api/auth/options')).data).toEqual({ recovery: true });
  });

  it('o e-mail fica na conta, é único e não aparece para os outros', async () => {
    const dora = await api(mailEnv.app, 'POST', '/api/auth/register', { password: 'segredo123', displayName: 'Dora FC', email: ' Dora@Exemplo.com ' });
    expect(dora.status).toBe(200);
    expect(JSON.stringify(dora.data)).not.toContain('exemplo.com');
    const account = await api(mailEnv.app, 'GET', '/api/account', undefined, dora.data.token);
    expect(account.data).toEqual({ account: { username: null, email: 'dora@exemplo.com', isGuest: false }, recovery: true });
    expect(JSON.stringify((await api(mailEnv.app, 'GET', '/api/me', undefined, dora.data.token)).data)).not.toContain('exemplo.com');
    // Mesmo e-mail em outra conta (mesmo com outra caixa) e e-mail torto são recusados.
    expect((await api(mailEnv.app, 'POST', '/api/auth/register', { password: 'segredo123', displayName: 'Dora 2', email: 'DORA@exemplo.com' })).status).toBe(409);
    expect((await api(mailEnv.app, 'POST', '/api/auth/register', { password: 'segredo123', displayName: 'Dora 3', email: 'sem-arroba' })).status).toBe(400);
    // Trocar o e-mail pede a senha atual.
    expect((await api(mailEnv.app, 'PUT', '/api/account/email', { email: 'nova@exemplo.com', password: 'errada123' }, dora.data.token)).status).toBe(401);
    const changed = await api(mailEnv.app, 'PUT', '/api/account/email', { email: 'nova@exemplo.com', password: 'segredo123' }, dora.data.token);
    expect(changed.data.account.email).toBe('nova@exemplo.com');
    // Convidado vira conta já com e-mail.
    const guest = await api(mailEnv.app, 'POST', '/api/auth/guest', { displayName: 'Time da Eva' });
    await api(mailEnv.app, 'POST', '/api/auth/upgrade', { email: 'eva@exemplo.com', password: 'segredo123' }, guest.data.token);
    expect((await api(mailEnv.app, 'GET', '/api/account', undefined, guest.data.token)).data.account.email).toBe('eva@exemplo.com');
  });

  it('trocar a senha: pede a atual, derruba os outros aparelhos e mantém este', async () => {
    const a = await api(mailEnv.app, 'POST', '/api/auth/register', { password: 'antiga123', displayName: 'Fábio FC', email: 'fabio@exemplo.com' });
    const b = await api(mailEnv.app, 'POST', '/api/auth/login', { email: 'fabio@exemplo.com', password: 'antiga123' });
    expect((await api(mailEnv.app, 'POST', '/api/auth/password', { current: 'errada123', next: 'nova12345' }, a.data.token)).status).toBe(401);
    expect((await api(mailEnv.app, 'POST', '/api/auth/password', { current: 'antiga123', next: '123' }, a.data.token)).status).toBe(400);
    expect((await api(mailEnv.app, 'POST', '/api/auth/password', { current: 'antiga123', next: 'nova12345' }, a.data.token)).status).toBe(200);
    expect((await api(mailEnv.app, 'GET', '/api/me', undefined, a.data.token)).status).toBe(200);
    expect((await api(mailEnv.app, 'GET', '/api/me', undefined, b.data.token)).status).toBe(401);
    expect((await api(mailEnv.app, 'POST', '/api/auth/login', { email: 'fabio@exemplo.com', password: 'antiga123' })).status).toBe(401);
    expect((await api(mailEnv.app, 'POST', '/api/auth/login', { email: 'fabio@exemplo.com', password: 'nova12345' })).status).toBe(200);
    // Convidado não tem senha para trocar.
    const guest = await api(mailEnv.app, 'POST', '/api/auth/guest', { displayName: 'Sem Senha' });
    expect((await api(mailEnv.app, 'POST', '/api/auth/password', { current: 'x', next: 'nova12345' }, guest.data.token)).status).toBe(400);
  });

  it('esqueci a senha: link por e-mail, de uso único, que cria a senha nova e derruba as sessões antigas', async () => {
    const gil = await api(mailEnv.app, 'POST', '/api/auth/register', { password: 'antiga123', displayName: 'Gil & Cia', email: 'gil@exemplo.com' });
    outbox.length = 0;
    // Conta que não existe (ou sem e-mail): mesma resposta, nenhum e-mail.
    expect((await api(mailEnv.app, 'POST', '/api/auth/forgot', { identifier: 'ninguem@exemplo.com' })).data).toEqual({ ok: true });
    await api(mailEnv.app, 'POST', '/api/auth/register', { email: 'semmail@exemplo.com', password: 'segredo123', displayName: 'Sem Mail' });
    expect((await api(mailEnv.app, 'POST', '/api/auth/forgot', { identifier: 'ninguem@exemplo.com' })).data).toEqual({ ok: true });
    expect(outbox).toHaveLength(0);
    // Pelo e-mail (em qualquer caixa): chega o link do site público.
    expect((await api(mailEnv.app, 'POST', '/api/auth/forgot', { identifier: 'GIL@exemplo.com' })).data).toEqual({ ok: true });
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    const mail = outbox[0]!;
    expect(mail.to).toBe('gil@exemplo.com');
    expect(mail.text).toContain('https://leilao.test/redefinir?token=');
    // O nome do time vai escapado no HTML.
    expect(mail.html).toContain('Gil &amp; Cia');
    expect(mail.html).not.toContain('Gil & Cia');
    // Pedir de novo em seguida não manda outro e-mail.
    await api(mailEnv.app, 'POST', '/api/auth/forgot', { identifier: 'gil@exemplo.com' });
    await new Promise((r) => setTimeout(r, 30));
    expect(outbox).toHaveLength(1);

    const token = lastToken();
    expect((await api(mailEnv.app, 'POST', '/api/auth/reset', { token: 'token-inventado', password: 'nova12345' })).status).toBe(400);
    expect((await api(mailEnv.app, 'POST', '/api/auth/reset', { token, password: '123' })).status).toBe(400);
    const reset = await api(mailEnv.app, 'POST', '/api/auth/reset', { token, password: 'nova12345' });
    expect(reset.status).toBe(200);
    expect(reset.data.user.id).toBe(gil.data.user.id);
    // Já entra com a sessão nova; a antiga caiu; a senha antiga não vale mais; o link não serve duas vezes.
    expect((await api(mailEnv.app, 'GET', '/api/me', undefined, reset.data.token)).status).toBe(200);
    expect((await api(mailEnv.app, 'GET', '/api/me', undefined, gil.data.token)).status).toBe(401);
    expect((await api(mailEnv.app, 'POST', '/api/auth/login', { email: 'gil@exemplo.com', password: 'antiga123' })).status).toBe(401);
    expect((await api(mailEnv.app, 'POST', '/api/auth/login', { email: 'gil@exemplo.com', password: 'nova12345' })).status).toBe(200);
    expect((await api(mailEnv.app, 'POST', '/api/auth/reset', { token, password: 'outra12345' })).status).toBe(400);
  });

  it('link vencido não vale', async () => {
    // Servidor à parte: os testes acima já gastaram o limite de tentativas por minuto deste endereço.
    const fresh = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-vencido-')), undefined, { mailer, publicUrl: 'https://leilao.test' });
    try {
      await api(fresh.app, 'POST', '/api/auth/register', { password: 'antiga123', displayName: 'Hugo FC', email: 'hugo@exemplo.com' });
      outbox.length = 0;
      await api(fresh.app, 'POST', '/api/auth/forgot', { identifier: 'hugo@exemplo.com' });
      await vi.waitFor(() => expect(outbox).toHaveLength(1));
      fresh.app.db.prepare(`UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z'`).run();
      expect((await api(fresh.app, 'POST', '/api/auth/reset', { token: lastToken(), password: 'nova12345' })).status).toBe(400);
      expect((await api(fresh.app, 'POST', '/api/auth/login', { email: 'hugo@exemplo.com', password: 'antiga123' })).status).toBe(200);
    } finally {
      await fresh.stop();
      cleanupDir(fresh.dir);
    }
  });

  it('muitas tentativas seguidas do mesmo endereço são barradas', async () => {
    const fresh = await startTestApp(mkdtempSync(join(tmpdir(), 'leilao-limite-')), undefined, { mailer });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 34; i++) codes.push((await api(fresh.app, 'POST', '/api/auth/reset', { token: `chute-${i}`, password: 'nova12345' })).status);
      expect(codes.slice(0, 30).every((c) => c === 400)).toBe(true);
      expect(codes.slice(30).every((c) => c === 429)).toBe(true);
    } finally {
      await fresh.stop();
      cleanupDir(fresh.dir);
    }
  });
});

describe('endereço oficial', () => {
  it('páginas abertas no endereço antigo vão para o oficial; a API continua atendendo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'leilao-redir-'));
    const env2 = await startTestApp(dir, undefined, { publicUrl: 'https://leilao.test', redirectHosts: ['antigo.test'] });
    try {
      const { port } = env2.app.server.address() as { port: number };
      const get = (path: string, host: string) =>
        new Promise<{ status: number; location?: string }>((ok, fail) => {
          request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
            res.resume();
            ok({ status: res.statusCode ?? 0, location: res.headers.location });
          })
            .on('error', fail)
            .end();
        });
      expect(await get('/sala/ABCD?x=1', 'antigo.test')).toEqual({ status: 301, location: 'https://leilao.test/sala/ABCD?x=1' });
      expect((await get('/api/health', 'antigo.test')).status).toBe(200);
      expect((await get('/sala/ABCD', 'leilao.test')).status).not.toBe(301);
    } finally {
      await env2.stop();
      cleanupDir(dir);
    }
  });
});

describe('anúncios (AdSense)', () => {
  it('sem ADSENSE_CLIENT o site não muda; com ele, publica o ads.txt e avisa o cliente', async () => {
    const { adsenseFromEnv } = await import('../../src/server/config.js');
    expect(adsenseFromEnv({})).toBeNull();
    expect(adsenseFromEnv({ ADSENSE_CLIENT: 'qualquer coisa' })).toBeNull();
    expect(adsenseFromEnv({ ADSENSE_CLIENT: 'ca-pub-1234567890123456', ADSENSE_SLOT: 'x' })).toEqual({ client: 'ca-pub-1234567890123456', slot: null });
    expect((await api(env.app, 'GET', '/api/health')).data.ads).toBeNull();
    expect((await fetch(`${env.app.url}/ads.txt`)).status).toBe(404);

    const dir = mkdtempSync(join(tmpdir(), 'leilao-ads-'));
    const withAds = await startTestApp(dir, undefined, { adsense: { client: 'ca-pub-1234567890123456', slot: '9876543210' } });
    try {
      expect((await api(withAds.app, 'GET', '/api/health')).data.ads).toEqual({ client: 'ca-pub-1234567890123456', slot: '9876543210' });
      const txt = await fetch(`${withAds.app.url}/ads.txt`);
      expect(txt.status).toBe(200);
      expect(await txt.text()).toBe('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
      // A política de conteúdo passa a aceitar os scripts do Google.
      expect((await fetch(`${withAds.app.url}/api/health`)).headers.get('content-security-policy')).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https:");
      expect((await fetch(`${env.app.url}/api/health`)).headers.get('content-security-policy')).toContain("script-src 'self';");
    } finally {
      await withAds.stop();
      cleanupDir(dir);
    }
  });
});
