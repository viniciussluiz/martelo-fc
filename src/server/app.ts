import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { validateDeck } from '../engine/deck-generator.js';
import { GameRuleError } from '../engine/errors.js';
import type { Card } from '../engine/types.js';
import type { ClientMessage, ServerMessage } from '../shared/protocol.js';
import { AuthError, AuthService, type PublicUser } from './auth.js';
import { loadConfig, type ServerConfig } from './config.js';
import { migrate, openDatabase, type DB } from './db.js';
import { HttpError, RateLimiter, readJson, Router, SECURITY_HEADERS, sendJson, serveStatic, type Ctx } from './http.js';
import { createLogger, type Logger } from './log.js';
import { RoomManager } from './rooms/room-manager.js';
import type { RoomActor } from './rooms/room-actor.js';
import { AchievementService } from './services/achievements.js';
import { ACHIEVEMENTS, CATEGORY_LABEL, RARITY_LABEL } from './services/achievements-catalog.js';
import { H2HService } from './services/h2h.js';
import { profileSummary } from './services/profile.js';
import { ResultsService } from './services/results.js';

export interface App {
  server: Server;
  db: DB;
  rooms: RoomManager;
  auth: AuthService;
  results: ResultsService;
  achievements: AchievementService;
  h2h: H2HService;
  config: ServerConfig;
  url: string;
  close(): Promise<void>;
}

export function loadDeck(path: string): Card[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { cards: Card[] };
  validateDeck(raw.cards);
  return raw.cards;
}

