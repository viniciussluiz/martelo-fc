import { useEffect, useState } from 'react';
import { api } from './api';

/** O que o servidor conta sobre o site: versão, baralho e os anúncios (quando ligados). */
export interface SiteInfo {
  version: string;
  deck: string;
  cards: number;
  ads: { client: string; slot: string | null } | null;
}

let pending: Promise<SiteInfo | null> | null = null;

export function siteInfo(): Promise<SiteInfo | null> {
  return (pending ??= api<SiteInfo>('GET', '/api/health').catch(() => {
    pending = null;
    return null;
  }));
}

export function useSiteInfo(): SiteInfo | null {
  const [info, setInfo] = useState<SiteInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void siteInfo().then((i) => {
      if (alive) setInfo(i);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** Escolha do visitante sobre cookies: tudo (anúncios personalizados) ou só o essencial. */
export type CookieChoice = 'tudo' | 'essencial';
const COOKIE_KEY = 'leilao.cookies';

export function cookieChoice(): CookieChoice | null {
  try {
    const v = localStorage.getItem(COOKIE_KEY);
    return v === 'tudo' || v === 'essencial' ? v : null;
  } catch {
    return null;
  }
}

export function saveCookieChoice(choice: CookieChoice) {
  try {
    localStorage.setItem(COOKIE_KEY, choice);
  } catch {
    // Sem armazenamento (navegação privada restrita): a escolha vale só nesta visita.
  }
}
