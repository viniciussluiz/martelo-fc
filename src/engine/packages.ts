import { Rng } from './rng.js';
import { AUCTION_FORMATIONS, FORMATIONS, POSITIONS, QUALITY_BANDS, type Card, type Position, type QualityBand } from './types.js';

/**
 * Leilão de clubes: em vez de um jogador por lance, cada lote é um SETOR de um clube
 * (ex.: os goleiros do Corinthians). Quem leva o pacote convoca, no fim do pregão,
 * quem joga pela sua formação; quem sobra vai para os outros times da liga.
 *
 * Regras (observadas no Leilão Legends e adaptadas):
 *  - cada setor tem um pacote a mais que o número de técnicos;
 *  - cada técnico leva no máximo um pacote por setor;
 *  - todo pacote tem pelo menos um jogador a mais do que a formação mais exigente pede
 *    no setor (goleiros 2, laterais 3, zagueiros 3, meias 5, atacantes 4), para sempre haver escolha;
 *  - pacotes muito grandes são cortados para a convocação caber na tela: os melhores do clube no
 *    setor ficam sempre (ninguém leva o Bayern sem o Beckenbauer) e o resto das vagas é sorteado;
 *  - uma pessoa nunca aparece em dois pacotes do mesmo leilão;
 *  - o lote tem 1/3 de clubes fortes, 1/3 de médios e 1/3 de fracos (terços, pela força do pacote;
 *    a sobra da divisão vai para os fortes) e pelo menos um pacote com Lenda quando o baralho permite;
 *  - com Europa e Brasil no baralho da sala, metade dos pacotes do lote é de cada origem.
 */

export interface ClubPackage {
  id: string;
  club: string;
  position: Position;
  cardIds: string[];
  /** Pacote montado com jogadores de vários clubes (baralho sem clubes suficientes no setor). */
  mixed?: boolean;
}

/** Quantos jogadores o setor pede na formação de leilão mais exigente (4-3-3 ou 4-4-2). */
export const SECTOR_NEED: Record<Position, number> = Object.fromEntries(
  POSITIONS.map((pos) => [pos, Math.max(...AUCTION_FORMATIONS.map((f) => FORMATIONS[f][pos]))]),
) as Record<Position, number>;

/** Tamanho mínimo de um pacote: o que a formação mais exigente pede + 1. */
export const PACK_MIN: Record<Position, number> = Object.fromEntries(POSITIONS.map((pos) => [pos, SECTOR_NEED[pos] + 1])) as Record<
  Position,
  number
>;

/** Tamanho máximo de um pacote (clubes enormes no baralho são cortados). */
export const PACK_MAX = 10;
/** No corte, quantos dos melhores do clube no setor têm vaga garantida; o resto é sorteio. */
export const PACK_KEEP = 5;

export const SECTOR_LABEL: Record<Position, string> = {
  GOL: 'Goleiros',
  LAT: 'Laterais',
  ZAG: 'Zagueiros',
  MEI: 'Meio-campo',
  ATA: 'Ataque',
};

/** “Corinthians · goleiros” (sem artigo: “do/da” depende do clube). */
export function packageLabel(p: Pick<ClubPackage, 'club' | 'position' | 'mixed'>): string {
  return p.mixed ? `${SECTOR_LABEL[p.position]} combinados` : `${p.club} · ${SECTOR_LABEL[p.position].toLowerCase()}`;
}

const mid = (c: Card) => (c.levelMin + c.levelMax) / 2;

