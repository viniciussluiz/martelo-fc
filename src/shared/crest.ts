/**
 * Escudos dos times (técnicos e clubes do jogo).
 *
 * Um escudo é só uma receita (formato, padrão, cores, símbolo e enfeites): o desenho é feito no
 * cliente. Os técnicos montam o seu no criador de escudos e ele fica salvo na conta; os times da
 * CPU e os clubes que completam a liga e as copas ganham um escudo gerado a partir do nome, então
 * o mesmo time tem sempre o mesmo escudo — em qualquer partida, campeonato ou sala.
 */

export const CREST_SHAPES = ['classico', 'frances', 'redondo', 'moderno', 'retro', 'brasao', 'oval', 'diamante'] as const;
export type CrestShape = (typeof CREST_SHAPES)[number];

export const CREST_PATTERNS = ['liso', 'listras', 'faixa', 'metade', 'meio', 'aros', 'cruz', 'chevron', 'quartos', 'topo', 'central'] as const;
export type CrestPattern = (typeof CREST_PATTERNS)[number];

export const CREST_SYMBOLS = [
  'bola',
  'estrela',
  'coroa',
  'martelo',
  'raio',
  'trofeu',
  'leao',
  'aguia',
  'galo',
  'lobo',
  'touro',
  'tubarao',
  'coruja',
  'castelo',
  'ancora',
  'chama',
  'montanha',
  'trevo',
  'robo',
  'chip',
  'engrenagem',
  'iniciais',
  'nenhum',
] as const;
export type CrestSymbol = (typeof CREST_SYMBOLS)[number];

export const CREST_BORDERS = ['simples', 'dupla', 'grossa'] as const;
export type CrestBorder = (typeof CREST_BORDERS)[number];

export interface CrestConfig {
  shape: CrestShape;
  pattern: CrestPattern;
  /** Cor de fundo do escudo. */
  primary: string;
  /** Cor do padrão (listras, faixa, metade…). */
  secondary: string;
  /** Cor dos detalhes: borda interna, símbolo e faixa. */
  detail: string;
  symbol: CrestSymbol;
  /** Sigla do time (1 a 4 letras): símbolo “iniciais”. */
  initials: string;
  /** Texto da faixa embaixo (até 10 caracteres). */
  motto: string;
  /** Estrelas em cima (0 a 5). */
  stars: number;
  ribbon: boolean;
  laurel: boolean;
  /** Medalhão atrás do símbolo (deixa o símbolo legível em cima de padrões fortes). */
  medallion: boolean;
  border: CrestBorder;
}

export interface CrestColor {
  id: string;
  name: string;
  hex: string;
}

/** Cores oferecidas no criador (dá para escolher qualquer outra no seletor livre). */
export const CREST_COLORS: CrestColor[] = [
  { id: 'branco', name: 'Branco', hex: '#FFFFFF' },
  { id: 'creme', name: 'Creme', hex: '#F3E3B5' },
  { id: 'amarelo', name: 'Amarelo', hex: '#FFC81E' },
  { id: 'ouro', name: 'Ouro', hex: '#D99A0B' },
  { id: 'laranja', name: 'Laranja', hex: '#F07D1A' },
  { id: 'vermelho', name: 'Vermelho', hex: '#D2392B' },
  { id: 'grena', name: 'Grená', hex: '#7D1C2C' },
  { id: 'rosa', name: 'Rosa', hex: '#E85C9C' },
  { id: 'roxo', name: 'Roxo', hex: '#6A3FA0' },
  { id: 'marinho', name: 'Azul-marinho', hex: '#1C2E6B' },
  { id: 'azul', name: 'Azul', hex: '#2F6FD0' },
  { id: 'celeste', name: 'Celeste', hex: '#6EC1F0' },
  { id: 'turquesa', name: 'Turquesa', hex: '#18A39B' },
  { id: 'verde', name: 'Verde', hex: '#2E8B3A' },
  { id: 'limao', name: 'Verde-limão', hex: '#8BCB3A' },
  { id: 'marrom', name: 'Marrom', hex: '#6B3E1F' },
  { id: 'cinza', name: 'Cinza', hex: '#8A8F98' },
  { id: 'preto', name: 'Preto', hex: '#1A1A1A' },
];

