import { describe, expect, it } from 'vitest';
import { disputePoints, isSeasonKey, pointsFromTotals, RANKING_POINTS, seasonLabel, seasonOf } from '../../src/shared/ranking.js';

const base = { leagueWon: 0, leagueDrawn: 0, cupWon: 0, cupDrawn: 0, leagueTitle: false, cupTitle: false };

describe('pontos de uma disputa', () => {
  it('vitória 3 e empate 1, somando liga e copa', () => {
    expect(disputePoints({ ...base, cupFormat: 'libertadores', leagueWon: 20, leagueDrawn: 8, cupWon: 5, cupDrawn: 2 })).toEqual({ jogos: 85, titulos: 0, total: 85 });
  });

  it('cada título tem o seu peso: Mundial e Libertadores 200, liga 100, Copa dos 8 50', () => {
    const t = (cupFormat: 'mundial' | 'libertadores' | 'copa8' | 'nenhuma', leagueTitle: boolean, cupTitle: boolean) =>
      disputePoints({ ...base, cupFormat, leagueTitle, cupTitle }).titulos;
    expect(t('mundial', false, true)).toBe(200);
    expect(t('libertadores', false, true)).toBe(200);
    expect(t('copa8', false, true)).toBe(50);
    expect(t('nenhuma', true, false)).toBe(100);
    expect(t('libertadores', true, true)).toBe(300);
    // Sem copa, um “título de copa” não vale nada (não acontece, mas a conta não inventa).
    expect(t('nenhuma', false, true)).toBe(0);
  });

  it('totais de várias disputas', () => {
    const p = pointsFromTotals({ won: 10, drawn: 4, titles: { mundial: 1, libertadores: 2, liga: 1, copa8: 3 } });
    expect(p).toEqual({ jogos: 34, titulos: 200 + 400 + 100 + 150, total: 884 });
    expect(RANKING_POINTS.vitoria).toBe(3);
  });
});

describe('temporada', () => {
  it('é o mês no horário de Brasília', () => {
    expect(seasonOf('2026-11-20T12:00:00.000Z')).toBe('2026-11');
    // 23h30 de 30/11 em Brasília ainda é novembro.
    expect(seasonOf('2026-12-01T02:30:00.000Z')).toBe('2026-11');
    expect(seasonOf('2026-12-01T03:00:00.000Z')).toBe('2026-12');
    expect(seasonOf('2027-01-01T02:59:59.000Z')).toBe('2026-12');
  });

  it('nome e validação', () => {
    expect(seasonLabel('2026-11')).toBe('Novembro de 2026');
    expect(seasonLabel('2027-03', true)).toBe('março');
    expect(isSeasonKey('2026-11')).toBe(true);
    expect(isSeasonKey('2026-13')).toBe(false);
    expect(isSeasonKey('geral')).toBe(false);
    expect(isSeasonKey(null)).toBe(false);
  });
});
