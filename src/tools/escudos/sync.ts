import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clubSlug } from '../../shared/clubs.js';
import { CREST_SOURCES_FILE, loadCrests, loadCrestSources, type CrestEntry, type CrestSources } from '../../server/crests.js';
import { clubRef, normName, type ClubGroup } from './clubs.js';

/**
 * Atualiza os escudos dos clubes do baralho (`npm run escudos`):
 *  1. API Futebol (api-futebol.com.br), com a chave do .env: lê os campeonatos liberados no plano,
 *     as tabelas/fases de Brasileirão e Copa do Brasil (clubes brasileiros) e das ligas e copas
 *     europeias (clubes da Europa), e casa os times pelo nome;
 *  2. TheSportsDB, como reserva para o que a API Futebol não trouxer (ou se não houver chave);
 *  3. baixa cada escudo para `data/escudos/<clube>.<ext>` e grava `data/escudos/fontes.json`.
 * Arquivos colocados à mão na pasta nunca são substituídos.
 */

export const API_FUTEBOL = 'https://api.api-futebol.com.br/v1';
export const THESPORTSDB = 'https://www.thesportsdb.com/api/v1/json';

export interface SyncClub {
  name: string;
  group: ClubGroup;
}

export interface SyncOptions {
  clubs: SyncClub[];
  dir: string;
  apiFutebolKey?: string | undefined;
  theSportsDbKey?: string | undefined;
  download?: boolean;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
  /** Pausa entre chamadas (ms). Testes usam 0. */
  pace?: { apiFutebol: number; theSportsDb: number };
  now?: () => Date;
}

export interface SyncReport {
  apiFutebol: string[];
  theSportsDb: string[];
  /** Mantidos como estavam em fontes.json (a fonte não respondeu). */
  kept: string[];
  missing: string[];
  /** Clubes com arquivo colocado à mão (não mexemos). */
  manual: string[];
  downloaded: string[];
  failedDownloads: string[];
  apiFutebolError?: string;
}

interface ApiTeam {
  time_id: number;
  nome_popular?: string;
  nome?: string;
  sigla?: string;
  escudo: string;
}

interface ApiChampionship {
  campeonato_id: number;
  nome?: string;
  nome_popular?: string;
  slug?: string;
  fase_atual?: { _link?: string } | null;
}

class HttpFail extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const BR_COMP = /brasileir|copa do brasil/;
const EU_COMP = /premier|la liga|bundesliga|italiano|frances|campeoes|champions|liga europa|europa league|conference|mundo de clubes/;
const SKIP_COMP = /feminin|sub \d\d|\bsub\d\d|serie c|serie d|a2\b/;

/** Times (com escudo) em qualquer resposta da API Futebol: tabela, grupos, chaves, partidas. */
export function collectTeams(data: unknown, out = new Map<number, ApiTeam>()): Map<number, ApiTeam> {
  if (Array.isArray(data)) {
    for (const x of data) collectTeams(x, out);
  } else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.time_id === 'number' && typeof o.escudo === 'string' && o.escudo) {
      if (!out.has(o.time_id)) out.set(o.time_id, o as unknown as ApiTeam);
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') collectTeams(v, out);
  }
  return out;
}

/** Campeonatos úteis, na ordem de busca: os brasileiros (Série A antes da B) e os europeus. */
export function pickChampionships(list: ApiChampionship[]): Array<{ c: ApiChampionship; group: ClubGroup }> {
  const out: Array<{ c: ApiChampionship; group: ClubGroup; rank: number }> = [];
  for (const c of list) {
    const text = normName(`${c.nome ?? ''} ${c.nome_popular ?? ''} ${c.slug ?? ''}`);
    if (SKIP_COMP.test(text)) continue;
    if (BR_COMP.test(text)) out.push({ c, group: 'BR', rank: /copa do brasil/.test(text) ? 2 : /serie b/.test(text) ? 1 : 0 });
    else if (EU_COMP.test(text)) out.push({ c, group: 'EU', rank: /campeoes|champions|europa|conference|mundo/.test(text) ? 1 : 0 });
  }
  return out.sort((a, b) => (a.group === b.group ? a.rank - b.rank : a.group === 'BR' ? -1 : 1)).map(({ c, group }) => ({ c, group }));
}

/** Time da API que corresponde ao clube (nome popular ou oficial igual a um dos apelidos aceitos). */
export function matchTeam(club: string, teams: Iterable<ApiTeam>): ApiTeam | undefined {
  const accepted = new Set(clubRef(club).aliases.map(normName));
  accepted.add(normName(club));
  for (const t of teams) {
    if ((t.nome_popular && accepted.has(normName(t.nome_popular))) || (t.nome && accepted.has(normName(t.nome)))) return t;
  }
  return undefined;
}