/** Combinações de cores com cara de clube, usadas nos escudos gerados (fundo, padrão, detalhes). */
const CLUB_PALETTES: Array<[string, string, string]> = [
  ['#D2392B', '#FFFFFF', '#1A1A1A'],
  ['#1A1A1A', '#FFFFFF', '#FFC81E'],
  ['#1C2E6B', '#FFFFFF', '#D2392B'],
  ['#2E8B3A', '#FFFFFF', '#FFC81E'],
  ['#FFC81E', '#2E8B3A', '#1C2E6B'],
  ['#6EC1F0', '#FFFFFF', '#1C2E6B'],
  ['#7D1C2C', '#1C2E6B', '#FFC81E'],
  ['#F07D1A', '#1A1A1A', '#FFFFFF'],
  ['#6A3FA0', '#FFFFFF', '#FFC81E'],
  ['#FFFFFF', '#1A1A1A', '#D2392B'],
  ['#2F6FD0', '#FFC81E', '#FFFFFF'],
  ['#18A39B', '#FFFFFF', '#1A1A1A'],
  ['#D2392B', '#1A1A1A', '#FFC81E'],
  ['#1A1A1A', '#FFC81E', '#FFFFFF'],
  ['#8BCB3A', '#1C2E6B', '#FFFFFF'],
  ['#E85C9C', '#1A1A1A', '#FFFFFF'],
  ['#6B3E1F', '#FFC81E', '#F3E3B5'],
  ['#FFFFFF', '#2E8B3A', '#1A1A1A'],
  ['#1C2E6B', '#FFC81E', '#FFFFFF'],
  ['#D99A0B', '#1A1A1A', '#FFFFFF'],
  ['#FFFFFF', '#2F6FD0', '#1C2E6B'],
  ['#7D1C2C', '#FFFFFF', '#FFC81E'],
];

// ---------------------------------------------------------------------------
// Sorteio determinístico
// ---------------------------------------------------------------------------

export function crestHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

function seededRandom(seed: string): () => number {
  let a = crestHash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends string>(rand: () => number, weights: Array<[T, number]>): T {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [v, w] of weights) {
    r -= w;
    if (r <= 0) return v;
  }
  return weights[weights.length - 1]![0];
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'del', 'e', 'y', 'fc', 'ec', 'sc', 'ac', 'cf', 'the', 'club', 'clube']);

