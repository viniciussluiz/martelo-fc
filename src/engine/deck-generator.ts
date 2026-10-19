import { Rng } from './rng.js';
import type { Card, Position, Tier } from './types.js';

/**
 * Gerador do baralho padrão “Lendas Fictícias”.
 *
 * Decisão de design: o original usa nomes e clubes reais. Para não depender de
 * dados de terceiros nem de direitos de imagem, o baralho padrão é fictício e
 * gerado de forma determinística. O formato é o mesmo de um baralho licenciado
 * (ver docs/BARALHO.md), que pode substituir este arquivo.
 */

const FIRST = [
  'Ademir', 'Aldo', 'Amaro', 'Anselmo', 'Arlindo', 'Baltazar', 'Benedito', 'Bento', 'Caetano', 'Cândido',
  'Cícero', 'Clóvis', 'Dalton', 'Damião', 'Dario', 'Davi', 'Edgar', 'Edinho', 'Eliseu', 'Emílio',
  'Evaldo', 'Fausto', 'Feliciano', 'Firmino', 'Gaspar', 'Genésio', 'Gerson', 'Gilmar', 'Heitor', 'Hélio',
  'Horácio', 'Ivo', 'Jairo', 'Jonas', 'Juvenal', 'Lauro', 'Leôncio', 'Lindomar', 'Lucas', 'Lupércio',
  'Macário', 'Manoel', 'Marçal', 'Moacir', 'Nazário', 'Nestor', 'Nicanor', 'Odair', 'Olavo', 'Orlando',
  'Osmar', 'Otacílio', 'Pacheco', 'Plínio', 'Quirino', 'Raimundo', 'Reginaldo', 'Rufino', 'Sabino', 'Sálvio',
  'Severino', 'Silas', 'Tadeu', 'Tibério', 'Toninho', 'Ubirajara', 'Valdir', 'Vicente', 'Wanderlei', 'Zacarias',
  'Zeca', 'Juca', 'Tião', 'Netinho', 'Dudu', 'Biel', 'Kaio', 'Ruan', 'Yago', 'Thalles',
];

const SURNAME = [
  'Calhau', 'Brasileiro', 'Ferradura', 'Canhão', 'Pimenta', 'Trovão', 'Barbosa', 'Carrapeta', 'Mourão', 'Furacão',
  'Bandeira', 'Paçoca', 'Siqueira', 'Toquinho', 'Rebouças', 'Moringa', 'Tavares', 'Leiteiro', 'Cajueiro', 'Pitanga',
  'Andrada', 'Coruja', 'Fumaça', 'Jaburu', 'Macaxeira', 'Peixoto', 'Rapadura', 'Sabiá', 'Tamanduá', 'Vassoura',
  'Ventania', 'Bigode', 'Cotovelo', 'Faísca', 'Garrafão', 'Ligeiro', 'Marimbondo', 'Paraíba', 'Quiabo', 'Relâmpago',
  'Serafim', 'Taquara', 'Urubatã', 'Xodó', 'Zabumba', 'Beija-Flor', 'Cangaço', 'Dendê', 'Estilingue', 'Gaiola',
];

const CLUBS = [
  'Atlético Serrano', 'Ferroviário do Vale', 'Real Itapuã', 'União Cafezal', 'Operário Bandeirante',
  'Grêmio Planalto', 'Esporte Clube Mangueiral', 'Náutico Litorâneo', 'Tupã FC', 'Estrela Alvinegra',
  'Comercial da Serra', 'Aurora Paulistana', 'Juventus do Agreste', 'América Ribeirinho', 'Botafogo do Cerrado',
  'Sertanejo EC', 'Portuário AC', 'Independente Mineiro', 'Bangu da Colina', 'Ipiranga das Dunas',
];

/** Distribuição de faixas por posição (decisão própria). */
const TIER_WEIGHTS: Record<Tier, number> = { lenda: 8, craque: 20, titular: 32, operario: 26, perna: 14 };

const TIER_RANGES: Record<Tier, { min: [number, number]; width: [number, number] }> = {
  lenda: { min: [90, 95], width: [4, 6] },
  craque: { min: [82, 87], width: [6, 8] },
  titular: { min: [74, 79], width: [6, 9] },
  operario: { min: [66, 71], width: [7, 10] },
  perna: { min: [50, 58], width: [10, 16] },
};

