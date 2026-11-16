import { useEffect, useRef, useState } from 'react';
import { navigate } from '../lib/router';
import { cookieChoice, saveCookieChoice, useSiteInfo, type CookieChoice } from '../lib/site';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>> & { requestNonPersonalizedAds?: number };
  }
}

/**
 * Espaço de anúncio (Google AdSense). Só existe quando o servidor tem ADSENSE_CLIENT e ADSENSE_SLOT;
 * sem isso não ocupa lugar nenhum. Fica fora da área de jogo.
 */
export function AdSlot() {
  const ads = useSiteInfo()?.ads;
  const ref = useRef<HTMLModElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!ads?.slot || !ref.current || asked.current) return;
    asked.current = true;
    try {
      const queue = (window.adsbygoogle ??= []);
      // Quem não aceitou todos os cookies recebe anúncios não personalizados.
      if (cookieChoice() !== 'tudo') queue.requestNonPersonalizedAds = 1;
      queue.push({});
    } catch {
      // Bloqueador de anúncios ou script fora do ar: o espaço fica vazio.
    }
  }, [ads?.slot]);
  if (!ads?.slot) return null;
  return (
    <aside className="ad-slot" aria-label="Publicidade">
      <span className="ad-slot-label">Publicidade</span>
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block' }} data-ad-client={ads.client} data-ad-slot={ads.slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}

/** Aviso de cookies: aparece até a pessoa escolher. */
export function CookieNotice() {
  const [choice, setChoice] = useState<CookieChoice | null>(() => cookieChoice());
  if (choice) return null;
  const pick = (c: CookieChoice) => {
    saveCookieChoice(c);
    setChoice(c);
  };
  return (
    <div className="cookie-notice" role="dialog" aria-label="Cookies">
      <p>
        O Leilão FC guarda no seu aparelho o necessário para manter você conectado. Com a sua permissão, parceiros de publicidade como o Google também
        podem usar cookies para mostrar anúncios.{' '}
        <a
          href="/privacidade"
          onClick={(e) => {
            e.preventDefault();
            navigate('/privacidade');
          }}
        >
          Política de Privacidade
        </a>
      </p>
      <div className="cookie-notice-actions">
        <button type="button" className="btn btn-sm" onClick={() => pick('essencial')}>
          Só o essencial
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => pick('tudo')}>
          Aceitar
        </button>
      </div>
    </div>
  );
}