function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Sigla do time: “Tubarões do Cais” → “TC”, “Real Pelada” → “RP”, “Robô Boleiro” → “RB”. */
export function teamInitials(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s\-]+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  const main = words.filter((w) => !STOP.has(w.toLowerCase()));
  const pick = main.length ? main : words;
  if (pick.length === 0) return 'FC';
  if (pick.length === 1) return pick[0]!.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase();
  return pick
    .slice(0, 3)
    .map((w) => w.replace(/[^a-z0-9]/gi, '')[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

/** Palavras do nome que puxam um símbolo (os clubes do jogo ficam com escudo “de acordo”). */
const SYMBOL_HINTS: Array<[RegExp, CrestSymbol[]]> = [
  [/tubar[ao]|tiburon|marea|pacific|caribe/, ['tubarao']],
  [/leao|leoes|leon|tigre|yaguarete|onca|felino/, ['leao']],
  [/aguia|carcara|condor|gaviao|falcao|urubu/, ['aguia']],
  [/galo|frango/, ['galo']],
  [/lobo|lobos|raposa/, ['lobo']],
  [/touro|toro|bufalo/, ['touro']],
  [/coruja|buho/, ['coruja']],
  [/robo|robot|algoritmo|servidor/, ['robo', 'robo', 'chip']],
  [/byte|pixel|digital|binario|kernel|cache|placa|silicio|chip|processador|firmware|tech|bit /, ['chip', 'robo', 'raio', 'engrenagem', 'iniciais']],
  [/ferroviari|obrero|engrenag|fabrica|operario/, ['engrenagem', 'martelo']],
  [/carbonero|martelo|ferreiro/, ['martelo']],
  [/relampago|furacao|raio|trovao|expresso|eletric/, ['raio']],
  [/real|rei|reino|imperio|imperial/, ['coroa']],
  [/estrela|galactic|celeste|azules|astro|cometa/, ['estrela']],
  [/cordillera|andino|altiplano|cerro|sierra|patagonia|altura|serran|montanha|morro|valle/, ['montanha', 'montanha', 'aguia', 'estrela', 'castelo', 'iniciais']],
  [/volcan|chama|fogo|fuego|inferno|desierto|cerrado/, ['chama']],
  [/porto|puerto|cais|bahia|costeir|costera|riberen|lago|mangue|baixada|marinh|navio/, ['ancora', 'ancora', 'tubarao', 'estrela']],
  [/castelo|torre|fortaleza|muralha|universitario|nacional|independiente|defensor/, ['castelo', 'iniciais', 'estrela', 'leao']],
  [/trevo|sorte|verde|quintal|jardim|garagem/, ['trevo', 'bola']],
  [/veterano|campe|taca|copa|trofeu/, ['trofeu']],
];

const RANDOM_SYMBOLS: Array<[CrestSymbol, number]> = [
  ['bola', 5],
  ['estrela', 3],
  ['iniciais', 5],
  ['coroa', 2],
  ['leao', 2],
  ['aguia', 2],
  ['lobo', 2],
  ['touro', 1],
  ['castelo', 2],
  ['raio', 2],
  ['chama', 1],
  ['trevo', 1],
  ['galo', 1],
  ['coruja', 1],
  ['ancora', 1],
  ['montanha', 1],
  ['trofeu', 1],
];

/** Escudo gerado a partir de uma semente (estável: a mesma semente dá sempre o mesmo escudo). */
export function generateCrest(seed: string, name: string): CrestConfig {
  const rand = seededRandom(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const n = plain(name);
  const hints = SYMBOL_HINTS.find(([re]) => re.test(n + ' '))?.[1];
  const hinted = hints ? hints[int(0, hints.length - 1)] : undefined;
  const palette = CLUB_PALETTES[int(0, CLUB_PALETTES.length - 1)]!;
  const shape = pickWeighted<CrestShape>(rand, [
    ['classico', 5],
    ['frances', 4],
    ['redondo', 4],
    ['moderno', 3],
    ['retro', 2],
    ['brasao', 3],
    ['oval', 2],
    ['diamante', 1],
  ]);
  const pattern = pickWeighted<CrestPattern>(rand, [
    ['liso', 3],
    ['listras', 5],
    ['faixa', 4],
    ['metade', 3],
    ['meio', 2],
    ['aros', 2],
    ['cruz', 2],
    ['chevron', 2],
    ['quartos', 2],
    ['topo', 3],
    ['central', 2],
  ]);
  const symbol = hinted ?? pickWeighted(rand, RANDOM_SYMBOLS);
  const initials = teamInitials(name);
  const ribbon = rand() < 0.4;
  const stars = rand() < 0.28 ? int(1, 3) : 0;
  return {
    shape,
    pattern,
    primary: palette[0],
    secondary: palette[1],
    detail: palette[2],
    symbol,
    initials,
    motto: symbol === 'iniciais' ? String(int(1903, 2009)) : initials,
    stars,
    ribbon,
    laurel: rand() < 0.18,
    medallion: pattern !== 'liso' && rand() < 0.6,
    border: pickWeighted<CrestBorder>(rand, [
      ['simples', 3],
      ['dupla', 2],
      ['grossa', 2],
    ]),
  };
}

/** Escudo de um time sem dono (CPU, clubes da liga e das copas): sai do nome. */
export function crestForTeamName(name: string): CrestConfig {
  return generateCrest(`time:${plain(name).trim()}`, name);
}

/** Escudo de quem ainda não montou o seu: sai do id da conta (não muda se o nome mudar). */
export function defaultUserCrest(userId: string, name: string): CrestConfig {
  return generateCrest(`u:${userId}`, name);
}

/** Escudo sorteado no criador (botão “Sortear”). */
export function randomCrest(name: string): CrestConfig {
  return generateCrest(`r:${Math.random()}:${Date.now()}`, name);
}

// ---------------------------------------------------------------------------
// Validação (o servidor só guarda receitas válidas)
// ---------------------------------------------------------------------------

export class CrestError extends Error {}

const HEX = /^#[0-9a-fA-F]{6}$/;

function cleanText(raw: unknown, max: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Lê e valida uma receita de escudo vinda de fora. Lança `CrestError` se algo estiver fora do lugar. */
export function parseCrest(raw: unknown): CrestConfig {
  if (!raw || typeof raw !== 'object') throw new CrestError('Escudo inválido.');
  const r = raw as Record<string, unknown>;
  const oneOf = <T extends string>(list: readonly T[], v: unknown, label: string): T => {
    if (typeof v !== 'string' || !list.includes(v as T)) throw new CrestError(`${label} do escudo inválido.`);
    return v as T;
  };
  const color = (v: unknown, label: string): string => {
    if (typeof v !== 'string' || !HEX.test(v)) throw new CrestError(`Cor ${label} inválida.`);
    return v.toUpperCase();
  };
  const initials = cleanText(r.initials, 4).toUpperCase();
  if (initials.length < 1) throw new CrestError('A sigla do escudo precisa de pelo menos 1 letra.');
  const stars = Number(r.stars ?? 0);
  if (!Number.isInteger(stars) || stars < 0 || stars > 5) throw new CrestError('O escudo tem de 0 a 5 estrelas.');
  return {
    shape: oneOf(CREST_SHAPES, r.shape, 'Formato'),
    pattern: oneOf(CREST_PATTERNS, r.pattern, 'Padrão'),
    primary: color(r.primary, 'principal'),
    secondary: color(r.secondary, 'secundária'),
    detail: color(r.detail, 'dos detalhes'),
    symbol: oneOf(CREST_SYMBOLS, r.symbol, 'Símbolo'),
    initials,
    motto: cleanText(r.motto, 10),
    stars,
    ribbon: r.ribbon === true,
    laurel: r.laurel === true,
    medallion: r.medallion === true,
    border: oneOf(CREST_BORDERS, r.border ?? 'simples', 'Borda'),
  };
}

/** Lê uma receita guardada; se estiver corrompida, devolve `fallback`. */
export function readCrest(raw: string | null | undefined, fallback: () => CrestConfig): CrestConfig {
  if (!raw) return fallback();
  try {
    return parseCrest(JSON.parse(raw));
  } catch {
    return fallback();
  }
}

/** Contraste: tinta escura ou clara sobre uma cor. */
export function crestLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
