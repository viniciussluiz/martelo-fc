import type { Rng } from './rng.js';
import type { BidRound, TieItem } from './auction.js';
import type { Card, Participant } from './types.js';

/**
 * Inteligência das CPUs no leilão.
 *
 * Decisão de design (as fórmulas do original não são observáveis): a CPU estima
 * o valor de cada nome com ruído — ela “conhece futebol”, mas erra — e distribui
 * as moedas proporcionalmente às vagas que ainda precisa preencher. O lance também olha
 * para o lote: só paga caro pelo que é melhor do que a sobra que levaria barato depois,
 * e tem um teto pela qualidade (não torra o caixa em time fraco).
 */

const STYLE_MULT = { agressivo: 1.3, equilibrado: 1.0, poupador: 0.72 } as const;

export function cpuEstimate(card: Card, rng: Rng, mystery: boolean, noise = 6): number {
  const mid = (card.levelMin + card.levelMax) / 2;
  if (mystery) return 74 + rng.normal(0, 9);
  return mid + rng.normal(0, noise);
}

interface PlanParams {
  rng: Rng;
  participant: Participant;
  cards: Card[];
  mysteryCardIds: string[];
  openInPosition: number;
  totalOpenSlots: number;
  round: BidRound;
  /** Quantos jogadores cada item rende (leilão de clubes: os que o pacote dá para escalar). */
  playersPerItem?: number;
  /** Vagas abertas na posição somando todos os técnicos que disputam o lote (incluindo a própria CPU). */
  demand?: number;
}

/** Quantos pontos de nível acima da “sobra” um item precisa ter para a CPU pagar o preço cheio. */
const PREMIUM_SPAN = 8;

export function cpuPlanBids(params: PlanParams): Record<string, number> {
  const { rng, participant, cards, mysteryCardIds, openInPosition, totalOpenSlots, round } = params;
  const packs = !!params.playersPerItem;
  const perItem = Math.max(1, params.playersPerItem ?? 1);
  // Pacotes: quase todo técnico leva um por setor, então a CPU segura a mão para chegar ao fim com moedas —
  // e solta no último setor que falta, porque moeda guardada depois do leilão não vale nada.
  const lastSector = packs && round === 'leva' && params.totalOpenSlots <= perItem;
  const pace = !packs ? 1 : lastSector ? 1.15 : 0.68;
  const coins = participant.coins;
  if (coins <= 0 || openInPosition <= 0 || cards.length === 0) return {};
  const style = participant.cpuStyle ?? 'equilibrado';
  const perSlot = coins / Math.max(1, totalOpenSlots);
  // Um setor inteiro de um clube é mais fácil de avaliar que um jogador só: a CPU erra menos nos pacotes.
  const ranked = cards
    .map((c) => ({ card: c, est: cpuEstimate(c, rng, mysteryCardIds.includes(c.id), packs ? 2.5 : 6) }))
    .map((x) => ({ ...x, noisy: x.est + rng.normal(0, packs ? 1.5 : 4) }))
    .sort((a, b) => b.noisy - a.noisy);

  // “Sobra”: o que a CPU acha que ainda leva barato (repescagem, Monte) se perder tudo neste lote —
  // o item que resta depois que todas as vagas em disputa forem preenchidas pelos melhores.
  // Só vale pagar caro pelo que é melhor que isso; pelo resto, um lance simbólico.
  const demand = Math.max(openInPosition, params.demand ?? 0);
  const byEst = ranked.map((x) => x.est).sort((a, b) => b - a);
  const surplus = byEst.length > demand || (packs && byEst.length >= demand && byEst.length > 1);
  const leftover = surplus ? byEst[Math.min(byEst.length, Math.max(1, demand)) - 1]! : null;

  const wanted = ranked.slice(0, Math.min(openInPosition, ranked.length));
  const bids: Record<string, number> = {};
  let total = 0;
  for (const w of wanted) {
    const desirability = Math.min(1.35, Math.max(0.05, (w.est - 62) / 28));
    // Às vezes a CPU passa a vez em nomes que acha fracos.
    if (desirability < 0.25 && rng.next() < 0.35) continue;
    // Nos pacotes, diferença de 2 pontos para a sobra está dentro do erro de avaliação: não conta.
    const premium = leftover === null ? 1 : Math.min(1, Math.max(0, (w.est - leftover - (packs ? 2 : 0)) / PREMIUM_SPAN));
    // Pacote que não é melhor que a sobra sai de graça no Monte: lance mínimo ou nenhum.
    if (packs && premium <= 0.1) {
      if (rng.next() < 0.5) continue;
      bids[w.card.id] = 1;
      total += 1;
      continue;
    }
    const relative = packs ? 0.3 + 0.7 * premium : 0.65 + 0.35 * premium;
    const roundMult = round === 'repescagem' ? (packs ? 0.5 : 0.65) : 1;
    let amount =
      perSlot * perItem * pace * (0.2 + 1.85 * Math.pow(desirability, 1.8)) * relative * STYLE_MULT[style] * roundMult * (0.75 + rng.next() * 0.5);
    // Teto pela qualidade: por mais moedas que tenha sobrando, a CPU não torra o caixa em item fraco.
    // Na repescagem dos pacotes só há sobras (e o Monte dá uma de graça): teto pela metade.
    const ceiling = coins * (0.05 + 0.95 * Math.pow(Math.min(1, desirability), 3)) * (packs && round === 'repescagem' ? 0.5 : 1);
    amount = Math.max(1, Math.round(Math.min(amount, ceiling)));
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

/** Convocação da CPU (leilão de clubes): em cada setor, os que ela acha melhores. */
export function cpuConvoca(rng: Rng, sectors: Array<{ need: number; cards: Card[] }>): string[] {
  const out: string[] = [];
  for (const { need, cards } of sectors) {
    const ranked = cards.map((c) => ({ id: c.id, est: cpuEstimate(c, rng, false) })).sort((a, b) => b.est - a.est);
    out.push(...ranked.slice(0, need).map((x) => x.id));
  }
  return out;
}
