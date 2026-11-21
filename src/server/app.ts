import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { validateDeck } from '../engine/deck-generator.js';
import { GameRuleError } from '../engine/errors.js';
import type { Card } from '../engine/types.js';
import type { ClientMessage, DeckInfo, ServerMessage } from '../shared/protocol.js';
import { AuthError, AuthService, RESET_TTL_MIN, type PublicUser } from './auth.js';
import { noMailer, passwordResetMail, smtpMailer, type Mailer } from './mail.js';
import { APP_VERSION, configNotes, loadConfig, type ServerConfig } from './config.js';
import { loadCrests, loadCrestSources, resolveCrests, type CrestSources } from './crests.js';
import { DeckAdmin } from './services/deck-admin.js';
import { migrate, openDatabase, type DB } from './db.js';
import { adsenseHead, clientBuildId, HttpError, RateLimiter, readJson, Router, securityHeaders, sendJson, serveStatic, type Ctx } from './http.js';
import { createLogger, type Logger } from './log.js';
import { applySeo } from '../shared/seo.js';
import { RoomManager } from './rooms/room-manager.js';
import type { RoomActor } from './rooms/room-actor.js';
import { AchievementService } from './services/achievements.js';
import { ACHIEVEMENTS, CATEGORY_LABEL, RARITY_LABEL } from './services/achievements-catalog.js';
import { H2HService } from './services/h2h.js';
import { profileSummary } from './services/profile.js';
import { RankingService } from './services/ranking.js';
import { ResultsService } from './services/results.js';
import { isSeasonKey } from '../shared/ranking.js';

export interface App {
  server: Server;
  db: DB;
  rooms: RoomManager;
  auth: AuthService;
  results: ResultsService;
  achievements: AchievementService;
  h2h: H2HService;
  ranking: RankingService;
  config: ServerConfig;
  deckInfo: DeckInfo;
  url: string;
  close(): Promise<void>;
}

export function loadDeckFile(path: string): { name: string; cards: Card[] } {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { name?: string; cards: Card[] };
  validateDeck(raw.cards);
  return { name: raw.name ?? 'Baralho', cards: raw.cards };
}

export function loadDeck(path: string): Card[] {
  return loadDeckFile(path).cards;
}

export { loadCrests } from './crests.js';

/** Resumo do baralho para a sala: nome e cartas por grupo de clubes. */
export function describeDeck(
  name: string,
  cards: Card[],
  crestFiles: Map<string, string> = new Map(),
  crestSources: CrestSources = { clubes: {} },
): DeckInfo {
  const groups: DeckInfo['groups'] = {};
  const clubs: Partial<Record<keyof DeckInfo['groups'], Set<string>>> = {};
  for (const c of cards) {
    if (!c.series) continue;
    groups[c.series] = (groups[c.series] ?? 0) + 1;
    (clubs[c.series] ??= new Set()).add(c.club);
  }
  const crests = resolveCrests(
    cards.map((c) => c.club),
    crestFiles,
    crestSources,
  );
  return {
    name,
    total: cards.length,
    groups,
    clubs: Object.fromEntries(Object.entries(clubs).map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b, 'pt'))])),
    crests,
  };
}

