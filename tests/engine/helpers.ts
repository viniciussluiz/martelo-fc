import { generateDeck } from '../../src/engine/deck-generator.js';
import type { Card, Formation, Participant } from '../../src/engine/types.js';
import type { SeatInput } from '../../src/engine/dispute.js';

export const DECK = generateDeck();

export function seat(id: string, opts: Partial<SeatInput> = {}): SeatInput {
  return {
    id,
    userId: opts.isCpu ? null : (opts.userId ?? id.replace('u:', '')),
    name: opts.name ?? id,
    isCpu: opts.isCpu ?? false,
    formation: opts.formation ?? '4-3-3',
    ...(opts.cpuStyle ? { cpuStyle: opts.cpuStyle } : {}),
  };
}

export function participant(id: string, formation: Formation = '4-3-3', isCpu = false): Participant {
  return { id, userId: isCpu ? null : id, name: id, isCpu, formation, coins: 100, roster: [] };
}

/** Cartas sintéticas com nível conhecido para testes de regra. */
export function fakeCards(position: Card['position'], n: number, prefix: string = position): Card[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: `${prefix} ${i + 1}`,
    position,
    club: 'Teste FC',
    year: 2000,
    levelMin: 70 + i,
    levelMax: 75 + i,
    tier: 'titular' as const,
    hint: 'teste',
  }));
}
