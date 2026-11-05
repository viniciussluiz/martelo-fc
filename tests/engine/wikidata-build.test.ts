import { describe, expect, it } from 'vitest';
import { buildAuctionPool } from '../../src/engine/dispute.js';
import { validateDeck } from '../../src/engine/deck-generator.js';
import { Rng } from '../../src/engine/rng.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deckForScope, SERIES_SCOPES, type Card } from '../../src/engine/types.js';
import { SERIES_CLUBS, type SeriesClub } from '../../src/tools/wikidata/series.js';
import {
  ageModifier,
  buildDeck,
  careerApps,
  disambiguatedName,
  displayName,
  evaluateStint,
  fameScore,
  givenName,
  idolBonus,
  mapPosition,
  mergeStints,
  peakFromPercentile,
  referencePercentile,
  representativeYear,
  shortClubName,
  shortStintCap,
  tierOf,
} from '../../src/tools/wikidata/build.js';
import type { RawDump, RawPerson, RawStint } from '../../src/tools/wikidata/types.js';

describe('normalização', () => {
  it('mapeia posições do Wikidata para as do jogo', () => {
    expect(mapPosition(['goalkeeper'])).toBe('GOL');
    expect(mapPosition(['left-back'])).toBe('LAT');
    expect(mapPosition(['full-back', 'midfielder'])).toBe('LAT');
    expect(mapPosition(['stopper'])).toBe('ZAG');
    expect(mapPosition(['defender'])).toBe('ZAG');
    expect(mapPosition(['wing half'])).toBe('MEI');
    expect(mapPosition(['midfielder', 'defender'])).toBe('ZAG');
    expect(mapPosition(['forward', 'midfielder'])).toBe('ATA');
    expect(mapPosition(['winger'])).toBe('ATA');
    expect(mapPosition(['referee'])).toBeNull();
  });

  it('usa o nome mais curto pelo qual o jogador é conhecido', () => {
    expect(displayName({ ptTitle: 'Jorge Luiz Frello Filho', labelPt: 'Jorge Luiz Frello Filho', labelEn: 'Jorginho' })).toBe('Jorginho');
    expect(displayName({ ptTitle: 'Tita (futebolista)', labelPt: null, labelEn: 'Tita' })).toBe('Tita');
    expect(displayName({ ptTitle: null, labelPt: null, labelEn: 'Q123' })).toBeNull();
  });

  it('só troca nome completo por apelido que tenha uma palavra em comum', () => {
    const full = { ptTitle: 'Rodrigo Guedes Filho Souza', labelPt: null, labelEn: null };
    expect(displayName({ ...full, nicknames: ['Rodriguinho Guedes'] })).toBe('Rodriguinho Guedes');
    expect(displayName({ ...full, nicknames: ['Pitbull'], nationalities: ['Uruguai'] })).toBe('Rodrigo Guedes Filho Souza');
    expect(displayName({ ptTitle: 'Ronaldo Nazário', labelPt: null, labelEn: null, nicknames: ['Fenômeno'] })).toBe('Ronaldo Nazário');
  });

  it('brasileiro só com nome de registro vira prenome; nome de guerra de 3 palavras fica', () => {
    expect(displayName({ ptTitle: 'Cássio Albuquerque dos Anjos', labelPt: null, labelEn: null, nationalities: ['Brasil'] })).toBe('Cássio');
    expect(displayName({ ptTitle: 'Paulo Sérgio de Oliveira Lima', labelPt: null, labelEn: null })).toBe('Paulo Sérgio');
    expect(displayName({ ptTitle: 'Ademir da Guia', labelPt: null, labelEn: null, nationalities: ['Brasil'] })).toBe('Ademir da Guia');
    expect(displayName({ ptTitle: 'Paulo Roberto Falcão', labelPt: null, labelEn: null })).toBe('Paulo Roberto Falcão');
    expect(displayName({ ptTitle: 'Juan Pablo Sorín Ríos', labelPt: null, labelEn: null, nationalities: ['Argentina'] })).toBe('Juan Pablo Sorín Ríos');
    expect(displayName({ ptTitle: 'Alexsandro de Souza', labelPt: 'Alex de Souza', labelEn: null })).toBe('Alex de Souza');
    expect(givenName('José Carlos da Silva Neto')).toBe('José Carlos');
  });

  it('homônimos ganham o último sobrenome', () => {
    expect(disambiguatedName('Reinaldo', { ptTitle: 'Reinaldo Manoel da Silva', labelPt: null, labelEn: null })).toBe('Reinaldo Silva');
    expect(disambiguatedName('Aílton', { ptTitle: 'Aílton José Pereira Júnior', labelPt: null, labelEn: null })).toBe('Aílton Pereira');
    expect(disambiguatedName('Juninho', { ptTitle: 'Juninho', labelPt: null, labelEn: null })).toBeNull();
  });

  it('encurta nomes de clubes', () => {
    expect(shortClubName({ label: 'Clube de Regatas do Flamengo', short: null })).toBe('Flamengo');
    expect(shortClubName({ label: 'Clube Atlético Mineiro', short: null })).toBe('Atlético-MG');
    expect(shortClubName({ label: 'Sport Club Corinthians Paulista', short: null })).toBe('Corinthians');
    expect(shortClubName({ label: 'Santos Futebol Clube', short: null })).toBe('Santos');
    expect(shortClubName({ label: 'Sociedade Esportiva Palmeiras', short: null })).toBe('Palmeiras');
    expect(shortClubName({ label: 'Club de Regatas Vasco da Gama', short: null })).toBe('Vasco');
    expect(shortClubName({ label: 'Esporte Clube Bahia', short: 'ECB' })).toBe('Bahia');
  });

  it('escolhe o ano mais perto do auge dentro da passagem', () => {
    expect(representativeYear({ start: 1978, end: 1989 }, 1953, 2026)).toBe(1980);
    expect(representativeYear({ start: 2020, end: null }, 1990, 2026)).toBe(2020);
    expect(representativeYear({ start: 2023, end: null }, 2003, 2026)).toBe(2026);
    expect(representativeYear({ start: null, end: 2000 }, 1970, 2026)).toBeNull();
  });

  it('junta passagens seguidas pelo mesmo clube somando jogos e gols', () => {
    const merged = mergeStints([
      { person: 'Q1', club: 'V', start: 1971, end: 1979, apps: 161, goals: 92 },
      { person: 'Q1', club: 'V', start: 1980, end: 1989, apps: 134, goals: 89 },
      { person: 'Q1', club: 'V', start: 1992, end: 1993, apps: 2, goals: 0 },
      { person: 'Q1', club: 'P', start: 1989, end: 1990, apps: 16, goals: 9 },
    ]);
    const vasco = merged.filter((s) => s.club === 'V').sort((a, b) => a.start! - b.start!);
    expect(vasco[0]).toMatchObject({ start: 1971, end: 1989, apps: 295, goals: 181 });
    expect(vasco[1]).toMatchObject({ start: 1992, end: 1993, apps: 2 });
    expect(merged.filter((s) => s.club === 'P')).toHaveLength(1);
  });

  it('ídolos ganham bônus e passagens curtas têm teto', () => {
    expect(idolBonus(300, 180, 'ATA')).toBe(4);
    expect(idolBonus(300, 180, 'GOL')).toBe(3);
    expect(idolBonus(900, 150, 'MEI')).toBe(5);
    expect(idolBonus(30, 3, 'MEI')).toBe(0);
    expect(shortStintCap(5, 0)).toBeLessThan(80);
    expect(shortStintCap(30, 1)).toBeLessThan(90);
    expect(shortStintCap(null, 0)).toBeLessThan(90);
    expect(shortStintCap(200, 8)).toBe(99);
  });

  it('fama: técnico pelo título perde; seleção, era antiga e carreira longa somam', () => {
    const base = { sitelinks: 60, awards: 0, caps: null, ptTitle: 'Fulano', birthYear: 1985 };
    // Felipão: título “(treinador…)” e muitos artigos pela carreira no banco
    expect(fameScore({ ...base, ptTitle: 'Fulano (treinador de futebol)' })).toBeLessThan(fameScore(base) - 1);
    expect(fameScore({ ...base, international: true })).toBeGreaterThan(fameScore(base));
    // Ídolo antigo com menos artigos (ex.: Ademir da Guia, 901 jogos) supera um jogador recente mais citado
    const idol = fameScore({ sitelinks: 25, awards: 0, caps: null, ptTitle: 'Ademir', birthYear: 1942 }, careerApps([stint(1962, 1977, 901)]));
    const recent = fameScore({ sitelinks: 40, awards: 0, caps: null, ptTitle: 'Beltrano', birthYear: 1990 }, careerApps([stint(2012, 2014, 69)]));
    expect(idol).toBeGreaterThan(recent);
    // Sem número de jogos, a passagem conta por temporada
    expect(careerApps([stint(1959, 1974, null)])).toBeGreaterThan(careerApps([stint(1959, 1960, null)]));
  });

  it('Lenda exige passagem marcante, salvo os maiores astros; topo comprimido', () => {
    const p = person({ birthYear: 1970 });
    const longIdol = buildOne(p, [stint(1995, 2003, 300)], 0.95);
    const shortSpell = buildOne(p, [stint(1997, 1998, 60)], 0.95);
    const superstar = buildOne(p, [stint(1997, 1998, 60)], 0.995);
    expect(tierOf(longIdol)).toBe('lenda');
    expect(shortSpell).toBeLessThan(90);
    expect(tierOf(superstar)).toBe('lenda');
    // Fora da passagem principal, 106 jogos não bastam (ex.: Roger Machado no Fluminense)
    expect(evaluateStint(stint(1997, 2000, 106), p, 'MEI', 0.95, 1, false, 2026)!.mid).toBeLessThan(90);
    expect(evaluateStint(stint(1997, 2000, 106), p, 'MEI', 0.95, 1, true, 2026)!.mid).toBeGreaterThanOrEqual(90);
    expect(buildOne(p, [stint(1990, 2005, 900, 300)], 1)).toBeLessThanOrEqual(97);
  });

  it('curva de nota e faixas', () => {
    expect(peakFromPercentile(1)).toBeCloseTo(97);
    expect(peakFromPercentile(0.975)).toBeCloseTo(90);
    expect(tierOf(peakFromPercentile(0.99))).toBe('lenda');
    expect(tierOf(peakFromPercentile(0.9))).toBe('craque');
    expect(tierOf(peakFromPercentile(0.6))).toBe('titular');
    expect(tierOf(peakFromPercentile(0.3))).toBe('operario');
    expect(tierOf(peakFromPercentile(0.1))).toBe('perna');
    expect(ageModifier(19)).toBeLessThan(ageModifier(22));
    expect(ageModifier(27)).toBe(0);
    expect(ageModifier(36)).toBeLessThan(ageModifier(33));
  });
});