export async function createApp(overrides: Partial<ServerConfig> = {}, logger?: Logger): Promise<App> {
  const config = { ...loadConfig(), ...overrides };
  const log = logger ?? createLogger(config.logLevel);
  const db = openDatabase(config.dbPath);
  const applied = migrate(db);
  if (applied.length) log.info('migrações aplicadas', { applied });
  for (const note of configNotes.splice(0)) log.warn(note);
  const deckFile = loadDeckFile(config.deckPath);
  // Baralho de jogadores reais: soma as cartas de seleção (modo “Seleções”), se o arquivo existir.
  const real = deckFile.cards.some((c) => c.series);
  const national =
    real && !deckFile.cards.some((c) => c.series === 'SEL') && existsSync(config.nationalDeckPath)
      ? loadDeckFile(config.nationalDeckPath).cards.filter((c) => c.series === 'SEL')
      : [];
  const deck = national.length ? [...deckFile.cards, ...national] : deckFile.cards;
  validateDeck(deck);
  // Ajustes do dono (página de admin), por cima do arquivo do baralho.
  const deckAdmin = new DeckAdmin(db, deck);
  if (deckAdmin.applied) log.info('ajustes do baralho', { cartas: deckAdmin.applied });
  if (national.length) log.info('cartas de seleção', { path: config.nationalDeckPath, cartas: national.length, selecoes: new Set(national.map((c) => c.club)).size });
  const crestFiles = loadCrests(config.crestsDir);
  const crestSources = loadCrestSources(config.crestsDir);
  const deckInfo = describeDeck(deckFile.name, deck, crestFiles, crestSources);
  // Jogador criado ou excluído pelo dono: o resumo do baralho (grupos e clubes) que as salas mostram acompanha.
  deckAdmin.onDeckChanged = () => Object.assign(deckInfo, describeDeck(deckFile.name, deck, crestFiles, crestSources));
  {
    const clubs = new Set(deck.map((c) => c.club));
    const local = [...clubs].filter((c) => deckInfo.crests[c]?.startsWith('/escudos/')).length;
    const remote = Object.keys(deckInfo.crests).length - local;
    if (local || remote) log.info('escudos', { pasta: config.crestsDir, arquivos: local, endereços: remote, semEscudo: clubs.size - local - remote });
  }
  if (Object.keys(deckInfo.groups).length === 0) {
    log.warn('baralho sem jogadores reais em uso (fictício ou personalizado)', { path: config.deckPath, name: deckInfo.name });
  }
  const auth = new AuthService(db, config.sessionTtlDays);
  const mailer: Mailer = config.mailer ?? (config.smtp ? smtpMailer(config.smtp) : noMailer);
  if (!mailer.configured) log.info('recuperação de senha por e-mail desligada (defina SMTP_HOST, SMTP_USER e SMTP_PASS)');
  const achievements = new AchievementService(db);
  const results = new ResultsService(db, achievements);
  const h2h = new H2HService(db);
  const ranking = new RankingService(db, achievements);
  results.onFinalized = () => ranking.invalidate();
  // Fecha as temporadas que acabaram (o mês virou): grava o top 10 e dá as conquistas de temporada.
  const closeSeasons = () => {
    try {
      for (const c of ranking.closeSeasons()) log.info('temporada do ranking fechada', { temporada: c.season, tecnicos: c.technicians, top: c.top.length });
    } catch (err) {
      log.error('falha ao fechar temporada do ranking', { err: String(err) });
    }
  };
  closeSeasons();
  const seasonTimer = setInterval(closeSeasons, 10 * 60_000);
  seasonTimer.unref?.();
  const rooms = new RoomManager({ db, deck, deckInfo, results, config, log });
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
  /** Quem pediu, se estiver logado (páginas abertas a todos, como o ranking). */
  const optionalUser = (ctx: Ctx): PublicUser | null => {
    const header = ctx.req.headers.authorization ?? '';
    return header.startsWith('Bearer ') ? auth.authenticate(header.slice(7)) : null;
  };
  /** Dono do site: conta registrada cujo e-mail, nome de usuário ou id está em ADMIN_USERS. */
  const admins = new Set(config.adminUsers.map((s) => s.toLowerCase()));
  const isAdmin = (user: PublicUser): boolean => {
    if (user.isGuest || admins.size === 0) return false;
    if (admins.has(user.id.toLowerCase())) return true;
    const acc = auth.account(user.id);
    return (!!acc.username && admins.has(acc.username.toLowerCase())) || (!!acc.email && admins.has(acc.email.toLowerCase()));
  };
  const requireAdmin = (ctx: Ctx): PublicUser => {
    const user = requireUser(ctx);
    if (!isAdmin(user)) throw new HttpError(403, 'so_dono', 'Esta página é só do dono do site.');
    return user;
  };
  /** Erro de regra (nível inválido, carta que não existe) vira resposta para quem pediu, não erro do servidor. */
  const adminCall = <T,>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof GameRuleError) throw new HttpError(err.code === 'carta_inexistente' ? 404 : 400, err.code, err.message);
      throw err;
    }
  };
  const limitAuth = (ctx: Ctx) => {
    if (!authLimiter.check(ctx.ip)) throw new HttpError(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde um minuto.');
  };
  const body = (ctx: Ctx) => (ctx.body ?? {}) as Record<string, unknown>;

  router
    .on('GET', '/api/health', () => ({
      ok: true,
      version: APP_VERSION,
      deck: deckInfo.name,
      cards: deckInfo.total,
      rooms: rooms.all().length,
      time: new Date().toISOString(),
      ads: config.adsense ?? null,
    }))
    .on('POST', '/api/auth/guest', (ctx) => {
      limitAuth(ctx);
      const b = body(ctx);
      return auth.createGuest(b.displayName, b.crest);
    })
    .on('POST', '/api/auth/register', (ctx) => {
      limitAuth(ctx);
      const b = body(ctx);
      return auth.register({ email: b.email, password: b.password, displayName: b.displayName, crest: b.crest });
    })
    .on('POST', '/api/auth/login', (ctx) => {
      limitAuth(ctx);
      const b = body(ctx);
      return auth.login({ email: b.email ?? b.username, password: b.password });
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
      const upgraded = auth.upgradeGuest(user.id, { email: b.email, password: b.password });
      // Visitante que cria a conta passa a aparecer no ranking com os pontos que já tinha.
      ranking.invalidate();
      return { user: upgraded };
    })
    // O site só oferece “Esqueci a senha” quando há envio de e-mail configurado.
    .on('GET', '/api/auth/options', () => ({ recovery: mailer.configured }))
    .on('POST', '/api/auth/forgot', (ctx) => {
      limitAuth(ctx);
      if (!mailer.configured) throw new HttpError(503, 'sem_email', 'A recuperação por e-mail não está ligada neste servidor.');
      const req = auth.requestPasswordReset(body(ctx).identifier);
      if (req) {
        const link = `${config.publicUrl}/redefinir?token=${encodeURIComponent(req.token)}`;
        // Envia sem segurar a resposta: ela sai igual (e no mesmo tempo) exista ou não a conta, para não revelar quem está cadastrado.
        void mailer
          .send(passwordResetMail({ to: req.email, teamName: req.displayName, link, minutes: RESET_TTL_MIN }))
          .then(() => log.info('e-mail de redefinição enviado', { usuario: req.userId }))
          .catch((err: unknown) => log.error('falha ao enviar e-mail de redefinição', { usuario: req.userId, error: err instanceof Error ? err.message : String(err) }));
      }
      return { ok: true };
    })
    .on('POST', '/api/auth/reset', (ctx) => {
      limitAuth(ctx);
      const b = body(ctx);
      return auth.resetPassword({ token: b.token, password: b.password });
    })
    .on('POST', '/api/auth/password', (ctx) => {
      limitAuth(ctx);
      const user = requireUser(ctx);
      const b = body(ctx);
      const header = ctx.req.headers.authorization ?? '';
      auth.changePassword(user.id, { current: b.current, next: b.next }, header.startsWith('Bearer ') ? header.slice(7) : null);
      return { ok: true };
    })
    .on('GET', '/api/account', (ctx) => ({ account: auth.account(requireUser(ctx).id), recovery: mailer.configured }))
    .on('PUT', '/api/account/email', (ctx) => {
      limitAuth(ctx);
      const user = requireUser(ctx);
      const b = body(ctx);
      return { account: auth.setEmail(user.id, { email: b.email, password: b.password }) };
    })
    .on('GET', '/api/me', (ctx) => {
      const user = requireUser(ctx);
      const room = rooms.activeRoomFor(user.id);
      return { user: { ...user, admin: isAdmin(user) }, activeRoom: room ? { code: room.code, mode: room.mode, status: room.status } : null };
    })
    // Página de admin (só o dono): o baralho inteiro, com Lenda, nível e informações editáveis.
    .on('GET', '/api/admin/cards', (ctx) => {
      requireAdmin(ctx);
      return { cards: deckAdmin.list(), faces: deckAdmin.faces() };
    })
    .on('PATCH', '/api/admin/cards/:id', (ctx) => {
      const user = requireAdmin(ctx);
      const b = body(ctx);
      const card = adminCall(() => deckAdmin.update(ctx.params.id!, b, user.id));
      return { card, faces: deckAdmin.faces() };
    })
    .on('DELETE', '/api/admin/cards/:id', (ctx) => {
      requireAdmin(ctx);
      const card = adminCall(() => deckAdmin.reset(ctx.params.id!));
      return { card, faces: deckAdmin.faces() };
    })
    .on('POST', '/api/admin/cards', (ctx) => {
      const user = requireAdmin(ctx);
      const card = adminCall(() => deckAdmin.create(body(ctx), user.id));
      return { card, faces: deckAdmin.faces() };
    })
    .on('DELETE', '/api/admin/custom-cards/:id', (ctx) => {
      requireAdmin(ctx);
      adminCall(() => deckAdmin.remove(ctx.params.id!));
      return { ok: true, faces: deckAdmin.faces() };
    })
    // Faces para gerar: tirar alguém da lista, ou pôr todas as Lendas do baralho que estão sem face.
    .on('DELETE', '/api/admin/faces/:key', (ctx) => {
      requireAdmin(ctx);
      return { faces: deckAdmin.dismissFace(ctx.params.key!) };
    })
    .on('POST', '/api/admin/faces/fill', (ctx) => {
      requireAdmin(ctx);
      return { faces: deckAdmin.queueAllMissingFaces() };
    })
    .on('PATCH', '/api/me', (ctx) => {
      const user = requireUser(ctx);
      const updated = auth.rename(user.id, body(ctx).displayName);
      rooms.userChanged(user.id);
      ranking.invalidate();
      return { user: updated };
    })
    .on('PUT', '/api/me/crest', (ctx) => {
      const user = requireUser(ctx);
      const updated = auth.setCrest(user.id, body(ctx).crest);
      // As salas em que o técnico está passam a mostrar o escudo novo na hora.
      rooms.userChanged(user.id);
      return { user: updated };
    })
    .on('POST', '/api/rooms', (ctx) => {
      const user = requireUser(ctx);
      const b = body(ctx);
      const mode = b.mode === 'solo' ? 'solo' : 'online';
      const current = rooms.activeRoomFor(user.id);
      if (current && current.status === 'in_dispute' && current.isParticipant(user.id)) {
        throw new HttpError(409, 'em_disputa', `Você está no meio de uma disputa na sala ${current.code}.`);
      }
      let room;
      try {
        room = rooms.create(user, mode, (b.settings as Record<string, unknown>) ?? undefined, b.password);
      } catch (err) {
        // Senha fora do tamanho: erro de quem pediu, não do servidor.
        if (err instanceof GameRuleError) throw new HttpError(400, err.code, err.message);
        throw err;
      }
      return { code: room.code, id: room.id };
    })
    // Salas em andamento (as com amigos, não ocultas): quem está no site pode ver e pedir para entrar.
    .on('GET', '/api/public-rooms', (ctx) => {
      requireUser(ctx);
      return { rooms: rooms.publicRooms() };
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
        locked: room.locked,
      };
    })
    // Ranking da sala: só os ciclos dela.
    .on('GET', '/api/rooms/:code/ranking', (ctx) => {
      requireUser(ctx);
      const id = db.prepare('SELECT id FROM rooms WHERE code = ?').pluck().get(ctx.params.code!.toUpperCase()) as string | undefined;
      if (!id) throw new HttpError(404, 'sala_inexistente', 'Não achamos uma sala com esse código.');
      return ranking.room(id);
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
      return { ...p, ranking: ranking.profile(ctx.params.id!), byCompetition: ranking.byCompetition(ctx.params.id!) };
    })
    // Ranking aberto a todos; `temporada` = '2026-11' ou 'geral' (sem nada: a temporada atual).
    .on('GET', '/api/ranking', (ctx) => {
      const q = ctx.query.get('temporada');
      const season = q === 'geral' ? null : isSeasonKey(q) ? q : ranking.currentSeason();
      const limit = Number(ctx.query.get('limite'));
      return ranking.view(season, optionalUser(ctx)?.id ?? null, {
        online: ctx.query.get('online') === '1',
        ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      });
    })
    // O que a disputa rendeu no ranking para quem pediu (resumo do fim da disputa).
    .on('GET', '/api/ranking/disputa/:id', (ctx) => {
      const user = requireUser(ctx);
      return { gain: ranking.gain(ctx.params.id!, user.id) };
    })
    .on('GET', '/api/users/:id/opponents', (ctx) => {
      requireUser(ctx);
      // ?busca=nome&pagina=2 (12 por página; `porPagina` muda isso, até 60).
      const page = Number(ctx.query.get('pagina') ?? 1);
      const size = Number(ctx.query.get('porPagina') ?? 0);
      return h2h.opponents(ctx.params.id!, {
        query: (ctx.query.get('busca') ?? '').slice(0, 60),
        page: Number.isFinite(page) ? page : 1,
        ...(Number.isFinite(size) && size > 0 ? { pageSize: size } : {}),
      });
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

  const redirectHosts = new Set(config.redirectHosts ?? []);
  const headers = securityHeaders(!!config.adsense);
  const adsHead = config.adsense ? adsenseHead(config.adsense.client) : null;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // No Fly, o endereço de quem chama vem em Fly-Client-IP (posto pelo proxy; o cliente não consegue forjar).
    const ip =
      (req.headers['fly-client-ip'] as string | undefined)?.trim() ||
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '?';
    if (url.pathname.startsWith('/api/')) {
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
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
    // Endereço antigo (ou www): as páginas vão para o endereço oficial. A API e o WebSocket continuam atendendo nos dois.
    const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
    if (redirectHosts.has(host) && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(301, { Location: `${config.publicUrl}${req.url ?? '/'}`, 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/escudos/')) {
      // Só arquivos listados na pasta de escudos (sem caminhos arbitrários).
      const file = decodeURIComponent(url.pathname.slice('/escudos/'.length));
      const known = [...crestFiles.values()].includes(file) ? file : null;
      if (!known) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...headers });
        res.end('Escudo não encontrado.');
        return;
      }
      const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=86400', ...headers });
      createReadStream(join(config.crestsDir, known)).pipe(res);
      return;
    }
    // ads.txt: diz aos anunciantes que o Google pode vender os espaços deste site.
    if (url.pathname === '/ads.txt' && config.adsense) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600', ...headers });
      res.end(`google.com, ${config.adsense.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
      return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(config.staticDir, url.pathname, res, { headers, page: (html, path) => applySeo(html, path, config.publicUrl), ...(adsHead ? { head: adsHead } : {}) })) return;
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
          const build = clientBuildId(config.staticDir);
          send({
            t: 'hello:ok',
            user: { id: u.id, displayName: u.displayName, username: u.username, isGuest: u.isGuest, crest: u.crest, ...(isAdmin(u) ? { admin: true } : {}) },
            ...(build ? { build } : {}),
          });
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
          target.join(user, msg.password);
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
            case 'room:password':
              room.setPassword(u, msg.password);
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
            case 'convoca:set':
              room.convoca(u, String(msg.stepId), Array.isArray(msg.cardIds) ? msg.cardIds : [], !!msg.seal);
              break;
            case 'convoca:formation':
              room.convocaFormation(u, String(msg.stepId), msg.formation);
              break;
            case 'ceremony:ready':
              room.ceremonyReady(u);
              break;
            case 'tactic':
              room.setTactic(u, msg.tactic);
              break;
            case 'setpieces':
              room.setSetPieces(u, msg.takers);
              break;
            case 'cup:start-now':
              room.startCupNow(u);
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
  log.info('servidor no ar', { url, db: config.dbPath, deck: `${deckInfo.name} (${deck.length} cartas)` });

  return {
    server,
    db,
    rooms,
    auth,
    results,
    achievements,
    h2h,
    ranking,
    config,
    deckInfo,
    url,
    async close() {
      clearInterval(heartbeat);
      clearInterval(seasonTimer);
      rooms.shutdown();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
  };
}
