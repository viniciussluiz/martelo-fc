/**
 * Catálogo de conquistas (orientado a dados).
 * Para criar uma conquista nova basta adicionar um item aqui — desde que use uma
 * métrica existente em `UserStats` (ou uma nova métrica calculada em stats.ts).
 * Os ids são estáveis: nunca reutilize um id para outro significado.
 */

export type AchievementCategory = 'titulos' | 'leilao' | 'sequencias' | 'confrontos' | 'salas' | 'carreira' | 'especiais';
export type Rarity = 'comum' | 'rara' | 'epica' | 'lendaria';

export interface UserStats {
  disputes: number;
  leagueTitles: number;
  cupTitles: number;
  titles: number;
  doubles: number;
  cupFinals: number;
  podiums: number;
  cardsWon: number;
  legendsBought: number;
  bargainLegends: number;
  maxWinStreak: number;
  currentWinStreak: number;
  maxLossStreak: number;
  bigWins: number;
  unbeatenLeagues: number;
  distinctOpponentsBeaten: number;
  onlineDisputes: number;
  continuedCycles: number;
  careerXp: number;
  careerLevel: number;
  underdogTitles: number;
  monteChampions: number;
  matchesPlayed: number;
  matchesWon: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Critério legível exibido na Sala de Troféus. */
  criteria: string;
  icon: string;
  category: AchievementCategory;
  rarity: Rarity;
  metric: keyof UserStats;
  target: number;
  /** Conquistas secretas mostram “???” até serem desbloqueadas. */
  secret?: boolean;
}

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  titulos: 'Títulos',
  leilao: 'Leilão',
  sequencias: 'Sequências',
  confrontos: 'Confrontos',
  salas: 'Salas',
  carreira: 'Trajetória',
  especiais: 'Especiais',
};

export const RARITY_LABEL: Record<Rarity, string> = { comum: 'Comum', rara: 'Rara', epica: 'Épica', lendaria: 'Lendária' };

/** Níveis da trajetória do técnico (decisão própria, inspirada na pirâmide do modo carreira original). */
export const CAREER_LEVELS = [
  { level: 0, name: 'Várzea', xp: 0 },
  { level: 1, name: 'Série D', xp: 100 },
  { level: 2, name: 'Série C', xp: 300 },
  { level: 3, name: 'Série B', xp: 700 },
  { level: 4, name: 'Série A', xp: 1300 },
  { level: 5, name: 'Lenda do Apito', xp: 2200 },
] as const;