const HINTS: Record<Tier, string[]> = {
  lenda: [
    'Ídolo eterno do {club}; estátua na porta do estádio.',
    'Eleito o melhor do continente na temporada de {year}.',
    'Camisa {num} histórica — decidiu três finais seguidas.',
    'Até hoje a torcida canta o nome dele no {club}.',
  ],
  craque: [
    'Artilheiro do estadual de {year} com folga.',
    'Convocado para a seleção na fase áurea do {club}.',
    'Decisivo nos clássicos; vendido caro para o exterior.',
    'Peça-chave do {club} campeão de {year}.',
  ],
  titular: [
    'Titular absoluto do {club} por cinco temporadas.',
    'Regular, raramente se machucava.',
    'Fez a temporada de {year} acima da média.',
    'Cumpridor; a torcida gostava da raça.',
  ],
  operario: [
    'Carregador de piano no {club} de {year}.',
    'Alternava entre o banco e o time titular.',
    'Contratado como aposta, entregou o básico.',
    'Ficou marcado por um gol contra num clássico.',
  ],
  perna: [
    'Folclórico do {club}: mais famoso pelo cabelo que pelos gols.',
    'Chegou como promessa em {year}; virou meme.',
    'Jogou poucas partidas, mas tem fã-clube.',
    'Contratação misteriosa do {club} de {year}.',
  ],
};

const ORDER: Tier[] = ['lenda', 'craque', 'titular', 'operario', 'perna'];

function hintFor(rng: Rng, tier: Tier, club: string, year: number): string {
  // 60% das vezes a pista vem da própria faixa; senão, de uma faixa vizinha.
  let source = tier;
  if (rng.next() >= 0.6) {
    const idx = ORDER.indexOf(tier);
    const neighbors = [ORDER[idx - 1], ORDER[idx + 1]].filter(Boolean) as Tier[];
    source = rng.pick(neighbors);
  }
  return rng
    .pick(HINTS[source])
    .replace('{club}', club)
    .replace('{year}', String(year))
    .replace('{num}', String(rng.pick([7, 9, 10, 11, 5, 8])));
}

export const DEFAULT_DECK_COUNTS: Record<Position, number> = { GOL: 36, LAT: 56, ZAG: 56, MEI: 96, ATA: 76 };

export function generateDeck(seed = 'martelo-fc-deck-v1', counts = DEFAULT_DECK_COUNTS): Card[] {
  const rng = new Rng(seed);
  const usedNames = new Set<string>();
  const cards: Card[] = [];
  let n = 0;
  for (const position of Object.keys(counts) as Position[]) {
    for (let i = 0; i < counts[position]; i++) {
      let name = '';
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = rng.next() < 0.22 ? rng.pick(FIRST) + ' ' + rng.pick(FIRST.slice(-12)) : `${rng.pick(FIRST)} ${rng.pick(SURNAME)}`;
        if (!usedNames.has(candidate)) {
          name = candidate;
          break;
        }
      }
      if (!name) name = `${rng.pick(FIRST)} ${rng.pick(SURNAME)} ${n}`;
      usedNames.add(name);
      const tier = rng.weighted(ORDER, (t) => TIER_WEIGHTS[t]);
      const range = TIER_RANGES[tier];
      const levelMin = rng.int(range.min[0], range.min[1]);
      const levelMax = Math.min(99, levelMin + rng.int(range.width[0], range.width[1]));
      const club = rng.pick(CLUBS);
      const year = rng.int(1958, 2026);
      n++;
      cards.push({
        id: `c${String(n).padStart(3, '0')}`,
        name,
        position,
        club,
        year,
        levelMin,
        levelMax,
        tier,
        hint: hintFor(rng, tier, club, year),
      });
    }
  }
  return cards;
}

/** Valida um baralho (gerado ou importado). Lança erro descritivo se inválido. */
export function validateDeck(cards: Card[]): void {
  const ids = new Set<string>();
  for (const c of cards) {
    if (!c.id || ids.has(c.id)) throw new Error(`Carta com id ausente ou duplicado: ${c.id}`);
    ids.add(c.id);
    if (!['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'].includes(c.position)) throw new Error(`Posição inválida em ${c.id}`);
    if (!(c.levelMin >= 1 && c.levelMax <= 99 && c.levelMin <= c.levelMax)) throw new Error(`Faixa de nível inválida em ${c.id}`);
    if (!c.name?.trim()) throw new Error(`Nome vazio em ${c.id}`);
    if (c.kit && !(Array.isArray(c.kit) && c.kit.length === 2 && c.kit.every((h) => /^#[0-9a-fA-F]{6}$/.test(h)))) {
      throw new Error(`Cores do uniforme inválidas em ${c.id}`);
    }
  }
}
