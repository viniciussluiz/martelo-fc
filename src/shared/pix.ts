/**
 * Pix “copia e cola” (BR Code estático, padrão EMV do Banco Central): o texto que o aplicativo do banco
 * lê no QR Code. Sem valor fixo: quem paga escolhe quanto.
 */

/** Campo EMV: identificador de 2 dígitos, tamanho de 2 dígitos e o valor. */
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Só letras sem acento, números e espaço, em maiúsculas (o que todo banco aceita nesses campos). */
const plain = (s: string, max: number) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, max);

export function pixPayload(params: { key: string; name: string; city: string; txid?: string }): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', params.key);
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', plain(params.name, 25)) +
    field('60', plain(params.city, 15)) +
    field('62', field('05', params.txid ?? '***')) +
    '6304';
  return body + crc16(body);
}

/** Apoio ao Leilão FC: chave Pix (aleatória) e o nome que aparece no banco na hora de confirmar. */
export const SUPPORT_PIX = {
  /** Que tipo de chave é (aparece na página de apoio). */
  keyKind: 'aleatória',
  /** Como a pessoa digita (ou cola) a chave no aplicativo do banco. */
  keyLabel: 'aa4feb78-42ab-414f-b11d-e2a9d33d94e9',
  /** Chave no formato do Pix (a aleatória vai como está, em minúsculas). */
  key: 'aa4feb78-42ab-414f-b11d-e2a9d33d94e9',
  holder: 'Vinicius Luiz Alves de Oliveira',
  payload: '',
};
SUPPORT_PIX.payload = pixPayload({ key: SUPPORT_PIX.key, name: 'Vinicius L A de Oliveira', city: 'Brasil', txid: 'LEILAOFC' });
