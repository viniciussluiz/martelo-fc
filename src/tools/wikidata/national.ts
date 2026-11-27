import type { Card, Position } from '../../engine/types.js';
import { NATIONAL_TEAMS, nationalTeamOf, type NationalTeam } from '../../shared/selecoes.js';
import { displayName, fameScore, mapPosition, tierOf } from './build.js';
import type { RawDump, RawPerson } from './types.js';

/**
 * Baralho do modo “Seleções”: os melhores de cada país que jogaram pela seleção principal.
 *
 * Pente-fino:
 *  - só quem tem jogos pela seleção: 15 ou mais, ou pelo menos uma Copa do Mundo;
 *  - de cada seleção entram só os melhores de cada setor (3 goleiros, 5 laterais, 5 zagueiros,
 *    8 meias, 7 atacantes), pela nota e, no empate, pela história na seleção;
 *  - só ficam as seleções que fecham todos os setores com folga para a convocação.
 * Nota: a mesma do melhor momento do jogador no baralho de clubes; quem não tem carta lá recebe
 * a nota típica de quem tem história parecida (artigos, prêmios, jogos e Copas pela seleção).
 * Lenda de seleção: só quem é Lenda no clube, mais as escolhidas à mão em CARD_FIXES.
 * Uma carta por jogador: o “clube” é a seleção.
 */

export const NATIONAL_MIN_CAPS = 15;
/** Quanto a nota de clube pode subir quando a história na seleção é maior que ela. */
const MAX_LIFT = 3;
export const NATIONAL_QUOTA: Record<Position, number> = { GOL: 3, LAT: 5, ZAG: 5, MEI: 8, ATA: 7 };
/** Mínimo por setor para a seleção entrar (o que a formação mais exigente pede + 1). */
export const NATIONAL_MIN: Record<Position, number> = { GOL: 2, LAT: 3, ZAG: 3, MEI: 5, ATA: 4 };

export interface NationalReport {
  teams: Array<{ name: string; cards: number; legends: number }>;
  /** Seleções que não fecharam algum setor. */
  dropped: string[];
  candidates: number;
  /** Jogadores cuja nota veio do baralho de clubes / foi estimada. */
  fromClubDeck: number;
  estimated: number;
}

/**
 * Posição na seleção quando a do Wikidata engana (ele lista várias, e “defender” serve para lateral e zagueiro).
 * Chave: seleção → nome da carta.
 */
export const POSITION_FIXES: Record<string, Record<string, Position>> = {
  Brasil: { 'Nílton Santos': 'LAT', 'Djalma Santos': 'LAT', Sócrates: 'MEI', Neymar: 'ATA', Rivaldo: 'MEI', Kaká: 'MEI', 'Carlos Alberto Torres': 'LAT', Leandro: 'LAT', Júnior: 'LAT', Tostão: 'ATA' },
  Argentina: { 'Nicolás Otamendi': 'ZAG', 'Lionel Messi': 'ATA', 'Ángel Di María': 'ATA', 'Ezequiel Lavezzi': 'ATA', 'Nicolás Burdisso': 'ZAG', 'Ezequiel Garay': 'ZAG' },
  Uruguai: { 'Sebastián Coates': 'ZAG', 'Rodrigo Betancur': 'MEI', 'Pedro Rocha': 'MEI', 'Pablo Forlán': 'LAT' },
  Portugal: { 'Raphaël Guerreiro': 'LAT', 'Ricardo Costa': 'ZAG', 'Cristiano Ronaldo': 'ATA', Nani: 'ATA', 'Luís Figo': 'ATA' },
  Inglaterra: { 'Rio Ferdinand': 'ZAG', 'James Milner': 'MEI' },
  Itália: { 'Giorgio Chiellini': 'ZAG', 'Leonardo Bonucci': 'ZAG', 'Paolo Maldini': 'LAT' },
  Alemanha: { 'Robert Huth': 'ZAG', 'Joshua Kimmich': 'LAT', 'Lukas Podolski': 'ATA', 'Paul Breitner': 'LAT' },
  França: { 'Franck Ribéry': 'ATA' },
  Holanda: { 'Dirk Kuyt': 'ATA', 'Royston Drenthe': 'LAT' },
  // Revisão de posições (nov/2026): laterais que o Wikidata chama só de “defensor”, meias no ataque e o
  // contrário. Ponta que já está no meio da seleção fica lá quando tirá-lo tiraria um centroavante da cota.
  Dinamarca: { 'Jan Heintze': 'LAT', 'Dennis Rommedahl': 'ATA' },
  // Navas: lateral-direito da Espanha campeã da Euro 2024.
  Espanha: { 'Jesús Navas': 'LAT', 'Juan Mata': 'MEI' },
  // Beasley: ponta no começo, lateral-esquerdo da seleção na Copa de 2014 (e é ele quem fecha a lateral dos EUA).
  'Estados Unidos': { 'DaMarcus Beasley': 'LAT', 'John Brooks': 'ZAG', 'Christian Pulisic': 'ATA', 'Julian Green': 'ATA' },
  Irlanda: { 'Damien Duff': 'ATA', 'Ronnie Whelan': 'MEI' },
  México: { 'Jorge Sánchez': 'LAT', 'Hirving Lozano': 'ATA', 'Edson Álvarez': 'MEI' },
};

