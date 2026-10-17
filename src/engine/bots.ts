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

export function makeLeagueBots(count: number, seed: string): BotClub[] {
  const rng = new Rng(`bots:${seed}`);
  const names = rng.shuffle(LEAGUE_BOT_NAMES).slice(0, count);
  return names.map((name, i) =>
    makeBotClub({ id: `bot-${i + 1}`, name, seed: `${seed}:bot:${i}`, strength: rng.int(66, 77) }),
  );
}

export function makeContinentalBots(count: number, seed: string): BotClub[] {
  const rng = new Rng(`cont:${seed}`);
  const names = rng.shuffle(CONTINENTAL_BOT_NAMES).slice(0, count);
  return names.map((name, i) =>
    makeBotClub({ id: `cont-${i + 1}`, name, seed: `${seed}:cont:${i}`, strength: rng.int(68, 80), continental: true }),
  );
}