export const ACHIEVEMENTS: AchievementDef[] = [
  // Títulos
  { id: 'primeira-liga', name: 'Primeira Taça', description: 'Seu primeiro título de liga.', criteria: 'Seja campeão da liga 1 vez.', icon: 'taca', category: 'titulos', rarity: 'comum', metric: 'leagueTitles', target: 1 },
  { id: 'primeira-copa', name: 'Rei do Mata-Mata', description: 'Seu primeiro título de copa.', criteria: 'Vença uma copa (Copa dos 8, Taça Continental ou Torneio Mundial).', icon: 'trofeu', category: 'titulos', rarity: 'comum', metric: 'cupTitles', target: 1 },
  { id: 'dobradinha', name: 'Dobradinha', description: 'Liga e copa na mesma disputa.', criteria: 'Vença a liga e a copa no mesmo ciclo.', icon: 'coroa', category: 'titulos', rarity: 'rara', metric: 'doubles', target: 1 },
  { id: 'galeria-5', name: 'Galeria de Taças', description: 'Estante começando a encher.', criteria: 'Conquiste 5 títulos no total.', icon: 'estante', category: 'titulos', rarity: 'rara', metric: 'titles', target: 5 },
  { id: 'dinastia-15', name: 'Dinastia', description: 'Ninguém aguenta mais te ver levantando taça.', criteria: 'Conquiste 15 títulos no total.', icon: 'coroa', category: 'titulos', rarity: 'lendaria', metric: 'titles', target: 15 },
  { id: 'finalista-3', name: 'Figurinha de Final', description: 'Sempre lá na decisão.', criteria: 'Chegue a 3 finais de copa.', icon: 'apito', category: 'titulos', rarity: 'rara', metric: 'cupFinals', target: 3 },
  { id: 'podio-5', name: 'Freguês do Pódio', description: 'Constância é tudo.', criteria: 'Termine 5 ligas entre os 3 primeiros.', icon: 'podio', category: 'titulos', rarity: 'comum', metric: 'podiums', target: 5 },

  // Leilão
  { id: 'primeiro-arremate', name: 'Bateu o Martelo', description: 'Seu primeiro jogador arrematado.', criteria: 'Arremate 1 jogador no leilão.', icon: 'martelo', category: 'leilao', rarity: 'comum', metric: 'cardsWon', target: 1 },
  { id: 'arremates-25', name: 'Leiloeiro', description: 'Já conhece o pregão de cor.', criteria: 'Arremate 25 jogadores no leilão.', icon: 'martelo', category: 'leilao', rarity: 'rara', metric: 'cardsWon', target: 25 },
  { id: 'arremates-100', name: 'Dono do Pregão', description: 'O leiloeiro já te chama pelo nome.', criteria: 'Arremate 100 jogadores no leilão.', icon: 'martelo-ouro', category: 'leilao', rarity: 'epica', metric: 'cardsWon', target: 100 },
  { id: 'faro-de-lenda', name: 'Faro de Lenda', description: 'Apostou no nome certo.', criteria: 'Compre um jogador da faixa Lenda no leilão.', icon: 'estrela', category: 'leilao', rarity: 'rara', metric: 'legendsBought', target: 1 },
  { id: 'roubo-de-lenda', name: 'Roubo de Lenda', description: 'Uma Lenda por quase nada.', criteria: 'Compre uma Lenda por até 5 moedas.', icon: 'cadeado', category: 'leilao', rarity: 'epica', metric: 'bargainLegends', target: 1, secret: true },

  // Sequências
  { id: 'embalado-5', name: 'Embalado', description: 'Cinco vitórias seguidas.', criteria: 'Vença 5 partidas seguidas.', icon: 'chama', category: 'sequencias', rarity: 'comum', metric: 'maxWinStreak', target: 5 },
  { id: 'maquina-10', name: 'Máquina de Vencer', description: 'Dez vitórias seguidas.', criteria: 'Vença 10 partidas seguidas.', icon: 'raio', category: 'sequencias', rarity: 'rara', metric: 'maxWinStreak', target: 10 },
  { id: 'atropelo', name: 'Atropelo', description: 'Goleada de respeito.', criteria: 'Vença uma partida por 4 ou mais gols de diferença.', icon: 'bola', category: 'sequencias', rarity: 'comum', metric: 'bigWins', target: 1 },
  { id: 'invicto', name: 'Invicto', description: 'Uma liga inteira sem perder.', criteria: 'Termine uma liga sem nenhuma derrota.', icon: 'escudo', category: 'sequencias', rarity: 'epica', metric: 'unbeatenLeagues', target: 1 },

  // Confrontos
  { id: 'primeiro-classico', name: 'Primeiro Clássico', description: 'Venceu outro técnico de verdade.', criteria: 'Vença uma partida contra o time de outro usuário.', icon: 'alvo', category: 'confrontos', rarity: 'comum', metric: 'distinctOpponentsBeaten', target: 1 },
  { id: 'algoz-3', name: 'Algoz da Turma', description: 'Três vítimas diferentes.', criteria: 'Vença partidas contra 3 adversários diferentes.', icon: 'alvo', category: 'confrontos', rarity: 'rara', metric: 'distinctOpponentsBeaten', target: 3 },
  { id: 'temido-10', name: 'Temido no Grupo', description: 'Dez adversários diferentes já caíram.', criteria: 'Vença partidas contra 10 adversários diferentes.', icon: 'caveira', category: 'confrontos', rarity: 'epica', metric: 'distinctOpponentsBeaten', target: 10 },

  // Salas
  { id: 'com-a-turma', name: 'Pregão com a Turma', description: 'Disputa completa com amigos.', criteria: 'Conclua uma disputa com pelo menos 2 técnicos humanos.', icon: 'turma', category: 'salas', rarity: 'comum', metric: 'onlineDisputes', target: 1 },
  { id: 'mais-uma', name: 'Mais Uma!', description: 'Ficou na sala para a revanche.', criteria: 'Jogue um ciclo de continuação na mesma sala.', icon: 'repetir', category: 'salas', rarity: 'comum', metric: 'continuedCycles', target: 1 },
  { id: 'maratona-10', name: 'Maratona', description: 'A sala virou casa.', criteria: 'Jogue 10 ciclos de continuação.', icon: 'relogio', category: 'salas', rarity: 'rara', metric: 'continuedCycles', target: 10 },
  { id: 'veterano-25', name: 'Veterano', description: 'Vinte e cinco disputas no currículo.', criteria: 'Conclua 25 disputas.', icon: 'medalha', category: 'salas', rarity: 'rara', metric: 'disputes', target: 25 },

  // Trajetória (marcos de progressão)
  { id: 'trajetoria-serie-d', name: 'Saiu da Várzea', description: 'Subiu para a Série D.', criteria: 'Alcance 100 pontos de trajetória.', icon: 'escada', category: 'carreira', rarity: 'comum', metric: 'careerLevel', target: 1 },
  { id: 'trajetoria-serie-c', name: 'Acesso à Série C', description: 'O clube começa a ser notado.', criteria: 'Alcance 300 pontos de trajetória.', icon: 'escada', category: 'carreira', rarity: 'comum', metric: 'careerLevel', target: 2 },
  { id: 'trajetoria-serie-b', name: 'Acesso à Série B', description: 'Agora é sério.', criteria: 'Alcance 700 pontos de trajetória.', icon: 'escada', category: 'carreira', rarity: 'rara', metric: 'careerLevel', target: 3 },
  { id: 'trajetoria-serie-a', name: 'Elite', description: 'Chegou à Série A.', criteria: 'Alcance 1300 pontos de trajetória.', icon: 'escada', category: 'carreira', rarity: 'epica', metric: 'careerLevel', target: 4 },
  { id: 'trajetoria-lenda', name: 'Lenda do Apito', description: 'O topo da pirâmide.', criteria: 'Alcance 2200 pontos de trajetória.', icon: 'coroa', category: 'carreira', rarity: 'lendaria', metric: 'careerLevel', target: 5 },

  // Especiais (secretas)
  { id: 'zebra', name: 'Zebra', description: 'Campeão com o elenco mais fraco da sala.', criteria: 'Conquiste um título tendo a menor média de elenco entre os técnicos.', icon: 'zebra', category: 'especiais', rarity: 'epica', metric: 'underdogTitles', target: 1, secret: true },
  { id: 'rei-do-monte', name: 'Rei do Monte', description: 'Campeão com a sobra dos outros.', criteria: 'Vença a liga com 4 ou mais jogadores pegos no Monte Final.', icon: 'monte', category: 'especiais', rarity: 'epica', metric: 'monteChampions', target: 1, secret: true },
];

export function careerLevelFor(xp: number): { level: number; name: string; xp: number; nextXp: number | null } {
  let current: (typeof CAREER_LEVELS)[number] = CAREER_LEVELS[0];
  for (const l of CAREER_LEVELS) if (xp >= l.xp) current = l;
  const next = CAREER_LEVELS.find((l) => l.level === current.level + 1);
  return { level: current.level, name: current.name, xp, nextXp: next ? next.xp : null };
}
