/**
 * Gerador pseudoaleatório determinístico (mulberry32) com semente textual.
 * Todo sorteio do jogo passa por aqui, o que torna partidas reproduzíveis
 * em testes e permite que o servidor restaure uma disputa a partir de um snapshot.
 */
export class Rng {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Estado interno serializável (para snapshots). */
  get snapshot(): number {
    return this.state;
  }

  static fromSnapshot(state: number): Rng {
    const r = new Rng(1);
    r.state = state >>> 0;
    return r;
  }

  /** Número em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() em lista vazia');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Escolha ponderada; pesos <= 0 são ignorados. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((s, it) => s + Math.max(0, weight(it)), 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (const it of items) {
      roll -= Math.max(0, weight(it));
      if (roll < 0) return it;
    }
    return items[items.length - 1]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }

  /** Normal aproximada (Box–Muller). */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Amostra de Poisson (Knuth) — adequada para médias pequenas como gols. */
  poisson(lambda: number): number {
    const l = Math.exp(-Math.max(0, lambda));
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > l && k < 50);
    return k - 1;
  }

  /** Deriva um gerador independente e estável a partir de um rótulo. */
  fork(label: string): Rng {
    return new Rng(`${this.state}:${label}`);
  }
}

export function hashString(s: string): number {
  // FNV-1a 32 bits seguido de um avalanche simples.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
