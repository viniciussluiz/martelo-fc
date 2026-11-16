/**
 * Ritmo da disputa de pênaltis na tela. Ela começa quando o jogo acaba (aos 85% da rodada) e passa
 * cobrança por cobrança; o servidor segura a rodada seguinte pelo tempo que a disputa mais longa leva.
 */

/** Duração de uma cobrança: 1,5 s no ritmo normal, proporcional nas rodadas mais curtas. */
export function kickMs(kicks: number, tickMs: number): number {
  const base = Math.min(1500, tickMs * 0.85 * 0.06);
  // Alternadas longas aceleram para a disputa não passar muito de 15 cobranças de tempo.
  return kicks <= 10 ? base : Math.max(base * 0.6, (base * 10) / kicks);
}

/** Pausa antes da primeira cobrança (o gol aparece) e depois da última (o resultado fica na tela), em cobranças. */
export const SHOOTOUT_LEAD = 1.2;
export const SHOOTOUT_TAIL = 1.6;

/** Tempo total da disputa na tela (0 sem disputa). */
export function shootoutMs(kicks: number, tickMs: number): number {
  return kicks > 0 ? Math.round(kickMs(kicks, tickMs) * (kicks + SHOOTOUT_LEAD + SHOOTOUT_TAIL)) : 0;
}

/** Em que ponto a disputa está: quantas cobranças já terminaram e qual está no ar (com o progresso dela, 0–1). */
export function shootoutAt(kicks: number, tickMs: number, sinceWhistleMs: number): { started: boolean; done: number; current: number | null; progress: number; over: boolean } {
  const per = kickMs(kicks, tickMs);
  const t = sinceWhistleMs / per - SHOOTOUT_LEAD;
  if (sinceWhistleMs < 0 || kicks === 0) return { started: false, done: 0, current: null, progress: 0, over: false };
  if (t < 0) return { started: true, done: 0, current: null, progress: 0, over: false };
  if (t >= kicks) return { started: true, done: kicks, current: null, progress: 1, over: true };
  const current = Math.floor(t);
  const progress = t - current;
  // A cobrança conta no placar quando a bola chega (60% do tempo dela).
  return { started: true, done: progress >= 0.6 ? current + 1 : current, current, progress, over: false };
}
