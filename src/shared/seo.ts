/**
 * Como cada página se apresenta para buscadores e redes: título, resumo e se entra no índice.
 * O servidor escreve isso no HTML que entrega; o cliente atualiza a aba ao navegar.
 */
export interface PageMeta {
  title: string;
  description: string;
  /** Página pública, que vale aparecer na busca. Salas, perfis e conta ficam fora. */
  index: boolean;
}

export const SITE_NAME = 'Leilão FC';
const HOME_DESCRIPTION = 'Leilão às cegas de futebol: lance no nome, monte o time, dispute liga e copa com os amigos.';

const PAGES: Record<string, { title: string; description: string }> = {
  '/': { title: 'Leilão FC: leilão às cegas de futebol com os amigos', description: HOME_DESCRIPTION },
  '/como-jogar': {
    title: 'Como jogar o Leilão FC: guia para a primeira partida',
    description: 'Passo a passo do Leilão FC: crie o time, dê lances fechados nos jogadores, feche os 11 e dispute a liga e a copa. Grátis, no navegador.',
  },
  '/regras': {
    title: 'Regras do Leilão FC: pregão, cerimônia, liga, copa e confrontos',
    description: 'As regras do Leilão FC: 100 moedas, lances em envelope lacrado, desempate, Monte Final, faixas de nível, liga de 20 times, copas e histórico de confrontos.',
  },
  '/ranking': {
    title: 'Ranking do Leilão FC: os melhores técnicos do mês e de todos os tempos',
    description: 'Quem mais pontua no Leilão FC: vitórias, empates e títulos de liga, Libertadores, Torneio Mundial e Copa dos 8, por temporada e no geral.',
  },
  '/sobre': {
    title: 'Sobre o Leilão FC',
    description: 'O que é o Leilão FC, de onde vêm os dados das cartas e quem faz o jogo.',
  },
  '/apoiar': {
    title: 'Apoie o Leilão FC com um Pix',
    description: 'O Leilão FC é gratuito e feito por uma pessoa só. Um Pix de qualquer valor ajuda a pagar o servidor.',
  },
  '/contato': {
    title: 'Contato · Leilão FC',
    description: 'Fale com quem cuida do Leilão FC: dúvidas, sugestões, correções de jogadores e pedidos sobre a sua conta.',
  },
  '/privacidade': {
    title: 'Política de Privacidade · Leilão FC',
    description: 'O que o Leilão FC guarda sobre você, para quê e como pedir para ver, corrigir ou apagar.',
  },
};

/** Caminho sem barra no fim nem parâmetros (a raiz continua “/”). */
export function cleanPath(pathname: string): string {
  const p = (pathname.split('?')[0] ?? '/').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function pageMeta(pathname: string): PageMeta {
  const page = PAGES[cleanPath(pathname)];
  if (page) return { ...page, index: true };
  return { title: SITE_NAME, description: HOME_DESCRIPTION, index: false };
}

export const PUBLIC_PATHS = Object.keys(PAGES);

/** Dados estruturados (schema.org) da página inicial: o site, quem publica e o jogo. */
export function structuredData(siteUrl: string): Record<string, unknown> {
  const org = { '@type': 'Organization', '@id': `${siteUrl}/#org`, name: SITE_NAME, url: `${siteUrl}/`, logo: `${siteUrl}/icon-192.png` };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      org,
      { '@type': 'WebSite', '@id': `${siteUrl}/#site`, name: SITE_NAME, alternateName: 'Leilao FC', url: `${siteUrl}/`, inLanguage: 'pt-BR', publisher: { '@id': org['@id'] } },
      {
        '@type': 'VideoGame',
        name: SITE_NAME,
        url: `${siteUrl}/`,
        description: HOME_DESCRIPTION,
        image: `${siteUrl}/og.png`,
        inLanguage: 'pt-BR',
        genre: ['Futebol', 'Estratégia', 'Leilão'],
        gamePlatform: 'Navegador',
        applicationCategory: 'Game',
        operatingSystem: 'Qualquer',
        playMode: ['SinglePlayer', 'MultiPlayer'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        publisher: { '@id': org['@id'] },
      },
    ],
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Escreve no HTML da página o título, o resumo, o endereço oficial e (na inicial) os dados estruturados.
 * O HTML de entrada é o `index.html` do build, igual para todas as rotas.
 */
export function applySeo(html: string, pathname: string, siteUrl: string): string {
  const meta = pageMeta(pathname);
  const path = cleanPath(pathname);
  const url = `${siteUrl}${path === '/' ? '/' : path}`;
  const setContent = (doc: string, attr: string, value: string) =>
    doc.replace(new RegExp(`(<meta ${attr}[^>]*content=")[^"]*(")`), (_m, a: string, b: string) => `${a}${esc(value)}${b}`);
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  out = setContent(out, 'name="description"', meta.description);
  out = setContent(out, 'property="og:title"', meta.title);
  out = setContent(out, 'property="og:description"', meta.description);
  out = setContent(out, 'property="og:url"', url);
  const extra = meta.index
    ? `<link rel="canonical" href="${esc(url)}" />` +
      (path === '/' ? `\n    <script type="application/ld+json">${JSON.stringify(structuredData(siteUrl)).replace(/</g, '\\u003c')}</script>` : '')
    : '<meta name="robots" content="noindex" />';
  return out.replace('</head>', `  ${extra}\n  </head>`);
}
