import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type DB } from '../../src/server/db.js';
import { AchievementService } from '../../src/server/services/achievements.js';
import { careerLevelFor } from '../../src/server/services/achievements-catalog.js';
import { H2HService } from '../../src/server/services/h2h.js';
import { computeUserStats, xpForDispute } from '../../src/server/services/stats.js';

/** Banco em memória com dados sintéticos conhecidos, para conferir os cálculos à mão. */
let db: DB;
const A = 'aaaa';
const B = 'bbbb';

function seed() {
  const now = '2026-10-01T12:00:00.000Z';
  for (const [id, name] of [
    [A, 'Alfa'],
    [B, 'Bravo'],
  ]) {
    db.prepare(`INSERT INTO users (id, display_name, is_guest, created_at) VALUES (?, ?, 1, ?)`).run(id, name, now);
  }
  db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES ('r', 'ROOM01', 'online', ?, 'post_dispute', '{}', 2, ?, ?)`).run(A, now, now);
  const disputes = [
    ['d1', 1, '2026-10-01T13:00:00.000Z'],
    ['d2', 2, '2026-10-02T13:00:00.000Z'],
  ] as const;
  for (const [id, seq, at] of disputes) {
    db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, result_json, started_at, finished_at) VALUES (?, 'r', ?, 'finished', 'finished', 's', '{}', '{"cupName":"Copa dos 8"}', ?, ?)`).run(id, seq, at, at);
  }
  const dp = db.prepare(
    `INSERT INTO dispute_participants (dispute_id, participant_id, user_id, team_name, is_cpu, formation, abandoned, league_position, league_points, won, drawn, lost, goals_for, goals_against, cup_reach, league_title, cup_title, rank, coins_left, spent, auction_wins, squad_average)
     VALUES (?,?,?,?,0,'4-3-3',0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  // d1: A campeão da liga e da copa sem perder; B 2º.
  dp.run('d1', `u:${A}`, A, 'Alfa', 1, 90, 28, 6, 0, 80, 20, 'campeao', 1, 1, 1, 10, 90, 9, 70.0);
  dp.run('d1', `u:${B}`, B, 'Bravo', 2, 80, 25, 5, 8, 70, 30, 'final', 0, 0, 2, 0, 100, 10, 80.0);
  // d2: B campeão da liga; A 3º.
  dp.run('d2', `u:${A}`, A, 'Alfa', 3, 70, 21, 7, 10, 60, 40, 'semi', 0, 0, 2, 5, 95, 8, 75.0);
  dp.run('d2', `u:${B}`, B, 'Bravo', 1, 85, 27, 4, 7, 75, 35, 'quartas', 1, 0, 1, 1, 99, 11, 78.0);
  // Elencos: A comprou uma Lenda por 4 moedas em d1 e tem 4 jogadores do Monte.
  const roster = db.prepare(`INSERT INTO dispute_rosters (dispute_id, participant_id, card_id, position, price, source, card_json) VALUES (?,?,?,?,?,?,?)`);
  roster.run('d1', `u:${A}`, 'c1', 'ATA', 4, 'leilao', JSON.stringify({ id: 'c1', name: 'Lenda Barata', tier: 'lenda' }));
  roster.run('d1', `u:${A}`, 'c2', 'MEI', 10, 'leilao', JSON.stringify({ id: 'c2', name: 'Meia', tier: 'titular' }));
  for (let i = 3; i <= 6; i++) roster.run('d1', `u:${A}`, `c${i}`, 'ZAG', 0, 'monte', JSON.stringify({ id: `c${i}`, name: `Monte ${i}`, tier: 'operario' }));
  // Partidas de A (ordem cronológica): V V V D E V V V V V V(5x0)
  const m = db.prepare(
    `INSERT INTO matches (dispute_id, match_id, seq, competition, stage, home_team_id, away_team_id, home_name, away_name, home_user_id, away_user_id, home_goals, away_goals) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const results: Array<[number, number]> = [
    [1, 0],
    [2, 1],
    [3, 0],
    [0, 1],
    [1, 1],
    [1, 0],
    [2, 0],
    [1, 0],
    [3, 2],
    [2, 1],
    [5, 0],
  ];
  results.forEach(([h, a], i) => m.run('d1', `L${i + 1}-1`, i + 1, 'liga', `rodada ${i + 1}`, `u:${A}`, 'bot-1', 'Alfa', 'Bot', A, null, h, a));
  // Confrontos A×B (user_a = 'aaaa' < 'bbbb').
  const c = db.prepare(
    `INSERT INTO confrontations (dispute_id, kind, ref, competition, user_a, user_b, outcome, score_a, score_b, detail_json, occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  c.run('d1', 'ciclo', 'ciclo', null, A, B, 'a', 1, 2, null, '2026-10-01T13:00:00.000Z');
  c.run('d2', 'ciclo', 'ciclo', null, A, B, 'b', 2, 1, null, '2026-10-02T13:00:00.000Z');
  c.run('d1', 'partida', 'L5-1', 'liga', A, B, 'a', 2, 0, JSON.stringify({ stage: 'rodada 5', homeTeam: `u:${A}` }), '2026-10-01T13:00:00.000Z');
  c.run('d1', 'partida', 'L24-1', 'liga', A, B, 'empate', 1, 1, JSON.stringify({ stage: 'rodada 24', homeTeam: `u:${B}` }), '2026-10-01T13:00:00.000Z');
  c.run('d2', 'partida', 'L3-2', 'liga', A, B, 'b', 0, 3, JSON.stringify({ stage: 'rodada 3', homeTeam: `u:${A}` }), '2026-10-02T13:00:00.000Z');
  c.run('d2', 'partida', 'L22-2', 'liga', A, B, 'b', 1, 2, JSON.stringify({ stage: 'rodada 22', homeTeam: `u:${B}` }), '2026-10-02T13:00:00.000Z');
  c.run('d1', 'eliminatoria', 'T-final-1', 'copa', A, B, 'a', 3, 3, JSON.stringify({ stage: 'final', penalties: { a: 5, b: 4 } }), '2026-10-01T13:00:00.000Z');
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrate(db);
  seed();
});

describe('estatísticas do usuário', () => {
  it('calcula títulos, sequências, goleadas, compras e trajetória a partir do histórico', () => {
    const s = computeUserStats(db, A);
    expect(s.disputes).toBe(2);
    expect(s.leagueTitles).toBe(1);
    expect(s.cupTitles).toBe(1);
    expect(s.titles).toBe(2);
    expect(s.doubles).toBe(1);
    expect(s.cupFinals).toBe(1);
    expect(s.podiums).toBe(2);
    expect(s.unbeatenLeagues).toBe(1);
    expect(s.cardsWon).toBe(2);
    expect(s.legendsBought).toBe(1);
    expect(s.bargainLegends).toBe(1);
    expect(s.monteChampions).toBe(1);
    expect(s.underdogTitles).toBe(1); // média 70 era a menor de d1
    expect(s.continuedCycles).toBe(1);
    expect(s.onlineDisputes).toBe(2);
    expect(s.matchesPlayed).toBe(11);
    expect(s.matchesWon).toBe(9);
    expect(s.maxWinStreak).toBe(6);
    expect(s.currentWinStreak).toBe(6);
    expect(s.maxLossStreak).toBe(1);
    expect(s.bigWins).toBe(1);
    expect(s.distinctOpponentsBeaten).toBe(1);
    const xp = xpForDispute({ league_position: 1, league_title: 1, cup_title: 1, cup_reach: 'campeao' }) + xpForDispute({ league_position: 3, league_title: 0, cup_title: 0, cup_reach: 'semi' });
    expect(s.careerXp).toBe(xp);
    expect(s.careerLevel).toBe(careerLevelFor(xp).level);
  });

  it('desbloqueia conquistas correspondentes uma única vez', () => {
    const svc = new AchievementService(db);
    const first = svc.evaluate(A, 'd2').map((a) => a.id);
    expect(first).toEqual(expect.arrayContaining(['primeira-liga', 'primeira-copa', 'dobradinha', 'invicto', 'roubo-de-lenda', 'zebra', 'rei-do-monte', 'embalado-5', 'atropelo', 'mais-uma', 'com-a-turma']));
    expect(first).not.toContain('maquina-10');
    expect(svc.evaluate(A, 'd2')).toEqual([]);
    const room = svc.trophyRoom(A);
    expect(room.totals.unlocked).toBe(first.length);
    const maquina = room.trophies.find((t) => t.id === 'maquina-10')!;
    expect(maquina.progress).toEqual({ current: 6, target: 10, ratio: 0.6 });
  });
});

describe('confronto direto', () => {
  it('soma por modalidade, aproveitamento, sequências e finais do ponto de vista de cada um', () => {
    const h2h = new H2HService(db);
    const a = h2h.detail(A, B);
    expect(a.records.ciclo).toMatchObject({ total: 2, wins: 1, draws: 0, losses: 1, pct: 50 });
    // Partidas: V, E, D, D → (3×1 + 1) / (3×4) = 33,3%
    expect(a.records.partida).toMatchObject({ total: 4, wins: 1, draws: 1, losses: 2, pct: 33.3, goalsFor: 4, goalsAgainst: 6 });
    expect(a.streaks).toEqual({ current: { type: 'D', length: 2 }, longestWin: 1, longestLoss: 2 });
    expect(a.finals).toHaveLength(1);
    expect(a.finals[0]!.result).toBe('V');
    expect(a.lastResults.map((r) => r.result)).toEqual(['D', 'D', 'E', 'V']);
    expect(a.timeline).toHaveLength(2);
    expect(a.titlesInCommon.map((t) => `${t.who}:${t.title}`).sort()).toEqual(['adversario:liga', 'eu:copa', 'eu:liga']);

    const b = h2h.detail(B, A);
    expect(b.records.partida).toMatchObject({ wins: 2, draws: 1, losses: 1 });
    expect(b.records.eliminatoria).toMatchObject({ wins: 0, losses: 1 });
    expect(b.finals[0]!.result).toBe('D');

    // Filtro por competição e período.
    const copa = h2h.detail(A, B, { competition: 'copa' });
    expect(copa.records.partida.total).toBe(0);
    expect(copa.records.eliminatoria.total).toBe(1);
    expect(copa.records.ciclo.total).toBe(0);
  });
});