/** Força do pacote: média dos melhores que a formação mais exigente escalaria. */
export function packageStrength(cards: Card[], position: Position): number {
  const best = cards
    .map(mid)
    .sort((a, b) => b - a)
    .slice(0, SECTOR_NEED[position]);
  return best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0;
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface Candidate {
  club: string;
  /** Todos os jogadores do clube no setor (uma versão por pessoa). */
  all: Card[];
  /** O pacote (corte de até PACK_MAX). */
  cards: Card[];
  strength: number;
  /** Origem do clube: Europa ou Brasil (Séries A e B); `null` em baralhos sem grupo e nas seleções. */
  region: Region | null;
}

type Region = 'eu' | 'br';

function regionOf(cards: Card[]): Region | null {
  const series = cards[0]?.series;
  if (series === 'EU') return 'eu';
  return series === 'A' || series === 'B' ? 'br' : null;
}

export function buildClubPackages(params: { participants: number; deck: Card[]; seed: string }): { packages: ClubPackage[]; cards: Card[] } {
  const rng = new Rng(`pacotes:${params.seed}`);
  const person = (c: Card) => c.personId ?? c.id;
  const usedPeople = new Set<string>();
  const packages: ClubPackage[] = [];
  const cards: Card[] = [];
  const want = Math.max(2, params.participants + 1);

  for (const pos of POSITIONS) {
    // Jogadores do setor por clube, uma versão por pessoa (a versão é sorteada).
    const byClub = new Map<string, Card[]>();
    const seen = new Set<string>();
    for (const c of rng.shuffle(params.deck.filter((c) => c.position === pos && !c.id.startsWith('fill-')))) {
      if (usedPeople.has(person(c)) || seen.has(person(c))) continue;
      seen.add(person(c));
      const list = byClub.get(c.club) ?? [];
      list.push(c);
      byClub.set(c.club, list);
    }
    const toCandidate = (club: string, all: Card[]): Candidate => {
      let cut = all.slice();
      if (all.length > PACK_MAX) {
        const ranked = all.slice().sort((x, y) => mid(y) - mid(x) || x.id.localeCompare(y.id));
        cut = [...ranked.slice(0, PACK_KEEP), ...rng.shuffle(ranked.slice(PACK_KEEP)).slice(0, PACK_MAX - PACK_KEEP)];
      }
      return { club, all, cards: cut, strength: packageStrength(cut, pos), region: regionOf(all) };
    };
    let candidates = [...byClub.entries()].filter(([, l]) => l.length >= PACK_MIN[pos]).map(([club, l]) => toCandidate(club, l));
    // Poucos clubes com elenco completo: aceita os que têm o mínimo da formação (sem sobra).
    if (candidates.length < want) {
      const extra = [...byClub.entries()]
        .filter(([, l]) => l.length >= SECTOR_NEED[pos] && l.length < PACK_MIN[pos])
        .map(([club, l]) => toCandidate(club, l));
      candidates = [...candidates, ...rng.shuffle(extra).slice(0, want - candidates.length)];
    }

    const chosen = pickBalanced(candidates, Math.min(want, candidates.length), rng);
    ensureLegend(chosen, candidates, rng);

    const sector: ClubPackage[] = chosen.map((c) => ({
      id: `pk:${pos}:${slug(c.club)}`,
      club: c.club,
      position: pos,
      cardIds: c.cards.map((x) => x.id),
    }));
    for (const c of chosen) {
      cards.push(...c.cards);
      for (const x of c.cards) usedPeople.add(person(x));
    }

    // Ainda faltando pacote (baralho pequeno): pacotes combinados com quem sobrou no setor.
    if (sector.length < want) {
      const taken = new Set(chosen.map((c) => c.club));
      const loose = rng.shuffle([...byClub.entries()].filter(([club]) => !taken.has(club)).flatMap(([, l]) => l));
      let n = 0;
      while (sector.length < want && loose.length >= SECTOR_NEED[pos]) {
        const size = Math.min(loose.length, Math.max(PACK_MIN[pos], Math.ceil(loose.length / (want - sector.length))), PACK_MAX);
        const part = loose.splice(0, size);
        n++;
        sector.push({ id: `pk:${pos}:combinado-${n}`, club: 'Combinado', position: pos, cardIds: part.map((x) => x.id), mixed: true });
        cards.push(...part);
        for (const x of part) usedPeople.add(person(x));
      }
    }
    packages.push(...rng.shuffle(sector));
  }
  return { packages, cards };
}

/**
 * Escolhe `n` pacotes com duas garantias (quando o baralho permite):
 *  - força: os clubes do setor são divididos em terços (fortes, médios, fracos) e o lote leva
 *    1/3 de cada; o que sobra da divisão vai primeiro para os fortes, depois para os médios
 *    (3 pacotes = 1/1/1, 4 = 2/1/1, 5 = 2/2/1) — nunca um lote só de fracos;
 *  - origem: metade Europa, metade Brasil (com número ímpar, o pacote a mais é sorteado).
 */
function pickBalanced(candidates: Candidate[], n: number, rng: Rng): Candidate[] {
  if (n >= candidates.length) return candidates.slice();
  const ranked = [...candidates].sort((a, b) => b.strength - a.strength);
  const third = Math.ceil(ranked.length / 3);
  const bands: Record<QualityBand, Candidate[]> = {
    bom: rng.shuffle(ranked.slice(0, third)),
    medio: rng.shuffle(ranked.slice(third, 2 * third)),
    ruim: rng.shuffle(ranked.slice(2 * third)),
  };

  // Cotas por faixa de força; faixa sem clubes suficientes repassa a vaga (fortes primeiro).
  const quota: Record<QualityBand, number> = {
    bom: Math.floor(n / 3) + (n % 3 >= 1 ? 1 : 0),
    medio: Math.floor(n / 3) + (n % 3 === 2 ? 1 : 0),
    ruim: Math.floor(n / 3),
  };
  let spare = 0;
  for (const b of QUALITY_BANDS) {
    const over = quota[b] - bands[b].length;
    if (over > 0) {
      quota[b] -= over;
      spare += over;
    }
  }
  for (const b of QUALITY_BANDS) {
    const room = Math.min(spare, bands[b].length - quota[b]);
    quota[b] += room;
    spare -= room;
  }

  // Cotas por origem (só quando o baralho da sala tem Europa e Brasil).
  const total: Record<Region, number> = { eu: 0, br: 0 };
  for (const c of candidates) if (c.region) total[c.region]++;
  const mixRegions = total.eu > 0 && total.br > 0;
  const left: Record<Region, number> = { eu: 0, br: 0 };
  if (mixRegions) {
    const others = candidates.length - total.eu - total.br;
    const slots = Math.max(0, n - Math.min(others, Math.floor(n / 3)));
    let eu = Math.floor(slots / 2) + (slots % 2 === 1 && rng.next() < 0.5 ? 1 : 0);
    eu = Math.max(slots - total.br, Math.min(total.eu, eu));
    left.eu = eu;
    left.br = slots - eu;
  }

  const out: Candidate[] = [];
  // Os fracos primeiro: é a faixa com menos opções de origem (quase não há europeu fraco),
  // e as faixas seguintes compensam o que faltar.
  for (const band of ['ruim', 'medio', 'bom'] as const) {
    for (let k = 0; k < quota[band]; k++) {
      const pool = bands[band];
      let idx = 0;
      if (mixRegions) {
        const prefer: Region[] =
          left.eu === left.br ? rng.shuffle<Region>(['eu', 'br']) : left.eu > left.br ? ['eu', 'br'] : ['br', 'eu'];
        const hit = prefer
          .filter((r) => left[r] > 0)
          .map((r) => pool.findIndex((c) => c.region === r))
          .find((j) => j >= 0);
        if (hit !== undefined) idx = hit;
      }
      const [next] = pool.splice(idx, 1);
      if (!next) break;
      if (next.region && left[next.region] > 0) left[next.region]--;
      out.push(next);
    }
  }
  return out;
}

/** Pelo menos um pacote com Lenda no setor, quando algum clube do baralho tem. */
function ensureLegend(chosen: Candidate[], candidates: Candidate[], rng: Rng) {
  const hasLegend = (cards: Card[]) => cards.some((c) => c.tier === 'lenda');
  if (chosen.length === 0 || chosen.some((c) => hasLegend(c.cards))) return;
  // 1) Um clube escolhido tem Lenda que ficou fora do corte: entra no lugar do pior do pacote.
  const withHidden = rng.shuffle(chosen.filter((c) => hasLegend(c.all)));
  const host = withHidden[0];
  if (host) {
    const legend = rng.pick(host.all.filter((c) => c.tier === 'lenda'));
    const worst = [...host.cards].sort((a, b) => mid(a) - mid(b))[0]!;
    host.cards = host.cards.map((c) => (c === worst ? legend : c));
    host.strength = packageStrength(host.cards, legend.position);
    return;
  }
  // 2) Troca um pacote por um clube de fora que tenha Lenda. Sai o mais forte da mesma origem
  //    (clube com Lenda é clube forte: assim a mistura de força e de origem do lote não muda);
  //    sem ninguém da mesma origem, sai o mais fraco.
  const outside = rng.shuffle(candidates.filter((c) => !chosen.includes(c) && hasLegend(c.all)))[0];
  if (!outside) return;
  if (!hasLegend(outside.cards)) {
    const legend = rng.pick(outside.all.filter((c) => c.tier === 'lenda'));
    const worst = [...outside.cards].sort((a, b) => mid(a) - mid(b))[0]!;
    outside.cards = outside.cards.map((c) => (c === worst ? legend : c));
    outside.strength = packageStrength(outside.cards, legend.position);
  }
  const byStrength = [...chosen].sort((a, b) => b.strength - a.strength);
  const leaving = byStrength.find((c) => c.region === outside.region) ?? byStrength[byStrength.length - 1]!;
  chosen[chosen.indexOf(leaving)] = outside;
}
