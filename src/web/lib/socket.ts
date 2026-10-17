import type { ClientMessage, ServerMessage } from '../../shared/protocol';
import { store, toast } from './store';

type Pending = { resolve: () => void; reject: (e: Error & { code?: string }) => void; timer: ReturnType<typeof setTimeout> };

/**
 * Conexão WebSocket com reconexão automática. Ao reconectar, refaz o “hello”
 * e volta para a sala atual — o servidor devolve o estado completo.
 */
class Socket {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private queue: ClientMessage[] = [];
  private wanted = false;

  start() {
    this.wanted = true;
    if (this.ws || !store.get().token) return;
    this.open();
  }

  stop() {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.ready = false;
    store.set({ connection: 'offline' });
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    store.set({ connection: 'connecting' });
    ws.onopen = () => {
      this.raw({ t: 'hello', token: store.get().token ?? '', reqId: 'hello' });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
    ws.onclose = () => {
      this.ws = null;
      this.ready = false;
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(Object.assign(new Error('Conexão perdida. Tentando de novo…'), { code: 'conexao' }));
        this.pending.delete(id);
      }
      store.set({ connection: 'offline' });
      if (!this.wanted) return;
      const delay = Math.min(10_000, 800 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private raw(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.t) {
      case 'hello:ok': {
        this.ready = true;
        this.retry = 0;
        store.set({ user: msg.user, connection: 'online' });
        const code = store.get().roomCode;
        if (code) this.raw({ t: 'room:join', code, reqId: `rejoin${++this.seq}` });
        for (const q of this.queue.splice(0)) this.raw(q);
        break;
      }
      case 'room:state':
        store.set({ room: msg.room, roomCode: msg.room.code, leftReason: null, clockOffset: msg.room.serverTime - Date.now() });
        break;
      case 'room:left':
        store.set({ room: null, roomCode: null, leftReason: msg.reason });
        break;
      case 'achievements:unlocked':
        for (const a of msg.items) toast({ kind: 'conquista', title: 'Troféu desbloqueado', body: a.name, icon: a.icon }, 5500);
        break;
      case 'ack': {
        const p = this.pending.get(msg.reqId);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.reqId);
          p.resolve();
        }
        break;
      }
      case 'error': {
        if (msg.reqId && this.pending.has(msg.reqId)) {
          const p = this.pending.get(msg.reqId)!;
          clearTimeout(p.timer);
          this.pending.delete(msg.reqId);
          p.reject(Object.assign(new Error(msg.message), { code: msg.code }));
        } else if (msg.code === 'nao_autenticado') {
          store.set({ token: null, user: null });
        } else if (msg.reqId?.startsWith('rejoin')) {
          store.set({ roomCode: null, room: null, leftReason: msg.message });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Envia uma intenção e resolve quando o servidor confirmar (ou rejeita com a mensagem de erro). */
  request(msg: ClientMessage): Promise<void> {
    const reqId = `q${++this.seq}`;
    const payload = { ...msg, reqId } as ClientMessage;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(Object.assign(new Error('O servidor demorou para responder.'), { code: 'timeout' }));
      }, 10_000);
      this.pending.set(reqId, { resolve, reject, timer });
      if (this.ready) this.raw(payload);
      else this.queue.push(payload);
    });
  }

  joinRoom(code: string) {
    store.set({ roomCode: code.toUpperCase(), leftReason: null });
    this.start();
    return this.request({ t: 'room:join', code });
  }
}

export const socket = new Socket();

/** Executa uma ação e mostra o erro como aviso, devolvendo se deu certo. */
export async function act(msg: ClientMessage): Promise<boolean> {
  try {
    await socket.request(msg);
    return true;
  } catch (err) {
    toast({ kind: 'erro', title: 'Não deu', body: (err as Error).message });
    return false;
  }
}
