import { Rng } from '../../engine/rng.js';
import type { Card, Position, Series, Tier } from '../../engine/types.js';
import { SERIES_CLUBS, SERIES_SEASON, type SeriesClub } from './series.js';
import type { RawClub, RawDump, RawPerson, RawStint } from './types.js';

/**
 * Monta o baralho a partir dos dados brutos do Wikidata.
 *
 * A nota é uma decisão própria (nenhuma fonte aberta tem “overall”):
 *  1. Fama do jogador: artigos em Wikipédias (sitelinks, escala log), prêmios e jogos
 *     por seleção → percentil entre todos os candidatos → nota de auge (56–97).
 *  2. Cada passagem por clube ajusta o auge: idade no período, tempo/jogos no clube,
 *     peso do clube, gols por jogo (atacantes) e se foi a passagem principal.
 *  3. Incerteza vira a largura da faixa (dados incompletos → faixa mais larga).
 * Assim o mesmo nome vale diferente conforme o clube e o ano, como no jogo original.
 */

export interface BuildOptions {
  deckId: string;
  deckName: string;
  /** Ano de referência para “jogadores atuais” (passagem sem data de fim). */
  currentYear: number;
  /**
   * Clubes que viram cartas, com a série de cada um. Passagens por outros clubes do
   * dump contam para a fama do jogador, mas não viram carta. `null` = todos os clubes, sem série.
   */
  clubs: SeriesClub[] | null;
  /** Cartas por posição em cada série (cada série sozinha precisa bastar para uma sala de 20). */
  countsBySeries: Record<Series, Record<Position, number>>;
  /** Cartas por posição quando não há séries (`clubs: null`). */
  counts: Record<Position, number>;
  /** Máximo de versões (clube/ano) do mesmo jogador no baralho. */
  maxVersionsPerPlayer: number;
  /** Participação desejada de cada faixa no baralho. */
  tierShare: Record<Tier, number>;
  /** Percentil de fama a partir do qual a melhor versão do jogador sempre entra. */
  mustIncludePercentile: Record<Region, number>;
  seed: string;
}

export const DEFAULT_BUILD: BuildOptions = {
  deckId: `brasileirao-${SERIES_SEASON}-wikidata`,
  deckName: `Brasileirão ${SERIES_SEASON} (Séries A e B) + grandes da Europa`,
  currentYear: new Date().getFullYear(),
  clubs: SERIES_CLUBS,
  countsBySeries: {
    A: { GOL: 70, LAT: 110, ZAG: 115, MEI: 220, ATA: 185 },
    B: { GOL: 30, LAT: 55, ZAG: 55, MEI: 105, ATA: 85 },
    EU: { GOL: 85, LAT: 140, ZAG: 150, MEI: 290, ATA: 235 },
  },
  counts: { GOL: 90, LAT: 140, ZAG: 140, MEI: 260, ATA: 220 },
  maxVersionsPerPlayer: 2,
  tierShare: {
    lenda: 0.08,
    craque: 0.18,
    titular: 0.34,
    operario: 0.26,
    perna: 0.14,
  },
  // Na Europa a busca já só traz jogadores muito citados; ali o corte é mais alto.
  mustIncludePercentile: { BR: 0.9, EU: 0.95 },
  seed: 'wikidata-deck-v1',
};

export interface DeckFile {
  id: string;
  name: string;
  version: number;
  source: string;
  license: string;
  generatedAt: string;
  fetchedAt: string;
  cards: Card[];
}

// ---------------------------------------------------------------------------
// Normalização de nomes, posições e clubes
// ---------------------------------------------------------------------------

const POSITION_RULES: Array<[RegExp, Position]> = [
  [/goal ?keeper/i, 'GOL'],
  [/full[- ]?back|wing[- ]?back|left[- ]back|right[- ]back|lateral/i, 'LAT'],
  [/striker|centre[- ]forward|center[- ]forward|second striker|inside forward|outside forward/i, 'ATA'],
  [/centre[- ]back|center[- ]back|stopper|sweeper|libero|central defender/i, 'ZAG'],
  [/midfield|wing half|half[- ]back|playmaker|regista|mezzala/i, 'MEI'],
  [/defender/i, 'ZAG'],
  [/forward|winger/i, 'ATA'],
];

/** Posição do jogo a partir dos rótulos do Wikidata (ordem de prioridade: GOL, LAT, ATA, ZAG, MEI). */
export function mapPosition(labels: string[]): Position | null {
  const found = new Set<Position>();
  for (const l of labels) {
    for (const [re, pos] of POSITION_RULES) {
      if (re.test(l)) {
        found.add(pos);
        break;
      }
    }
  }
  for (const pos of ['GOL', 'LAT', 'ATA', 'ZAG', 'MEI'] as Position[]) if (found.has(pos)) return pos;
  return null;
}

