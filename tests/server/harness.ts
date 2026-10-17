import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApp, type App } from '../../src/server/app.js';
import { silentLogger } from '../../src/server/log.js';
import type { ClientMessage, RoomView, ServerMessage } from '../../src/shared/protocol.js';

export interface TestEnv {
  app: App;
  dir: string;
  stop(): Promise<void>;
}

export async function startTestApp(dir = mkdtempSync(join(tmpdir(), 'martelo-'))): Promise<TestEnv> {
  const app = await createApp({ port: 0, host: '127.0.0.1', dbPath: join(dir, 'test.db'), forceSpeed: 'test', staticDir: join(dir, 'nada') }, silentLogger);
  return {
    app,
    dir,
    async stop() {
      await app.close();
    },
  };
}

export function cleanupDir(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

export async function api<T = any>(app: App, method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(app.url + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: (await res.json()) as T };
}

type Strategy = 'bid' | 'pass' | 'manual';

/** Cliente de teste: guarda a última visão da sala e pode jogar sozinho. */
export class TestClient {
  ws!: WebSocket;
  room: RoomView | null = null;
  messages: ServerMessage[] = [];
  errors: Array<{ code: string; message: string }> = [];
  unlocked: string[] = [];
  left: string | null = null;
  private seq = 0;
  private pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private listeners = new Set<() => void>();
  strategy: Strategy = 'bid';
  private acted = new Set<string>();

  constructor(
    public app: App,
    public token: string,
    public userId: string,
    public name: string,
  ) {}

  static async guest(app: App, name: string): Promise<TestClient> {
    const { data } = await api(app, 'POST', '/api/auth/guest', { displayName: name });
    const c = new TestClient(app, data.token, data.user.id, name);
    await c.connect();
    return c;
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.app.url.replace('http', 'ws') + '/ws');
    await new Promise<void>((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
    this.ws.on('message', (raw) => this.onMessage(JSON.parse(String(raw)) as ServerMessage));
    await this.send({ t: 'hello', token: this.token });
  }

  private onMessage(msg: ServerMessage) {
    this.messages.push(msg);
    if (msg.t === 'room:state') this.room = msg.room;
    if (msg.t === 'room:left') {
      this.left = msg.reason;
      this.room = null;
    }
    if (msg.t === 'achievements:unlocked') this.unlocked.push(...msg.items.map((i) => i.id));
    if (msg.t === 'ack') this.pending.get(msg.reqId)?.resolve();
    if (msg.t === 'error') {
      this.errors.push({ code: msg.code, message: msg.message });
      if (msg.reqId) this.pending.get(msg.reqId)?.reject(Object.assign(new Error(msg.message), { code: msg.code }));
    }
    for (const l of [...this.listeners]) l();
    if (msg.t === 'room:state') this.autoPlay();
  }

  send(msg: ClientMessage): Promise<void> {
    const reqId = `r${++this.seq}`;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.ws.send(JSON.stringify({ ...msg, reqId }));
    });
  }

  /** Envia sem esperar resposta (erros ficam em `errors`). */
  fire(msg: ClientMessage) {
    this.send(msg).catch(() => undefined);
  }

  waitFor(pred: (room: RoomView | null, c: TestClient) => boolean, timeoutMs = 20_000, label = 'condição'): Promise<RoomView | null> {
    if (pred(this.room, this)) return Promise.resolve(this.room);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`Tempo esgotado esperando ${label} (${this.name}); status=${this.room?.status} fase=${this.room?.dispute?.phase}`));
      }, timeoutMs);
      const check = () => {
        if (pred(this.room, this)) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(this.room);
        }
      };
      this.listeners.add(check);
    });
  }

  close() {
    this.ws.close();
  }

  /** Joga automaticamente conforme a estratégia (responde a cada estado). */
  private autoPlay() {
    if (this.strategy === 'manual') return;
    const d = this.room?.dispute;
    if (!d || !d.you) return;
    const step = d.auction?.step;
    if (step && !this.acted.has(step.stepId)) {
      if (step.kind === 'bid' && step.youAreEligible && !step.mySealed) {
        this.acted.add(step.stepId);
        const bids: Record<string, number> = {};
        if (this.strategy === 'bid') {
          const n = Math.min(step.myOpenSlots, step.cardIds.length);
          const per = Math.max(1, Math.floor(step.myCoins / 12));
          step.cardIds.slice(0, n).forEach((id, i) => {
            if (per * (i + 1) <= step.myCoins) bids[id] = per;
          });
        }
        this.fire({ t: 'bid:set', stepId: step.stepId, bids, seal: true });
      } else if (step.kind === 'tiebreak' && step.myItems.length && !step.mySealed) {
        this.acted.add(step.stepId);
        this.fire({ t: 'tiebreak:set', stepId: step.stepId, amounts: Object.fromEntries(step.myItems.map((i) => [i.cardId, i.floor])) });
      } else if (step.kind === 'monte' && step.current === d.you && step.myOptions.length) {
        this.acted.add(step.stepId);
        this.fire({ t: 'monte:pick', stepId: step.stepId, cardId: step.myOptions[0]! });
      }
    }
    if (d.phase === 'ceremony' && !this.acted.has(`cer:${d.id}`)) {
      this.acted.add(`cer:${d.id}`);
      this.fire({ t: 'ceremony:ready' });
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
