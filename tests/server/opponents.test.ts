import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../../src/server/db.js';
import { H2HService, searchKey } from '../../src/server/services/h2h.js';

/** Um técnico com 15 adversários, cada um num dia diferente (o mais recente é o último). */
function seeded() {
  const db = openDatabase(':memory:');
  migrate(db);
  const at = '2026-11-01T12:00:00.000Z';
  const user = db.prepare(`INSERT INTO users (id, display_name, is_guest, created_at) VALUES (?, ?, 0, ?)`);
  user.run('aaaa', 'Eu FC', at);
  db.prepare(`INSERT INTO rooms (id, code, mode, host_user_id, status, settings_json, cycle, created_at, updated_at) VALUES ('r', 'R1', 'online', 'aaaa', 'lobby', '{}', 1, ?, ?)`).run(at, at);
  db.prepare(`INSERT INTO disputes (id, room_id, seq, status, phase, seed, config_json, started_at, finished_at) VALUES ('d', 'r', 1, 'finished', 'finished', 's', '{}', ?, ?)`).run(at, at);
  const names = ['Caçarato FC', 'Cruzeirão Cabuloso', 'Rebite FC', 'fabiobrug', 'Skateerick FC', 'MEIA BOCA JUNIOR', 'Seleção do GuiGomes', 'Jumentos', 'Yannis Society', 'Só Comédia FC', 'Lucindo FC', 'Chwon FC', 'Galo Doido', 'Real Bairro', 'Ponte Velha'];
  const conf = db.prepare(
    `INSERT INTO confrontations (dispute_id, kind, ref, competition, user_a, user_b, outcome, score_a, score_b, detail_json, occurred_at) VALUES ('d', 'ciclo', ?, NULL, 'aaaa', ?, 'a', 1, 2, NULL, ?)`,
  );
  names.forEach((n, i) => {
    const id = `u${String(i).padStart(2, '0')}`;
    user.run(id, n, at);
    conf.run(`ref-${i}`, id, `2026-11-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`);
  });
  return new H2HService(db);
}

describe('adversários do perfil', () => {
  it('vêm em páginas de 12, do confronto mais recente para o mais antigo', () => {
    const h2h = seeded();
    const p1 = h2h.opponents('aaaa');
    expect(p1).toMatchObject({ total: 15, overall: 15, page: 1, pages: 2, pageSize: 12, query: '' });
    expect(p1.items).toHaveLength(12);
    expect(p1.items[0]!.displayName).toBe('Ponte Velha');
    expect(p1.items[0]!.records.ciclo.wins).toBe(1);
    const p2 = h2h.opponents('aaaa', { page: 2 });
    expect(p2.items.map((o) => o.displayName)).toEqual(['Rebite FC', 'Cruzeirão Cabuloso', 'Caçarato FC']);
    // Página fora do intervalo cai na última.
    expect(h2h.opponents('aaaa', { page: 9 }).page).toBe(2);
    expect(h2h.opponents('aaaa', { page: 0 }).page).toBe(1);
  });

  it('a busca ignora maiúsculas e acentos e conta o que achou', () => {
    const h2h = seeded();
    expect(h2h.opponents('aaaa', { query: 'cacarato' }).items.map((o) => o.displayName)).toEqual(['Caçarato FC']);
    const fc = h2h.opponents('aaaa', { query: ' fc ' });
    expect(fc).toMatchObject({ total: 6, overall: 15, pages: 1, query: 'fc' });
    expect(h2h.opponents('aaaa', { query: 'SELECAO' }).items[0]!.displayName).toBe('Seleção do GuiGomes');
    expect(h2h.opponents('aaaa', { query: 'ninguém' })).toMatchObject({ total: 0, items: [], pages: 1, page: 1 });
    expect(searchKey('  Só Comédia ')).toBe('so comedia');
  });

  it('o tamanho da página tem limite', () => {
    const h2h = seeded();
    expect(h2h.opponents('aaaa', { pageSize: 5 })).toMatchObject({ pages: 3, pageSize: 5 });
    expect(h2h.opponents('aaaa', { pageSize: 1000 }).pageSize).toBe(60);
  });
});
