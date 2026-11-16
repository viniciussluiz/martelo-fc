import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { smtpFromEnv, type Mailer, type SmtpConfig } from './mail.js';

export type GameSpeed = 'normal' | 'turbo' | 'test' | 'e2e';

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  deckPath: string;
  /** Cartas de seleção (modo “Seleções”), somadas ao baralho de jogadores reais. */
  nationalDeckPath: string;
  staticDir: string;
  /** Pasta com escudos oficiais, para quem tem autorização de usá-los (opcional; ver docs/BARALHO.md). */
  crestsDir: string;
  /** Força uma velocidade para todas as salas (usado em testes automatizados). */
  forceSpeed: GameSpeed | null;
  sessionTtlDays: number;
  /** Disputa sem nenhum humano conectado por mais que isso é encerrada (minutos). */
  abandonAfterMin: number;
  /** Sala sem atividade (ninguém conectado) por mais que isso é fechada (minutos). */
  idleRoomCloseMin: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Endereço público do site, usado nos links enviados por e-mail (ex.: https://leilaofc.com.br). */
  publicUrl: string;
  /** Endereços antigos ou alternativos do site: as páginas abertas neles vão (301) para o `publicUrl`. */
  redirectHosts?: string[];
  /** Google AdSense: id do editor (ca-pub-…) e, opcional, o bloco de anúncio dos espaços do site. Nulo = sem anúncios. */
  adsense?: { client: string; slot: string | null } | null;
  /** SMTP para a recuperação de senha por e-mail (nulo = desligada). */
  smtp: SmtpConfig | null;
  /** Substitui o envio de e-mail (testes). */
  mailer?: Mailer;
}

const root = resolve(import.meta.dirname, '../..');

/** Lê ADSENSE_CLIENT (ca-pub-…) e ADSENSE_SLOT (número do bloco). Valor fora do formato é ignorado. */
export function adsenseFromEnv(env: NodeJS.ProcessEnv): { client: string; slot: string | null } | null {
  const client = env.ADSENSE_CLIENT?.trim() ?? '';
  if (!/^ca-pub-\d{10,20}$/.test(client)) return null;
  const slot = env.ADSENSE_SLOT?.trim() ?? '';
  return { client, slot: /^\d{6,14}$/.test(slot) ? slot : null };
}

/** Usa o baralho de jogadores reais (Wikidata) quando existir; senão, o fictício. */
function defaultDeckPath(): string {
  const real = resolve(root, 'data/deck-wikidata.json');
  return existsSync(real) ? real : resolve(root, 'data/deck.json');
}

/** Avisos de configuração detectados ao carregar (mostrados no log ao subir). */
export const configNotes: string[] = [];

/**
 * Baralho a usar. O `.env.example` das primeiras versões trazia `DECK_PATH=./data/deck.json`
 * (o fictício); quem copiou o arquivo continuaria preso a ele. Por isso, apontar para o fictício
 * só vale com FORCE_FICTIONAL_DECK=1 — senão, usa o de jogadores reais e avisa no log.
 */
export function resolveDeckPath(env: NodeJS.ProcessEnv): string {
  if (!env.DECK_PATH) return defaultDeckPath();
  const chosen = resolve(root, env.DECK_PATH);
  const fictional = resolve(root, 'data/deck.json');
  const real = resolve(root, 'data/deck-wikidata.json');
  if (chosen === fictional && existsSync(real) && env.FORCE_FICTIONAL_DECK !== '1') {
    configNotes.push(
      'DECK_PATH aponta para o baralho fictício (data/deck.json), provavelmente copiado do .env.example antigo. ' +
        'Usando o de jogadores reais (data/deck-wikidata.json). Para forçar o fictício, defina FORCE_FICTIONAL_DECK=1.',
    );
    return real;
  }
  return chosen;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const speed = env.GAME_SPEED as GameSpeed | undefined;
  return {
    port: Number(env.PORT ?? 3210),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DATABASE_PATH ?? resolve(root, 'data/martelo.db'),
    deckPath: resolveDeckPath(env),
    nationalDeckPath: env.NATIONAL_DECK_PATH ?? resolve(root, 'data/deck-selecoes.json'),
    staticDir: env.STATIC_DIR ?? resolve(root, 'dist'),
    crestsDir: env.CRESTS_DIR ?? resolve(root, 'data/escudos'),
    forceSpeed: speed && ['normal', 'turbo', 'test', 'e2e'].includes(speed) ? speed : null,
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 60),
    abandonAfterMin: Number(env.ABANDON_AFTER_MIN ?? 30),
    idleRoomCloseMin: Number(env.IDLE_ROOM_CLOSE_MIN ?? 120),
    logLevel: (env.LOG_LEVEL as ServerConfig['logLevel']) ?? 'info',
    publicUrl: (env.PUBLIC_URL?.trim() || `http://localhost:${Number(env.PORT ?? 3210)}`).replace(/\/+$/, ''),
    redirectHosts: (env.REDIRECT_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    adsense: adsenseFromEnv(env),
    smtp: smtpFromEnv(env),
  };
}

export const ROOT_DIR = root;

/** Carrega `.env` da raiz, se existir, sem sobrescrever variáveis já definidas. */
export function loadDotEnv(path = resolve(root, '.env')) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, raw] = m;
    const value = raw!.replace(/^["']|["']$/g, '');
    if (process.env[key!] === undefined && value !== '') process.env[key!] = value;
  }
}

/** Versão do projeto (package.json), mostrada no log e no rodapé para saber qual cópia está rodando. */
export const APP_VERSION: string = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version;