/**
 * Nota e ano escolhidos à mão para a carta da seleção (valem sobre os calculados).
 * Chave: seleção → nome da carta. `faixa` é a nota [mínima, máxima]; a raridade sai dela.
 */
export const CARD_FIXES: Record<string, Record<string, { faixa?: [number, number]; ano?: number }>> = {
  // Lendas da Bélgica: só De Bruyne e Courtois, os dois da Copa de 2018 (3º lugar; Courtois foi a Luva de Ouro).
  Bélgica: { 'Thibaut Courtois': { ano: 2018 } },
  // Griezmann da Copa de 2018 (campeão, melhor jogador da final): Lenda na seleção mesmo sem ser no clube.
  França: { 'Antoine Griezmann': { faixa: [87, 93], ano: 2018 } },
};

/**
 * Seleção certa de quem o Wikidata lista com mais de um país (a ordem lá não diz por qual jogou).
 * Chave: QID do jogador → país (como o Wikidata escreve); país sem seleção no modo = fica de fora.
 */
export const NATIONALITY_FIXES: Record<string, string> = {
  Q26932598: 'Marrocos', // Achraf Hakimi
  Q38136: 'Brasil', // Marcelo
  Q3192187: 'Senegal', // Kalidou Koulibaly
  Q115453: 'Croácia', // Ivan Rakitić
  Q380223: 'Irlanda do Norte', // Norman Whiteside
  Q482931: 'Hungria', // Ferenc Puskás
};

