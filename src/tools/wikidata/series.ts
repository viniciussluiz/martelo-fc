import type { Series } from '../../engine/types.js';

/**
 * Clubes que viram cartas (QIDs do Wikidata): a Série A e a Série B do Brasileirão de 2026
 * e os grandes clubes da Europa. O baralho real só usa passagens por estes clubes; cada carta
 * leva o grupo do clube, e a sala escolhe com quais grupos joga.
 *
 * Para outra temporada: troque a lista, rode `npm run deck:wikidata` (busca e monta).
 * Cores dos uniformes são fato público e servem só para as figurinhas ilustradas.
 */
export interface SeriesClub {
  qid: string;
  name: string;
  series: Series;
  kit: [string, string];
}

export const SERIES_SEASON = 2026;

export const SERIES_CLUBS: SeriesClub[] = [
  // Série A 2026
  { qid: 'Q506832', name: 'Athletico-PR', series: 'A', kit: ['#C8102E', '#111111'] },
  { qid: 'Q270995', name: 'Atlético-MG', series: 'A', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q198032', name: 'Bahia', series: 'A', kit: ['#0055A4', '#E30613'] },
  { qid: 'Q80958', name: 'Botafogo', series: 'A', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q541744', name: 'Bragantino', series: 'A', kit: ['#FFFFFF', '#D50000'] },
  { qid: 'Q2536715', name: 'Chapecoense', series: 'A', kit: ['#00843D', '#FFFFFF'] },
  { qid: 'Q35933', name: 'Corinthians', series: 'A', kit: ['#FFFFFF', '#111111'] },
  { qid: 'Q478317', name: 'Coritiba', series: 'A', kit: ['#00613A', '#FFFFFF'] },
  { qid: 'Q188277', name: 'Cruzeiro', series: 'A', kit: ['#0033A0', '#FFFFFF'] },
  { qid: 'Q17479', name: 'Flamengo', series: 'A', kit: ['#C8102E', '#111111'] },
  { qid: 'Q80987', name: 'Fluminense', series: 'A', kit: ['#7A1E32', '#00613A'] },
  { qid: 'Q221695', name: 'Grêmio', series: 'A', kit: ['#0D80BF', '#111111'] },
  { qid: 'Q80845', name: 'Internacional', series: 'A', kit: ['#D50000', '#FFFFFF'] },
  { qid: 'Q2622870', name: 'Mirassol', series: 'A', kit: ['#FFD200', '#00843D'] },
  { qid: 'Q80964', name: 'Palmeiras', series: 'A', kit: ['#006437', '#FFFFFF'] },
  { qid: 'Q2552872', name: 'Remo', series: 'A', kit: ['#0B1F4D', '#FFFFFF'] },
  { qid: 'Q80955', name: 'Santos', series: 'A', kit: ['#FFFFFF', '#111111'] },
  { qid: 'Q38568', name: 'São Paulo', series: 'A', kit: ['#FFFFFF', '#D0021B'] },
  { qid: 'Q5014111', name: 'Vasco', series: 'A', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q274465', name: 'Vitória', series: 'A', kit: ['#D50000', '#111111'] },
  // Série B 2026
  { qid: 'Q338285', name: 'América-MG', series: 'B', kit: ['#00843D', '#111111'] },
  { qid: 'Q9636189', name: 'Athletic-MG', series: 'B', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q198034', name: 'Atlético-GO', series: 'B', kit: ['#D50000', '#111111'] },
  { qid: 'Q374069', name: 'Avaí', series: 'B', kit: ['#0055A4', '#FFFFFF'] },
  { qid: 'Q2332493', name: 'Botafogo-SP', series: 'B', kit: ['#D50000', '#FFFFFF'] },
  { qid: 'Q1052219', name: 'Ceará', series: 'B', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q598834', name: 'Criciúma', series: 'B', kit: ['#FFD200', '#111111'] },
  { qid: 'Q1024264', name: 'CRB', series: 'B', kit: ['#D50000', '#FFFFFF'] },
  { qid: 'Q2945011', name: 'Cuiabá', series: 'B', kit: ['#00843D', '#FFD200'] },
  { qid: 'Q188841', name: 'Fortaleza', series: 'B', kit: ['#D50000', '#0033A0'] },
  { qid: 'Q816779', name: 'Goiás', series: 'B', kit: ['#00613A', '#FFFFFF'] },
  { qid: 'Q910453', name: 'Juventude', series: 'B', kit: ['#00843D', '#FFFFFF'] },
  { qid: 'Q1633430', name: 'Londrina', series: 'B', kit: ['#5BC2E7', '#FFFFFF'] },
  { qid: 'Q73971', name: 'Náutico', series: 'B', kit: ['#D50000', '#FFFFFF'] },
  { qid: 'Q10292312', name: 'Novorizontino', series: 'B', kit: ['#FFD200', '#111111'] },
  { qid: 'Q2580083', name: 'Operário-PR', series: 'B', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q219120', name: 'Ponte Preta', series: 'B', kit: ['#111111', '#FFFFFF'] },
  { qid: 'Q557103', name: 'São Bernardo', series: 'B', kit: ['#FFD200', '#111111'] },
  { qid: 'Q219098', name: 'Sport', series: 'B', kit: ['#D50000', '#111111'] },
  { qid: 'Q1513287', name: 'Vila Nova', series: 'B', kit: ['#D50000', '#FFFFFF'] },
  // Grandes da Europa (só os mais conhecidos, para ninguém dar lance em time que nunca viu)
  { qid: 'Q18656', name: 'Manchester United', series: 'EU', kit: ['#DA291C', '#111111'] },
  { qid: 'Q1130849', name: 'Liverpool', series: 'EU', kit: ['#C8102E', '#FFFFFF'] },
  { qid: 'Q9616', name: 'Chelsea', series: 'EU', kit: ['#034694', '#FFFFFF'] },
  { qid: 'Q9617', name: 'Arsenal', series: 'EU', kit: ['#EF0107', '#FFFFFF'] },
  { qid: 'Q50602', name: 'Manchester City', series: 'EU', kit: ['#6CABDD', '#FFFFFF'] },
  { qid: 'Q18741', name: 'Tottenham', series: 'EU', kit: ['#FFFFFF', '#132257'] },
  { qid: 'Q8682', name: 'Real Madrid', series: 'EU', kit: ['#FFFFFF', '#FEBE10'] },
  { qid: 'Q7156', name: 'Barcelona', series: 'EU', kit: ['#A50044', '#004D98'] },
  { qid: 'Q8701', name: 'Atlético de Madrid', series: 'EU', kit: ['#CB3524', '#FFFFFF'] },
  { qid: 'Q10329', name: 'Sevilla', series: 'EU', kit: ['#FFFFFF', '#D50000'] },
  { qid: 'Q10333', name: 'Valencia', series: 'EU', kit: ['#FFFFFF', '#111111'] },
  { qid: 'Q1422', name: 'Juventus', series: 'EU', kit: ['#FFFFFF', '#111111'] },
  { qid: 'Q1543', name: 'Milan', series: 'EU', kit: ['#FB090B', '#111111'] },
  { qid: 'Q631', name: 'Inter de Milão', series: 'EU', kit: ['#0068A8', '#111111'] },
  { qid: 'Q2739', name: 'Roma', series: 'EU', kit: ['#8E1F2F', '#F0BC42'] },
  { qid: 'Q2641', name: 'Napoli', series: 'EU', kit: ['#12A0D7', '#FFFFFF'] },
  { qid: 'Q2609', name: 'Lazio', series: 'EU', kit: ['#87D8F7', '#FFFFFF'] },
  { qid: 'Q15789', name: 'Bayern de Munique', series: 'EU', kit: ['#DC052D', '#FFFFFF'] },
  { qid: 'Q41420', name: 'Borussia Dortmund', series: 'EU', kit: ['#FDE100', '#111111'] },
  { qid: 'Q104761', name: 'Bayer Leverkusen', series: 'EU', kit: ['#E32221', '#111111'] },
  { qid: 'Q483020', name: 'PSG', series: 'EU', kit: ['#004170', '#DA291C'] },
  { qid: 'Q132885', name: 'Olympique de Marseille', series: 'EU', kit: ['#FFFFFF', '#2FAEE0'] },
  { qid: 'Q704', name: 'Lyon', series: 'EU', kit: ['#FFFFFF', '#1E3A8A'] },
  { qid: 'Q180305', name: 'Monaco', series: 'EU', kit: ['#E2001A', '#FFFFFF'] },
  { qid: 'Q131499', name: 'Benfica', series: 'EU', kit: ['#E83030', '#FFFFFF'] },
  { qid: 'Q128446', name: 'Porto', series: 'EU', kit: ['#003893', '#FFFFFF'] },
  { qid: 'Q75729', name: 'Sporting', series: 'EU', kit: ['#008057', '#FFFFFF'] },
  { qid: 'Q81888', name: 'Ajax', series: 'EU', kit: ['#FFFFFF', '#D2122E'] },
  { qid: 'Q11938', name: 'PSV', series: 'EU', kit: ['#ED1C24', '#FFFFFF'] },
];

/** Corte de artigos na Wikipédia ao buscar jogadores de cada tipo de clube (grandes da Europa têm milhares). */
export const MIN_SITELINKS = { brBig: 8, brSmall: 3, europe: 30 } as const;
