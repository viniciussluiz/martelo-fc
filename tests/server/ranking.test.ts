import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT_DIR } from '../../src/server/config.js';
import { migrate, openDatabase, type DB } from '../../src/server/db.js';
import { RankingService } from '../../src/server/services/ranking.js';
import { api, cleanupDir, startTestApp, TestClient, type TestEnv } from './harness.js';

const MIGRATIONS = resolve(ROOT_DIR, 'migrations');
const RANKING_MIGRATION = '009_ranking.sql';

/** Banco com as migrações até a 008: o “histórico antigo”, antes da tabela do ranking existir. */
function legacyDb(): { db: DB; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const f of readdirSync(MIGRATIONS).filter((f) => f < RANKING_MIGRATION)) copyFileSync(join(MIGRATIONS, f), join(dir, f));
  const db = openDatabase(':memory:');
  migrate(db, dir);
  return { db, dir };
}

/** Só o preenchimento do histórico da migração 009 (o INSERT), para rodar de novo num banco já migrado. */
function backfillSql(): string {
  const sql = readFileSync(join(MIGRATIONS, RANKING_MIGRATION), 'utf8');
  return sql.slice(sql.indexOf('WITH side AS'));
}

const ENTRY_COLS = `dispute_id, user_id, room_id, finished_at, season, cup_format, skip_league, humans, technicians, league_won, league_drawn,
  league_lost, cup_won, cup_drawn, cup_lost, goals_for, goals_against, league_title, cup_title`;

