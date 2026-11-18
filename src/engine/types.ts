/**
 * Tipos centrais do motor de regras. Este módulo é puro (sem I/O) e é
 * compartilhado entre servidor (autoridade) e cliente (apenas tipos/visões).
 */

export type Position = 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA';
export const POSITIONS: readonly Position[] = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'];

export const POSITION_LABEL: Record<Position, string> = {
  GOL: 'Goleiros',
  LAT: 'Laterais',
  ZAG: 'Zagueiros',
  MEI: 'Meio-campo',
  ATA: 'Ataque',
};

export type Formation = '4-3-3' | '4-4-2' | '4-5-1' | '4-2-4' | '3-5-2' | '3-4-3' | '5-4-1';
/**
 * Quantos jogadores de cada posição a formação leva. Nas formações com 3 zagueiros, os 2 laterais
 * jogam de alas (no 3-5-2 e no 3-4-3 contam no meio; no 5-4-1, na defesa).
 */
export const FORMATIONS: Record<Formation, Record<Position, number>> = {
  '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 },
  '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2 },
  '4-5-1': { GOL: 1, LAT: 2, ZAG: 2, MEI: 5, ATA: 1 },
  '4-2-4': { GOL: 1, LAT: 2, ZAG: 2, MEI: 2, ATA: 4 },
  '3-5-2': { GOL: 1, LAT: 2, ZAG: 3, MEI: 3, ATA: 2 },
  '3-4-3': { GOL: 1, LAT: 2, ZAG: 3, MEI: 2, ATA: 3 },
  '5-4-1': { GOL: 1, LAT: 2, ZAG: 3, MEI: 4, ATA: 1 },
};
/** Todas as formações, na ordem em que aparecem para escolher. */
export const FORMATION_LIST = Object.keys(FORMATIONS) as Formation[];
/**
 * Formações do leilão: é com elas que o técnico entra no pregão (e que definem o tamanho dos lotes e
 * dos pacotes). As outras só valem na convocação do leilão de clubes, onde dá para trocar de formação
 * com os pacotes já na mão.
 */
export const AUCTION_FORMATIONS: readonly Formation[] = ['4-3-3', '4-4-2'];
export const SQUAD_SIZE = 11;

/** Faixas de nível (decisão própria — o original exibe faixas como “76–84”). */
export type Tier = 'lenda' | 'craque' | 'titular' | 'operario' | 'perna';

/**
 * Grupo do clube da carta: Série A ou B do Brasileirão, ou um grande clube da Europa.
 * `SEL` são as cartas de seleção (modo “Seleções”): ficam fora dos leilões de jogador e de clubes.
 */
export type Series = 'A' | 'B' | 'EU' | 'SEL';
/** Quais cartas a sala usa. */
export type SeriesScope = 'ALL' | 'AB' | 'A' | 'B' | 'EU' | 'AEU' | 'BEU';
export const SERIES_SCOPES: readonly SeriesScope[] = ['ALL', 'AB', 'A', 'B', 'EU', 'AEU', 'BEU'];

/** Grupos de clubes que a sala pode marcar (as cartas de seleção ficam de fora). */
export const CLUB_SERIES: readonly Exclude<Series, 'SEL'>[] = ['EU', 'A', 'B'];

const SCOPE_SERIES: Record<SeriesScope, readonly Series[]> = {
  ALL: ['A', 'B', 'EU'],
  AB: ['A', 'B'],
  A: ['A'],
  B: ['B'],
  EU: ['EU'],
  AEU: ['A', 'EU'],
  BEU: ['B', 'EU'],
};

/** Grupos que a escolha da sala inclui. */
export function scopeSeries(scope: SeriesScope): readonly Series[] {
  return SCOPE_SERIES[scope] ?? SCOPE_SERIES.ALL;
}

/** A escolha da sala que corresponde a um conjunto de grupos marcados (`null` se nenhum estiver marcado). */
export function scopeOfSeries(groups: readonly Series[]): SeriesScope | null {
  const has = (g: Series) => groups.includes(g);
  const key = `${has('A') ? 'A' : ''}${has('B') ? 'B' : ''}${has('EU') ? 'EU' : ''}`;
  if (key === '') return null;
  return key === 'ABEU' ? 'ALL' : (key as SeriesScope);
}

/**
 * Cartas que a sala usa conforme o grupo escolhido. Baralhos sem grupo
 * (ex.: o fictício) são usados inteiros, qualquer que seja a escolha.
 */
export function deckForScope(deck: Card[], scope: SeriesScope): Card[] {
  if (!deck.some((c) => c.series)) return deck;
  const allowed = SCOPE_SERIES[scope] ?? SCOPE_SERIES.ALL;
  return deck.filter((c) => c.series !== undefined && allowed.includes(c.series));
}
/**
 * Faixa de qualidade usada para equilibrar o leilão: cada lote de posição sai com
 * ≈ 1/3 de bons (Lenda, Craque), 1/3 de médios (Titular) e 1/3 de ruins (Operário, Perna-de-pau).
 */
export type QualityBand = 'bom' | 'medio' | 'ruim';
export const QUALITY_BANDS: readonly QualityBand[] = ['bom', 'medio', 'ruim'];

