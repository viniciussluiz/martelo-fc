import { nationalTeam } from '../../shared/selecoes.js';

/**
 * Como cada clube do baralho aparece nas fontes de escudo.
 *  - `aliases`: nomes aceitos na API Futebol (comparação exata, sem acento/caixa/pontuação).
 *  - `tsdb`: nomes para buscar no TheSportsDB (reserva para o que a API Futebol não cobrir).
 *  - `country`: país do clube como o TheSportsDB escreve (“Monaco”, “The Netherlands”); Brasil = Séries A/B, o resto = Europa.
 * Clubes fora desta tabela usam o próprio nome em tudo.
 */
export interface ClubRef {
  aliases: string[];
  tsdb: string[];
  country: string;
  /** Seleção nacional (modo “Seleções”): o escudo é o da federação, buscado só no TheSportsDB. */
  national?: boolean;
}

const br = (aliases: string[], tsdb: string[]): ClubRef => ({ aliases, tsdb, country: 'Brazil' });
const eu = (country: string, aliases: string[], tsdb: string[]): ClubRef => ({ aliases, tsdb, country });

export const CLUB_DIRECTORY: Record<string, ClubRef> = {
  // Série A 2026
  'Athletico-PR': br(['Athletico-PR', 'Athletico Paranaense', 'Athletico'], ['Athletico Paranaense']),
  'Atlético-MG': br(['Atlético-MG', 'Atlético Mineiro'], ['Atletico Mineiro']),
  Bahia: br(['Bahia', 'EC Bahia'], ['Bahia']),
  Botafogo: br(['Botafogo', 'Botafogo-RJ'], ['Botafogo']),
  Bragantino: br(['Bragantino', 'RB Bragantino', 'Red Bull Bragantino'], ['Red Bull Bragantino', 'Bragantino']),
  Chapecoense: br(['Chapecoense'], ['Chapecoense']),
  Corinthians: br(['Corinthians'], ['Corinthians']),
  Coritiba: br(['Coritiba'], ['Coritiba']),
  Cruzeiro: br(['Cruzeiro'], ['Cruzeiro']),
  Flamengo: br(['Flamengo'], ['Flamengo']),
  Fluminense: br(['Fluminense'], ['Fluminense']),
  Grêmio: br(['Grêmio'], ['Gremio']),
  Internacional: br(['Internacional'], ['Internacional']),
  Mirassol: br(['Mirassol'], ['Mirassol']),
  Palmeiras: br(['Palmeiras'], ['Palmeiras']),
  Remo: br(['Remo', 'Clube do Remo'], ['Remo', 'Clube do Remo']),
  Santos: br(['Santos'], ['Santos']),
  'São Paulo': br(['São Paulo'], ['Sao Paulo']),
  Vasco: br(['Vasco', 'Vasco da Gama'], ['Vasco da Gama']),
  Vitória: br(['Vitória', 'EC Vitória'], ['Vitoria']),
  // Série B 2026
  'América-MG': br(['América-MG', 'América Mineiro'], ['America Mineiro']),
  'Athletic-MG': br(['Athletic-MG', 'Athletic', 'Athletic Club'], ['Athletic Club MG', 'Athletic MG']),
  'Atlético-GO': br(['Atlético-GO', 'Atlético Goianiense'], ['Atletico Goianiense']),
  Avaí: br(['Avaí'], ['Avai']),
  'Botafogo-SP': br(['Botafogo-SP', 'Botafogo SP'], ['Botafogo Ribeirao Preto', 'Botafogo SP']),
  Ceará: br(['Ceará'], ['Ceara']),
  Criciúma: br(['Criciúma'], ['Criciuma']),
  CRB: br(['CRB'], ['CRB']),
  Cuiabá: br(['Cuiabá'], ['Cuiaba']),
  Fortaleza: br(['Fortaleza'], ['Fortaleza']),
  Goiás: br(['Goiás'], ['Goias']),
  Juventude: br(['Juventude'], ['Juventude']),
  Londrina: br(['Londrina'], ['Londrina']),
  Náutico: br(['Náutico'], ['Nautico']),
  Novorizontino: br(['Novorizontino', 'Grêmio Novorizontino'], ['Novorizontino']),
  'Operário-PR': br(['Operário-PR', 'Operário', 'Operário Ferroviário'], ['Operario Ferroviario', 'Operario PR']),
  'Ponte Preta': br(['Ponte Preta'], ['Ponte Preta']),
  'São Bernardo': br(['São Bernardo', 'São Bernardo FC'], ['Sao Bernardo']),
  Sport: br(['Sport', 'Sport Recife'], ['Sport Recife']),
  'Vila Nova': br(['Vila Nova'], ['Vila Nova']),
  // Europa
  'Manchester United': eu('England', ['Manchester United', 'Manchester Utd', 'Man United'], ['Manchester United']),
  Liverpool: eu('England', ['Liverpool'], ['Liverpool']),
  Chelsea: eu('England', ['Chelsea'], ['Chelsea']),
  Arsenal: eu('England', ['Arsenal'], ['Arsenal']),
  'Manchester City': eu('England', ['Manchester City', 'Man City'], ['Manchester City']),
  Tottenham: eu('England', ['Tottenham', 'Tottenham Hotspur'], ['Tottenham Hotspur', 'Tottenham']),
  'Real Madrid': eu('Spain', ['Real Madrid'], ['Real Madrid']),
  Barcelona: eu('Spain', ['Barcelona'], ['Barcelona']),
  'Atlético de Madrid': eu('Spain', ['Atlético de Madrid', 'Atlético Madrid', 'Atlético-MAD'], ['Atletico Madrid']),
  Sevilla: eu('Spain', ['Sevilla', 'Sevilha'], ['Sevilla']),
  Valencia: eu('Spain', ['Valencia', 'Valência'], ['Valencia']),
  Juventus: eu('Italy', ['Juventus'], ['Juventus']),
  Milan: eu('Italy', ['Milan', 'AC Milan'], ['AC Milan']),
  'Inter de Milão': eu('Italy', ['Inter de Milão', 'Inter', 'Internazionale', 'Inter Milão'], ['Inter Milan']),
  Roma: eu('Italy', ['Roma', 'AS Roma'], ['Roma', 'AS Roma']),
  Napoli: eu('Italy', ['Napoli', 'Nápoles'], ['Napoli']),
  Lazio: eu('Italy', ['Lazio'], ['Lazio']),
  'Bayern de Munique': eu('Germany', ['Bayern de Munique', 'Bayern', 'Bayern München', 'Bayern Munique'], ['Bayern Munich']),
  'Borussia Dortmund': eu('Germany', ['Borussia Dortmund', 'Dortmund'], ['Borussia Dortmund']),
  'Bayer Leverkusen': eu('Germany', ['Bayer Leverkusen', 'Leverkusen'], ['Bayer Leverkusen']),
  PSG: eu('France', ['PSG', 'Paris Saint-Germain', 'Paris SG'], ['Paris Saint-Germain', 'Paris SG']),
  'Olympique de Marseille': eu('France', ['Olympique de Marseille', 'Olympique Marseille', 'Marseille'], ['Marseille']),
  Lyon: eu('France', ['Lyon', 'Olympique Lyonnais', 'Olympique de Lyon'], ['Lyon']),
  Monaco: eu('Monaco', ['Monaco', 'AS Monaco'], ['Monaco']),
  Benfica: eu('Portugal', ['Benfica', 'SL Benfica'], ['Benfica']),
  Porto: eu('Portugal', ['Porto', 'FC Porto'], ['FC Porto', 'Porto']),
  Sporting: eu('Portugal', ['Sporting', 'Sporting CP', 'Sporting Lisboa'], ['Sporting CP', 'Sporting Lisbon']),
  Ajax: eu('The Netherlands', ['Ajax'], ['Ajax']),
  PSV: eu('The Netherlands', ['PSV', 'PSV Eindhoven'], ['PSV Eindhoven', 'PSV']),
  // Clubes de cartas feitas à mão (data/deck-ajustes.json)
  Bolton: eu('England', ['Bolton', 'Bolton Wanderers'], ['Bolton Wanderers', 'Bolton']),
  Villarreal: eu('Spain', ['Villarreal'], ['Villarreal']),
  Galatasaray: eu('Turkey', ['Galatasaray'], ['Galatasaray']),
  'Deportivo La Coruña': eu('Spain', ['Deportivo La Coruña', 'Deportivo', 'La Coruña'], ['Deportivo La Coruna', 'Deportivo']),
  Piacenza: eu('Italy', ['Piacenza'], ['Piacenza']),
  Parma: eu('Italy', ['Parma'], ['Parma']),
  Fiorentina: eu('Italy', ['Fiorentina'], ['Fiorentina']),
  Feyenoord: eu('The Netherlands', ['Feyenoord'], ['Feyenoord']),
  Brescia: eu('Italy', ['Brescia'], ['Brescia']),
  Anderlecht: eu('Belgium', ['Anderlecht'], ['Anderlecht']),
  'Nagoya Grampus': eu('Japan', ['Nagoya Grampus'], ['Nagoya Grampus']),
  'Leeds United': eu('England', ['Leeds United', 'Leeds'], ['Leeds United', 'Leeds']),
};

export type ClubGroup = 'BR' | 'EU' | 'SEL';

export function clubRef(club: string): ClubRef {
  const known = CLUB_DIRECTORY[club];
  if (known) return known;
  const team = nationalTeam(club);
  if (team) return { aliases: [team.name, ...team.tsdb], tsdb: team.tsdb, country: '', national: true };
  return { aliases: [club], tsdb: [club], country: '' };
}

export function clubGroup(club: string): ClubGroup {
  const ref = clubRef(club);
  return ref.national ? 'SEL' : ref.country === 'Brazil' ? 'BR' : 'EU';
}

/** Normaliza nomes para comparar: sem acento, minúsculo, só letras e números separados por espaço. */
export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
