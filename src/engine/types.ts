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

export type Formation = '4-3-3' | '4-4-2';
export const FORMATIONS: Record<Formation, Record<Position, number>> = {
  '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 },
  '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2 },
};
export const SQUAD_SIZE = 11;

/** Faixas de nível (decisão própria — o original exibe faixas como “76–84”). */
export type Tier = 'lenda' | 'craque' | 'titular' | 'operario' | 'perna';
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

export interface AuctionConfig {
  startingCoins: number;
  /** Cartas extras por lote além da soma das vagas (o original usa +1). */
  lotExtra: number;
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
  auction: AuctionConfig;
  /** Política de reaproveitamento: jogadores adquiridos no ciclo anterior voltam ao leilão. */
  carryOverPreviousCycle: boolean;
}

export const DEFAULT_AUCTION_CONFIG: AuctionConfig = {
  startingCoins: 100,
  lotExtra: 1,
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
