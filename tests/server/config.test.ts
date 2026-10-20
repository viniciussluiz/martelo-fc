import { describe, expect, it } from 'vitest';
import { configNotes, resolveDeckPath } from '../../src/server/config.js';

describe('escolha do baralho pelo ambiente', () => {
  it('sem DECK_PATH usa o de jogadores reais', () => {
    expect(resolveDeckPath({})).toMatch(/data\/deck-wikidata\.json$/);
  });

  it('DECK_PATH antigo apontando para o fictício (do .env.example velho) é ignorado, com aviso', () => {
    configNotes.length = 0;
    expect(resolveDeckPath({ DECK_PATH: './data/deck.json' })).toMatch(/data\/deck-wikidata\.json$/);
    expect(configNotes.join(' ')).toMatch(/FORCE_FICTIONAL_DECK/);
    configNotes.length = 0;
  });

  it('o fictício só com FORCE_FICTIONAL_DECK=1; outro caminho é respeitado', () => {
    expect(resolveDeckPath({ DECK_PATH: './data/deck.json', FORCE_FICTIONAL_DECK: '1' })).toMatch(/data\/deck\.json$/);
    expect(resolveDeckPath({ DECK_PATH: '/tmp/meu-baralho.json' })).toBe('/tmp/meu-baralho.json');
  });
});
