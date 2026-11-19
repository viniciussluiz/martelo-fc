import { describe, expect, it } from 'vitest';
import { crc16, pixPayload, SUPPORT_PIX } from '../../src/shared/pix.js';

/** Lê os campos EMV de um trecho do código (id, tamanho, valor). */
function parse(code: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < code.length; ) {
    const id = code.slice(i, i + 2);
    const len = Number(code.slice(i + 2, i + 4));
    out[id] = code.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

describe('Pix copia e cola', () => {
  it('CRC16 do padrão (valor de referência conhecido)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('o código do apoio tem a chave, o nome, a moeda e fecha com o CRC certo', () => {
    const code = SUPPORT_PIX.payload;
    const f = parse(code);
    expect(f['00']).toBe('01');
    expect(parse(f['26']!)).toEqual({ '00': 'br.gov.bcb.pix', '01': 'aa4feb78-42ab-414f-b11d-e2a9d33d94e9' });
    expect(f['53']).toBe('986');
    expect(f['58']).toBe('BR');
    expect(f['59']).toBe('VINICIUS L A DE OLIVEIRA');
    expect(f['60']).toBe('BRASIL');
    expect(parse(f['62']!)).toEqual({ '05': 'LEILAOFC' });
    // Sem o campo 54: quem paga escolhe o valor.
    expect(f['54']).toBeUndefined();
    expect(code.slice(-8, -4)).toBe('6304');
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4));
  });

  it('nome e cidade vão sem acento, em maiúsculas e no tamanho máximo', () => {
    const f = parse(pixPayload({ key: 'a@b.com', name: 'José da Conceição Albuquerque Júnior', city: 'São João del-Rei' }));
    expect(f['59']).toBe('JOSE DA CONCEICAO ALBUQUE');
    expect(f['60']).toBe('SAO JOAO DELREI');
  });
});