describe('migração 009: histórico antigo', () => {
  let db: DB;
  let dir: string;
  beforeAll(() => {
    ({ db, dir } = legacyDb());
    const at = '2026-10-01T12:00:00.000Z';
    const user = db.prepare(`INSERT INTO users (id, display_name, is_guest, created_at) VALUES (?, ?, ?, ?)`);
    user.run('ana', 'Ana FC', 0, at);
    user.run('bia', 'Bia FC', 0, at);
    user.run('vis', 'Visitante FC', 1, at);
    db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES ('r1', 'AAA111', 'online', 'ana', 'post_dispute', '{}', 3, ?, ?)`).run(at, at);
    const disp = db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, result_json, started_at, finished_at) VALUES (?, 'r1', ?, ?, 'finished', 's', ?, '{}', ?, ?)`);
    // d1: Libertadores, termina 23h30 de 30/11 em Brasília (ainda é novembro).
    disp.run('d1', 1, 'finished', JSON.stringify({ cupFormat: 'libertadores' }), at, '2026-12-01T02:30:00.000Z');
    // d2: Só Libertadores (sem liga), em outubro.
    disp.run('d2', 2, 'finished', JSON.stringify({ cupFormat: 'libertadores', skipLeague: true }), at, '2026-10-05T15:00:00.000Z');
    // d3: abortada: não entra.
    disp.run('d3', 3, 'aborted', JSON.stringify({ cupFormat: 'mundial' }), at, '2026-10-06T15:00:00.000Z');
    const dp = db.prepare(
      `INSERT INTO dispute_participants (dispute_id, participant_id, user_id, team_name, is_cpu, formation, abandoned, league_position, league_points, won, drawn, lost, goals_for, goals_against, cup_reach, league_title, cup_title, rank, coins_left, spent, auction_wins, squad_average)
       VALUES (?,?,?,?,?,'4-3-3',?,1,0,0,0,0,0,0,NULL,?,?,1,0,100,11,80)`,
    );
    dp.run('d1', 'u:ana', 'ana', 'Ana FC', 0, 0, 1, 1);
    dp.run('d1', 'u:bia', 'bia', 'Bia FC', 0, 1, 0, 0); // abandonou: fica fora
    dp.run('d1', 'u:vis', 'vis', 'Visitante FC', 0, 0, 0, 0);
    dp.run('d1', 'cpu:1', null, 'Robô', 1, 0, 0, 0);
    dp.run('d2', 'u:ana', 'ana', 'Ana FC', 0, 0, 0, 1);
    dp.run('d3', 'u:ana', 'ana', 'Ana FC', 0, 0, 1, 0);
    const m = db.prepare(
      `INSERT INTO matches (dispute_id, match_id, seq, competition, stage, home_team_id, away_team_id, home_name, away_name, home_user_id, away_user_id, home_goals, away_goals, pen_home, pen_away) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    let n = 0;
    const play = (d: string, comp: 'liga' | 'copa', home: string | null, away: string | null, hg: number, ag: number, pens: [number, number] | null = null) =>
      m.run(d, `M${++n}`, n, comp, comp === 'liga' ? 'rodada 1' : 'final', home ? `u:${home}` : 'bot', away ? `u:${away}` : 'bot', 'x', 'y', home, away, hg, ag, pens?.[0] ?? null, pens?.[1] ?? null);
    play('d1', 'liga', 'ana', null, 2, 0); // Ana V
    play('d1', 'liga', null, 'ana', 1, 1); // Ana E
    play('d1', 'liga', 'ana', 'vis', 0, 3); // Ana D, Visitante V
    play('d1', 'copa', 'ana', null, 1, 1, [5, 4]); // pênaltis = empate
    play('d1', 'copa', null, 'ana', 0, 2); // Ana V
    play('d2', 'copa', 'ana', null, 3, 1); // Só Libertadores: só copa
    play('d3', 'liga', 'ana', null, 9, 0); // abortada
    migrate(db); // aplica a 009
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('cria uma linha por humano que terminou a disputa, com liga e copa separadas', () => {
    const rows = db.prepare(`SELECT ${ENTRY_COLS} FROM ranking_entries ORDER BY dispute_id, user_id`).all() as any[];
    expect(rows.map((r) => `${r.dispute_id}/${r.user_id}`)).toEqual(['d1/ana', 'd1/vis', 'd2/ana']);
    const d1 = rows[0];
    expect(d1).toMatchObject({ season: '2026-11', cup_format: 'libertadores', skip_league: 0, humans: 2, technicians: 4 });
    expect(d1).toMatchObject({ league_won: 1, league_drawn: 1, league_lost: 1, cup_won: 1, cup_drawn: 1, cup_lost: 0, goals_for: 6, goals_against: 5 });
    expect(d1).toMatchObject({ league_title: 1, cup_title: 1 });
    expect(rows[1]).toMatchObject({ league_won: 1, league_lost: 0, goals_for: 3, goals_against: 0 });
    expect(rows[2]).toMatchObject({ season: '2026-10', skip_league: 1, league_won: 0, cup_won: 1, cup_title: 1 });
  });

  it('ranking: pontos, temporada e visitante fora da lista', () => {
    const r = new RankingService(db);
    // Ana em novembro: jogos 3+1+0 + 3+1 = 8; liga 100 + Libertadores 200.
    const nov = r.view('2026-11', 'ana');
    expect(nov.rows.map((x) => [x.userId, x.points])).toEqual([['ana', 308]]);
    expect(nov.rows[0]).toMatchObject({ pointsGames: 8, pointsTitles: 300, won: 2, drawn: 2, lost: 1, disputes: 1, titles: { mundial: 0, libertadores: 1, liga: 1, copa8: 0 } });
    // Geral: + Só Libertadores (3 + 200).
    expect(r.view(null, null).rows[0]).toMatchObject({ userId: 'ana', points: 511, disputes: 2 });
    // Visitante pontua (3), mas não entra na lista: a linha dele vem com posição 0.
    const vis = r.view('2026-11', 'vis');
    expect(vis.total).toBe(1);
    expect(vis.me).toMatchObject({ userId: 'vis', position: 0, points: 3 });
    expect(r.standing('vis', null)).toEqual({ position: null, points: 3, total: 1 });
    // Bia abandonou: nada.
    expect(r.standing('bia', null)).toBeNull();
    expect(r.view('2026-11', null).seasons).toEqual(expect.arrayContaining(['2026-11', '2026-10']));
  });

  it('perfil: números por competição, com Só Libertadores na Libertadores', () => {
    const r = new RankingService(db);
    expect(r.byCompetition('ana')).toEqual([
      { competition: 'liga', label: 'Liga', editions: 1, titles: 1, played: 3, won: 1, drawn: 1, lost: 1 },
      { competition: 'libertadores', label: 'Taça Libertadores', editions: 2, titles: 2, played: 3, won: 2, drawn: 1, lost: 0 },
    ]);
  });

  it('o que a disputa rendeu', () => {
    const r = new RankingService(db);
    expect(r.gain('d1', 'ana')).toMatchObject({ points: { jogos: 8, titulos: 300, total: 308 }, titles: ['libertadores', 'liga'], season: '2026-11', position: 1, guest: false });
    expect(r.gain('d1', 'vis')).toMatchObject({ points: { total: 3 }, position: null, guest: true });
    expect(r.gain('d1', 'bia')).toBeNull();
  });
});

describe('desempate', () => {
  it('pontos, depois títulos de Mundial e Libertadores, títulos, vitórias e saldo', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const at = '2026-11-01T12:00:00.000Z';
    db.prepare(`INSERT INTO users (id, display_name, is_guest, created_at) VALUES ('h', 'Host', 0, ?)`).run(at);
    db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES ('r', 'R', 'solo', 'h', 'lobby', '{}', 1, ?, ?)`).run(at, at);
    const user = db.prepare(`INSERT INTO users (id, display_name, is_guest, created_at) VALUES (?, ?, 0, ?)`);
    const disp = db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, started_at, finished_at) VALUES (?, 'r', ?, 'finished', 'finished', 's', '{}', ?, ?)`);
    const e = db.prepare(
      `INSERT INTO ranking_entries (${ENTRY_COLS}) VALUES (?, ?, 'r', ?, '2026-11', ?, 0, 1, 4, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)`,
    );
    let seq = 0;
    // [id, formato, vitórias, empates, gols pró, gols contra, título liga, título copa, terminou em]
    const add = (id: string, fmt: string, w: number, d: number, gf: number, ga: number, lt: number, ct: number, when = at) => {
      user.run(id, id.toUpperCase(), at);
      disp.run(`d-${id}`, ++seq, at, when);
      e.run(`d-${id}`, id, when, fmt, w, d, gf, ga, lt, ct);
    };
    add('mun', 'mundial', 0, 0, 0, 0, 1, 1); // 100 + 200 = 300, com Mundial
    add('dup', 'copa8', 0, 0, 0, 0, 1, 1); // 100 + 50 = 150
    add('tit', 'copa8', 0, 50, 0, 0, 1, 0); // 50 + 100 = 150, 1 título
    add('jog', 'copa8', 100, 0, 0, 0, 0, 0); // 300 só de jogos
    add('a', 'nenhuma', 10, 0, 20, 5, 0, 0); // 30, saldo +15
    add('b', 'nenhuma', 10, 0, 20, 10, 0, 0); // 30, saldo +10
    add('c', 'nenhuma', 10, 0, 20, 10, 0, 0, '2026-11-02T12:00:00.000Z'); // 30, chegou depois de b
    const order = new RankingService(db).view('2026-11', null).rows.map((r) => r.userId);
    expect(order).toEqual(['mun', 'jog', 'dup', 'tit', 'a', 'b', 'c']);
  });
});

describe('ranking ao vivo', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await startTestApp();
  });
  afterAll(async () => {
    await env.stop();
    cleanupDir(env.dir);
  });

  it('a disputa grava a linha do ranking, igual à conta do histórico, e a API mostra o técnico depois de criar a conta', async () => {
    const ana = await TestClient.guest(env.app, 'Ana FC');
    const { data } = await api(env.app, 'POST', '/api/rooms', { mode: 'solo', settings: { cpuCount: 3, cupFormat: 'libertadores' } }, ana.token);
    await ana.send({ t: 'room:join', code: data.code });
    await ana.waitFor((r) => r?.code === data.code, 5000, 'entrar na sala');
    await ana.send({ t: 'room:start' });
    const end = await ana.waitFor((r) => r?.status === 'post_dispute' && !!r.continuation, 60_000, 'fim da disputa');
    const disputeId = end!.lastResult!.disputeId;
    const db = env.app.db;

    const live = db.prepare(`SELECT ${ENTRY_COLS} FROM ranking_entries WHERE dispute_id = ?`).all(disputeId) as any[];
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ user_id: ana.userId, cup_format: 'libertadores', skip_league: 0, humans: 1, technicians: 4 });
    // Liga de 20 times: 38 jogos.
    expect(live[0].league_won + live[0].league_drawn + live[0].league_lost).toBe(38);
    const mine = end!.lastResult!.outcomes.find((o) => o.userId === ana.userId)!;
    expect(live[0].league_won).toBe(mine.leagueRecord.won);
    expect(live[0].league_title).toBe(mine.titles.includes('liga') ? 1 : 0);

    // A conta da migração (a partir de `matches`) dá exatamente o mesmo.
    db.prepare('DELETE FROM ranking_entries').run();
    db.exec(backfillSql());
    const migrated = db.prepare(`SELECT ${ENTRY_COLS} FROM ranking_entries WHERE dispute_id = ?`).all(disputeId);
    expect(migrated).toEqual(live);
    env.app.ranking.invalidate();

    // Visitante: pontua, mas não aparece na lista.
    const anon = await api(env.app, 'GET', '/api/ranking');
    expect(anon.status).toBe(200);
    expect(anon.data.rows).toEqual([]);
    expect(anon.data.me).toBeNull();
    const asGuest = await api(env.app, 'GET', '/api/ranking?temporada=geral', undefined, ana.token);
    expect(asGuest.data.season).toBeNull();
    expect(asGuest.data.me).toMatchObject({ userId: ana.userId, position: 0 });
    const gain = await api(env.app, 'GET', `/api/ranking/disputa/${disputeId}`, undefined, ana.token);
    expect(gain.data.gain).toMatchObject({ disputeId, guest: true, position: null });
    expect(gain.data.gain.points.total).toBe(asGuest.data.me.points);

    // Criou a conta: entra na lista, em 1º.
    const up = await api(env.app, 'POST', '/api/auth/upgrade', { email: 'ana@exemplo.com', password: 'segredo123' }, ana.token);
    expect(up.status).toBe(200);
    const after = await api(env.app, 'GET', '/api/ranking', undefined, ana.token);
    expect(after.data.rows).toHaveLength(1);
    expect(after.data.rows[0]).toMatchObject({ userId: ana.userId, position: 1, name: 'Ana FC' });
    expect(after.data.me.position).toBe(1);
    expect(after.data.weights).toMatchObject({ vitoria: 3, empate: 1, mundial: 200, libertadores: 200, liga: 100, copa8: 50 });

    // Perfil: posição e números por competição.
    const prof = await api(env.app, 'GET', `/api/users/${ana.userId}/profile`, undefined, ana.token);
    expect(prof.data.ranking.seasonStanding).toMatchObject({ position: 1, total: 1 });
    expect(prof.data.byCompetition[0]).toMatchObject({ competition: 'liga', editions: 1, played: 38 });

    // Ranking da sala (pelo código) e sala que não existe.
    const room = await api(env.app, 'GET', `/api/rooms/${data.code}/ranking`, undefined, ana.token);
    expect(room.data.cycles).toBe(1);
    expect(room.data.rows).toEqual([expect.objectContaining({ userId: ana.userId, position: 1, guest: false })]);
    expect((await api(env.app, 'GET', '/api/rooms/ZZZZZZ/ranking', undefined, ana.token)).status).toBe(404);

        // Temporada inválida cai na atual; um mês sem ninguém vem vazio.
    expect((await api(env.app, 'GET', '/api/ranking?temporada=xyz')).data.season).toBe(after.data.current);
    expect((await api(env.app, 'GET', '/api/ranking?temporada=2020-01')).data.rows).toEqual([]);
    ana.close();
  });
});

describe('temporadas, sala e filtro só online', () => {
  /** Banco com técnicos e uma linha de ranking por disputa, sem passar pelo jogo. */
  function seeded() {
    const db = openDatabase(':memory:');
    migrate(db);
    const at = '2026-11-01T12:00:00.000Z';
    db.prepare(`INSERT INTO users (id, display_name, is_guest, created_at) VALUES ('host', 'Host', 0, ?)`).run(at);
    for (const r of ['sala-a', 'sala-b'])
      db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES (?, ?, 'online', 'host', 'lobby', '{}', 1, ?, ?)`).run(
        r,
        r.toUpperCase().replace('-', ''),
        at,
        at,
      );
    const user = db.prepare(`INSERT OR IGNORE INTO users (id, display_name, is_guest, created_at) VALUES (?, ?, ?, ?)`);
    const disp = db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, started_at, finished_at) VALUES (?, ?, ?, 'finished', 'finished', 's', '{}', ?, ?)`);
    const e = db.prepare(
      `INSERT INTO ranking_entries (${ENTRY_COLS}) VALUES (?, ?, ?, ?, ?, 'nenhuma', 0, ?, 4, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
    );
    let n = 0;
    /** Uma disputa: `wins` vitórias (3 pontos cada) para o técnico, na temporada e sala dadas. */
    const play = (id: string, wins: number, opts: { season?: string; room?: string; humans?: number; guest?: boolean } = {}) => {
      const season = opts.season ?? '2026-11';
      const when = `${season}-10T12:00:00.000Z`;
      user.run(id, id.toUpperCase(), opts.guest ? 1 : 0, at);
      const d = `d${++n}`;
      disp.run(d, opts.room ?? 'sala-a', n, when, when);
      e.run(d, id, opts.room ?? 'sala-a', when, season, opts.humans ?? 2, wins);
    };
    return { db, play };
  }

  it('fecha a temporada que acabou uma vez só: grava o top 10 e dá as conquistas', async () => {
    const { AchievementService } = await import('../../src/server/services/achievements.js');
    const { db, play } = seeded();
    for (let i = 1; i <= 12; i++) play(`t${String(i).padStart(2, '0')}`, 30 - i); // t01 lidera
    play('vis', 99, { guest: true }); // visitante não entra
    play('t01', 1, { season: '2026-10' }); // antes da primeira temporada com prêmio
    play('t02', 1, { season: '2026-12' }); // temporada em andamento
    const achievements = new AchievementService(db);
    const r = new RankingService(db, achievements);

    // Ainda em novembro: nada fecha.
    expect(r.closeSeasons(Date.parse('2026-11-30T20:00:00.000Z'))).toEqual([]);
    const dec = Date.parse('2026-12-02T12:00:00.000Z');
    const closed = r.closeSeasons(dec);
    expect(closed.map((c) => [c.season, c.technicians, c.top.length])).toEqual([['2026-11', 12, 10]]);
    expect(closed[0]!.top[0]).toMatchObject({ userId: 't01', position: 1, points: 87 });
    expect(r.closeSeasons(dec)).toEqual([]);

    const unlocked = (u: string) => (db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').pluck().all(u) as string[]).sort();
    expect(unlocked('t01')).toEqual(expect.arrayContaining(['campeao-temporada', 'top10-temporada']));
    expect(unlocked('t10')).toContain('top10-temporada');
    expect(unlocked('t10')).not.toContain('campeao-temporada');
    expect(unlocked('t11')).not.toContain('top10-temporada');
    expect(unlocked('vis')).toEqual([]);

    // Página de uma temporada encerrada.
    const v = r.view('2026-11', null, {}, dec);
    expect(v.closed).toBe(true);
    expect(r.view('2026-12', null, {}, dec).closed).toBe(false);
  });

  it('temporada com poucos técnicos: campeão só com alguém para vencer, top 10 só com mais de 10', async () => {
    const { AchievementService } = await import('../../src/server/services/achievements.js');
    const { db, play } = seeded();
    play('sozinho', 10);
    const r = new RankingService(db, new AchievementService(db));
    r.closeSeasons(Date.parse('2026-12-02T12:00:00.000Z'));
    expect(db.prepare('SELECT position FROM season_awards WHERE user_id = ?').pluck().get('sozinho')).toBe(1);
    expect(db.prepare('SELECT COUNT(*) FROM user_achievements WHERE user_id = ?').pluck().get('sozinho')).toBe(0);
  });

  it('só online conta as disputas com 2 ou mais humanos; limite corta a lista', () => {
    const { db, play } = seeded();
    play('ana', 10, { humans: 1 });
    play('ana', 2, { humans: 3 });
    play('bia', 5, { humans: 2 });
    const r = new RankingService(db);
    expect(r.view('2026-11', null).rows.map((x) => [x.userId, x.points])).toEqual([
      ['ana', 36],
      ['bia', 15],
    ]);
    const online = r.view('2026-11', 'ana', { online: true });
    expect(online.online).toBe(true);
    expect(online.rows.map((x) => [x.userId, x.points])).toEqual([
      ['bia', 15],
      ['ana', 6],
    ]);
    expect(online.me).toMatchObject({ userId: 'ana', position: 2, disputes: 1 });
    const top1 = r.view('2026-11', 'bia', { limit: 1 });
    expect(top1.rows.map((x) => x.userId)).toEqual(['ana']);
    expect(top1.me).toMatchObject({ userId: 'bia', position: 2 });
  });

  it('ranking da sala: só os ciclos dela, com visitantes', () => {
    const { db, play } = seeded();
    play('ana', 10, { room: 'sala-a' });
    play('vis', 12, { room: 'sala-a', guest: true });
    play('ana', 50, { room: 'sala-b' });
    play('bia', 1, { room: 'sala-b' });
    const r = new RankingService(db);
    const a = r.room('sala-a');
    expect(a.cycles).toBe(2);
    expect(a.rows.map((x) => [x.userId, x.points, x.guest, x.position])).toEqual([
      ['vis', 36, true, 1],
      ['ana', 30, false, 2],
    ]);
    expect(r.room('sala-b').rows.map((x) => x.userId)).toEqual(['ana', 'bia']);
    expect(r.room('nenhuma')).toEqual({ cycles: 0, rows: [] });
  });
});
