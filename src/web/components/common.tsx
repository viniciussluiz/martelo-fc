import { useEffect, useState } from 'react';
import type { CardView } from '../../shared/protocol';
import { serverNow } from '../lib/store';
import { Icon } from './Icon';

export const TIER_LABEL: Record<string, string> = {
  lenda: 'Lenda',
  craque: 'Craque',
  titular: 'Titular',
  operario: 'Operário',
  perna: 'Perna-de-pau',
};

export const POSITION_NAME: Record<string, string> = {
  GOL: 'Goleiros',
  LAT: 'Laterais',
  ZAG: 'Zagueiros',
  MEI: 'Meio-campo',
  ATA: 'Ataque',
};

export const REACH_LABEL: Record<string, string> = {
  grupos: 'Fase de grupos',
  oitavas: 'Oitavas',
  quartas: 'Quartas',
  semi: 'Semifinal',
  final: 'Vice',
  campeao: 'Campeão',
};

export const CUP_FORMAT_LABEL: Record<string, string> = {
  copa8: 'Copa dos 8',
  libertadores: 'Taça Continental',
  mundial: 'Torneio Mundial',
  nenhuma: 'Só liga',
};

/** Re-renderiza a cada `ms` e devolve a hora do servidor estimada. */
export function useNow(ms = 250): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function Countdown({ deadline, urgentAt = 10 }: { deadline: number; urgentAt?: number }) {
  const now = useNow(250);
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className="clock" data-urgent={s <= urgentAt} aria-label={`${s} segundos`}>
      {s}s
    </span>
  );
}

export function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  return <span className={`tier tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}

export function Band({ card }: { card?: CardView }) {
  if (!card || card.levelMin === undefined) return null;
  return (
    <span className="band">
      {card.levelMin}–{card.levelMax}
    </span>
  );
}

export function CardFace({ card, children, compact }: { card: CardView; children?: React.ReactNode; compact?: boolean }) {
  return (
    <div className="sticker" data-mystery={!!card.mystery}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge-pos">{card.position}</span>
            <TierBadge tier={card.tier} />
            <Band card={card} />
          </div>
          <div className="sticker-name">{card.name}</div>
          <div className="sticker-meta">
            {card.club}, {card.year}
          </div>
          {!compact && <div className="sticker-hint">{card.hint}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function EnvelopeArt({ amount, label, sealed }: { amount: string; label?: string; sealed?: boolean }) {
  return (
    <div className="envelope" role="img" aria-label={`Envelope com lance de ${amount}${sealed ? ', lacrado' : ''}`}>
      {label && <span className="envelope-label">{label}</span>}
      <span className="envelope-amount">{amount}</span>
      {sealed && (
        <span className="seal seal-pop">
          <Icon name="martelo" />
        </span>
      )}
    </div>
  );
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="empty" role="status">
      {label}
    </div>
  );
}