function stint(start: number, end: number | null, apps: number | null, goals: number | null = null): RawStint {
  return { person: 'Q1', club: 'C', start, end, apps, goals };
}

function person(over: Partial<RawPerson> = {}): RawPerson {
  return { qid: 'Q1', ptTitle: 'Fulano', labelPt: null, labelEn: null, sitelinks: 30, birthYear: 1970, positions: ['midfielder'], awards: 0, nationalities: ['Brasil'], caps: null, ...over };
}

/** Nota (meio da faixa) da melhor passagem, como passagem principal num clube grande. */
function buildOne(p: RawPerson, stints: RawStint[], famePct: number): number {
  return Math.max(...stints.map((s) => evaluateStint(s, p, 'MEI', famePct, 1, true, 2026)!.mid));
}

/** Gera dados no mesmo formato do Wikidata: 4 clubes e ~900 jogadores com fama variada. */
function syntheticDump(): RawDump {
  const rng = new Rng('fixture');
  const clubs = [
    { qid: 'Q17479', label: 'Clube de Regatas do Flamengo', short: null, sitelinks: 91, colors: ['E2001A', '000000'] },
    { qid: 'Q35933', label: 'Sport Club Corinthians Paulista', short: null, sitelinks: 104, colors: ['FFFFFF', '000000'] },
    { qid: 'Q80955', label: 'Esporte Clube Exemplo', short: null, sitelinks: 75, colors: [] },
    { qid: 'Q999', label: 'Clube Atlético Tubarão', short: null, sitelinks: 20, colors: ['123456', 'ABCDEF'] },
    { qid: 'Q219120', label: 'Associação Atlética Ponte Preta', short: null, sitelinks: 36, colors: ['000000', 'FFFFFF'] },
  ];
  const posLabels = [['goalkeeper'], ['full-back'], ['centre-back'], ['midfielder'], ['forward']];
  const people: Record<string, RawPerson> = {};
  const stints: RawStint[] = [];
  for (let i = 0; i < 900; i++) {
    const qid = `Q${9000 + i}`;
    const birth = rng.int(1935, 2004);
    const pos = posLabels[i % 5 === 0 ? 0 : 1 + (i % 4)]!;
    people[qid] = {
      qid,
      ptTitle: `Jogador ${i} (futebolista)`,
      labelPt: `Jogador Completo ${i}`,
      labelEn: null,
      sitelinks: Math.round(8 + Math.pow(rng.next(), 4) * 120),
      birthYear: birth,
      positions: i % 97 === 0 ? [] : pos,
      awards: rng.next() < 0.1 ? rng.int(1, 8) : 0,
      nationalities: i % 13 === 0 ? ['Uruguai'] : ['Brasil'],
      caps: rng.next() < 0.2 ? rng.int(5, 90) : null,
      nicknames: [],
      coach: false,
      international: rng.next() < 0.2,
      female: i % 89 === 0,
    };
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const start = Math.min(2026, birth + rng.int(18, 33));
      const end = start + rng.int(0, 6) > 2026 ? null : start + rng.int(0, 6);
      stints.push({
        person: qid,
        club: clubs[rng.int(0, 4)]!.qid,
        start: i % 61 === 0 ? null : start,
        end,
        apps: rng.next() < 0.7 ? rng.int(3, 220) : null,
        goals: rng.next() < 0.7 ? rng.int(0, 90) : null,
      });
    }
  }
  return { source: 'wikidata', license: 'CC0-1.0', fetchedAt: '2026-10-19T00:00:00.000Z', country: 'Q155', minSitelinks: 8, clubs, people, stints };
}

