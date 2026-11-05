import { Rng } from './rng.js';
import { FORMATIONS, POSITIONS, QUALITY_BANDS, type Card, type Position, type QualityBand } from './types.js';

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
 *  - pacotes muito grandes são cortados (sorteio) para a convocação caber na tela;
 *  - uma pessoa nunca aparece em dois pacotes do mesmo leilão;
 *  - o lote mistura clubes fortes, médios e fracos (terços, pela força do pacote) e tem pelo
 *    menos um pacote com Lenda quando o baralho permite.
 */

export interface ClubPackage {
  id: string;
  club: string;
  position: Position;
  cardIds: string[];
  /** Pacote montado com jogadores de vários clubes (baralho sem clubes suficientes no setor). */
  mixed?: boolean;
}

/** Quantos jogadores o setor pede na formação mais exigente (4-3-3 ou 4-4-2). */
export const SECTOR_NEED: Record<Position, number> = Object.fromEntries(
  POSITIONS.map((pos) => [pos, Math.max(...Object.values(FORMATIONS).map((f) => f[pos]))]),
) as Record<Position, number>;

/** Tamanho mínimo de um pacote: o que a formação mais exigente pede + 1. */
export const PACK_MIN: Record<Position, number> = Object.fromEntries(POSITIONS.map((pos) => [pos, SECTOR_NEED[pos] + 1])) as Record<
  Position,
  number
>;

/** Tamanho máximo de um pacote (clubes enormes no baralho são cortados por sorteio). */
export const PACK_MAX = 10;

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
      const cut = all.length > PACK_MAX ? rng.shuffle(all).slice(0, PACK_MAX) : all.slice();
      return { club, all, cards: cut, strength: packageStrength(cut, pos) };
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

/** Escolhe `n` pacotes misturando os terços de força (fortes, médios e fracos). */
function pickBalanced(candidates: Candidate[], n: number, rng: Rng): Candidate[] {
  if (n >= candidates.length) return candidates.slice();
  const ranked = [...candidates].sort((a, b) => b.strength - a.strength);
  const third = Math.ceil(ranked.length / 3);
  const bands: Record<QualityBand, Candidate[]> = {
    bom: rng.shuffle(ranked.slice(0, third)),
    medio: rng.shuffle(ranked.slice(third, 2 * third)),
    ruim: rng.shuffle(ranked.slice(2 * third)),
  };
  const out: Candidate[] = [];
  const order = rng.shuffle(QUALITY_BANDS);
  let i = 0;
  while (out.length < n) {
    const band = order[i++ % order.length]!;
    const next = bands[band].shift() ?? (['bom', 'medio', 'ruim'] as const).map((b) => bands[b].shift()).find(Boolean);
    if (!next) break;
    out.push(next);
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
  // 2) Troca o pacote mais fraco por um clube de fora que tenha Lenda.
  const outside = rng.shuffle(candidates.filter((c) => !chosen.includes(c) && hasLegend(c.all)))[0];
  if (!outside) return;
  if (!hasLegend(outside.cards)) {
    const legend = rng.pick(outside.all.filter((c) => c.tier === 'lenda'));
    const worst = [...outside.cards].sort((a, b) => mid(a) - mid(b))[0]!;
    outside.cards = outside.cards.map((c) => (c === worst ? legend : c));
  }
  const weakest = [...chosen].sort((a, b) => a.strength - b.strength)[0]!;
  chosen[chosen.indexOf(weakest)] = outside;
}
