import { useSyncExternalStore } from 'react';
import type { PublicUserView, RoomView } from '../../shared/protocol';

export interface Toast {
  id: number;
  kind: 'info' | 'erro' | 'conquista' | 'sucesso';
  title: string;
  body?: string;
  icon?: string;
}

export interface AppState {
  token: string | null;
  user: PublicUserView | null;
  booting: boolean;
  connection: 'offline' | 'connecting' | 'online';
  roomCode: string | null;
  room: RoomView | null;
  leftReason: string | null;
  clockOffset: number;
  toasts: Toast[];
}

const TOKEN_KEY = 'martelo.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function persistToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* navegação privada: segue só em memória */
  }
}

let state: AppState = {
  token: readToken(),
  user: null,
  booting: true,
  connection: 'offline',
  roomCode: null,
  room: null,
  leftReason: null,
  clockOffset: 0,
  toasts: [],
};

const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state));
}

let toastSeq = 0;
export function toast(t: Omit<Toast, 'id'>, ms = 4500) {
  const id = ++toastSeq;
  store.set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ms);
}

/** Hora do servidor estimada (para contagens regressivas consistentes). */
export function serverNow(): number {
  return Date.now() + state.clockOffset;
}
