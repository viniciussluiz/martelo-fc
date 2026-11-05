import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { CREST_REMOTE_ORIGINS } from './crests.js';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  ip: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

/** Roteador mínimo (sem dependências) para a API JSON. */
export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:([a-zA-Z]+)/g, (_, k) => {
          keys.push(k);
          return '([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      return { handler: r.handler, params };
    }
    return null;
  }
}

export async function readJson(req: IncomingMessage, limit = 32 * 1024): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'corpo_grande', 'Requisição grande demais.');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'json_invalido', 'JSON inválido.');
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy':
    `default-src 'self'; img-src 'self' data: ${CREST_REMOTE_ORIGINS.join(' ')}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ws: wss:; script-src 'self'; frame-ancestors 'none'`,
};

const buildCache = new Map<string, { mtimeMs: number; id: string | undefined }>();

/**
 * Identifica o site compilado que o servidor entrega: o script principal de `dist/index.html`
 * (ex.: “/assets/index-tp4b96hG.js”, que muda a cada build). Vai no `hello:ok`; uma aba aberta
 * com um build antigo se recarrega sozinha. Sem dist/ (modo dev), não há id.
 */
export function clientBuildId(staticDir: string): string | undefined {
  const file = join(resolve(staticDir), 'index.html');
  if (!existsSync(file)) return undefined;
  const mtimeMs = statSync(file).mtimeMs;
  const cached = buildCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.id;
  const id = /src="(\/assets\/index-[^"]+\.js)"/.exec(readFileSync(file, 'utf8'))?.[1];
  buildCache.set(file, { mtimeMs, id });
  return id;
}

/** Serve o build do cliente (dist/) com fallback de SPA para index.html. */
export function serveStatic(staticDir: string, pathname: string, res: ServerResponse): boolean {
  const root = resolve(staticDir);
  if (!existsSync(join(root, 'index.html'))) return false;
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, safe);
  if (!file.startsWith(root)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  const immutable = file.includes(`${join(root, 'assets')}`);
  res.writeHead(200, {
    'content-type': type,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  createReadStream(file).pipe(res);
  return true;
}

/** Limitador simples por chave (janela fixa). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt < now) this.hits.delete(k);
      return true;
    }
    h.count++;
    return h.count <= this.max;
  }
}
