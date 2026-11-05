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

describe('build do site entregue', () => {
  it('lê o script principal do dist/index.html e acompanha um novo build', async () => {
    const { mkdtempSync, writeFileSync, utimesSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { clientBuildId } = await import('../../src/server/http.js');
    const dir = mkdtempSync(join(tmpdir(), 'martelo-build-'));
    expect(clientBuildId(dir)).toBeUndefined();
    const index = join(dir, 'index.html');
    writeFileSync(index, '<script type="module" crossorigin src="/assets/index-AAA111.js"></script>');
    expect(clientBuildId(dir)).toBe('/assets/index-AAA111.js');
    writeFileSync(index, '<script type="module" crossorigin src="/assets/index-BBB222.js"></script>');
    utimesSync(index, new Date(), new Date(Date.now() + 5000));
    expect(clientBuildId(dir)).toBe('/assets/index-BBB222.js');
    rmSync(dir, { recursive: true, force: true });
  });
});
