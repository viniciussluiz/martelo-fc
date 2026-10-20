import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type GameSpeed = 'normal' | 'turbo' | 'test' | 'e2e';

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  deckPath: string;
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
}

const root = resolve(import.meta.dirname, '../..');

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
    staticDir: env.STATIC_DIR ?? resolve(root, 'dist'),
    crestsDir: env.CRESTS_DIR ?? resolve(root, 'data/escudos'),
    forceSpeed: speed && ['normal', 'turbo', 'test', 'e2e'].includes(speed) ? speed : null,
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 60),
    abandonAfterMin: Number(env.ABANDON_AFTER_MIN ?? 30),
    idleRoomCloseMin: Number(env.IDLE_ROOM_CLOSE_MIN ?? 120),
    logLevel: (env.LOG_LEVEL as ServerConfig['logLevel']) ?? 'info',
  };
}

export const ROOT_DIR = root;

/** Versão do projeto (package.json), mostrada no log e no rodapé para saber qual cópia está rodando. */
export const APP_VERSION: string = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version;
