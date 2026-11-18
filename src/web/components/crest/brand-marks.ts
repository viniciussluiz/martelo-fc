import type { KitBrand } from '../../../shared/crest';

/**
 * Marcas de material esportivo do jogo: três marcas inventadas, em silhueta cheia — a Capivara
 * (o bicho de perfil), o Raio e a Chama. Desenhos próprios, num quadro de 64 × 40
 * (preenchimento par-ímpar: o olho da capivara e o miolo da chama são recortes).
 */
export const BRAND_MARK_BOX = { w: 64, h: 40 };
export const BRAND_MARK_PATH: Record<Exclude<KitBrand, 'nenhum'>, string> = {
  capivara: 'M5 24 C3.5 16 8.5 9.5 18 9 C24 8.6 30 9 35.5 8.6 C38.5 6.4 42.5 5.2 46.5 5.6 L47.6 3.2 C48.9 3.4 50 4.6 50.2 6.2 C53.5 6.8 57 8.4 58.6 11 C60 13.2 59.8 16 58 17.6 C55.5 19.6 51.5 19.8 48.4 19 C47.2 20.6 46.4 22.2 46 24 L49.6 32.5 L44.6 32.5 L41 25.6 L39.4 32.5 L34.6 32.5 L35.4 25.2 C31 26.2 26 26.2 21.6 25.4 L23.4 32.5 L18.6 32.5 L15.4 26 L12 32.5 L7.2 32.5 L9.4 25.2 C7.4 25.2 5.6 24.8 5 24 Z M52.8 10.4 a1.3 1.3 0 1 0 0.01 0 Z',
  raio: 'M40 1.5 L15 22.5 L27.5 22.5 L20.5 38.5 L49.5 15.5 L36 15.5 L45.5 1.5 Z',
  chama: 'M33 1.5 C36.5 9 47 13.5 47 24.5 C47 32.5 40.6 38.5 32 38.5 C23.4 38.5 17 32.5 17 24.5 C17 19.5 19.6 15.6 22.8 13 C23.4 16.4 25 18.6 27.4 19.6 C26.2 12.4 28.6 5.8 33 1.5 Z M32 34.5 C28.4 34.5 25.8 32 25.8 28.6 C25.8 25.4 28.2 23.4 29.8 20.8 C30.8 23.4 32.8 24 34.6 22.2 C37 24.2 38.2 26.4 38.2 28.6 C38.2 32 35.6 34.5 32 34.5 Z',
};
