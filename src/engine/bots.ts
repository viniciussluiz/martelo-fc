import { Rng } from './rng.js';
import type { SquadPlayer, TeamSheet } from './match.js';
import { FORMATIONS, POSITIONS, type Formation } from './types.js';

/**
 * Clubes controlados pelo jogo que completam a liga (até 20) e a fase de grupos
 * das copas continentais. Nomes e elencos são fictícios e gerados por semente.
 */

export const LEAGUE_BOT_NAMES = [
  'Tubarões do Cais', 'Unidos da Várzea', 'Bola Murcha FC', 'Real Pelada', 'Galácticos do Bairro',
  'Juventude Estrelada', 'Atlético Fim de Semana', 'Canela Fina EC', 'Esquadrão Relâmpago', 'Sociedade Esportiva Pastel',
  'Leões da Garagem', 'Racing do Morro', 'Inter de Quintal', 'Dínamo da Praça', 'Sporting Pé de Pano',
  'Clube dos Veteranos', 'Expresso da Baixada', 'Carcarás FC', 'Furacão do Cerrado', 'Estrela do Mangue',
];

export const CONTINENTAL_BOT_NAMES = [
  'Deportivo Cordillera', 'Club Atlético Pampa Viejo', 'Nacional del Puerto', 'Independiente Altiplano',
  'Sporting Valle Sagrado', 'Unión Ribereña', 'Real Andino', 'Club Social Malvinas',
  'Atlético Bahía Serena', 'Deportes Patagonia', 'Celeste Montevidano', 'Cerro Azul FC',
  'Universitario Sierra', 'Defensor del Lago', 'Franja del Chaco', 'Yaguareté Central',
  'Volcán del Norte', 'Marea del Pacífico', 'Azules del Valle', 'Tiburón Caribeño',
  'Alianza Costera', 'Cristal de los Andes', 'Altura Paceña', 'Cóndor do Sul',
  'Carbonero Antiguo', 'Obreros Serranos', 'Granate Ferroviario', 'Tigres del Desierto',
];

const BOT_FIRST = ['Beto', 'Cadu', 'Dênis', 'Éder', 'Fábio', 'Gil', 'Hugo', 'Igor', 'Jorge', 'Kleber', 'Léo', 'Mauro', 'Nando', 'Otávio', 'Paulo', 'Rui', 'Sandro', 'Téo', 'Vado', 'Wilson'];
const BOT_LAST = ['Souza', 'Lima', 'Prado', 'Rocha', 'Matos', 'Pires', 'Viana', 'Campos', 'Teles', 'Nery', 'Lobo', 'Rangel', 'Sales', 'Fontes', 'Brito'];
const LATIN_FIRST = ['Matías', 'Facundo', 'Rodrigo', 'Nahuel', 'Santiago', 'Joaquín', 'Thiago', 'Gonzalo', 'Ignacio', 'Lautaro', 'Agustín', 'Bruno'];
const LATIN_LAST = ['Ferreyra', 'Acosta', 'Benítez', 'Cáceres', 'Domínguez', 'Godoy', 'Ibarra', 'Medina', 'Ortiz', 'Quiroga', 'Sosa', 'Villalba'];

export interface BotClub extends TeamSheet {
  formation: Formation;
  continental: boolean;
}

export function makeBotClub(params: { id: string; name: string; seed: string; strength: number; continental?: boolean }): BotClub {
  const rng = new Rng(params.seed);
  const formation: Formation = rng.next() < 0.5 ? '4-3-3' : '4-4-2';
  const squad: SquadPlayer[] = [];
  let n = 0;
  for (const pos of POSITIONS) {
    for (let i = 0; i < FORMATIONS[formation][pos]; i++) {
      n++;
      const mid = Math.round(rng.normal(params.strength, 5));
      const width = rng.int(6, 10);
      const levelMin = Math.max(40, Math.min(94, mid - Math.floor(width / 2)));
      const levelMax = Math.min(99, levelMin + width);
      const name = params.continental
        ? `${rng.pick(LATIN_FIRST)} ${rng.pick(LATIN_LAST)}`
        : `${rng.pick(BOT_FIRST)} ${rng.pick(BOT_LAST)}`;
      squad.push({ cardId: `${params.id}-p${n}`, name, position: pos, levelMin, levelMax });
    }
  }
  return { teamId: params.id, name: params.name, squad, formation, continental: !!params.continental };
}

/**
 * Forças dos clubes do jogo espalhadas por igual entre `ref + from` e `ref + to` (com um pouco de ruído),
 * onde `ref` é a média dos elencos montados no leilão. Assim a liga tem clubes do jogo do nível dos
 * técnicos (que brigam pelo título) até os bem mais fracos (que brigam contra o rebaixamento) —
 * qualquer que seja o baralho. Sem `ref`, usa a faixa fixa antiga.
 */
export function botStrengths(count: number, rng: Rng, ref: number | undefined, from: number, to: number, fallback: [number, number]): number[] {
  if (ref === undefined || !Number.isFinite(ref)) return Array.from({ length: count }, () => rng.int(fallback[0], fallback[1]));
  const steps = Array.from({ length: count }, (_, i) => (count === 1 ? (from + to) / 2 : from + ((to - from) * i) / (count - 1)));
  return rng.shuffle(steps).map((d) => Math.round(Math.max(45, Math.min(92, ref + d + rng.normal(0, 0.8)))));
}

/** Clubes da liga: do nível médio dos técnicos (+1) até 9 pontos abaixo. */
export const LEAGUE_BOT_SPREAD: [number, number] = [-11, -1];
/** Clubes do continente na copa: um pouco mais fortes que os da liga. */
export const CONTINENTAL_BOT_SPREAD: [number, number] = [-9, 1];

export function makeLeagueBots(count: number, seed: string, ref?: number): BotClub[] {
  const rng = new Rng(`bots:${seed}`);
  const names = rng.shuffle(LEAGUE_BOT_NAMES).slice(0, count);
  const strengths = botStrengths(names.length, rng, ref, LEAGUE_BOT_SPREAD[0], LEAGUE_BOT_SPREAD[1], [66, 77]);
  return names.map((name, i) => makeBotClub({ id: `bot-${i + 1}`, name, seed: `${seed}:bot:${i}`, strength: strengths[i]! }));
}

export function makeContinentalBots(count: number, seed: string, ref?: number): BotClub[] {
  const rng = new Rng(`cont:${seed}`);
  const names = rng.shuffle(CONTINENTAL_BOT_NAMES).slice(0, count);
  const strengths = botStrengths(names.length, rng, ref, CONTINENTAL_BOT_SPREAD[0], CONTINENTAL_BOT_SPREAD[1], [68, 80]);
  return names.map((name, i) =>
    makeBotClub({ id: `cont-${i + 1}`, name, seed: `${seed}:cont:${i}`, strength: strengths[i]!, continental: true }),
  );
}
