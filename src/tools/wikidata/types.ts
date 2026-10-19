/**
 * Dados brutos extraídos do Wikidata (CC0). O arquivo `data/wikidata-raw.json`
 * guarda este formato para que a montagem do baralho seja reprodutível offline.
 */

export interface RawClub {
  qid: string;
  label: string;
  short: string | null;
  sitelinks: number;
  /** Cores oficiais em hexadecimal (sem #), na ordem em que vieram. */
  colors: string[];
}

export interface RawPerson {
  qid: string;
  ptTitle: string | null;
  labelPt: string | null;
  labelEn: string | null;
  sitelinks: number;
  birthYear: number | null;
  /** Rótulos em inglês das posições (P413), ex.: "goalkeeper", "wing half". */
  positions: string[];
  /** Nº de prêmios (P166). */
  awards: number;
  /** País pelo qual joga (P1532), rótulos em português. */
  nationalities: string[];
  /** Maior nº de jogos registrado por uma seleção principal (opcional). */
  caps: number | null;
  /** Apelidos (P1449) em pt/en, quando houver. */
  nicknames?: string[];
  /** Também atuou como técnico (P106 = Q628099). */
  coach?: boolean;
  /** Jogou por alguma seleção principal (P54 → seleção nacional). */
  international?: boolean;
  /** P21 = feminino (o baralho padrão é do futebol masculino). */
  female?: boolean;
}

export interface RawStint {
  person: string;
  club: string;
  start: number | null;
  end: number | null;
  apps: number | null;
  goals: number | null;
}

export interface RawDump {
  source: 'wikidata';
  license: 'CC0-1.0';
  fetchedAt: string;
  country: string;
  minSitelinks: number;
  clubs: RawClub[];
  people: Record<string, RawPerson>;
  stints: RawStint[];
  /** Só durante a busca: jogadores já detalhados (permite retomar). */
  detailed?: string[];
}

export interface FetchOptions {
  /** País dos clubes (QID). Brasil = Q155. */
  country: string;
  /** Quantos clubes (os mais conhecidos do país, por nº de artigos na Wikipédia). */
  clubCount: number;
  /** Corte mínimo de artigos em Wikipédias para entrar (filtra desconhecidos). */
  minSitelinks: number;
  /** Clubes extras/forçados (QIDs). */
  extraClubs?: string[];
  log?: (msg: string) => void;
}

/** Executa uma consulta SPARQL e devolve `results.bindings`. Injetável (Node ou navegador). */
export type SparqlFn = (query: string) => Promise<Array<Record<string, { value: string } | undefined>>>;
