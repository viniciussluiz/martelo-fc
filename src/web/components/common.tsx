import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardView } from '../../shared/protocol';
import { serverNow } from '../lib/store';
import { ClubLine } from './ClubBadge';
import { Icon } from './Icon';
import { LegendFigure } from './LegendFigure';
import { PixelBall, PosChip } from './ui';

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

/**
 * Relógio de placar (dígitos de LED). Com `bar`, mostra embaixo quanto do prazo ainda resta (o total
 * é o tempo que faltava quando este prazo apareceu na tela).
 */
export function Countdown({ deadline, urgentAt = 10, bar }: { deadline: number; urgentAt?: number; bar?: boolean }) {
  const now = useNow(250);
  const total = useRef<{ deadline: number; ms: number } | null>(null);
  if (!total.current || total.current.deadline !== deadline) total.current = { deadline, ms: Math.max(1000, deadline - now) };
  const left = Math.max(0, deadline - now);
  const s = Math.ceil(left / 1000);
  const pct = Math.min(100, (left / total.current.ms) * 100);
  return (
    <span className="clock" data-urgent={s <= urgentAt} data-final={s <= 5 || undefined} aria-label={`${s} segundos`}>
      <span className="clock-face">
        <Icon name="relogio" size={18} />
        <span className="clock-num" key={s <= 5 ? s : 'n'}>
          {String(s).padStart(2, '0')}
        </span>
        <span className="clock-unit">s</span>
      </span>
      {bar && (
        <span className="clock-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
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

/** Nome do jogador e, embaixo, o escudo com “Clube (ano)”. Nada além disso. */
export function CardIdentity({ card, crestSize = 18 }: { card: CardView; crestSize?: number }) {
  return (
    <div className="card-id">
      <div className="sticker-name">{card.name}</div>
      <div className="sticker-meta">
        <ClubLine club={card.club} year={card.year} kit={card.kit} size={crestSize} />
      </div>
    </div>
  );
}

/** Lenda já revelada no martelo: carta dourada com a figura de rosto amarelo. */
export function isRevealedLegend(card: CardView): boolean {
  return card.tier === 'lenda';
}

/**
 * Figurinha do jogador: faixa da posição em cima, escudo do clube como arte, nome e “Clube (ano)”.
 * `compact` é a versão de uma linha (lista lacrada, Monte).
 */
export function CardFace({ card, children, compact, band }: { card: CardView; children?: ReactNode; compact?: boolean; band?: ReactNode }) {
  const legend = isRevealedLegend(card);
  return (
    <div className="sticker" data-pos={card.position} data-mystery={!!card.mystery} data-legend={legend || undefined} data-compact={compact || undefined}>
      {!compact && (
        <div className="sticker-band">
          <PosChip pos={card.position} />
          {card.mystery && <span className="sticker-flag">carta-surpresa</span>}
          {band}
        </div>
      )}
      <div className="sticker-row">
        {legend && <LegendFigure club={card.club} kit={card.kit} size={compact ? 32 : 40} />}
        <CardIdentity card={card} crestSize={compact ? 22 : 40} />
        {children}
      </div>
    </div>
  );
}

/** Envelope pardo com o lance escrito à caneta e, se lacrado, o lacre de cera. */
export function EnvelopeArt({ amount, label, sealed }: { amount: string; label?: string; sealed?: boolean }) {
  return (
    <div className="envelope" role="img" aria-label={`Envelope com lance de ${amount}${sealed ? ', lacrado' : ''}`}>
      <span className="envelope-flap" aria-hidden="true" />
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

/** Carregando: a bolinha quicando e o recado. */
export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading-ball">
        <PixelBall size={30} />
      </span>
      <span className="loading-shadow" aria-hidden="true" />
      <span className="loading-text">{label}</span>
    </div>
  );
}

/** Aviso de tela vazia: diz o que fazer. */
export function Empty({ children, icon = 'bola' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} />
      <div>{children}</div>
    </div>
  );
}
