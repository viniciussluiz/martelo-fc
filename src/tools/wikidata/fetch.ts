import type { FetchOptions, RawClub, RawDump, RawPerson, RawStint, SparqlFn } from './types.js';

/**
 * Extrai do Wikidata os clubes mais conhecidos de um país e os jogadores que
 * passaram por eles (antigos e atuais), com período, jogos e gols de cada passagem.
 * Não usa fotos nem textos da Wikipédia — apenas dados estruturados (CC0).
 *
 * Este módulo não importa nada de Node para poder rodar também no navegador.
 */

const WD = 'http://www.wikidata.org/entity/';
const qid = (uri: string | undefined) => (uri ?? '').replace(WD, '');
const num = (v: { value: string } | undefined) => (v ? Number(v.value) : null);
const year = (v: { value: string } | undefined) => {
  if (!v) return null;
  const m = /^(-?\d{1,4})/.exec(v.value.replace(/^\+/, ''));
  return m ? Number(m[1]) : null;
};

const PEOPLE_BATCH = 120;

export const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export function nodeSparql(userAgent = 'MarteloFC-deck-builder/1.0 (https://github.com/; contato via repositório)'): SparqlFn {
  return async (query) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(SPARQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/sparql-results+json',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({ query }),
      });
      if (res.ok) return ((await res.json()) as { results: { bindings: [] } }).results.bindings;
      // 504 = consulta passou de 60 s: repetir não adianta; quem chama divide o lote.
      if ((res.status === 429 || res.status === 502 || res.status === 503) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error(`Wikidata respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  };
}

export function clubsQuery(country: string, limit: number): string {
  return `SELECT ?club ?clubLabel (SAMPLE(?s) AS ?short) (MAX(?sl0) AS ?sl) WHERE {
  ?club wdt:P31 wd:Q476028; wdt:P17 wd:${country}; wikibase:sitelinks ?sl0.
  OPTIONAL { ?club wdt:P1813 ?s. FILTER(LANG(?s) IN ("pt","pt-br","en")) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }
} GROUP BY ?club ?clubLabel ORDER BY DESC(?sl) LIMIT ${limit}`;
}

export function clubsByIdQuery(ids: string[]): string {
  return `SELECT ?club ?clubLabel (SAMPLE(?s) AS ?short) (MAX(?sl0) AS ?sl) WHERE {
  VALUES ?club { ${ids.map((i) => `wd:${i}`).join(' ')} }
  ?club wikibase:sitelinks ?sl0.
  OPTIONAL { ?club wdt:P1813 ?s. FILTER(LANG(?s) IN ("pt","pt-br","en")) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }
} GROUP BY ?club ?clubLabel`;
}

export function colorsQuery(ids: string[]): string {
  return `SELECT ?club ?hex WHERE {
  VALUES ?club { ${ids.map((i) => `wd:${i}`).join(' ')} }
  ?club wdt:P6364 ?c. ?c wdt:P465 ?hex.
}`;
}

export function stintsQuery(club: string, minSitelinks: number): string {
  return `SELECT ?p ?sl ?birth ?start ?end ?apps ?goals WHERE {
  ?p p:P54 ?st. ?st ps:P54 wd:${club}.
  ?p wdt:P106 wd:Q937857; wikibase:sitelinks ?sl.
  FILTER(?sl >= ${minSitelinks})
  OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
  OPTIONAL { ?st pq:P1350 ?apps } OPTIONAL { ?st pq:P1351 ?goals }
  OPTIONAL { ?p wdt:P569 ?birth }
}`;
}

const values = (ids: string[]) => `VALUES ?p { ${ids.map((i) => `wd:${i}`).join(' ')} }`;

/** Consultas separadas e simples: uma única consulta com tudo estoura o limite de 60 s do Wikidata. */
export function namesQuery(ids: string[]): string {
  return `SELECT ?p ?ptTitle ?labelPt ?labelEn WHERE {
  ${values(ids)}
  OPTIONAL { ?art schema:about ?p; schema:isPartOf <https://pt.wikipedia.org/>; schema:name ?ptTitle. }
  OPTIONAL { ?p rdfs:label ?labelPt. FILTER(LANG(?labelPt) = "pt") }
  OPTIONAL { ?p rdfs:label ?labelEn. FILTER(LANG(?labelEn) = "en") }
}`;
}

export function positionsQuery(ids: string[]): string {
  return `SELECT ?p ?posL WHERE {
  ${values(ids)}
  ?p wdt:P413 ?posI. ?posI rdfs:label ?posL. FILTER(LANG(?posL) = "en")
}`;
}

export function awardsQuery(ids: string[]): string {
  return `SELECT ?p (COUNT(DISTINCT ?aw) AS ?awards) WHERE {
  ${values(ids)}
  ?p wdt:P166 ?aw.
} GROUP BY ?p`;
}

export function nationalityQuery(ids: string[]): string {
  return `SELECT ?p ?natL WHERE {
  ${values(ids)}
  ?p wdt:P1532 ?nI. ?nI rdfs:label ?natL. FILTER(LANG(?natL) = "pt")
}`;
}

export function nicknamesQuery(ids: string[]): string {
  return `SELECT ?p ?nick WHERE {
  ${values(ids)}
  ?p wdt:P1449 ?nick. FILTER(LANG(?nick) IN ("pt", "pt-br", "en", "mul"))
}`;
}

/**
 * Classes de seleção nacional no Wikidata: a genérica e “seleção masculina de futebol” (Q135408445),
 * que é a usada hoje em seleções como a brasileira (Q83459).
 */
const NATIONAL_TEAM_CLASSES = 'VALUES ?ntClass { wd:Q6979593 wd:Q135408445 }';

/** Marcas booleanas: técnico, seleção principal e sexo feminino. */
export function flagsQuery(ids: string[]): string {
  return `SELECT ?p ?flag WHERE {
  ${values(ids)}
  { ?p wdt:P106 wd:Q628099. BIND("coach" AS ?flag) }
  UNION { ${NATIONAL_TEAM_CLASSES} ?p wdt:P54 ?nt. ?nt wdt:P31 ?ntClass. BIND("international" AS ?flag) }
  UNION { ?p wdt:P21 wd:Q6581072. BIND("female" AS ?flag) }
}`;
}

export function capsQuery(ids: string[]): string {
  return `SELECT ?p (MAX(?c) AS ?caps) WHERE {
  VALUES ?p { ${ids.map((i) => `wd:${i}`).join(' ')} }
  ${NATIONAL_TEAM_CLASSES}
  ?p p:P54 ?ns. ?ns ps:P54 ?nt. ?nt wdt:P31 ?ntClass. ?ns pq:P1350 ?c.
} GROUP BY ?p`;
}

type Row = Record<string, { value: string } | undefined>;

/**
 * Roda a consulta para um lote de jogadores; se o Wikidata estourar o tempo,
 * divide o lote ao meio (até um mínimo) em vez de desistir de tudo.
 */
async function runBatched(sparql: SparqlFn, build: (ids: string[]) => string, ids: string[], onRows: (rows: Row[]) => void, onSkip: (n: number, err: unknown) => void, minSize = 6): Promise<void> {
  try {
    onRows(await sparql(build(ids)));
  } catch (err) {
    if (ids.length <= minSize) {
      onSkip(ids.length, err);
      return;
    }
    const mid = Math.ceil(ids.length / 2);
    await runBatched(sparql, build, ids.slice(0, mid), onRows, onSkip, minSize);
    await runBatched(sparql, build, ids.slice(mid), onRows, onSkip, minSize);
  }
}

/** Apelidos e marcas (técnico, seleção, sexo) de um lote de jogadores. */
export async function fetchExtras(sparql: SparqlFn, people: Record<string, RawPerson>, batch: string[], log: (m: string) => void): Promise<void> {
  const at = (r: Row) => people[qid(r.p?.value)];
  const skip = (label: string) => (n: number, err: unknown) => log(`  (${label}: ${n} jogadores sem dados — ${String(err).slice(0, 60)})`);
  for (const id of batch) {
    const p = people[id];
    if (!p) continue;
    p.nicknames ??= [];
    p.coach ??= false;
    p.international ??= false;
    p.female ??= false;
  }
  await runBatched(sparql, nicknamesQuery, batch, (rows) => {
    for (const r of rows) {
      const p = at(r);
      if (p && r.nick && !p.nicknames!.includes(r.nick.value)) p.nicknames!.push(r.nick.value);
    }
  }, skip('apelidos'));
  await runBatched(sparql, flagsQuery, batch, (rows) => {
    for (const r of rows) {
      const p = at(r);
      const f = r.flag?.value;
      if (!p || !f) continue;
      if (f === 'coach') p.coach = true;
      if (f === 'international') p.international = true;
      if (f === 'female') p.female = true;
    }
  }, skip('marcas'));
}

export interface FetchProgress {
  /** Estado parcial; dá para retomar passando-o em `resumeFrom`. */
  partial: RawDump;
}

export async function fetchRawDump(sparql: SparqlFn, opts: FetchOptions & { resumeFrom?: RawDump; onProgress?: (p: FetchProgress) => void }): Promise<RawDump> {
  const log = opts.log ?? (() => undefined);
  let dump: RawDump;
  if (opts.resumeFrom) {
    dump = opts.resumeFrom;
    log(`Retomando: ${dump.clubs.length} clubes, ${Object.keys(dump.people).length} jogadores, ${dump.detailed?.length ?? 0} já detalhados.`);
  } else {
    log(`Buscando os ${opts.clubCount} clubes mais conhecidos de ${opts.country}…`);
    const clubRows = await sparql(clubsQuery(opts.country, opts.clubCount));
    if (opts.extraClubs?.length) clubRows.push(...(await sparql(clubsByIdQuery(opts.extraClubs))));
    const clubs = new Map<string, RawClub>();
    for (const r of clubRows) {
      const id = qid(r.club?.value);
      if (!id || clubs.has(id)) continue;
      clubs.set(id, { qid: id, label: r.clubLabel?.value ?? id, short: r.short?.value ?? null, sitelinks: num(r.sl) ?? 0, colors: [] });
    }
    for (const r of await sparql(colorsQuery([...clubs.keys()]))) {
      const c = clubs.get(qid(r.club?.value));
      const hex = (r.hex?.value ?? '').replace('#', '').toUpperCase();
      if (c && /^[0-9A-F]{6}$/.test(hex) && !c.colors.includes(hex)) c.colors.push(hex);
    }
    const people: Record<string, RawPerson> = {};
    const stints: RawStint[] = [];
    const seenStint = new Set<string>();
    let i = 0;
    for (const club of clubs.values()) {
      i++;
      log(`[${i}/${clubs.size}] passagens pelo ${club.label}…`);
      const rows = await sparql(stintsQuery(club.qid, opts.minSitelinks));
      for (const r of rows) {
        const person = qid(r.p?.value);
        if (!person) continue;
        people[person] ??= {
          qid: person,
          ptTitle: null,
          labelPt: null,
          labelEn: null,
          sitelinks: num(r.sl) ?? 0,
          birthYear: year(r.birth),
          positions: [],
          awards: 0,
          nationalities: [],
          caps: null,
        };
        const stint: RawStint = { person, club: club.qid, start: year(r.start), end: year(r.end), apps: num(r.apps), goals: num(r.goals) };
        const key = `${stint.person}|${stint.club}|${stint.start}|${stint.end}`;
        if (seenStint.has(key)) continue;
        seenStint.add(key);
        stints.push(stint);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    dump = {
      source: 'wikidata',
      license: 'CC0-1.0',
      fetchedAt: new Date().toISOString(),
      country: opts.country,
      minSitelinks: opts.minSitelinks,
      clubs: [...clubs.values()],
      people,
      stints,
      detailed: [],
    };
    opts.onProgress?.({ partial: dump });
  }

  const people = dump.people;
  const done = new Set(dump.detailed ?? []);
  const ids = Object.keys(people).filter((id) => !done.has(id));
  log(`Detalhes de ${ids.length} jogadores…`);
  const at = (r: Row) => people[qid(r.p?.value)];
  const skip = (label: string) => (n: number, err: unknown) => log(`  (${label}: ${n} jogadores sem dados — ${String(err).slice(0, 60)})`);
  for (let k = 0; k < ids.length; k += PEOPLE_BATCH) {
    const batch = ids.slice(k, k + PEOPLE_BATCH);
    await runBatched(sparql, namesQuery, batch, (rows) => {
      for (const r of rows) {
        const p = at(r);
        if (!p) continue;
        p.ptTitle ??= r.ptTitle?.value ?? null;
        p.labelPt ??= r.labelPt?.value ?? null;
        p.labelEn ??= r.labelEn?.value ?? null;
      }
    }, skip('nomes'));
    await runBatched(sparql, positionsQuery, batch, (rows) => {
      for (const r of rows) {
        const p = at(r);
        if (p && r.posL && !p.positions.includes(r.posL.value)) p.positions.push(r.posL.value);
      }
    }, skip('posições'));
    await runBatched(sparql, awardsQuery, batch, (rows) => {
      for (const r of rows) {
        const p = at(r);
        if (p) p.awards = num(r.awards) ?? 0;
      }
    }, skip('prêmios'));
    await runBatched(sparql, nationalityQuery, batch, (rows) => {
      for (const r of rows) {
        const p = at(r);
        if (p && r.natL && !p.nationalities.includes(r.natL.value)) p.nationalities.push(r.natL.value);
      }
    }, skip('nacionalidade'));
    await runBatched(sparql, capsQuery, batch, (rows) => {
      for (const r of rows) {
        const p = at(r);
        if (p) p.caps = num(r.caps);
      }
    }, skip('jogos por seleção'));
    await fetchExtras(sparql, people, batch, log);
    dump.detailed = [...(dump.detailed ?? []), ...batch];
    opts.onProgress?.({ partial: dump });
    log(`  ${Object.keys(people).length - ids.length + Math.min(k + PEOPLE_BATCH, ids.length)}/${Object.keys(people).length}`);
  }
  delete dump.detailed;
  dump.fetchedAt = new Date().toISOString();
  return dump;
}