describe('montagem do baralho', () => {
  const counts = { GOL: 30, LAT: 50, ZAG: 50, MEI: 90, ATA: 80 };
  const { deck, report } = buildDeck(syntheticDump(), { counts, currentYear: 2026, clubs: null });

  it('produz um baralho válido, com pelo menos as quantidades pedidas e ids estáveis', () => {
    validateDeck(deck.cards);
    for (const pos of Object.keys(counts) as Array<keyof typeof counts>) expect(report.byPosition[pos]).toBeGreaterThanOrEqual(counts[pos]);
    expect(report.skipped.female).toBeGreaterThan(0);
    expect(deck.cards.every((c) => c.id.startsWith(`wd-${c.personId}-`))).toBe(true);
    expect(deck.cards.every((c) => c.levelMin >= 40 && c.levelMax <= 99 && c.levelMin <= c.levelMax)).toBe(true);
    expect(report.skipped.noPosition).toBeGreaterThan(0);
    expect(report.skipped.noDates).toBeGreaterThanOrEqual(0);
  });

  it('distribui as faixas e cria Lendas', () => {
    expect(report.byTier.lenda).toBeGreaterThan(5);
    expect(report.byTier.perna).toBeGreaterThan(5);
    for (const c of deck.cards) expect(c.tier).toBe(tierOf((c.levelMin + c.levelMax) / 2));
  });

  it('usa nome curto, clube curto, cores do clube e pista com fatos da passagem', () => {
    const c = deck.cards.find((x) => x.club === 'Flamengo')!;
    expect(c.name).toMatch(/^Jogador \d+$/);
    expect(c.kit).toEqual(['#C8102E', '#111111']);
    expect(deck.cards.find((x) => x.club === 'Exemplo')?.kit).toBeUndefined();
    expect(deck.cards.find((x) => x.club === 'Atlético Tubarão')?.kit).toEqual(['#123456', '#ABCDEF']);
    expect(c.hint).toMatch(/Flamengo/);
    const foreign = deck.cards.find((x) => x.hint.startsWith('Uruguai.'));
    expect(foreign).toBeTruthy();
  });

  it('mesmo jogador pode ter até 2 versões, mas nunca duas no mesmo leilão', () => {
    const byPerson = new Map<string, Card[]>();
    for (const c of deck.cards) byPerson.set(c.personId!, [...(byPerson.get(c.personId!) ?? []), c]);
    expect(Math.max(...[...byPerson.values()].map((v) => v.length))).toBeLessThanOrEqual(2);
    for (let s = 0; s < 5; s++) {
      const seats = Array.from({ length: 8 }, () => ({ formation: '4-3-3' as const }));
      const { pool, reserve } = buildAuctionPool({ seats, deck: deck.cards, carried: [], extra: 1, seed: `s${s}` });
      const people = [...pool, ...reserve].map((c) => c.personId);
      expect(new Set(people).size).toBe(people.length);
    }
  });

  it('a melhor versão de todo jogador muito conhecido está no baralho', () => {
    const raw = syntheticDump();
    const famous = Object.values(raw.people)
      .filter((p) => !p.female && p.positions.length)
      .sort((a, b) => b.sitelinks - a.sitelinks)
      .slice(0, 20)
      .map((p) => p.qid);
    const inDeck = new Set(deck.cards.map((c) => c.personId));
    const withDates = famous.filter((q) => raw.stints.some((s) => s.person === q && s.start !== null));
    for (const q of withDates) expect(inDeck.has(q)).toBe(true);
  });

  it('é determinístico', () => {
    const again = buildDeck(syntheticDump(), { counts, currentYear: 2026, clubs: null }).deck.cards;
    expect(again.map((c) => `${c.id}:${c.levelMin}`)).toEqual(deck.cards.map((c) => `${c.id}:${c.levelMin}`));
  });
});

