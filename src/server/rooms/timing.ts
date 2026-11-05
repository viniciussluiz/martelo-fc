import type { GameSpeed } from '../config.js';

/**
 * Ritmo do jogo (ms). Envelopes como no original (45 s); cada jogo dura 20 s na tela (10 s no turbo),
 * com a bola andando no campo — a liga de 38 rodadas leva ~13 min (~6,5 no turbo).
 */
export interface Timing {
  bidMs: number;
  tiebreakMs: number;
  monteMs: number;
  /** Convocação do leilão de clubes (escolher os 11 dentro dos pacotes). */
  convocacaoMs: number;
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
    convocacaoMs: 90_000,
    cpuStepMs: 900,
    revealItemMs: 1_400,
    revealTailMs: 1_500,
    ceremonyMs: 45_000,
    leagueRoundMs: 20_000,
    cupMatchdayMs: 20_000,
    cupIntroMs: 6_000,
    continuationScale: 1,
  },
  turbo: {
    bidMs: 25_000,
    tiebreakMs: 12_000,
    monteMs: 12_000,
    convocacaoMs: 50_000,
    cpuStepMs: 400,
    revealItemMs: 650,
    revealTailMs: 800,
    ceremonyMs: 20_000,
    leagueRoundMs: 10_000,
    cupMatchdayMs: 10_000,
    cupIntroMs: 2_500,
    continuationScale: 1,
  },
  test: {
    bidMs: 1_200,
    tiebreakMs: 800,
    monteMs: 600,
    convocacaoMs: 800,
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
    convocacaoMs: 8_000,
    cpuStepMs: 5,
    revealItemMs: 40,
    revealTailMs: 150,
    ceremonyMs: 8_000,
    // A liga ainda passa em segundos, mas dá tempo de o navegador clicar durante ela (sair da partida, tática).
    leagueRoundMs: 120,
    cupMatchdayMs: 80,
    cupIntroMs: 80,
    continuationScale: 0.15,
  },
};
