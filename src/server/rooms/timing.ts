import type { GameSpeed } from '../config.js';

/** Ritmo do jogo (ms). “normal” se aproxima do original (45 s por envelope, ~3–4 min de liga). */
export interface Timing {
  bidMs: number;
  tiebreakMs: number;
  monteMs: number;
  cpuStepMs: number;
  revealItemMs: number;
  revealTailMs: number;
  ceremonyMs: number;
  leagueRoundMs: number;
  cupMatchdayMs: number;
  /** Intervalo entre o fim da liga e o 1º jogo da copa. */
  cupIntroMs: number;
  /** Multiplicador do prazo de continuidade (testes usam prazos curtos). */
  continuationScale: number;
}

export const TIMINGS: Record<GameSpeed, Timing> = {
  normal: {
    bidMs: 45_000,
    tiebreakMs: 20_000,
    monteMs: 20_000,
    cpuStepMs: 900,
    revealItemMs: 1_400,
    revealTailMs: 1_500,
    ceremonyMs: 45_000,
    leagueRoundMs: 4_500,
    cupMatchdayMs: 6_000,
    cupIntroMs: 6_000,
    continuationScale: 1,
  },
  turbo: {
    bidMs: 25_000,
    tiebreakMs: 12_000,
    monteMs: 12_000,
    cpuStepMs: 400,
    revealItemMs: 650,
    revealTailMs: 800,
    ceremonyMs: 20_000,
    leagueRoundMs: 1_600,
    cupMatchdayMs: 2_500,
    cupIntroMs: 2_500,
    continuationScale: 1,
  },
  test: {
    bidMs: 1_200,
    tiebreakMs: 800,
    monteMs: 600,
    cpuStepMs: 5,
    revealItemMs: 5,
    revealTailMs: 10,
    ceremonyMs: 600,
    leagueRoundMs: 15,
    cupMatchdayMs: 20,
    cupIntroMs: 20,
    continuationScale: 0.02,
  },
  /** Testes de navegador: tempo suficiente para cliques reais, jogos rápidos. */
  e2e: {
    bidMs: 6_000,
    tiebreakMs: 4_000,
    monteMs: 4_000,
    cpuStepMs: 5,
    revealItemMs: 40,
    revealTailMs: 150,
    ceremonyMs: 8_000,
    leagueRoundMs: 40,
    cupMatchdayMs: 80,
    cupIntroMs: 80,
    continuationScale: 0.15,
  },
};
