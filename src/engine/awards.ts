import type { RevealItem } from './auction.js';
import type { Card, Participant } from './types.js';

/**
 * “Prêmios do pregão” exibidos na Cerimônia da Revelação.
 * O original mostra Achado, Mico, Mão furada, Mão de vaca e Perna-de-pau titular;
 * os critérios exatos não são públicos — abaixo estão os critérios próprios.
 */

export interface PregaoAward {
  id: 'achado' | 'mico' | 'mao-furada' | 'mao-de-vaca' | 'perna-de-pau' | 'martelo-caro';
  title: string;
  emoji: string;
  participantId: string;
  cardId?: string;
  text: string;
}

const mid = (c: Card) => (c.levelMin + c.levelMax) / 2;
const valueIndex = (c: Card, price: number) => mid(c) - 55 - price * 1.2;

export function computePregaoAwards(participants: Participant[], cards: Record<string, Card>, reveals: RevealItem[]): PregaoAward[] {
  const awards: PregaoAward[] = [];
  const sold = participants.flatMap((p) =>
    p.roster.filter((r) => r.price > 0).map((r) => ({ p, r, card: cards[r.cardId]! })),
  );
  if (sold.length > 0) {
    const best = [...sold].sort((a, b) => valueIndex(b.card, b.r.price) - valueIndex(a.card, a.r.price))[0]!;
    awards.push({
      id: 'achado',
      title: 'Achado do pregão',
      emoji: '🏅',
      participantId: best.p.id,
      cardId: best.card.id,
      text: `${best.card.name}: nível ${best.card.levelMin}–${best.card.levelMax} por ${best.r.price} moeda(s).`,
    });
    // Mico: muito caro para o nível que entregou (preço × distância de um craque).
    const micoScore = (c: Card, price: number) => price * Math.max(0, 85 - mid(c));
    const expensive = sold.filter((s) => s.r.price >= 3 && micoScore(s.card, s.r.price) > 0);
    if (expensive.length > 0) {
      const worst = [...expensive].sort((a, b) => micoScore(b.card, b.r.price) - micoScore(a.card, a.r.price))[0]!;
      if (worst.card.id !== best.card.id) {
        awards.push({
          id: 'mico',
          title: 'Mico do pregão',
          emoji: '🙈',
          participantId: worst.p.id,
          cardId: worst.card.id,
          text: `${worst.card.name}: nível ${worst.card.levelMin}–${worst.card.levelMax} e custou ${worst.r.price}.`,
        });
      }
    }
    const priciest = [...sold].sort((a, b) => b.r.price - a.r.price)[0]!;
    awards.push({
      id: 'martelo-caro',
      title: 'Martelo mais caro',
      emoji: '🔨',
      participantId: priciest.p.id,
      cardId: priciest.card.id,
      text: `${priciest.card.name} saiu por ${priciest.r.price} moedas.`,
    });
  }
  // Mão furada: quanto pagou acima do 2º maior lance, somado.
  const overpay = new Map<string, number>();
  for (const rv of reveals) {
    if (!rv.winnerId) continue;
    overpay.set(rv.winnerId, (overpay.get(rv.winnerId) ?? 0) + Math.max(0, rv.margin));
  }
  const furada = [...overpay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (furada && furada[1] > 0) {
    awards.push({
      id: 'mao-furada',
      title: 'Mão furada',
      emoji: '💸',
      participantId: furada[0],
      text: `Pagou ${furada[1]} moedas acima do 2º lance, somando o pregão inteiro.`,
    });
  }
  const vaca = [...participants].sort((a, b) => b.coins - a.coins)[0];
  if (vaca && vaca.coins > 0) {
    awards.push({
      id: 'mao-de-vaca',
      title: 'Mão de vaca',
      emoji: '🤏',
      participantId: vaca.id,
      text: `Terminou o pregão com ${vaca.coins} moedas no bolso.`,
    });
  }
  const starters = participants.flatMap((p) => p.roster.map((r) => ({ p, card: cards[r.cardId]! })));
  if (starters.length > 0) {
    const perna = [...starters].sort((a, b) => a.card.levelMax - b.card.levelMax || mid(a.card) - mid(b.card))[0]!;
    awards.push({
      id: 'perna-de-pau',
      title: 'Perna-de-pau titular',
      emoji: '🪵',
      participantId: perna.p.id,
      cardId: perna.card.id,
      text: `Escalou ${perna.card.name} (${perna.card.levelMin}–${perna.card.levelMax}).`,
    });
  }
  return awards;
}
