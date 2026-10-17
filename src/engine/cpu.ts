import type { Rng } from './rng.js';
import type { BidRound, TieItem } from './auction.js';
import type { Card, Participant } from './types.js';

/**
 * Inteligência das CPUs no leilão.
 *
 * Decisão de design (as fórmulas do original não são observáveis): a CPU estima
 * o valor de cada nome com ruído — ela “conhece futebol”, mas erra — e distribui
 * as moedas proporcionalmente às vagas que ainda precisa preencher.
 */

const STYLE_MULT = { agressivo: 1.3, equilibrado: 1.0, poupador: 0.72 } as const;

export function cpuEstimate(card: Card, rng: Rng, mystery: boolean): number {
  const mid = (card.levelMin + card.levelMax) / 2;
  if (mystery) return 74 + rng.normal(0, 9);
  return mid + rng.normal(0, 6);
}

interface PlanParams {
  rng: Rng;
  participant: Participant;
  cards: Card[];
  mysteryCardIds: string[];
  openInPosition: number;
  totalOpenSlots: number;
  round: BidRound;
}

export function cpuPlanBids(params: PlanParams): Record<string, number> {
  const { rng, participant, cards, mysteryCardIds, openInPosition, totalOpenSlots, round } = params;
  const coins = participant.coins;
  if (coins <= 0 || openInPosition <= 0 || cards.length === 0) return {};
  const style = participant.cpuStyle ?? 'equilibrado';
  const perSlot = coins / Math.max(1, totalOpenSlots);
  const ranked = cards
    .map((c) => ({ card: c, est: cpuEstimate(c, rng, mysteryCardIds.includes(c.id)) }))
    .map((x) => ({ ...x, noisy: x.est + rng.normal(0, 4) }))
    .sort((a, b) => b.noisy - a.noisy);

  const wanted = ranked.slice(0, Math.min(openInPosition, ranked.length));
  const bids: Record<string, number> = {};
  let total = 0;
  for (const w of wanted) {
    const desirability = Math.min(1.35, Math.max(0.05, (w.est - 62) / 28));
    // Às vezes a CPU passa a vez em nomes que acha fracos.
    if (desirability < 0.25 && rng.next() < 0.35) continue;
    const roundMult = round === 'repescagem' ? 0.65 : 1;
    let amount = perSlot * (0.35 + 1.7 * Math.pow(desirability, 1.5)) * STYLE_MULT[style] * roundMult * (0.75 + rng.next() * 0.5);
    amount = Math.max(1, Math.round(amount));
    bids[w.card.id] = amount;
    total += amount;
  }
  // Nunca ultrapassa o saldo (reduz proporcionalmente se precisar).
  if (total > coins) {
    const factor = coins / total;
    total = 0;
    for (const id of Object.keys(bids)) {
      bids[id] = Math.max(1, Math.floor(bids[id]! * factor));
      total += bids[id]!;
    }
    const ids = Object.keys(bids).sort((a, b) => bids[a]! - bids[b]!);
    while (total > coins && ids.length > 0) {
      const id = ids.shift()!;
      total -= bids[id]!;
      delete bids[id];
    }
  }
  return bids;
}

export function cpuTiebreak(rng: Rng, items: TieItem[], freeCoins: number, _p: Participant): Record<string, number> {
  const out: Record<string, number> = {};
  let budget = freeCoins - items.reduce((s, i) => s + i.floor, 0);
  for (const item of items) {
    let raise = 0;
    if (budget > 0 && rng.next() < 0.6) raise = Math.min(budget, rng.int(1, 4));
    budget -= raise;
    out[item.cardId] = item.floor + raise;
  }
  return out;
}

export function cpuMontePick(rng: Rng, options: Card[], _p: Participant): string {
  if (options.length === 0) throw new Error('CPU sem opções no Monte');
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const c of options) {
    const score = cpuEstimate(c, rng, false);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best.id;
}