const stripParens = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Nome curto pelo qual o jogador é conhecido: o menor entre título da Wikipédia pt e rótulos.
 * Se todos forem nome completo (3+ palavras), tenta um apelido que compartilhe uma palavra com ele
 * (evita trocar “Ronaldo Nazário” por “Fenômeno”).
 */
export function displayName(
  p: Pick<RawPerson, 'ptTitle' | 'labelPt' | 'labelEn'> & {
    nicknames?: string[];
    nationalities?: string[];
  },
): string | null {
  const candidates = nameCandidates(p);
  if (candidates.length === 0) return null;
  const best = candidates.reduce((b, c) => (words(c) < words(b) || (words(c) === words(b) && c.length < b.length) ? c : b));
  if (words(best) < 3) return best;
  const tokens = new Set(
    normalize(best)
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  const nick = (p.nicknames ?? [])
    .map(stripParens)
    .filter((n) => n.length >= 2 && n.length <= 24 && words(n) <= 2)
    .find((n) =>
      normalize(n)
        .split(/\s+/)
        .some((t) => tokens.has(t)),
    );
  if (nick) return nick;
  // Jogador brasileiro só com o nome de registro (4+ palavras) nos rótulos: no Brasil ele é chamado pelo
  // prenome (“Cássio Albuquerque dos Anjos” → “Cássio”; “Paulo Sérgio de Oliveira Lima” → “Paulo Sérgio”).
  // Nomes de 3 palavras costumam ser o nome de guerra (“Ademir da Guia”, “Paulo Roberto Falcão”).
  const brazilian = !p.nationalities?.length || p.nationalities.includes('Brasil');
  return brazilian && words(best) >= 4 ? givenName(best) : best;
}

const words = (s: string) => s.split(/\s+/).length;

function nameCandidates(p: Pick<RawPerson, 'ptTitle' | 'labelPt' | 'labelEn'>): string[] {
  return [p.ptTitle, p.labelPt, p.labelEn]
    .filter((x): x is string => !!x && !/^Q\d+$/.test(x))
    .map(stripParens)
    .filter((x) => x.length >= 2 && x.length <= 40);
}

const CONNECTORS = new Set(['da', 'de', 'do', 'dos', 'das', 'e']);
const COMPOUND_FIRST = new Set([
  'jose',
  'joao',
  'paulo',
  'luiz',
  'luis',
  'carlos',
  'marco',
  'marcos',
  'antonio',
  'jorge',
  'pedro',
  'francisco',
  'juan',
]);
const NAME_SUFFIXES = new Set(['junior', 'jr', 'jr.', 'filho', 'neto', 'sobrinho', 'segundo']);

/** Prenome pelo qual um jogador brasileiro costuma ser chamado (simples ou composto). */
export function givenName(full: string): string {
  const w = full.split(/\s+/);
  if (w.length < 2) return full;
  if (COMPOUND_FIRST.has(normalize(w[0]!)) && !CONNECTORS.has(w[1]!.toLowerCase())) return `${w[0]} ${w[1]}`;
  return w[0]!;
}

/** Forma para desempatar homônimos: prenome + último sobrenome (“Reinaldo Manoel da Silva” → “Reinaldo Silva”). */
export function disambiguatedName(name: string, p: Pick<RawPerson, 'ptTitle' | 'labelPt' | 'labelEn'>): string | null {
  const full = nameCandidates(p).reduce<string | null>((b, c) => (b === null || words(c) > words(b) ? c : b), null);
  if (!full || words(full) < 2) return null;
  const w = full.split(/\s+/).filter((x) => !CONNECTORS.has(x.toLowerCase()));
  while (w.length > 1 && NAME_SUFFIXES.has(normalize(w[w.length - 1]!))) w.pop();
  const last = w[w.length - 1]!;
  if (normalize(name).split(/\s+/).includes(normalize(last))) return null;
  return `${name} ${last}`;
}

const CLUB_OVERRIDES: Array<[RegExp, string]> = [
  [/Atl[eé]tico Mineiro/i, 'Atlético-MG'],
  [/Athletico Paranaense|Atl[eé]tico Paranaense/i, 'Athletico-PR'],
  [/Atl[eé]tico Goianiense/i, 'Atlético-GO'],
  [/Vasco da Gama/i, 'Vasco'],
  [/Corinthians/i, 'Corinthians'],
  [/Gr[eê]mio Foot-Ball Porto Alegrense|Gr[eê]mio FBPA/i, 'Grêmio'],
  [/Botafogo de Futebol e Regatas/i, 'Botafogo'],
  [/Sport Club do Recife/i, 'Sport'],
  [/Am[eé]rica Futebol Clube \(MG\)|Am[eé]rica Mineiro/i, 'América-MG'],
  [/Red Bull Bragantino/i, 'Bragantino'],
  [/Portuguesa de Desportos/i, 'Portuguesa'],
  [/Ponte Preta/i, 'Ponte Preta'],
  [/Paran[aá] Clube/i, 'Paraná'],
];

const CLUB_PREFIXES =
  /^(Clube de Regatas do|Clube de Regatas|Club de Regatas|Clube|Club|Sport Club|Esporte Clube|Sociedade Esportiva|Associação Atlética|Associação Chapecoense de Futebol|Associação|Futebol Clube|Grêmio Esportivo|Esporte Clube)\s+/i;
const CLUB_SUFFIXES =
  /\s+(Futebol Clube|Foot Ball Club|Football Club|Esporte Clube|Futebol e Regatas|de Futebol|Futebol|F\.?C\.?|E\.?C\.?|S\.?C\.?)$/i;

/**
 * Cores dos uniformes dos principais clubes (fato público; o Wikidata tem poucos e
 * às vezes cores “puras” como #00FF00). Usadas só nas figurinhas ilustradas.
 */
const KNOWN_KITS: Record<string, [string, string]> = {
  Flamengo: ['#C8102E', '#111111'],
  Corinthians: ['#FFFFFF', '#111111'],
  Palmeiras: ['#006437', '#FFFFFF'],
  'São Paulo': ['#FFFFFF', '#D0021B'],
  Santos: ['#FFFFFF', '#111111'],
  Vasco: ['#111111', '#FFFFFF'],
  Fluminense: ['#7A1E32', '#00613A'],
  Botafogo: ['#111111', '#FFFFFF'],
  Grêmio: ['#0D80BF', '#111111'],
  Internacional: ['#D50000', '#FFFFFF'],
  Cruzeiro: ['#0033A0', '#FFFFFF'],
  'Atlético-MG': ['#111111', '#FFFFFF'],
  'Athletico-PR': ['#C8102E', '#111111'],
  Bahia: ['#0055A4', '#E30613'],
  Vitória: ['#D50000', '#111111'],
  Sport: ['#D50000', '#111111'],
  Fortaleza: ['#D50000', '#0033A0'],
  Ceará: ['#111111', '#FFFFFF'],
  Coritiba: ['#00613A', '#FFFFFF'],
  Goiás: ['#00613A', '#FFFFFF'],
  Juventude: ['#00843D', '#FFFFFF'],
  Chapecoense: ['#00843D', '#FFFFFF'],
  Avaí: ['#0055A4', '#FFFFFF'],
  Figueirense: ['#111111', '#FFFFFF'],
  'Ponte Preta': ['#111111', '#FFFFFF'],
  Portuguesa: ['#D50000', '#00843D'],
  Guarani: ['#00843D', '#FFFFFF'],
  'América-MG': ['#00843D', '#111111'],
  Paraná: ['#0033A0', '#D50000'],
};

function clubKit(c: RawClub, shortName: string): [string, string] | undefined {
  if (KNOWN_KITS[shortName]) return KNOWN_KITS[shortName];
  if (!c.colors.length) return undefined;
  return [`#${c.colors[0]}`, `#${c.colors[1] ?? 'FFFFFF'}`];
}

export function shortClubName(c: Pick<RawClub, 'label' | 'short'>): string {
  for (const [re, name] of CLUB_OVERRIDES) if (re.test(c.label)) return name;
  if (c.short && c.short.length >= 3 && !/^[A-Z]{2,4}$/.test(c.short)) return c.short;
  let s = c.label;
  for (let i = 0; i < 3; i++) s = s.replace(CLUB_PREFIXES, '').replace(CLUB_SUFFIXES, '').trim();
  if (/^Chapecoense/i.test(c.label) || /Chapecoense/i.test(s)) return 'Chapecoense';
  return s || c.label;
}

// ---------------------------------------------------------------------------
// Nota
// ---------------------------------------------------------------------------

export function tierOf(mid: number): Tier {
  if (mid >= 90) return 'lenda';
  if (mid >= 84) return 'craque';
  if (mid >= 76) return 'titular';
  if (mid >= 68) return 'operario';
  return 'perna';
}

/**
 * Fama do jogador: artigos em Wikipédias (escala log), prêmios, seleção (jogos e Copas do Mundo)
 * e carreira nos clubes importados.
 *  - Era: as Wikipédias cobrem muito mais os jogadores recentes; nascidos antes de 1975 ganham compensação.
 *  - Carreira: muitos jogos pelos clubes do baralho somam (ídolos locais com poucos artigos no exterior).
 *  - Quem é conhecido sobretudo como técnico (título da Wikipédia “(treinador…)”) perde bastante:
 *    os artigos sobre ele falam da carreira no banco, não em campo.
 */
export function fameScore(
  p: Pick<RawPerson, 'sitelinks' | 'awards' | 'caps' | 'ptTitle'> & {
    birthYear?: number | null;
    international?: boolean;
    coach?: boolean;
    wc?: number;
  },
  careerApps = 0,
): number {
  let score = Math.log(1 + p.sitelinks) + 0.12 * Math.min(p.awards, 12) + 0.004 * Math.min(p.caps ?? 0, 150);
  if (p.international) score += 0.2;
  score += 0.15 * Math.min(p.wc ?? 0, 4);
  const born = p.birthYear ?? null;
  if (born !== null) score += born < 1945 ? 0.45 : born < 1960 ? 0.3 : born < 1975 ? 0.12 : 0;
  score += 0.25 * Math.log(1 + Math.min(Math.max(careerApps, 0), 1000) / 50);
  if (/\((treinador|técnico)/i.test(p.ptTitle ?? '')) score -= 1.5;
  // Quem também foi técnico tem artigos inflados pela carreira no banco (ex.: Ancelotti, Guardiola).
  else if (p.coach) score -= 0.3;
  return score;
}

/** Jogos pelos clubes importados (estimados por temporada quando o Wikidata não tem o número). */
export function careerApps(stints: RawStint[]): number {
  let total = 0;
  for (const s of stints) {
    if (s.apps && s.apps > 0) total += s.apps;
    else if (s.start !== null && s.end !== null) total += Math.min(25 * Math.max(1, s.end - s.start), 400);
    else total += 10;
  }
  return total;
}

/** Percentil (0–1) → nota de auge. As faixas viram a distribuição de Lenda/Craque/…/Perna. */
export function peakFromPercentile(p: number): number {
  if (p >= 0.975) return 90 + ((p - 0.975) / 0.025) * 7;
  if (p >= 0.88) return 84 + ((p - 0.88) / 0.095) * 5.9;
  if (p >= 0.55) return 76 + ((p - 0.55) / 0.33) * 7.9;
  if (p >= 0.25) return 68 + ((p - 0.25) / 0.3) * 7.9;
  return 56 + (p / 0.25) * 11.9;
}

export function ageModifier(age: number | null): number {
  if (age === null) return -1;
  if (age <= 19) return -11;
  if (age === 20) return -8;
  if (age === 21) return -6;
  if (age === 22) return -3;
  if (age <= 31) return 0;
  if (age === 32) return -2;
  if (age === 33) return -4;
  if (age === 34) return -6;
  return -9;
}

/** Junta passagens seguidas pelo mesmo clube (ex.: 1971–79 e 1980–89) somando jogos e gols. */
export function mergeStints(list: RawStint[]): RawStint[] {
  const byClub = new Map<string, RawStint[]>();
  for (const s of list) byClub.set(s.club, [...(byClub.get(s.club) ?? []), s]);
  const out: RawStint[] = [];
  const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  for (const stints of byClub.values()) {
    const dated = stints.filter((s) => s.start !== null).sort((a, b) => a.start! - b.start!);
    const undated = stints.filter((s) => s.start === null);
    let cur: RawStint | undefined;
    for (const s of dated) {
      const prev: RawStint | undefined = cur;
      const prevEnd = prev ? (prev.end ?? prev.start) : null;
      if (prev && prevEnd !== null && s.start! <= prevEnd + 1) {
        cur = {
          person: prev.person,
          club: prev.club,
          start: prev.start,
          end: prev.end === null || s.end === null ? null : Math.max(prev.end, s.end),
          apps: add(prev.apps, s.apps),
          goals: add(prev.goals, s.goals),
        };
      } else {
        if (prev) out.push(prev);
        cur = { ...s };
      }
    }
    if (cur) out.push(cur);
    out.push(...undated);
  }
  return out;
}

/** Bônus de ídolo: muitos jogos/gols pelo clube. */
export function idolBonus(apps: number | null, goals: number | null, position: Position): number {
  let b = 0;
  if (apps !== null) {
    if (apps >= 400) b += 4;
    else if (apps >= 250) b += 3;
    else if (apps >= 150) b += 2;
    else if (apps >= 100) b += 1;
  }
  if (goals !== null && position !== 'GOL' && goals >= 100) b += 1;
  return b;
}

/** Percentil de fama a partir do qual o jogador é Lenda mesmo numa passagem mais curta (ex.: Ronaldo no Corinthians). */
export const SUPERSTAR_PERCENTILE = 0.985;

/** Teto de nota para passagens curtas: ninguém vira Lenda de um clube por onde só passou. */
export function shortStintCap(apps: number | null, span: number | null): number {
  if (apps !== null) {
    if (apps < 10) return 78;
    if (apps < 25) return 84;
    if (apps < 45) return 88.9;
    return 99;
  }
  if (span === null || span === 0) return 84;
  if (span <= 2) return 88.9;
  return 99;
}

export interface StintEval {
  stint: RawStint;
  year: number;
  age: number | null;
  mid: number;
  width: number;
}

/** Ano que representa a passagem: o mais próximo do auge (27 anos) dentro do período. */
export function representativeYear(s: Pick<RawStint, 'start' | 'end'>, birthYear: number | null, currentYear: number): number | null {
  if (s.start === null) return null;
  const end = s.end ?? Math.max(s.start, currentYear);
  const lo = Math.min(s.start, end);
  const hi = Math.max(s.start, end);
  if (birthYear === null) return Math.round((lo + hi) / 2);
  return Math.min(hi, Math.max(lo, birthYear + 27));
}

export function evaluateStint(
  s: RawStint,
  person: RawPerson,
  position: Position,
  famePct: number,
  clubPrestige: number,
  isMain: boolean,
  currentYear: number,
  /** Peso do bônus de ídolo: nos grandes da Europa o Wikidata tem jogos de quase todo mundo, e o bônus inflaria a todos. */
  idolScale = 1,
): StintEval | null {
  const peak = peakFromPercentile(famePct);
  const year = representativeYear(s, person.birthYear, currentYear);
  if (year === null || year > currentYear) return null;
  const age = person.birthYear !== null ? year - person.birthYear : null;
  const apps = s.apps && s.apps > 0 ? s.apps : null;
  const span = s.end !== null && s.start !== null ? Math.abs(s.end - s.start) : null;
  let mid = peak + ageModifier(age);
  // Peso do clube (percentil entre os clubes importados): −2 … +0,5
  mid += -2 + clubPrestige * 2.5;
  // Tempo/jogos no clube
  mid += idolBonus(apps, s.goals, position) * idolScale;
  if (apps === null && span !== null && span >= 4) mid += 1;
  // Produtividade dos atacantes
  if (position === 'ATA' && apps !== null && apps >= 20 && s.goals !== null) {
    const ratio = s.goals / apps;
    if (ratio >= 0.5) mid += 1.5;
    else if (ratio >= 0.35) mid += 0.5;
    else if (ratio < 0.12) mid -= 1;
  }
  if (isMain) mid += 0.5;
  mid = Math.min(mid, shortStintCap(apps, span));
  // Lenda de um clube exige passagem marcante (100+ jogos ou 4+ anos na passagem principal da carreira;
  // 150+ jogos ou 6+ anos nas demais), salvo os maiores astros.
  const marking = (apps !== null && apps >= (isMain ? 100 : 150)) || (apps === null && span !== null && span >= (isMain ? 4 : 6));
  if (!marking && famePct < SUPERSTAR_PERCENTILE) mid = Math.min(mid, 89.4);
  // Topo comprimido: só os maiores chegam perto de 97.
  if (mid > 91) mid = 91 + (mid - 91) * 0.55;
  mid = Math.max(48, Math.min(97, mid));
  let width = 6;
  if (apps === null) width += 2;
  if (age === null) width += 2;
  else if (age <= 21 || age >= 33) width += 2;
  if (mid >= 90) width = Math.min(width, 5);
  return { stint: s, year, age, mid, width };
}

// ---------------------------------------------------------------------------
// Texto da pista
// ---------------------------------------------------------------------------

function hintFor(e: StintEval, person: RawPerson, club: string, position: Position): string {
  const parts: string[] = [];
  const nat = person.nationalities.find((n) => n !== 'Brasil') ?? null;
  if (nat && !person.nationalities.includes('Brasil')) parts.push(`${nat}.`);
  const s = e.stint;
  const period =
    s.start !== null
      ? s.end !== null && s.end !== s.start
        ? `de ${s.start} a ${s.end}`
        : s.end === null
          ? `desde ${s.start}`
          : `em ${s.start}`
      : '';
  if (s.apps && s.apps > 0) {
    // Para goleiros o Wikidata às vezes registra gols sofridos no mesmo campo: não mostramos.
    const goals = position !== 'GOL' && s.goals !== null && s.goals > 0 ? ` e ${s.goals} ${s.goals === 1 ? 'gol' : 'gols'}` : '';
    parts.push(`${s.apps} jogos${goals} pelo ${club}${period ? ` ${period}` : ''}.`);
  } else {
    parts.push(`No ${club}${period ? ` ${period}` : ''}.`);
  }
  if (e.age !== null) parts.push(`${e.age} anos em ${e.year}.`);
  if (person.caps && person.caps >= 10) parts.push(`${person.caps} jogos pela seleção.`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/**
 * Percentil de cada valor em relação a uma população de referência. Assim, incluir
 * muitos jogadores pouco conhecidos (ex.: de clubes menores) não infla a nota de todos os outros.
 */
export function referencePercentile(values: Map<string, number>, reference: number[]): Map<string, number> {
  const ref = [...reference].sort((a, b) => a - b);
  const n = Math.max(1, ref.length - 1);
  const below = (v: number) => {
    let lo = 0;
    let hi = ref.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ref[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const out = new Map<string, number>();
  for (const [k, v] of values) out.set(k, Math.min(1, below(v) / n));
  return out;
}

export type Region = 'BR' | 'EU';

/**
 * Erros conhecidos no Wikidata corrigidos na montagem (o certo é corrigir lá também).
 * Ex.: Van der Sar aparece no Barcelona de 1990–99, mas era o Ajax.
 */
export const STINT_FIXES: Array<{ person: string; club: string; start: number | null; clubCorrect: string }> = [
  { person: 'Q482955', club: 'Q7156', start: 1990, clubCorrect: 'Q81888' },
];

/** Artigos mínimos para um jogador entrar na população de referência da fama de cada região (= corte da busca). */
export const FAME_REFERENCE_SITELINKS: Record<Region, number> = { BR: 8, EU: 30 };

function percentileMap(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const out = new Map<string, number>();
  const n = Math.max(1, sorted.length - 1);
  sorted.forEach(([k], i) => out.set(k, i / n));
  return out;
}

export interface BuildReport {
  candidates: number;
  people: number;
  byPosition: Record<Position, number>;
  byTier: Record<Tier, number>;
  skipped: {
    noPosition: number;
    noName: number;
    noDates: number;
    female: number;
    otherClubs: number;
  };
  /** Cartas por série (vazio sem séries). */
  bySeries: Partial<Record<Series, number>>;
}

export function buildDeck(raw: RawDump, options: Partial<BuildOptions> = {}): { deck: DeckFile; report: BuildReport } {
  const opts = { ...DEFAULT_BUILD, ...options };
  const rng = new Rng(opts.seed);
  const clubs = new Map(raw.clubs.map((c) => [c.qid, c]));
  const seriesClub = opts.clubs ? new Map(opts.clubs.map((c) => [c.qid, c])) : null;
  // Brasil e Europa são “mundos” separados: artigos na Wikipédia não se comparam entre eles
  // (um reserva de clube inglês tem mais artigos que muito ídolo brasileiro). Fama e peso do
  // clube são medidos dentro da região do clube da carta.
  const regionOf = (clubQid: string): Region => (seriesClub?.get(clubQid)?.series === 'EU' ? 'EU' : 'BR');
  const clubPrestige = new Map<string, number>();
  for (const region of ['BR', 'EU'] as Region[]) {
    const inRegion = raw.clubs.filter((c) => regionOf(c.qid) === region);
    for (const [k, v] of percentileMap(new Map(inRegion.map((c) => [c.qid, Math.log(1 + c.sitelinks)])))) clubPrestige.set(k, v);
  }
  const clubName = new Map(raw.clubs.map((c) => [c.qid, seriesClub?.get(c.qid)?.name ?? shortClubName(c)]));
  /** Só passagens por estes clubes viram carta. */
  const cardClub = (qid: string) => (seriesClub ? seriesClub.has(qid) : clubs.has(qid));
  const skipped = {
    noPosition: 0,
    noName: 0,
    noDates: 0,
    female: 0,
    otherClubs: 0,
  };

  // Jogadores elegíveis (baralho do futebol masculino; jogadoras ficam para um baralho próprio)
  const eligible = new Map<string, { person: RawPerson; position: Position; name: string }>();
  for (const p of Object.values(raw.people)) {
    if (p.female) {
      skipped.female++;
      continue;
    }
    const position = mapPosition(p.positions);
    if (!position) {
      skipped.noPosition++;
      continue;
    }
    const name = displayName(p);
    if (!name) {
      skipped.noName++;
      continue;
    }
    eligible.set(p.qid, { person: p, position, name });
  }
  // Passagens por jogador (com as correções conhecidas de erros do Wikidata)
  const stintsBy = new Map<string, RawStint[]>();
  for (const s0 of raw.stints) {
    const fix = STINT_FIXES.find((f) => f.person === s0.person && f.club === s0.club && f.start === s0.start);
    const s = fix ? { ...s0, club: fix.clubCorrect } : s0;
    if (!eligible.has(s.person) || !clubs.has(s.club)) continue;
    const list = stintsBy.get(s.person) ?? [];
    list.push(s);
    stintsBy.set(s.person, list);
  }
  const merged = new Map([...stintsBy].map(([pid, list]) => [pid, mergeStints(list)]));
  const fameScores = new Map([...eligible.values()].map((e) => [e.person.qid, fameScore(e.person, careerApps(merged.get(e.person.qid) ?? []))]));
  const fameIn = new Map<Region, Map<string, number>>();
  for (const region of ['BR', 'EU'] as Region[]) {
    const minLinks = FAME_REFERENCE_SITELINKS[region];
    const members = [...merged].filter(([pid, list]) => list.some((s) => regionOf(s.club) === region)).map(([pid]) => pid);
    const reference = members.filter((pid) => eligible.get(pid)!.person.sitelinks >= minLinks).map((pid) => fameScores.get(pid)!);
    const scores = new Map(members.map((pid) => [pid, fameScores.get(pid)!]));
    fameIn.set(region, referencePercentile(scores, reference.length >= 50 ? reference : [...scores.values()]));
  }
  const fame = (pid: string, region: Region) => fameIn.get(region)?.get(pid) ?? 0;

  interface Candidate {
    card: Card;
    fame: number;
    personId: string;
    /** 0 = melhor versão do jogador; 1 = segunda versão. */
    rank: number;
  }
  const candidates: Candidate[] = [];
  for (const pid of stintsBy.keys()) {
    const { person, position, name } = eligible.get(pid)!;
    const list = merged.get(pid)!;
    const weight = (s: RawStint) => (s.apps ?? 0) * 10 + (s.start !== null && s.end !== null ? Math.abs(s.end - s.start) : 0);
    const main = [...list].sort((a, b) => weight(b) - weight(a))[0];
    const own = list.filter((s) => cardClub(s.club));
    if (own.length === 0) {
      skipped.otherClubs++;
      continue;
    }
    const evals = own
      .map((s) =>
        evaluateStint(
          s,
          person,
          position,
          fame(pid, regionOf(s.club)),
          clubPrestige.get(s.club) ?? 0.5,
          s === main,
          opts.currentYear,
          regionOf(s.club) === 'EU' ? 0.5 : 1,
        ),
      )
      .filter((e): e is StintEval => !!e);
    if (evals.length === 0) {
      skipped.noDates++;
      continue;
    }
    // Versões, em cada região: a melhor passagem e, se houver, a de outro clube/época mais contrastante.
    // (Assim Ronaldo tem carta de Cruzeiro/Corinthians para salas só do Brasil e de Barcelona/Real para a Europa.)
    evals.sort((a, b) => b.mid - a.mid || (b.stint.apps ?? 0) - (a.stint.apps ?? 0));
    const versions: Array<{ e: StintEval; rank: number }> = [];
    for (const region of ['BR', 'EU'] as Region[]) {
      const chosen: StintEval[] = [];
      for (const e of evals.filter((x) => regionOf(x.stint.club) === region)) {
        if (chosen.length >= opts.maxVersionsPerPlayer) break;
        if (chosen.some((c) => c.stint.club === e.stint.club && Math.abs(c.year - e.year) < 4)) continue;
        chosen.push(e);
      }
      chosen.forEach((e, rank) => versions.push({ e, rank }));
    }
    for (const { e, rank } of versions) {
      const club = clubs.get(e.stint.club)!;
      const shortName = clubName.get(club.qid)!;
      const levelMin = Math.round(e.mid - e.width / 2);
      const levelMax = Math.min(99, levelMin + e.width);
      const tier = tierOf((levelMin + levelMax) / 2);
      const sc = seriesClub?.get(club.qid);
      const kit = sc?.kit ?? clubKit(club, shortName);
      candidates.push({
        personId: pid,
        rank,
        fame: fame(pid, regionOf(e.stint.club)),
        card: {
          id: `wd-${pid}-${club.qid}-${e.year}`,
          personId: pid,
          name,
          position,
          club: shortName,
          year: e.year,
          levelMin,
          levelMax,
          tier,
          hint: hintFor(e, person, shortName, position),
          ...(kit ? { kit } : {}),
          ...(sc ? { series: sc.series } : {}),
        },
      });
    }
  }

  // Seleção: 1) a melhor versão de todo jogador muito conhecido entra sempre;
  // 2) o resto é preenchido por faixa (para ter também operários e pernas-de-pau),
  //    preferindo melhores versões e nomes mais conhecidos.
  //    Com séries, cada série é selecionada à parte, para que cada uma sozinha forme um baralho completo.
  const tiers: Tier[] = ['lenda', 'craque', 'titular', 'operario', 'perna'];
  const picked: Card[] = [];
  const positions = Object.keys(opts.counts) as Position[];
  const groups: Array<{ pool: Candidate[]; counts: Record<Position, number> }> = seriesClub
    ? (Object.keys(opts.countsBySeries) as Series[]).map((sr) => ({
        pool: candidates.filter((c) => c.card.series === sr),
        counts: opts.countsBySeries[sr],
      }))
    : [{ pool: candidates, counts: opts.counts }];
  for (const group of groups) {
    for (const pos of positions) {
      const pool = group.pool.filter((c) => c.card.position === pos);
      const chosen = new Set<Candidate>();
      for (const c of pool) if (c.rank === 0 && c.fame >= opts.mustIncludePercentile[c.card.series === 'EU' ? 'EU' : 'BR']) chosen.add(c);
      const want = Math.max(group.counts[pos], chosen.size);
      for (const t of tiers) {
        const already = [...chosen].filter((c) => c.card.tier === t).length;
        const quota = Math.max(0, Math.round(want * opts.tierShare[t]) - already);
        const inTier = pool
          .filter((c) => c.card.tier === t && !chosen.has(c))
          .map((c) => ({
            c,
            key: c.fame + (c.rank === 0 ? 0.25 : 0) + rng.next() * 0.15,
          }))
          .sort((a, b) => b.key - a.key)
          .map((x) => x.c);
        for (const c of inTier.slice(0, quota)) chosen.add(c);
      }
      // Completa com os mais conhecidos que sobraram (caso alguma faixa tenha faltado).
      const rest = pool.filter((c) => !chosen.has(c)).sort((a, b) => a.rank - b.rank || b.fame - a.fame);
      for (const c of rest) {
        if (chosen.size >= want) break;
        chosen.add(c);
      }
      picked.push(...[...chosen].map((c) => c.card));
    }
  }

  // Homônimos no baralho: o mais conhecido fica com o nome curto; os outros ganham o último sobrenome.
  const byName = new Map<string, Set<string>>();
  for (const c of picked) byName.set(c.name, (byName.get(c.name) ?? new Set()).add(c.personId!));
  const rename = new Map<string, string>();
  for (const [name, ids] of byName) {
    if (ids.size < 2) continue;
    const [, ...others] = [...ids].sort((a, b) => (fameScores.get(b) ?? 0) - (fameScores.get(a) ?? 0));
    for (const pid of others) {
      const alt = disambiguatedName(name, eligible.get(pid)!.person);
      if (alt && !byName.has(alt)) rename.set(pid, alt);
    }
  }
  for (const c of picked) if (rename.has(c.personId!)) c.name = rename.get(c.personId!)!;

  picked.sort((a, b) => positions.indexOf(a.position) - positions.indexOf(b.position) || a.name.localeCompare(b.name, 'pt'));
  const byPosition = Object.fromEntries(positions.map((p) => [p, picked.filter((c) => c.position === p).length])) as Record<Position, number>;
  const byTier = Object.fromEntries(tiers.map((t) => [t, picked.filter((c) => c.tier === t).length])) as Record<Tier, number>;
  return {
    deck: {
      id: opts.deckId,
      name: opts.deckName,
      version: 1,
      source: 'Wikidata (https://www.wikidata.org) — dados estruturados sob CC0. Notas calculadas pelo Martelo FC.',
      license: 'CC0-1.0 (dados de origem)',
      generatedAt: new Date().toISOString(),
      fetchedAt: raw.fetchedAt,
      cards: picked,
    },
    report: {
      candidates: candidates.length,
      people: stintsBy.size,
      byPosition,
      byTier,
      skipped,
      bySeries: Object.fromEntries(
        (['A', 'B', 'EU'] as Series[]).map((sr) => [sr, picked.filter((c) => c.series === sr).length]).filter(([, n]) => n),
      ),
    },
  };
}