/** História na seleção: fama geral + jogos e Copas do Mundo com peso maior. */
export function nationalScore(p: RawPerson): number {
  return fameScore(p, 0) + 0.01 * Math.min(p.caps ?? 0, 150) + 0.2 * Math.min(p.wc ?? 0, 4);
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function buildNationalDeck(raw: RawDump, clubCards: Card[], currentYear = new Date().getFullYear()): { cards: Card[]; report: NationalReport } {
  // Melhor carta de cada jogador no baralho de clubes.
  const best = new Map<string, Card>();
  const mid = (c: Pick<Card, 'levelMin' | 'levelMax'>) => (c.levelMin + c.levelMax) / 2;
  for (const c of clubCards) {
    if (!c.personId || c.series === 'SEL') continue;
    const cur = best.get(c.personId);
    if (!cur || mid(c) > mid(cur)) best.set(c.personId, c);
  }

  interface Cand {
    person: RawPerson;
    team: NationalTeam;
    position: Position;
    name: string;
    score: number;
    club?: Card;
    fix?: { faixa?: [number, number]; ano?: number };
  }
  const cands: Cand[] = [];
  for (const p of Object.values(raw.people)) {
    if (p.female) continue;
    // Jogos registrados pela seleção bastam (o Wikidata nem sempre liga o jogador à seleção: Messi, Cristiano Ronaldo…).
    const capped = (p.caps ?? 0) >= NATIONAL_MIN_CAPS;
    if (!capped && !(p.international && p.wc && p.wc > 0)) continue;
    const fixed = NATIONALITY_FIXES[p.qid];
    const team = fixed ? nationalTeamOf(fixed) : p.nationalities.map(nationalTeamOf).find(Boolean);
    if (!team) continue;
    const club = best.get(p.qid);
    const name = club?.name ?? displayName(p);
    if (!name) continue;
    const position = POSITION_FIXES[team.name]?.[name] ?? club?.position ?? mapPosition(p.positions);
    if (!position) continue;
    const fix = CARD_FIXES[team.name]?.[name];
    cands.push({ person: p, team, position, name, score: nationalScore(p), ...(club ? { club } : {}), ...(fix ? { fix } : {}) });
  }

  // Nota de quem não tem carta de clube: mediana de quem tem história parecida na seleção.
  const known = cands.filter((c) => c.club).sort((a, b) => a.score - b.score);
  const estimate = (score: number): number => {
    if (known.length === 0) return 74;
    let lo = 0;
    let hi = known.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (known[m]!.score < score) lo = m + 1;
      else hi = m;
    }
    const from = Math.max(0, Math.min(known.length - 21, lo - 10));
    const near = known
      .slice(from, from + 21)
      .map((c) => mid(c.club!))
      .sort((a, b) => a - b);
    return near[near.length >> 1]!;
  };
  const level = (c: Cand): [number, number] => {
    if (c.fix?.faixa) return c.fix.faixa;
    const typical = Math.min(93, Math.max(60, estimate(c.score)));
    // Com carta de clube: vale o auge dele lá, a não ser que a carta seja de uma passagem menor
    // (Batistuta só tem a da Roma) — aí sobe um pouco, até a nota típica de quem tem a mesma história.
    if (c.club) {
      let lift = Math.min(MAX_LIFT, Math.max(0, Math.round(typical - mid(c.club))));
      // A subida não faz ninguém virar Lenda: na seleção, Lenda é quem já é Lenda no clube (ou está em CARD_FIXES).
      while (lift > 0 && c.club.tier !== 'lenda' && tierOf(mid(c.club) + lift) === 'lenda') lift--;
      return [Math.min(95, c.club.levelMin + lift), Math.min(100, c.club.levelMax + lift)];
    }
    const m = Math.min(88, typical - 2);
    return [Math.round(m - 4), Math.round(m + 4)];
  };

  const cards: Card[] = [];
  const report: NationalReport = { teams: [], dropped: [], candidates: cands.length, fromClubDeck: 0, estimated: 0 };
  for (const team of NATIONAL_TEAMS) {
    const mine = cands.filter((c) => c.team === team);
    const picked: Array<{ c: Cand; range: [number, number] }> = [];
    let complete = true;
    for (const pos of Object.keys(NATIONAL_QUOTA) as Position[]) {
      const ranked = mine
        .filter((c) => c.position === pos)
        .map((c) => ({ c, range: level(c) }))
        .sort((a, b) => (b.range[0] + b.range[1]) / 2 - (a.range[0] + a.range[1]) / 2 || b.c.score - a.c.score)
        .slice(0, NATIONAL_QUOTA[pos]);
      if (ranked.length < NATIONAL_MIN[pos]) complete = false;
      picked.push(...ranked);
    }
    if (!complete) {
      if (mine.length) report.dropped.push(team.name);
      continue;
    }
    // Homônimos na mesma seleção: o de mais história fica com o nome; o outro ganha o ano de nascimento.
    const names = new Map<string, number>();
    for (const { c } of [...picked].sort((a, b) => b.c.score - a.c.score)) {
      const n = names.get(c.name) ?? 0;
      names.set(c.name, n + 1);
      if (n > 0 && c.person.birthYear) c.name = `${c.name} (${c.person.birthYear})`;
    }
    for (const { c, range } of picked) {
      const p = c.person;
      const year = c.fix?.ano ?? c.club?.year ?? Math.min(currentYear, (p.birthYear ?? currentYear - 27) + 27);
      const bits = [p.caps ? `${p.caps} jogos pela seleção` : 'Jogou pela seleção', p.wc ? `${p.wc} ${p.wc === 1 ? 'Copa do Mundo' : 'Copas do Mundo'}` : ''];
      cards.push({
        id: `sel-${p.qid}-${slug(team.name)}`,
        personId: p.qid,
        name: c.name,
        position: c.position,
        club: team.name,
        year,
        levelMin: range[0],
        levelMax: range[1],
        tier: tierOf((range[0] + range[1]) / 2),
        hint: `${bits.filter(Boolean).join(', ')}.`,
        kit: team.kit,
        series: 'SEL',
      });
      if (c.club) report.fromClubDeck++;
      else report.estimated++;
    }
    report.teams.push({ name: team.name, cards: picked.length, legends: picked.filter(({ range }) => tierOf((range[0] + range[1]) / 2) === 'lenda').length });
  }
  const order: Position[] = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'];
  cards.sort((a, b) => a.club.localeCompare(b.club, 'pt') || order.indexOf(a.position) - order.indexOf(b.position) || a.name.localeCompare(b.name, 'pt'));
  return { cards, report };
}