export async function syncCrests(opts: SyncOptions): Promise<SyncReport> {
  const f = opts.fetch ?? fetch;
  const log = opts.log ?? (() => undefined);
  const pace = opts.pace ?? { apiFutebol: 300, theSportsDb: 2100 };
  const tsdbKey = opts.theSportsDbKey || '123';
  const previous = loadCrestSources(opts.dir);
  const next: CrestSources = { clubes: {} };
  const report: SyncReport = { apiFutebol: [], theSportsDb: [], kept: [], missing: [], manual: [], downloaded: [], failedDownloads: [] };
  const clubs = [...new Map(opts.clubs.map((c) => [c.name, c])).values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  const pending = new Set(clubs.map((c) => c.name));

  // 1. API Futebol
  if (opts.apiFutebolKey) {
    const get = async (path: string): Promise<unknown> => {
      for (let attempt = 0; ; attempt++) {
        const r = await f(API_FUTEBOL + path, { headers: { Authorization: `Bearer ${opts.apiFutebolKey}`, Accept: 'application/json' } });
        if (r.status === 429 && attempt < 3) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { mensagem?: string } | null;
          throw new HttpFail(r.status, body?.mensagem ?? `HTTP ${r.status}`);
        }
        await sleep(pace.apiFutebol);
        return r.json();
      }
    };
    try {
      if (opts.apiFutebolKey.startsWith('test_')) log('Chave de testes (test_): a API Futebol responde com dados fictícios e só 3 campeonatos.');
      const list = (await get('/campeonatos')) as ApiChampionship[];
      const comps = pickChampionships(Array.isArray(list) ? list : []);
      log(`API Futebol: ${comps.length} campeonato(s) úteis liberados no plano.`);
      for (const { c, group } of comps) {
        const wanted = clubs.filter((x) => x.group === group && pending.has(x.name));
        if (wanted.length === 0) continue;
        const teams = new Map<number, ApiTeam>();
        try {
          collectTeams(await get(`/campeonatos/${c.campeonato_id}/tabela`), teams);
        } catch (err) {
          if (!(err instanceof HttpFail) || err.status === 401) throw err;
        }
        const link = c.fase_atual?._link;
        if (teams.size === 0 && link) {
          try {
            collectTeams(await get(link.replace(/^\/v1(?=\/)/, '')), teams);
          } catch (err) {
            if (!(err instanceof HttpFail) || err.status === 401) throw err;
          }
        }
        let found = 0;
        for (const club of wanted) {
          const t = matchTeam(club.name, teams.values());
          if (!t) continue;
          next.clubes[club.name] = { fonte: 'api-futebol', id: String(t.time_id), nome: t.nome_popular ?? t.nome ?? club.name, url: t.escudo };
          pending.delete(club.name);
          report.apiFutebol.push(club.name);
          found++;
        }
        log(`  ${c.nome_popular ?? c.nome ?? c.campeonato_id}: ${teams.size} times, ${found} clube(s) do baralho.`);
      }
    } catch (err) {
      report.apiFutebolError =
        err instanceof HttpFail && err.status === 401 ? 'API Key ausente ou inválida (401).' : err instanceof Error ? err.message : String(err);
      log(`API Futebol falhou: ${report.apiFutebolError}`);
    }
  }

  // 2. TheSportsDB (reserva)
  const tsdb = async (path: string): Promise<Array<Record<string, string | null>>> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await f(`${THESPORTSDB}/${encodeURIComponent(tsdbKey)}/${path}`, { headers: { Accept: 'application/json' } });
      if (r.status === 429) {
        await sleep(20_000);
        continue;
      }
      await sleep(pace.theSportsDb);
      if (!r.ok) return [];
      const j = (await r.json().catch(() => null)) as { teams?: Array<Record<string, string | null>> | null } | null;
      return j?.teams ?? [];
    }
    return [];
  };
  const leftovers = clubs.filter((c) => pending.has(c.name));
  if (leftovers.length) log(`TheSportsDB: ${leftovers.length} clube(s) sem escudo da API Futebol.`);
  for (const club of leftovers) {
    const ref = clubRef(club.name);
    const before = previous.clubes[club.name];
    const fits = (t: Record<string, string | null>) =>
      t.strSport === 'Soccer' && t.strGender !== 'Female' && !!t.strBadge && (!ref.country || t.strCountry === ref.country);
    let team: Record<string, string | null> | undefined;
    try {
      if (before?.fonte === 'thesportsdb' && before.id) team = (await tsdb(`lookupteam.php?id=${encodeURIComponent(before.id)}`)).find(fits);
      for (const term of ref.tsdb) {
        if (team) break;
        team = pickTsdbTeam(club.name, (await tsdb(`searchteams.php?t=${encodeURIComponent(term)}`)).filter(fits));
      }
    } catch {
      team = undefined;
    }
    if (team) {
      // `/tiny` = versão de 100 px, de sobra para o escudo de 28 px da carta.
      next.clubes[club.name] = { fonte: 'thesportsdb', id: String(team.idTeam), nome: team.strTeam ?? club.name, url: `${team.strBadge!}/tiny` };
      report.theSportsDb.push(club.name);
    } else if (before) {
      next.clubes[club.name] = { ...before };
      report.kept.push(club.name);
    } else {
      report.missing.push(club.name);
    }
  }

  // 3. Arquivos locais
  mkdirSync(opts.dir, { recursive: true });
  const files = loadCrests(opts.dir);
  for (const club of clubs) {
    const entry = next.clubes[club.name];
    const slug = clubSlug(club.name);
    const existing = files.get(slug);
    const ours = previous.clubes[club.name]?.arquivo;
    if (existing && existing !== ours) {
      report.manual.push(club.name);
      continue;
    }
    if (!entry) continue;
    if (opts.download === false) {
      if (existing) entry.arquivo = existing;
      continue;
    }
    try {
      const file = await downloadCrest(f, entry.url, opts.dir, slug);
      if (existing && existing !== file) unlinkSync(join(opts.dir, existing));
      entry.arquivo = file;
      report.downloaded.push(club.name);
    } catch (err) {
      if (existing) entry.arquivo = existing;
      report.failedDownloads.push(club.name);
      log(`  não baixou o escudo de ${club.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Clubes de outros baralhos que já estavam no arquivo continuam lá.
  const inDeck = new Set(clubs.map((c) => c.name));
  for (const [club, entry] of Object.entries(previous.clubes)) if (!inDeck.has(club)) next.clubes[club] = entry;
  next.atualizadoEm = (opts.now ?? (() => new Date()))().toISOString();
  const sorted = Object.fromEntries(Object.entries(next.clubes).sort(([a], [b]) => a.localeCompare(b, 'pt')));
  const body = {
    _leia: 'Gerado por `npm run escudos`. Ordem de uso: arquivo em data/escudos/ e, sem ele, o endereço (url).',
    atualizadoEm: next.atualizadoEm,
    clubes: sorted as Record<string, CrestEntry>,
  };
  writeFileSync(join(opts.dir, CREST_SOURCES_FILE), JSON.stringify(body, null, 2) + '\n');
  return report;
}

/**
 * Time certo numa busca do TheSportsDB: nome (ou nome alternativo) igual a um dos aceitos para o clube.
 * Só aceita nome igual — a busca por “Botafogo SP” devolve o Botafogo do Rio, e “Paris SG” já devolveu
 * outro clube francês; melhor ficar com o selo genérico do que mostrar o escudo errado.
 */
export function pickTsdbTeam(club: string, teams: Array<Record<string, string | null>>): Record<string, string | null> | undefined {
  const ref = clubRef(club);
  const accepted = new Set([club, ...ref.aliases, ...ref.tsdb].map(normName));
  const names = (t: Record<string, string | null>) => [t.strTeam ?? '', ...(t.strTeamAlternate ?? '').split(',')].map(normName).filter(Boolean);
  return teams.find((t) => names(t).some((n) => accepted.has(n)));
}

const MAX_BYTES = 1_500_000;
const EXT_BY_TYPE: Record<string, string> = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg' };

async function downloadCrest(f: typeof fetch, url: string, dir: string, slug: string): Promise<string> {
  const r = await f(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const type = (r.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const fromUrl = /\.(svg|png|webp|jpe?g)(?:$|\?)/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  const ext = EXT_BY_TYPE[type] ?? (fromUrl ? `.${fromUrl === 'jpeg' ? 'jpg' : fromUrl}` : null);
  if (!ext) throw new Error(`tipo de arquivo inesperado (${type || 'desconhecido'})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) throw new Error(`tamanho inesperado (${buf.length} bytes)`);
  if (ext === '.svg') {
    const text = buf.toString('utf8');
    if (!/<svg[\s>]/i.test(text) || /<script|javascript:|\son[a-z]+\s*=/i.test(text)) throw new Error('SVG inválido ou com script');
  }
  const file = `${slug}${ext}`;
  const tmp = join(dir, `.${file}.tmp`);
  writeFileSync(tmp, buf);
  renameSync(tmp, join(dir, file));
  if (!existsSync(join(dir, file))) throw new Error('falha ao gravar');
  return file;
}