export function qualityBand(tier: Tier): QualityBand {
  if (tier === 'lenda' || tier === 'craque') return 'bom';
  if (tier === 'titular') return 'medio';
  return 'ruim';
}

export const TIER_LABEL: Record<Tier, string> = {
  lenda: 'Lenda',
  craque: 'Craque',
  titular: 'Titular',
  operario: 'Operário',
  perna: 'Perna-de-pau',
};

/** Carta de jogador do baralho. O nível fica oculto até a Cerimônia. */
export interface Card {
  id: string;
  name: string;
  position: Position;
  club: string;
  year: number;
  levelMin: number;
  levelMax: number;
  tier: Tier;
  /** Pista pública (biografia curta) — correlacionada, mas não idêntica, ao nível. */
  hint: string;
  /**
   * Identifica a pessoa por trás da carta (ex.: QID do Wikidata). Um baralho pode ter
   * várias versões do mesmo jogador (clube/ano); o leilão nunca põe duas juntas.
   */
  personId?: string;
  /** Cores do uniforme do clube (primária, secundária), usadas no avatar ilustrado. */
  kit?: [string, string];
  /** Grupo do clube da carta (baralho real): Série A, Série B ou Europa; a sala escolhe quais usa. */
  series?: Series;
}

export type AcquisitionSource = 'leilao' | 'desempate' | 'repescagem' | 'monte';

export interface RosterEntry {
  cardId: string;
  position: Position;
  price: number;
  source: AcquisitionSource;
}

export type CpuStyle = 'agressivo' | 'equilibrado' | 'poupador';

export interface Participant {
  /** Identificador estável dentro da disputa: `u:<userId>` ou `cpu:<n>`. */
  id: string;
  userId: string | null;
  name: string;
  isCpu: boolean;
  formation: Formation;
  coins: number;
  roster: RosterEntry[];
  cpuStyle?: CpuStyle;
}

export type Tactic = 'retranca' | 'equilibrio' | 'ataque';

export type CupFormat = 'copa8' | 'libertadores' | 'mundial' | 'nenhuma';

/**
 * Tipo de leilão: “jogador” é o de sempre (um jogador por lance); em “clubes” cada lote é um setor
 * de um clube (ex.: os goleiros do Corinthians), quem leva o pacote convoca no fim quem joga;
 * “selecoes” é o mesmo com seleções (os goleiros do Brasil), só com quem jogou pela seleção.
 */
export type AuctionMode = 'jogador' | 'clubes' | 'selecoes';
export const AUCTION_MODES: readonly AuctionMode[] = ['jogador', 'clubes', 'selecoes'];

/** Leilão por pacotes (setor de um clube ou de uma seleção), com convocação no fim. */
export function isPackageMode(mode: AuctionMode | undefined): boolean {
  return mode === 'clubes' || mode === 'selecoes';
}

/** Cartas de seleção do baralho (modo “Seleções”). */
export function nationalDeck(deck: Card[]): Card[] {
  return deck.filter((c) => c.series === 'SEL');
}

export interface AuctionConfig {
  /** Tipo de leilão (ausente = 'jogador'). */
  mode?: AuctionMode;
  startingCoins: number;
  /** Cartas extras por lote além da soma das vagas (mínimo). */
  lotExtra: number;
  /**
   * Cartas extras proporcionais às vagas: lote = vagas + max(lotExtra, ⌈vagas × lotExtraRatio⌉).
   * 0,5 → 4 técnicos têm 6 goleiros para escolher (e 12 laterais, 18 meias…).
   */
  lotExtraRatio?: number;
  /** Tamanho máximo de cada leva exibida de uma vez. */
  batchSize: number;
  /** Probabilidade de uma leva conter uma “carta surpresa” (nome oculto). */
  mysteryChance: number;
  /** Repescagem das sobras de cada posição. */
  repescagem: boolean;
  /** Rodada de desempate às cegas antes do sorteio. */
  tiebreakRound: boolean;
}

export interface DisputeConfig {
  deckId: string;
  cupFormat: CupFormat;
  leagueSize: number;
  /**
   * Sem liga: todos os técnicos vão direto para a fase de grupos da copa (só nos formatos com
   * grupos: Libertadores e Mundial).
   */
  skipLeague?: boolean;
  auction: AuctionConfig;
  /** Política de reaproveitamento: jogadores adquiridos no ciclo anterior voltam ao leilão. */
  carryOverPreviousCycle: boolean;
}

export const DEFAULT_AUCTION_CONFIG: AuctionConfig = {
  startingCoins: 100,
  lotExtra: 1,
  lotExtraRatio: 0.5,
  batchSize: 12,
  mysteryChance: 0.35,
  repescagem: true,
  tiebreakRound: true,
};

export const DEFAULT_DISPUTE_CONFIG: DisputeConfig = {
  deckId: 'lendas-ficticias-v1',
  cupFormat: 'copa8',
  leagueSize: 20,
  auction: DEFAULT_AUCTION_CONFIG,
  carryOverPreviousCycle: true,
};

export const MAX_PARTICIPANTS = 20;
