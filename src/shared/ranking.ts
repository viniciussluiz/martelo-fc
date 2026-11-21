import type { CupFormat } from '../engine/types.js';
import type { CrestConfig } from './crest.js';

/**
 * Ranking dos técnicos: cada disputa concluída soma pontos de jogos e de títulos.
 * Servidor e tela leem daqui, então a página “Como funciona” nunca fica desatualizada.
 *
 * Pesos calibrados simulando 15 mil disputas no motor do jogo: com eles, os formatos com liga
 * rendem de 88 a 115 pontos por disputa em média, e quem se destaca é quem ganha título.
 * Libertadores e Mundial saem com ~7% de chance por técnico (sala de 4), a Copa dos 8 com ~15%.
 */
export const RANKING_POINTS = {
  vitoria: 3,
  empate: 1,
  mundial: 200,
  libertadores: 200,
  liga: 100,
  copa8: 50,
} as const;

/** Competições que dão título, na ordem de importância. */
export type RankingCompetition = 'mundial' | 'libertadores' | 'liga' | 'copa8';
export const RANKING_COMPETITIONS: readonly RankingCompetition[] = ['mundial', 'libertadores', 'liga', 'copa8'];
export const COMPETITION_LABEL: Record<RankingCompetition, string> = {
  mundial: 'Torneio Mundial',
  libertadores: 'Taça Libertadores',
  liga: 'Liga',
  copa8: 'Copa dos 8',
};

export type TitleCounts = Record<RankingCompetition, number>;

/** Fatos de uma disputa para um técnico: tudo o que a pontuação precisa. */
export interface RankingFacts {
  cupFormat: CupFormat;
  leagueWon: number;
  leagueDrawn: number;
  cupWon: number;
  cupDrawn: number;
  leagueTitle: boolean;
  cupTitle: boolean;
}

export interface PointsSplit {
  jogos: number;
  titulos: number;
  total: number;
}

/** Peso do título de uma copa (`nenhuma` não tem copa). */
export function cupTitlePoints(format: CupFormat): number {
  return format === 'nenhuma' ? 0 : RANKING_POINTS[format];
}

/** Pontos que uma disputa rende: vitória 3, empate 1 (pênaltis = empate) e o peso de cada título. */
export function disputePoints(f: RankingFacts): PointsSplit {
  const jogos = (f.leagueWon + f.cupWon) * RANKING_POINTS.vitoria + (f.leagueDrawn + f.cupDrawn) * RANKING_POINTS.empate;
  const titulos = (f.leagueTitle ? RANKING_POINTS.liga : 0) + (f.cupTitle ? cupTitlePoints(f.cupFormat) : 0);
  return { jogos, titulos, total: jogos + titulos };
}

/** Pontos a partir de totais já somados (várias disputas). */
export function pointsFromTotals(t: { won: number; drawn: number; titles: TitleCounts }): PointsSplit {
  const jogos = t.won * RANKING_POINTS.vitoria + t.drawn * RANKING_POINTS.empate;
  const titulos = RANKING_COMPETITIONS.reduce((s, c) => s + t.titles[c] * RANKING_POINTS[c], 0);
  return { jogos, titulos, total: jogos + titulos };
}

/**
 * A temporada é o mês no horário de Brasília (UTC−3; sem horário de verão desde 2019).
 * O SQL usa o mesmo deslocamento: strftime('%Y-%m', finished_at, '-3 hours').
 */
export const SEASON_UTC_OFFSET_HOURS = -3;

/** Temporada de um instante em UTC: '2026-11'. */
export function seasonOf(iso: string | number | Date): string {
  const t = (typeof iso === 'string' ? Date.parse(iso) : +iso) + SEASON_UTC_OFFSET_HOURS * 3_600_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** '2026-11' → 'Novembro de 2026'; `short` → 'novembro'. */
export function seasonLabel(season: string, short = false): string {
  const [y, m] = season.split('-').map(Number);
  const name = MONTHS[(m ?? 1) - 1] ?? season;
  if (short) return name;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** Primeira temporada com prêmio: as anteriores aparecem no ranking, mas não dão conquista. */
export const RANKING_FIRST_SEASON = '2026-11';

/**
 * Prêmios do fechamento da temporada. O de campeão exige alguém para vencer; o de top 10 só vale
 * quando a temporada teve mais de 10 técnicos (senão todo mundo seria top 10).
 */
export const SEASON_AWARD_RULES = { championMinTechnicians: 2, top: 10 } as const;

/** Disputa “online”: com pelo menos 2 técnicos humanos (o filtro “Só online” do ranking). */
export const ONLINE_MIN_HUMANS = 2;

export function isSeasonKey(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Uma linha do ranking. */
export interface RankingRow {
  position: number;
  userId: string;
  name: string;
  crest: CrestConfig;
  points: number;
  pointsGames: number;
  pointsTitles: number;
  titles: TitleCounts;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  disputes: number;
}

export interface RankingView {
  /** `null` = geral (todos os tempos). */
  season: string | null;
  /** A temporada já acabou (o mês passou). */
  closed: boolean;
  /** Só disputas com 2 ou mais técnicos humanos. */
  online: boolean;
  /** Temporada em andamento agora. */
  current: string;
  /** Temporadas com pontos, da mais recente para a mais antiga (inclui a atual). */
  seasons: string[];
  weights: typeof RANKING_POINTS;
  /** Técnicos com pontos no período (só contas registradas). */
  total: number;
  /** Os 100 primeiros. */
  rows: RankingRow[];
  /** A sua linha. Visitante: posição 0 (pontua, mas só aparece no ranking depois de criar a conta). */
  me: RankingRow | null;
}

export const RANKING_PAGE_SIZE = 100;

/** Uma linha do ranking de uma sala: só os ciclos dela, com visitantes (lá todo mundo se conhece). */
export interface RoomRankingRow extends RankingRow {
  guest: boolean;
}

export interface RoomRankingView {
  /** Ciclos concluídos que contaram pontos nesta sala. */
  cycles: number;
  rows: RoomRankingRow[];
}

/** Posição e pontos de um técnico num período. `position` nulo = visitante (fora da lista). */
export interface RankingStanding {
  position: number | null;
  points: number;
  total: number;
}

/** Ranking no perfil: a temporada atual e o geral. */
export interface ProfileRanking {
  season: string;
  seasonStanding: RankingStanding | null;
  overall: RankingStanding | null;
}

/** Números de uma competição no perfil. */
export interface CompetitionRecord {
  competition: RankingCompetition;
  label: string;
  /** Disputas em que o técnico jogou essa competição. */
  editions: number;
  titles: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
}

/** O que uma disputa rendeu no ranking, para o resumo do fim da disputa. */
export interface RankingGain {
  disputeId: string;
  points: PointsSplit;
  won: number;
  drawn: number;
  lost: number;
  titles: RankingCompetition[];
  season: string;
  /** Posição na temporada da disputa depois dela; nula para visitante. */
  position: number | null;
  guest: boolean;
}