describe('baralho por grupos de clubes (Série A, Série B, Europa)', () => {
  const groups: SeriesClub[] = [
    { qid: 'Q17479', name: 'Flamengo', series: 'A', kit: ['#C8102E', '#111111'] },
    { qid: 'Q35933', name: 'Corinthians', series: 'A', kit: ['#FFFFFF', '#111111'] },
    { qid: 'Q219120', name: 'Ponte Preta', series: 'B', kit: ['#111111', '#FFFFFF'] },
    { qid: 'Q999', name: 'Tubarão', series: 'B', kit: ['#123456', '#ABCDEF'] },
    { qid: 'Q8682', name: 'Real Madrid', series: 'EU', kit: ['#FFFFFF', '#FEBE10'] },
  ];
  /** Mesmo dump sintético, com o clube "Exemplo" (Q80955) fora dos grupos e um clube europeu. */
  function dumpWithEurope(): RawDump {
    const raw = syntheticDump();
    raw.clubs.push({ qid: 'Q8682', label: 'Real Madrid Club de Fútbol', short: null, sitelinks: 153, colors: [] });
    // Um terço dos jogadores também passou pelo clube europeu, com mais artigos (como na vida real).
    let n = 0;
    for (const p of Object.values(raw.people)) {
      if (n++ % 3) continue;
      raw.stints.push({ person: p.qid, club: 'Q8682', start: (p.birthYear ?? 1980) + 26, end: (p.birthYear ?? 1980) + 29, apps: 90, goals: 10 });
    }
    return raw;
  }
  const countsBySeries = {
    A: { GOL: 12, LAT: 20, ZAG: 20, MEI: 36, ATA: 30 },
    B: { GOL: 10, LAT: 15, ZAG: 15, MEI: 25, ATA: 20 },
    EU: { GOL: 12, LAT: 20, ZAG: 20, MEI: 36, ATA: 30 },
  };
  const { deck, report } = buildDeck(dumpWithEurope(), { clubs: groups, countsBySeries, currentYear: 2026 });

  it('só clubes dos grupos viram carta, com nome, cores e grupo da lista', () => {
    validateDeck(deck.cards);
    expect(deck.cards.every((c) => c.series !== undefined)).toBe(true);
    expect(deck.cards.some((c) => c.club === 'Exemplo')).toBe(false);
    expect(new Set(deck.cards.map((c) => c.club))).toEqual(new Set(['Flamengo', 'Corinthians', 'Ponte Preta', 'Tubarão', 'Real Madrid']));
    const rm = deck.cards.find((c) => c.club === 'Real Madrid')!;
    expect(rm.series).toBe('EU');
    expect(rm.kit).toEqual(['#FFFFFF', '#FEBE10']);
    expect(deck.cards.find((c) => c.club === 'Tubarão')!.series).toBe('B');
    expect(report.bySeries.A).toBeGreaterThan(0);
    expect(report.bySeries.B).toBeGreaterThan(0);
    expect(report.bySeries.EU).toBeGreaterThan(0);
  });

  it('quem jogou no Brasil e na Europa tem versão nos dois, para salas só de um deles', () => {
    const byPerson = new Map<string, Set<string>>();
    for (const c of deck.cards) byPerson.set(c.personId!, (byPerson.get(c.personId!) ?? new Set()).add(c.series === 'EU' ? 'EU' : 'BR'));
    expect([...byPerson.values()].some((s) => s.size === 2)).toBe(true);
  });

  it('a sala filtra o baralho pelo grupo escolhido; baralho sem grupos fica inteiro', () => {
    expect(deckForScope(deck.cards, 'A').every((c) => c.series === 'A')).toBe(true);
    expect(deckForScope(deck.cards, 'B').every((c) => c.series === 'B')).toBe(true);
    expect(deckForScope(deck.cards, 'EU').every((c) => c.series === 'EU')).toBe(true);
    expect(deckForScope(deck.cards, 'AB').every((c) => c.series !== 'EU')).toBe(true);
    expect(deckForScope(deck.cards, 'ALL')).toHaveLength(deck.cards.length);
    const fictional = deck.cards.map(({ series: _s, ...c }) => c);
    expect(deckForScope(fictional, 'EU')).toHaveLength(fictional.length);
  });

  it('a fama é medida dentro de cada região: muitos desconhecidos novos não inflam as notas', () => {
    const scores = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const ref = [1, 2, 3];
    expect(referencePercentile(scores, ref).get('c')).toBeCloseTo(1);
    // Mais 100 jogadores pouco conhecidos fora da referência: o percentil de quem já estava não muda.
    const many = new Map([...scores, ...Array.from({ length: 100 }, (_, i) => [`x${i}`, 0.5] as [string, number])]);
    expect(referencePercentile(many, ref).get('b')).toBeCloseTo(referencePercentile(scores, ref).get('b')!);
  });
});

