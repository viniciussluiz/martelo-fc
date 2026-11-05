import type { CrestConfig } from '../../shared/crest';
import { Crest } from './crest/Crest';

/** Ícones próprios do Martelo FC (traço 2px, 24×24). */
const PATHS: Record<string, string> = {
  martelo: 'M14.5 3.5l6 6-3 3-6-6 3-3zM11.5 6.5l-8 8M8 15.5l-4.5 4.5M17.5 12.5l-4 4',
  'martelo-ouro': 'M14.5 3.5l6 6-3 3-6-6 3-3zM11.5 9.5l-8 8 3 3 8-8M4 21h7',
  envelope: 'M3 6h18v12H3zM3 6l9 7 9-7',
  taca: 'M7 4h10v4a5 5 0 01-10 0V4zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4M12 13v4M8 21h8M9 17h6',
  trofeu: 'M8 3h8v5a4 4 0 01-8 0V3zM12 12v5M7 21h10l-1-4H8l-1 4zM16 5h3v2a3 3 0 01-3 3M8 5H5v2a3 3 0 003 3',
  coroa: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z',
  estrela: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5 6.4 20.4l1.1-6.3L3 9.7l6.2-.9L12 3z',
  chama: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3 0-3-1-5-0-8z',
  raio: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  bola: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7l3.5 2.5-1.3 4h-4.4l-1.3-4L12 7zM12 3v4M20.5 9.5l-5 0M3.5 9.5h5M8.5 13.5L6 18.5M15.5 13.5L18 18.5',
  escudo: 'M12 3l8 3v6c0 4.5-3.5 7.8-8 9-4.5-1.2-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  alvo: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7a5 5 0 100 10 5 5 0 000-10zM12 11a1 1 0 100 2 1 1 0 000-2z',
  caveira: 'M12 3a7 7 0 00-7 7c0 2.5 1.2 4.2 3 5.2V19h8v-3.8c1.8-1 3-2.7 3-5.2a7 7 0 00-7-7zM9 10.5h.01M15 10.5h.01M10 19v2M14 19v2',
  turma: 'M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2.5 20c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5M13.5 16c.7-1 1.6-1.5 2.5-1.5 2.7 0 5 2 5.5 5.5',
  repetir: 'M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5',
  relogio: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.5 2',
  medalha: 'M8 3h8l-2 6h-4L8 3zM12 9a6 6 0 100 12 6 6 0 000-12zM12 12.5l1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3 1.1-2.2z',
  escada: 'M4 20h4v-4h4v-4h4V8h4V4',
  zebra: 'M5 19l3-12 4 3 4-6 3 15M8 7l1 4M12 10l.5 4M16 4l-1 6',
  monte: 'M3 19l5-8 3 4 4-7 6 11H3zM15 8l1.5-3',
  cadeado: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3M12 15v2',
  apito: 'M3 12a5 5 0 0010 0V9h8V6H10a7 7 0 00-7 6zM8 12h.01M13 6V4',
  podio: 'M9 9h6v12H9zM3 14h6v7H3zM15 12h6v9h-6zM12 3l.9 1.8 2 .3-1.4 1.4.3 2L12 7.6l-1.8.9.3-2-1.4-1.4 2-.3L12 3z',
  estante: 'M4 3v18M20 3v18M4 9h16M4 15h16M7 9V5h3v4M13 15v-4h4v4',
  segredo: 'M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 4M12 17h.01M12 3a9 9 0 100 18 9 9 0 000-18z',
  lacre: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 12l2 2 4-4',
  campo: 'M3 5h18v14H3zM12 5v14M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM3 9h3v6H3M21 9h-3v6h3',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  copiar: 'M8 8h12v12H8zM4 16V4h12',
  perfil: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c.8-4 4-6 8-6s7.2 2 8 6',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5h.01',
  dado: 'M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  pincel: 'M14 4l6 6-8.5 8.5a3 3 0 01-2 .9L5 20l.6-4.5a3 3 0 01.9-2L14 4zM12 6l6 6',
  editar: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  play: 'M7 4l13 8-13 8V4z',
  voltar: 'M15 5l-7 7 7 7',
  mais: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
};

/** Ícones cheios (desenho sólido, sem traço). */
const FILLED: Record<string, string> = {
  'estrela-cheia': 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5z',
};

export function Icon({ name, size, title }: { name: string; size?: number; title?: string }) {
  if (FILLED[name]) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
        {title ? <title>{title}</title> : null}
        <path d={FILLED[name]} />
      </svg>
    );
  }
  const d = PATHS[name] ?? PATHS.estrela!;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}

/** Escudo do próprio Martelo FC (marca do jogo). */
export const BRAND_CREST: CrestConfig = {
  shape: 'brasao',
  pattern: 'topo',
  primary: '#2E8B3A',
  secondary: '#FFC81E',
  detail: '#FFC81E',
  symbol: 'martelo',
  initials: 'MFC',
  motto: 'DESDE 2026',
  stars: 0,
  ribbon: false,
  laurel: false,
  medallion: false,
  border: 'grossa',
};

export function Logo({ size = 40 }: { size?: number }) {
  return <Crest crest={BRAND_CREST} size={size} />;
}
