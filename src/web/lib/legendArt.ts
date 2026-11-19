import { legendArtFile } from '../../shared/legend-art';

/** URL do retrato da Lenda desta carta, ou null quando ela ainda não tem arte (mapa em shared/legend-art). */
export function legendArtUrl(cardId: string | undefined): string | null {
  const file = legendArtFile(cardId);
  return file ? `/lendas/${file}.webp` : null;
}
