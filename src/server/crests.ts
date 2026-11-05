import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { clubSlug } from '../shared/clubs.js';

/**
 * Escudos dos clubes (marcas registradas — use só com autorização).
 *
 * Duas origens, nesta ordem:
 *  1. arquivo em `data/escudos/` com o nome do clube (`flamengo.svg`, `sao-paulo.png`…), colocado à mão
 *     ou baixado por `npm run escudos`; o servidor entrega em `/escudos/<arquivo>`;
 *  2. endereço registrado em `data/escudos/fontes.json` (API Futebol ou TheSportsDB), que o navegador
 *     carrega direto — só de hosts listados em CREST_REMOTE_ORIGINS, que também entram no CSP.
 * Sem nenhum dos dois, a carta mostra o selo genérico do jogo.
 */

export const CREST_EXT = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];
export const CREST_SOURCES_FILE = 'fontes.json';

/** Origens de onde o navegador pode carregar escudos (img-src do CSP). */
export const CREST_REMOTE_ORIGINS = ['https://cdn.api-futebol.com.br', 'https://r2.thesportsdb.com', 'https://www.thesportsdb.com'] as const;

export type CrestProvider = 'api-futebol' | 'thesportsdb';

export interface CrestEntry {
  fonte: CrestProvider;
  /** Id do time na fonte (time_id da API Futebol, idTeam do TheSportsDB). */
  id: string;
  /** Nome do time na fonte, para conferência. */
  nome?: string;
  url: string;
  /** Arquivo baixado por `npm run escudos` em data/escudos/ (os demais arquivos da pasta são manuais). */
  arquivo?: string;
}

export interface CrestSources {
  atualizadoEm?: string;
  clubes: Record<string, CrestEntry>;
}

/** Arquivos de escudo na pasta: slug do clube → nome do arquivo. */
export function loadCrests(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).sort()) {
    const ext = extname(file).toLowerCase();
    if (!CREST_EXT.includes(ext)) continue;
    const slug = basename(file, extname(file)).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug) || out.has(slug)) continue;
    out.set(slug, file);
  }
  return out;
}

/** `fontes.json` da pasta de escudos (vazio se não existir ou estiver inválido). */
export function loadCrestSources(dir: string): CrestSources {
  const path = join(dir, CREST_SOURCES_FILE);
  if (!existsSync(path)) return { clubes: {} };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CrestSources>;
    const clubes: Record<string, CrestEntry> = {};
    for (const [club, e] of Object.entries(raw.clubes ?? {})) {
      if (e && typeof e.url === 'string' && (e.fonte === 'api-futebol' || e.fonte === 'thesportsdb')) clubes[club] = e;
    }
    return { ...(raw.atualizadoEm ? { atualizadoEm: raw.atualizadoEm } : {}), clubes };
  } catch {
    return { clubes: {} };
  }
}

export function isAllowedCrestUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (CREST_REMOTE_ORIGINS as readonly string[]).includes(u.origin);
  } catch {
    return false;
  }
}

/** Escudo de cada clube: arquivo local primeiro, depois o endereço de `fontes.json`. */
export function resolveCrests(clubs: Iterable<string>, files: Map<string, string>, sources: CrestSources): Record<string, string> {
  const crests: Record<string, string> = {};
  for (const club of new Set(clubs)) {
    const file = files.get(clubSlug(club));
    if (file) {
      crests[club] = `/escudos/${encodeURIComponent(file)}`;
      continue;
    }
    const remote = sources.clubes[club]?.url;
    if (remote && isAllowedCrestUrl(remote)) crests[club] = remote;
  }
  return crests;
}
