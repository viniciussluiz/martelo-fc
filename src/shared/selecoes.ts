/**
 * Seleções do modo “Seleções” do leilão: nome exibido, sigla (selo genérico), cores do uniforme,
 * como o Wikidata escreve o país (P1532, em português) e como o TheSportsDB chama a seleção
 * (de onde vem o escudo — ver `npm run escudos`).
 */
export interface NationalTeam {
  name: string;
  code: string;
  kit: [string, string];
  /** Rótulos do país no Wikidata (pt). */
  wikidata: string[];
  /** Nomes da seleção no TheSportsDB (busca por nome exato). */
  tsdb: string[];
}

const t = (name: string, code: string, kit: [string, string], tsdb: string[], wikidata: string[] = [name]): NationalTeam => ({ name, code, kit, wikidata, tsdb });

export const NATIONAL_TEAMS: NationalTeam[] = [
  t('Brasil', 'BRA', ['#FFDC02', '#193375'], ['Brazil']),
  t('Argentina', 'ARG', ['#75AADB', '#FFFFFF'], ['Argentina']),
  t('Uruguai', 'URU', ['#5CBFEB', '#111111'], ['Uruguay']),
  t('Colômbia', 'COL', ['#FCD116', '#003893'], ['Colombia']),
  t('Chile', 'CHI', ['#D52B1E', '#0039A6'], ['Chile']),
  t('Paraguai', 'PAR', ['#D52B1E', '#FFFFFF'], ['Paraguay']),
  t('Equador', 'EQU', ['#FFD100', '#0033A0'], ['Ecuador']),
  t('Peru', 'PER', ['#FFFFFF', '#D91023'], ['Peru']),
  t('México', 'MEX', ['#006847', '#FFFFFF'], ['Mexico']),
  t('Estados Unidos', 'EUA', ['#FFFFFF', '#1F2F6B'], ['USA', 'United States']),
  t('Itália', 'ITA', ['#0066B2', '#FFFFFF'], ['Italy']),
  t('Alemanha', 'ALE', ['#FFFFFF', '#111111'], ['Germany'], ['Alemanha', 'Alemanha Ocidental']),
  t('França', 'FRA', ['#1F2F6B', '#FFFFFF'], ['France']),
  t('Espanha', 'ESP', ['#C60B1E', '#FFC400'], ['Spain']),
  t('Inglaterra', 'ING', ['#FFFFFF', '#1C2C5B'], ['England']),
  t('Holanda', 'HOL', ['#F36C21', '#FFFFFF'], ['Netherlands', 'Holland'], ['Países Baixos', 'Holanda']),
  t('Portugal', 'POR', ['#C8102E', '#006600'], ['Portugal']),
  t('Bélgica', 'BEL', ['#E30613', '#111111'], ['Belgium']),
  t('Croácia', 'CRO', ['#FFFFFF', '#E30613'], ['Croatia']),
  t('Sérvia', 'SER', ['#C6363C', '#0C4076'], ['Serbia']),
  t('Suíça', 'SUI', ['#D52B1E', '#FFFFFF'], ['Switzerland']),
  t('Suécia', 'SUE', ['#FECC02', '#006AA7'], ['Sweden']),
  t('Dinamarca', 'DIN', ['#C60C30', '#FFFFFF'], ['Denmark']),
  t('Noruega', 'NOR', ['#BA0C2F', '#FFFFFF'], ['Norway']),
  t('Polônia', 'POL', ['#FFFFFF', '#DC143C'], ['Poland'], ['Polónia', 'Polônia']),
  t('Tchéquia', 'TCH', ['#D7141A', '#11457E'], ['Czech Republic', 'Czechia'], ['Chéquia', 'Tchéquia', 'República Checa', 'República Tcheca']),
  t('Áustria', 'AUT', ['#ED2939', '#FFFFFF'], ['Austria']),
  t('Irlanda', 'IRL', ['#169B62', '#FFFFFF'], ['Ireland', 'Republic of Ireland']),
  t('Escócia', 'ESC', ['#0B1F4D', '#FFFFFF'], ['Scotland']),
  t('País de Gales', 'GAL', ['#C8102E', '#00B140'], ['Wales']),
  t('Turquia', 'TUR', ['#E30A17', '#FFFFFF'], ['Turkey', 'Türkiye']),
  t('Grécia', 'GRE', ['#0D5EAF', '#FFFFFF'], ['Greece']),
  t('Romênia', 'ROM', ['#FCD116', '#002B7F'], ['Romania'], ['Roménia', 'Romênia']),
  t('Rússia', 'RUS', ['#D52B1E', '#FFFFFF'], ['Russia']),
  t('Ucrânia', 'UCR', ['#FFD500', '#005BBB'], ['Ukraine']),
  t('Nigéria', 'NIG', ['#008751', '#FFFFFF'], ['Nigeria']),
  t('Camarões', 'CAM', ['#007A5E', '#CE1126'], ['Cameroon']),
  t('Costa do Marfim', 'CDM', ['#F77F00', '#009E60'], ['Ivory Coast', "Cote d'Ivoire"]),
  t('Gana', 'GAN', ['#FFFFFF', '#111111'], ['Ghana']),
  t('Senegal', 'SEN', ['#FFFFFF', '#00853F'], ['Senegal']),
  t('Marrocos', 'MAR', ['#C1272D', '#006233'], ['Morocco']),
  t('Japão', 'JAP', ['#0B1F8F', '#FFFFFF'], ['Japan']),
  t('Austrália', 'AUS', ['#FFCD00', '#00843D'], ['Australia']),
];

const BY_NAME = new Map(NATIONAL_TEAMS.map((x) => [x.name, x]));
const BY_LABEL = new Map(NATIONAL_TEAMS.flatMap((x) => x.wikidata.map((l) => [l, x] as const)));

export function nationalTeam(name: string): NationalTeam | undefined {
  return BY_NAME.get(name);
}

/** Seleção de um país como o Wikidata o escreve. */
export function nationalTeamOf(label: string): NationalTeam | undefined {
  return BY_LABEL.get(label);
}
