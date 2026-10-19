import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type GameSpeed = 'normal' | 'turbo' | 'test' | 'e2e';

export interface ServerConfig {
  port: number;
  host: string;
  dbPath: string;
  deckPath: string;
  staticDir: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const speed = env.GAME_SPEED as GameSpeed | undefined;
  return {
    port: Number(env.PORT ?? 3210),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DATABASE_PATH ?? resolve(root, 'data/martelo.db'),
    deckPath: env.DECK_PATH ?? defaultDeckPath(),
    staticDir: env.STATIC_DIR ?? resolve(root, 'dist'),
    forceSpeed: speed && ['normal', 'turbo', 'test', 'e2e'].includes(speed) ? speed : null,
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 60),
    abandonAfterMin: Number(env.ABANDON_AFTER_MIN ?? 30),
    idleRoomCloseMin: Number(env.IDLE_ROOM_CLOSE_MIN ?? 120),
    logLevel: (env.LOG_LEVEL as ServerConfig['logLevel']) ?? 'info',
  };
}

export const ROOT_DIR = root;
