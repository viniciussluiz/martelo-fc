import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applySeo, pageMeta, PUBLIC_PATHS, structuredData } from '../../src/shared/seo.js';

const HTML = readFileSync(resolve(import.meta.dirname, '../../src/web/index.html'), 'utf8');
const SITE = 'https://leilaofc.com.br';

describe('como cada página aparece na busca', () => {
  it('cada página pública tem título e resumo próprios; salas, perfis e conta ficam fora do índice', () => {
    const metas = PUBLIC_PATHS.map(pageMeta);
    expect(new Set(metas.map((m) => m.title)).size).toBe(PUBLIC_PATHS.length);
    expect(new Set(metas.map((m) => m.description)).size).toBe(PUBLIC_PATHS.length);
    for (const m of metas) {
      expect(m.index).toBe(true);
      expect(m.title.length).toBeLessThanOrEqual(70);
      expect(m.description.length).toBeLessThanOrEqual(170);
    }
    expect(pageMeta('/regras/').title).toBe(pageMeta('/regras').title);
    for (const p of ['/sala/ABCD', '/perfil/123', '/conta', '/entrar', '/redefinir?token=x']) expect(pageMeta(p).index, p).toBe(false);
  });

  it('o HTML entregue leva título, resumo, prévia e endereço oficial da rota', () => {
    const rules = applySeo(HTML, '/regras', SITE);
    expect(rules).toContain('<title>Regras do Leilão FC: pregão, cerimônia, liga, copa e confrontos</title>');
    expect(rules).toContain('<link rel="canonical" href="https://leilaofc.com.br/regras" />');
    expect(rules).toContain('<meta property="og:url" content="https://leilaofc.com.br/regras" />');
    expect(rules).toMatch(/<meta name="description" content="As regras do Leilão FC:[^"]+" \/>/);
    expect(rules).toMatch(/<meta property="og:title" content="Regras do Leilão FC[^"]+" \/>/);
    expect(rules).not.toContain('ld+json');
    expect(rules).not.toContain('noindex');
    // A imagem da prévia e o resto do <head> continuam como estavam.
    expect(rules).toContain('<meta property="og:image" content="https://leilaofc.com.br/og.png" />');
    expect(rules).toContain('<div id="root"></div>');
  });

  it('a inicial leva os dados estruturados; páginas privadas pedem para não ser indexadas', () => {
    const home = applySeo(HTML, '/', SITE);
    expect(home).toContain('<link rel="canonical" href="https://leilaofc.com.br/" />');
    const json = /<script type="application\/ld\+json">(.+?)<\/script>/.exec(home)![1]!;
    const data = JSON.parse(json) as { '@graph': Array<Record<string, unknown>> };
    expect(data['@graph'].map((g) => g['@type'])).toEqual(['Organization', 'WebSite', 'VideoGame']);
    expect(data['@graph'][0]!.logo).toBe('https://leilaofc.com.br/icon-192.png');
    expect(data).toEqual(structuredData(SITE));
    const room = applySeo(HTML, '/sala/ABCD', SITE);
    expect(room).toContain('<meta name="robots" content="noindex" />');
    expect(room).not.toContain('rel="canonical"');
    expect(room).toContain('<title>Leilão FC</title>');
  });
});
