import type { PackageGroup } from '../engine/packages.js';
import { Rng } from '../engine/rng.js';
import type { Card } from '../engine/types.js';

/**
 * Clássicos do leilão “Clássicos”: cada pacote é o setor de um clássico (os goleiros do Fla-Flu), com os
 * jogadores dos dois clubes, de todas as épocas. Os nomes dos clubes são os do baralho (`Card.club`).
 *
 * Uma pessoa não aparece em dois pacotes do mesmo leilão, então cada clube entra em um clássico só por
 * leilão: a cada leilão o jogo sorteia uma combinação (Fla-Flu e Vasco x Botafogo, ou Flamengo x Vasco e
 * Fluminense x Botafogo…). Com o baralho de hoje são 18 clássicos por leilão, 9 do Brasil e 9 da Europa:
 * dá pacote de clássico para até 15 técnicos (Atletiba e Ba-Vi não fecham a zaga); acima disso, os que
 * faltarem saem combinados.
 */
export interface Classico {
  id: string;
  nome: string;
  clubes: readonly [string, string];
  regiao: 'BR' | 'EU';
}

export const CLASSICOS: readonly Classico[] = [
  { id: 'fla-flu', nome: 'Fla-Flu', clubes: ['Flamengo', 'Fluminense'], regiao: 'BR' },
  { id: 'majestoso', nome: 'Majestoso', clubes: ['São Paulo', 'Corinthians'], regiao: 'BR' },
  { id: 'san-sao', nome: 'San-São', clubes: ['Santos', 'São Paulo'], regiao: 'BR' },
  { id: 'derby-paulista', nome: 'Derby', clubes: ['Corinthians', 'Palmeiras'], regiao: 'BR' },
  { id: 'choque-rei', nome: 'Choque-Rei', clubes: ['Palmeiras', 'São Paulo'], regiao: 'BR' },
  { id: 'classico-da-saudade', nome: 'Clássico da Saudade', clubes: ['Santos', 'Palmeiras'], regiao: 'BR' },
  { id: 'classico-alvinegro', nome: 'Clássico Alvinegro', clubes: ['Santos', 'Corinthians'], regiao: 'BR' },
  { id: 'classico-dos-milhoes', nome: 'Clássico dos Milhões', clubes: ['Flamengo', 'Vasco'], regiao: 'BR' },
  { id: 'classico-da-rivalidade', nome: 'Clássico da Rivalidade', clubes: ['Flamengo', 'Botafogo'], regiao: 'BR' },
  { id: 'classico-vovo', nome: 'Clássico Vovô', clubes: ['Fluminense', 'Botafogo'], regiao: 'BR' },
  { id: 'classico-dos-gigantes', nome: 'Clássico dos Gigantes', clubes: ['Fluminense', 'Vasco'], regiao: 'BR' },
  { id: 'classico-da-amizade', nome: 'Clássico da Amizade', clubes: ['Vasco', 'Botafogo'], regiao: 'BR' },
  { id: 'gre-nal', nome: 'Gre-Nal', clubes: ['Grêmio', 'Internacional'], regiao: 'BR' },
  { id: 'classico-mineiro', nome: 'Clássico Mineiro', clubes: ['Atlético-MG', 'Cruzeiro'], regiao: 'BR' },
  { id: 'atletiba', nome: 'Atletiba', clubes: ['Athletico-PR', 'Coritiba'], regiao: 'BR' },
  { id: 'ba-vi', nome: 'Ba-Vi', clubes: ['Bahia', 'Vitória'], regiao: 'BR' },
  { id: 'classico-dos-classicos', nome: 'Clássico dos Clássicos', clubes: ['Sport', 'Náutico'], regiao: 'BR' },
  { id: 'el-clasico', nome: 'El Clásico', clubes: ['Real Madrid', 'Barcelona'], regiao: 'EU' },
  { id: 'derbi-madrileno', nome: 'Derbi madrileño', clubes: ['Real Madrid', 'Atlético de Madrid'], regiao: 'EU' },
  { id: 'derby-della-madonnina', nome: 'Derby della Madonnina', clubes: ['Milan', 'Inter de Milão'], regiao: 'EU' },
  { id: 'derby-d-italia', nome: 'Derby d’Italia', clubes: ['Juventus', 'Inter de Milão'], regiao: 'EU' },
  { id: 'derby-della-capitale', nome: 'Derby della Capitale', clubes: ['Roma', 'Lazio'], regiao: 'EU' },
  { id: 'derby-de-manchester', nome: 'Derby de Manchester', clubes: ['Manchester United', 'Manchester City'], regiao: 'EU' },
  { id: 'north-west-derby', nome: 'North West Derby', clubes: ['Liverpool', 'Manchester United'], regiao: 'EU' },
  { id: 'north-london-derby', nome: 'North London Derby', clubes: ['Arsenal', 'Tottenham'], regiao: 'EU' },
  { id: 'der-klassiker', nome: 'Der Klassiker', clubes: ['Bayern de Munique', 'Borussia Dortmund'], regiao: 'EU' },
  { id: 'le-classique', nome: 'Le Classique', clubes: ['PSG', 'Olympique de Marseille'], regiao: 'EU' },
  { id: 'de-topper', nome: 'De Topper', clubes: ['Ajax', 'PSV'], regiao: 'EU' },
  { id: 'derby-de-lisboa', nome: 'Derby de Lisboa', clubes: ['Benfica', 'Sporting'], regiao: 'EU' },
  { id: 'o-classico', nome: 'O Clássico', clubes: ['Benfica', 'Porto'], regiao: 'EU' },
];

/**
 * Clássicos de um leilão, sorteados pela semente: cada clube do baralho entra em um só (o primeiro
 * clássico sorteado que o tem). Clássico com clube fora do baralho não entra.
 */
export function classicosForAuction(deck: readonly Card[], seed: string): Classico[] {
  const clubs = new Set(deck.filter((c) => c.series !== 'SEL').map((c) => c.club));
  const used = new Set<string>();
  const out: Classico[] = [];
  for (const c of new Rng(`classicos:${seed}`).shuffle(CLASSICOS)) {
    if (!c.clubes.every((club) => clubs.has(club)) || c.clubes.some((club) => used.has(club))) continue;
    out.push(c);
    for (const club of c.clubes) used.add(club);
  }
  return out;
}

/** Os clássicos como grupos de pacote do leilão. */
export function classicoGroups(classicos: readonly Classico[]): PackageGroup[] {
  return classicos.map((c) => ({ id: c.id, name: c.nome, clubs: c.clubes }));
}
