import type { RoomMode, RoomSettings, ServerMessage } from '../../shared/protocol.js';
import type { PublicUser } from '../auth.js';
import { RoomActor, type RoomDeps } from './room-actor.js';

/** Registro em memória das salas ativas (uma instância de ator por sala). */
export class RoomManager {
  private byId = new Map<string, RoomActor>();
  private byCode = new Map<string, RoomActor>();
  /** Conexões por usuário, para avisos fora da sala (ex.: conquistas). */
  private userSinks = new Map<string, Set<(msg: ServerMessage) => void>>();
  readonly deps: RoomDeps;

  constructor(deps: Omit<RoomDeps, 'notifyUser' | 'onClosed'>) {
    this.deps = {
      ...deps,
      notifyUser: (userId, msg) => this.notifyUser(userId, msg),
      onClosed: (room) => this.forget(room),
    };
  }

  /** Recarrega salas abertas após reinício do servidor. */
  restoreAll(): number {
    const rows = this.deps.db.prepare(`SELECT * FROM rooms WHERE status <> 'closed'`).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      try {
        const actor = RoomActor.restore(this.deps, row);
        if (actor.status !== 'closed') this.register(actor);
      } catch (err) {
        this.deps.log.error('falha ao restaurar sala', { room: row.code as string, err: String(err) });
      }
    }
    return this.byId.size;
  }

  create(host: PublicUser, mode: RoomMode, settings?: Partial<RoomSettings>): RoomActor {
    const actor = RoomActor.create(this.deps, { mode, host: { id: host.id, displayName: host.displayName }, ...(settings ? { settings } : {}) });
    this.register(actor);
    return actor;
  }

  private register(actor: RoomActor) {
    this.byId.set(actor.id, actor);
    this.byCode.set(actor.code, actor);
  }

  private forget(actor: RoomActor) {
    this.byId.delete(actor.id);
    this.byCode.delete(actor.code);
  }

  get(code: string): RoomActor | undefined {
    return this.byCode.get(code.trim().toUpperCase());
  }

  getById(id: string): RoomActor | undefined {
    return this.byId.get(id);
  }

  /** Sala ativa em que o usuário está (para “Continuar sala”). */
  activeRoomFor(userId: string): RoomActor | undefined {
    for (const r of this.byId.values()) {
      const m = r.members.get(userId);
      if (m && m.status === 'active' && r.status !== 'closed') return r;
    }
    return undefined;
  }

  addUserSink(userId: string, sink: (msg: ServerMessage) => void) {
    let set = this.userSinks.get(userId);
    if (!set) this.userSinks.set(userId, (set = new Set()));
    set.add(sink);
    return () => {
      set!.delete(sink);
      if (set!.size === 0) this.userSinks.delete(userId);
    };
  }

  notifyUser(userId: string, msg: ServerMessage) {
    for (const sink of this.userSinks.get(userId) ?? []) sink(msg);
  }

  all(): RoomActor[] {
    return [...this.byId.values()];
  }

  shutdown() {
    for (const r of this.byId.values()) r.dispose();
  }
}
