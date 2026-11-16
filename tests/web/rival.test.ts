import { describe, expect, it } from 'vitest';
import { rivalVerdict } from '../../src/web/components/room/RivalRecord';

describe('retrospecto contra o técnico adversário', () => {
  const rec = (wins: number, draws: number, losses: number) => ({ total: wins + draws + losses, wins, draws, losses });
  it('diz quem leva a melhor nos jogos diretos', () => {
    expect(rivalVerdict(rec(6, 2, 5))).toEqual({ tone: 'up', text: 'você leva vantagem' });
    expect(rivalVerdict(rec(2, 4, 5))).toEqual({ tone: 'down', text: 'você leva desvantagem' });
    expect(rivalVerdict(rec(3, 1, 3))).toEqual({ tone: 'even', text: 'tudo igual' });
    expect(rivalVerdict(rec(0, 0, 0))).toEqual({ tone: 'new', text: 'primeiro jogo entre vocês' });
  });
});
