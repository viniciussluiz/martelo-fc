/**
 * Siglas dos clubes (abreviações usadas em placares de TV) para o selo que aparece ao lado do
 * nome do clube nas cartas. O selo é um desenho genérico do próprio jogo — escudo liso nas cores
 * do clube com a sigla —, não o escudo oficial (marca registrada de cada clube). Quem tiver
 * autorização para usar os escudos oficiais pode colocá-los em `data/escudos/` (ver docs/BARALHO.md).
 */
export const CLUB_CODES: Record<string, string> = {
  // Série A 2026
  'Athletico-PR': 'CAP',
  'Atlético-MG': 'CAM',
  Bahia: 'BAH',
  Botafogo: 'BOT',
  Bragantino: 'RBB',
  Chapecoense: 'CHA',
  Corinthians: 'COR',
  Coritiba: 'CFC',
  Cruzeiro: 'CRU',
  Flamengo: 'FLA',
  Fluminense: 'FLU',
  Grêmio: 'GRE',
  Internacional: 'INT',
  Mirassol: 'MIR',
  Palmeiras: 'PAL',
  Remo: 'REM',
  Santos: 'SAN',
  'São Paulo': 'SAO',
  Vasco: 'VAS',
  Vitória: 'VIT',
  // Série B 2026
  'América-MG': 'AME',
  'Athletic-MG': 'ATH',
  'Atlético-GO': 'ACG',
  Avaí: 'AVA',
  'Botafogo-SP': 'BFC',
  Ceará: 'CEA',
  Criciúma: 'CRI',
  CRB: 'CRB',
  Cuiabá: 'CUI',
  Fortaleza: 'FOR',
  Goiás: 'GOI',
  Juventude: 'JUV',
  Londrina: 'LEC',
  Náutico: 'NAU',
  Novorizontino: 'NOV',
  'Operário-PR': 'OPE',
  'Ponte Preta': 'PON',
  'São Bernardo': 'SBC',
  Sport: 'SPT',
  'Vila Nova': 'VNO',
  // Europa
  'Manchester United': 'MUN',
  Liverpool: 'LIV',
  Chelsea: 'CHE',
  Arsenal: 'ARS',
  'Manchester City': 'MCI',
  Tottenham: 'TOT',
  'Real Madrid': 'RMA',
  Barcelona: 'BAR',
  'Atlético de Madrid': 'ATM',
  Sevilla: 'SEV',
  Valencia: 'VCF',
  Juventus: 'JUVE',
  Milan: 'MIL',
  'Inter de Milão': 'INTER',
  Roma: 'ROM',
  Napoli: 'NAP',
  Lazio: 'LAZ',
  'Bayern de Munique': 'FCB',
  'Borussia Dortmund': 'BVB',
  'Bayer Leverkusen': 'B04',
  PSG: 'PSG',
  'Olympique de Marseille': 'OM',
  Lyon: 'OL',
  Monaco: 'ASM',
  Benfica: 'SLB',
  Porto: 'FCP',
  Sporting: 'SCP',
  Ajax: 'AJA',
  PSV: 'PSV',
};

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Sigla do clube: a da tabela ou, para clubes fora dela, as iniciais (até 3 letras). */
export function clubCode(name: string): string {
  const known = CLUB_CODES[name];
  if (known) return known;
  const words = plain(name)
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w));
  if (words.length === 0) return plain(name).slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  // Iniciais; siglas já em maiúsculas (FC, EC) entram inteiras: “Tupã FC” → “TFC”.
  return words
    .slice(0, 3)
    .map((w) => (/^[A-Z0-9]+$/.test(w) ? w : w[0]))
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

/** Nome de arquivo do escudo de um clube em `data/escudos/` (ex.: "São Paulo" → "sao-paulo"). */
export function clubSlug(name: string): string {
  return plain(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