describe('baralho real gerado (data/deck-wikidata.json)', () => {
  const path = join(import.meta.dirname, '../../data/deck-wikidata.json');
  it.skipIf(!existsSync(path))('cada escolha de clubes tem cartas para uma sala de 20 técnicos e nenhum clube fora da lista', () => {
    const cards = (JSON.parse(readFileSync(path, 'utf8')) as { cards: Card[] }).cards;
    validateDeck(cards);
    // 20 técnicos × vagas da formação mais exigente + sobra por posição (ver docs/BARALHO.md).
    const need = { GOL: 21, LAT: 41, ZAG: 41, MEI: 81, ATA: 61 };
    for (const scope of SERIES_SCOPES) {
      const scoped = deckForScope(cards, scope);
      for (const [pos, n] of Object.entries(need)) expect(scoped.filter((c) => c.position === pos).length, `${scope} ${pos}`).toBeGreaterThanOrEqual(n);
    }
    const allowed = new Set(SERIES_CLUBS.map((c) => c.name));
    expect(cards.filter((c) => !allowed.has(c.club)).map((c) => c.club)).toEqual([]);
    for (const c of cards) expect(SERIES_CLUBS.find((x) => x.name === c.club)!.series).toBe(c.series);
  });
});

describe('ajustes manuais do baralho (data/deck-ajustes.json)', () => {
  it('cartas excluídas não estão no baralho; Pelé e Messi são 95–100; o id casa por prefixo', async () => {
    const { applyAdjustments, isExcluded, loadAdjustments } = await import('../../src/tools/wikidata/adjustments.js');
    const adj = loadAdjustments(join(process.cwd(), 'data/deck-ajustes.json'));
    expect(adj.excluir.some((e) => e.id === 'wd-Q56248407-Q270995')).toBe(true);
    const real = JSON.parse(readFileSync(join(process.cwd(), 'data/deck-wikidata.json'), 'utf8')) as { cards: Card[] };
    expect(real.cards.filter((c) => isExcluded(c, adj.excluir))).toEqual([]);
    expect(real.cards.some((c) => c.name === 'Marquinhos' && c.club === 'Atlético-MG')).toBe(false);
    for (const name of ['Pelé', 'Lionel Messi']) {
      const cards = real.cards.filter((c) => c.name === name);
      expect(cards.length, name).toBeGreaterThan(0);
      for (const c of cards) expect([c.levelMin, c.levelMax, c.tier]).toEqual([95, 100, 'lenda']);
    }
    // Ninguém mais passa do teto das Lendas.
    expect(real.cards.filter((c) => c.levelMax > 98).map((c) => c.name).sort()).toEqual(['Lionel Messi', 'Pelé']);
    // O baralho real continua válido com o 100.
    expect(() => validateDeck(real.cards)).not.toThrow();
    const sample = [
      { id: 'wd-Q1-Q2-2020', levelMin: 70, levelMax: 75, tier: 'titular' as const },
      { id: 'wd-Q1-Q2-2026', levelMin: 70, levelMax: 75, tier: 'titular' as const },
      { id: 'wd-Q1-Q3-2026', levelMin: 70, levelMax: 75, tier: 'titular' as const },
      { id: 'wd-Q10-Q2-2026', levelMin: 70, levelMax: 75, tier: 'titular' as const },
    ];
    const out = applyAdjustments(sample, { excluir: [{ id: 'wd-Q1-Q2' }], nivel: [{ id: 'wd-Q1', faixa: [95, 100] }] });
    expect(out.cards.map((c) => c.id)).toEqual(['wd-Q1-Q3-2026', 'wd-Q10-Q2-2026']);
    expect(out.cards[0]).toMatchObject({ levelMin: 95, levelMax: 100, tier: 'lenda' });
    expect(out.cards[1]).toMatchObject({ levelMin: 70, levelMax: 75 });
  });
});
