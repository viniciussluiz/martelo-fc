import { describe, expect, it } from 'vitest';
import { CLUB_CODES, clubCode, clubSlug } from '../../src/shared/clubs.js';
import { SERIES_CLUBS } from '../../src/tools/wikidata/series.js';

describe('selo dos clubes', () => {
  it('todo clube do baralho real tem sigla, sem repetição', () => {
    for (const c of SERIES_CLUBS) expect(CLUB_CODES[c.name], c.name).toBeTruthy();
    const codes = SERIES_CLUBS.map((c) => clubCode(c.name));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('clube fora da tabela ganha as iniciais', () => {
    expect(clubCode('Botafogo do Cerrado')).toBe('BC');
    expect(clubCode('Tupã FC')).toBe('TFC');
    expect(clubCode('Ipiranga')).toBe('IPI');
    expect(clubCode('Juventus do Agreste')).toBe('JA');
  });

  it('nome do arquivo do escudo sai do nome do clube', () => {
    expect(clubSlug('São Paulo')).toBe('sao-paulo');
    expect(clubSlug('Atlético-MG')).toBe('atletico-mg');
    expect(clubSlug('Inter de Milão')).toBe('inter-de-milao');
  });
});
