import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCrestSources, resolveCrests } from '../../src/server/crests.js';
import { CLUB_DIRECTORY, normName } from '../../src/tools/escudos/clubs.js';
import { collectTeams, matchTeam, pickChampionships, pickTsdbTeam, syncCrests } from '../../src/tools/escudos/sync.js';
import { SERIES_CLUBS } from '../../src/tools/wikidata/series.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="5"/></svg>';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const team = (time_id: number, nome_popular: string, escudo = `https://cdn.api-futebol.com.br/times/escudos/${time_id}.svg`) => ({
  time_id,
  nome_popular,
  sigla: nome_popular.slice(0, 3).toUpperCase(),
  escudo,
});

/** API Futebol + TheSportsDB + CDNs de mentira. */
function fakeWeb(opts: { status?: number } = {}) {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://api.api-futebol.com.br/v1/')) {
      const auth = new Headers(init?.headers).get('authorization');
      if (opts.status) return json({ codigo: opts.status, mensagem: 'API Key ausente ou inválida.' }, opts.status);
      expect(auth).toBe('Bearer live_teste');
      const path = url.slice('https://api.api-futebol.com.br/v1'.length);
      if (path === '/campeonatos')
        return json([
          { campeonato_id: 10, nome: 'Campeonato Brasileiro', nome_popular: 'Brasileirão', slug: 'campeonato-brasileiro' },
          { campeonato_id: 99, nome: 'Campeonato Brasileiro Feminino', slug: 'brasileiro-feminino' },
          { campeonato_id: 20, nome: 'La Liga', slug: 'la-liga' },
          { campeonato_id: 30, nome: 'Liga dos Campeões', slug: 'liga-dos-campeoes', fase_atual: { _link: '/v1/campeonatos/30/fases/7' } },
        ]);
      if (path === '/campeonatos/10/tabela') return json([{ posicao: 1, time: team(18, 'Flamengo') }, { posicao: 2, time: team(56, 'Palmeiras') }, { posicao: 3, time: team(77, 'Athletic') }]);
      if (path === '/campeonatos/20/tabela') return json([{ posicao: 1, time: team(500, 'Real Madrid') }, { posicao: 2, time: team(501, 'Athletic Club') }]);
      if (path === '/campeonatos/30/tabela') return json({ codigo: 404, mensagem: 'sem tabela' }, 404);
      if (path === '/campeonatos/30/fases/7')
        return json({ chaves: [{ partida_ida: { time_mandante: team(600, 'Benfica'), time_visitante: team(601, 'Sporting Cristal') } }] });
      return json({ codigo: 404 }, 404);
    }
    if (url.startsWith('https://www.thesportsdb.com/api/v1/json/123/')) {
      if (url.includes('searchteams.php?t=Sporting%20CP'))
        return json({ teams: [{ idTeam: '134', strTeam: 'Sporting CP', strSport: 'Soccer', strGender: 'Male', strCountry: 'Portugal', strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/scp.png' }] });
      return json({ teams: null });
    }
    if (url.startsWith('https://cdn.api-futebol.com.br/')) return new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } });
    if (url.startsWith('https://r2.thesportsdb.com/')) return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    return new Response('nada', { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

const CLUBS = [
  { name: 'Flamengo', group: 'BR' as const },
  { name: 'Palmeiras', group: 'BR' as const },
  { name: 'Athletic-MG', group: 'BR' as const },
  { name: 'Real Madrid', group: 'EU' as const },
  { name: 'Benfica', group: 'EU' as const },
  { name: 'Sporting', group: 'EU' as const },
];

describe('escudos: API Futebol primeiro, TheSportsDB de reserva', () => {
  it('todo clube do baralho real está no diretório de nomes', () => {
    for (const c of SERIES_CLUBS) expect(CLUB_DIRECTORY[c.name], c.name).toBeTruthy();
  });

  it('lê times de tabela, chaves e partidas; casa por nome exato, sem confundir clubes', () => {
    const teams = collectTeams({ a: [{ time: team(1, 'Sporting Cristal') }], b: { time_mandante: team(2, 'Athletic Club') } });
    expect([...teams.keys()]).toEqual([1, 2]);
    expect(matchTeam('Sporting', teams.values())).toBeUndefined();
    expect(matchTeam('Atlético-MG', [team(30, 'Atlético-MG')])?.time_id).toBe(30);
    expect(matchTeam('Bayern de Munique', [team(40, 'Bayern München')])?.time_id).toBe(40);
    expect(normName('São Paulo')).toBe('sao paulo');
  });

  it('TheSportsDB: só aceita time com o nome do clube (nada de escudo errado)', () => {
    const rio = { idTeam: '134285', strTeam: 'Botafogo', strTeamAlternate: 'Botafogo de Futebol e Regatas' };
    const sp = { idTeam: '9', strTeam: 'Botafogo SP', strTeamAlternate: '' };
    expect(pickTsdbTeam('Botafogo-SP', [rio])).toBeUndefined();
    expect(pickTsdbTeam('Botafogo-SP', [rio, sp])?.idTeam).toBe('9');
    expect(pickTsdbTeam('Botafogo', [rio])?.idTeam).toBe('134285');
    expect(pickTsdbTeam('Tottenham', [{ idTeam: '1', strTeam: 'Tottenham Hotspur', strTeamAlternate: 'Spurs' }])?.idTeam).toBe('1');
    expect(pickTsdbTeam('PSG', [{ idTeam: '2', strTeam: 'Torcy', strTeamAlternate: 'US Torcy' }])).toBeUndefined();
  });

  it('escolhe os campeonatos úteis: brasileiros para clubes do Brasil, europeus para a Europa', () => {
    const picked = pickChampionships([
      { campeonato_id: 1, nome: 'Copa do Brasil', slug: 'copa-do-brasil' },
      { campeonato_id: 2, nome: 'Campeonato Brasileiro Série B', slug: 'campeonato-brasileiro-serie-b' },
      { campeonato_id: 3, nome: 'Campeonato Brasileiro', slug: 'campeonato-brasileiro' },
      { campeonato_id: 4, nome: 'Premier League', slug: 'premier-league' },
      { campeonato_id: 5, nome: 'Campeonato Paulista', slug: 'paulista' },
      { campeonato_id: 6, nome: 'Copa do Brasil Feminina', slug: 'copa-do-brasil-feminina' },
    ]);
    expect(picked.map((p) => `${p.group}${p.c.campeonato_id}`)).toEqual(['BR3', 'BR2', 'BR1', 'EU4']);
  });

  it('com chave: usa a API Futebol, completa com o TheSportsDB e baixa os arquivos', async () => {
    dir = mkdtempSync(join(tmpdir(), 'martelo-escudos-'));
    const web = fakeWeb();
    const report = await syncCrests({ clubs: CLUBS, dir, apiFutebolKey: 'live_teste', fetch: web.f, pace: { apiFutebol: 0, theSportsDb: 0 } });
    expect(report.apiFutebolError).toBeUndefined();
    expect(report.apiFutebol.sort()).toEqual(['Athletic-MG', 'Benfica', 'Flamengo', 'Palmeiras', 'Real Madrid']);
    expect(report.theSportsDb).toEqual(['Sporting']);
    expect(report.downloaded).toHaveLength(6);
    // Athletic (MG) vem do Brasileirão, não o Athletic Club de La Liga; Sporting não vira o Sporting Cristal.
    const sources = loadCrestSources(dir);
    expect(sources.clubes['Athletic-MG']).toMatchObject({ fonte: 'api-futebol', id: '77', arquivo: 'athletic-mg.svg' });
    expect(sources.clubes.Sporting).toMatchObject({ fonte: 'thesportsdb', id: '134', arquivo: 'sporting.png' });
    expect(readFileSync(join(dir, 'flamengo.svg'), 'utf8')).toBe(SVG);
    // Brasileirão feminino nem é consultado.
    expect(web.calls.some((u) => u.includes('/campeonatos/99/'))).toBe(false);
  });

  it('chave inválida: avisa e usa a reserva; arquivo colocado à mão nunca é trocado', async () => {
    dir = mkdtempSync(join(tmpdir(), 'martelo-escudos-'));
    writeFileSync(join(dir, 'sporting.webp'), 'meu escudo');
    writeFileSync(
      join(dir, 'fontes.json'),
      JSON.stringify({
        clubes: {
          Benfica: { fonte: 'thesportsdb', id: '9', url: 'https://r2.thesportsdb.com/images/media/team/badge/slb.png' },
          'Clube de Outro Baralho': { fonte: 'thesportsdb', id: '7', url: 'https://r2.thesportsdb.com/images/media/team/badge/x.png' },
        },
      }),
    );
    const web = fakeWeb({ status: 401 });
    const report = await syncCrests({ clubs: CLUBS, dir, apiFutebolKey: 'live_teste', fetch: web.f, pace: { apiFutebol: 0, theSportsDb: 0 } });
    expect(report.apiFutebolError).toMatch(/inválida/);
    expect(report.manual).toEqual(['Sporting']);
    expect(report.kept).toEqual(['Benfica']);
    expect(readFileSync(join(dir, 'sporting.webp'), 'utf8')).toBe('meu escudo');
    expect(existsSync(join(dir, 'benfica.png'))).toBe(true);
    expect(loadCrestSources(dir).clubes['Clube de Outro Baralho']?.id).toBe('7');
    // O servidor usa o arquivo manual e o baixado.
    const crests = resolveCrests(['Sporting', 'Benfica', 'Flamengo'], new Map([['sporting', 'sporting.webp'], ['benfica', 'benfica.png']]), loadCrestSources(dir));
    expect(crests).toEqual({ Sporting: '/escudos/sporting.webp', Benfica: '/escudos/benfica.png' });
  });
});