export async function createApp(overrides: Partial<ServerConfig> = {}, logger?: Logger): Promise<App> {
  const config = { ...loadConfig(), ...overrides };
  const log = logger ?? createLogger(config.logLevel);
  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  if (applied.length) log.info('migrações aplicadas', { applied });
  const deck = loadDeck(config.deckPath);
  const auth = new AuthService(db, config.sessionTtlDays);
  const achievements = new AchievementService(db);
  const results = new ResultsService(db, achievements);
  const h2h = new H2HService(db);
  const rooms = new RoomManager({ db, deck, results, config, log });
  const restored = rooms.restoreAll();
  if (restored) log.info('salas restauradas', { restored });

  const authLimiter = new RateLimiter(30, 60_000);
  const router = new Router();

  const requireUser = (ctx: Ctx): PublicUser => {
    const header = ctx.req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = auth.authenticate(token);
    if (!user) throw new HttpError(401, 'nao_autenticado', 'Entre para continuar.');
    return user;
  };
  const limitAuth = (ctx: Ctx) => {
    if (!authLimiter.check(ctx.ip)) throw new HttpError(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde um minuto.');
  };
  const body = (ctx: Ctx) => (ctx.body ?? {}) as Record<string, unknown>;

  router
    .on('GET', '/api/health', () => ({ ok: true, rooms: rooms.all().length, time: new Date().toISOString() }))
    .on('POST', '/api/auth/guest', (ctx) => {
      limitAuth(ctx);
      return auth.createGuest(body(ctx).displayName);
    })
    .on('POST', '/api/auth/register', (ctx) => {
      limitAuth(ctx);
      const b = body(ctx);
      return auth.register({ username: b.username, password: b.password, displayName: b.displayName });
    })
    .on('POST', '/api/auth/login', (ctx) => {
      limitAuth(ctx);
      const b = body(ctx);
      return auth.login({ username: b.username, password: b.password });
    })
    .on('POST', '/api/auth/logout', (ctx) => {
      const header = ctx.req.headers.authorization ?? '';
      if (header.startsWith('Bearer ')) auth.logout(header.slice(7));
      return { ok: true };
    })
    .on('POST', '/api/auth/upgrade', (ctx) => {
      limitAuth(ctx);
      const user = requireUser(ctx);
      const b = body(ctx);
      return { user: auth.upgradeGuest(user.id, { username: b.username, password: b.password }) };
    })
    .on('GET', '/api/me', (ctx) => {
      const user = requireUser(ctx);
      const room = rooms.activeRoomFor(user.id);
      return { user, activeRoom: room ? { code: room.code, mode: room.mode, status: room.status } : null };
    })
    .on('PATCH', '/api/me', (ctx) => {
      const user = requireUser(ctx);
      return { user: auth.rename(user.id, body(ctx).displayName) };
    })
    .on('POST', '/api/rooms', (ctx) => {
      const user = requireUser(ctx);
      const b = body(ctx);
      const mode = b.mode === 'solo' ? 'solo' : 'online';
      const current = rooms.activeRoomFor(user.id);
      if (current && current.status === 'in_dispute' && current.isParticipant(user.id)) {
        throw new HttpError(409, 'em_disputa', `Você está no meio de uma disputa na sala ${current.code}.`);
      }
      const room = rooms.create(user, mode, (b.settings as Record<string, unknown>) ?? undefined);
      return { code: room.code, id: room.id };
    })
    .on('GET', '/api/rooms/:code', (ctx) => {
      requireUser(ctx);
      const room = rooms.get(ctx.params.code!);
      if (!room) throw new HttpError(404, 'sala_inexistente', 'Não achamos uma sala com esse código.');
      return {
        code: room.code,
        mode: room.mode,
        status: room.status,
        cycle: room.cycle,
        members: room.activeMembers().map((m) => m.teamName),
        maxHumans: room.settings.maxHumans,
      };
    })
    .on('GET', '/api/achievements', () =>
      ACHIEVEMENTS.map((a) => ({
        id: a.id,
        name: a.secret ? 'Conquista secreta' : a.name,
        category: a.category,
        categoryLabel: CATEGORY_LABEL[a.category],
        rarity: a.rarity,
        rarityLabel: RARITY_LABEL[a.rarity],
        secret: !!a.secret,
      })),
    )
    .on('GET', '/api/users/:id/profile', (ctx) => {
      requireUser(ctx);
      const p = profileSummary(db, ctx.params.id!);
      if (!p) throw new HttpError(404, 'usuario_inexistente', 'Técnico não encontrado.');
      return p;
    })
    .on('GET', '/api/users/:id/opponents', (ctx) => {
      requireUser(ctx);
      return h2h.opponents(ctx.params.id!);
    })
    .on('GET', '/api/users/:id/h2h/:opponent', (ctx) => {
      requireUser(ctx);
      const period = Number(ctx.query.get('period') ?? 0);
      const competition = ctx.query.get('competition');
      return h2h.detail(ctx.params.id!, ctx.params.opponent!, {
        periodDays: Number.isFinite(period) && period > 0 ? period : null,
        competition: competition === 'liga' || competition === 'copa' ? competition : null,
      });
    })
    .on('GET', '/api/users/:id/trophies', (ctx) => {
      requireUser(ctx);
      if (!auth.getUser(ctx.params.id!)) throw new HttpError(404, 'usuario_inexistente', 'Técnico não encontrado.');
      return achievements.trophyRoom(ctx.params.id!);
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
    if (url.pathname.startsWith('/api/')) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
      try {
        const match = router.match(req.method ?? 'GET', url.pathname);
        if (!match) throw new HttpError(404, 'rota_inexistente', 'Rota não encontrada.');
        const ctx: Ctx = { req, res, params: match.params, query: url.searchParams, body: await readJson(req), ip };
        const data = await match.handler(ctx);
        sendJson(res, 200, data);
      } catch (err) {
        if (err instanceof HttpError || err instanceof AuthError) sendJson(res, err.status, { error: err.code, message: err.message });
        else if (err instanceof GameRuleError) sendJson(res, 400, { error: err.code, message: err.message });
        else {
          log.error('erro na API', { path: url.pathname, err: String((err as Error)?.stack ?? err) });
          sendJson(res, 500, { error: 'interno', message: 'Erro interno. Tente de novo.' });
        }
      }
      return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(config.staticDir, url.pathname, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Cliente não compilado. Rode `npm run build` ou use `npm run dev`.');
  });

  // -------------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------------
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 25_000);

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const connId = randomUUID();
    let user: PublicUser | null = null;
    let room: RoomActor | null = null;
    let removeSink: (() => void) | null = null;
    let budget = 40;
    const refill = setInterval(() => (budget = Math.min(40, budget + 20)), 1000);
    const send = (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    const conn = { id: connId, send };
    const helloTimeout = setTimeout(() => {
      if (!user) ws.close(4001, 'hello esperado');
    }, 10_000);

    const leaveRoomConn = () => {
      if (room && user) room.disconnect(user.id, conn);
      room = null;
    };

    ws.on('message', (raw) => {
      if (--budget < 0) {
        send({ t: 'error', code: 'devagar', message: 'Muitas ações em pouco tempo.' });
        return;
      }
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
        if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') throw new Error('formato');
      } catch {
        send({ t: 'error', code: 'mensagem_invalida', message: 'Mensagem inválida.' });
        return;
      }
      const reqId = typeof msg.reqId === 'string' ? msg.reqId.slice(0, 64) : undefined;
      try {
        if (msg.t === 'hello') {
          const u = auth.authenticate(msg.token);
          if (!u) {
            send({ t: 'error', code: 'nao_autenticado', message: 'Sessão inválida. Entre de novo.', ...(reqId ? { reqId } : {}) });
            ws.close(4003, 'sessão inválida');
            return;
          }
          user = u;
          clearTimeout(helloTimeout);
          removeSink?.();
          removeSink = rooms.addUserSink(u.id, send);
          send({ t: 'hello:ok', user: { id: u.id, displayName: u.displayName, username: u.username, isGuest: u.isGuest } });
          if (reqId) send({ t: 'ack', reqId });
          return;
        }
        if (!user) throw new GameRuleError('nao_autenticado', 'Envie hello primeiro.');
        if (msg.t === 'ping') {
          send({ t: 'pong', serverTime: Date.now() });
          return;
        }
        if (msg.t === 'room:join') {
          const target = rooms.get(String(msg.code ?? ''));
          if (!target) throw new GameRuleError('sala_inexistente', 'Não achamos uma sala com esse código.');
          if (room && room !== target) leaveRoomConn();
          target.join(user);
          room = target;
          target.connect(user.id, conn);
        } else {
          if (!room || room.closed) throw new GameRuleError('sem_sala', 'Você não está em uma sala.');
          const u = user.id;
          switch (msg.t) {
            case 'room:leave':
              room.leave(u);
              room = null;
              break;
            case 'room:settings':
              room.updateSettings(u, msg.settings ?? {});
              break;
            case 'room:member':
              room.updateMember(u, { ...(msg.formation ? { formation: msg.formation } : {}), ...(msg.teamName ? { teamName: msg.teamName } : {}) });
              break;
            case 'room:start':
              room.start(u);
              break;
            case 'bid:set':
              room.bid(u, String(msg.stepId), msg.bids, !!msg.seal);
              break;
            case 'tiebreak:set':
              room.tiebreak(u, String(msg.stepId), msg.amounts);
              break;
            case 'monte:pick':
              room.montePick(u, String(msg.stepId), String(msg.cardId));
              break;
            case 'ceremony:ready':
              room.ceremonyReady(u);
              break;
            case 'tactic':
              room.setTactic(u, msg.tactic);
              break;
            case 'continue:vote':
              room.vote(u, String(msg.disputeId), msg.choice);
              break;
            case 'continue:start-now':
              room.startNow(u, String(msg.disputeId));
              break;
            default:
              throw new GameRuleError('mensagem_desconhecida', 'Ação desconhecida.');
          }
        }
        if (reqId) send({ t: 'ack', reqId });
      } catch (err) {
        if (err instanceof GameRuleError) {
          send({ t: 'error', code: err.code, message: err.message, ...(reqId ? { reqId } : {}) });
        } else {
          log.error('erro no websocket', { err: String((err as Error)?.stack ?? err), t: msg.t });
          send({ t: 'error', code: 'interno', message: 'Erro interno. Tente de novo.', ...(reqId ? { reqId } : {}) });
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimeout);
      clearInterval(refill);
      removeSink?.();
      leaveRoomConn();
    });
  });

  await new Promise<void>((resolveListen) => server.listen(config.port, config.host, resolveListen));
  const addr = server.address() as AddressInfo;
  const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
  const url = `http://${host}:${addr.port}`;
  log.info('servidor no ar', { url, db: config.dbPath, deck: deck.length });

  return {
    server,
    db,
    rooms,
    auth,
    results,
    achievements,
    h2h,
    config,
    url,
    async close() {
      clearInterval(heartbeat);
      rooms.shutdown();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
  };
}
