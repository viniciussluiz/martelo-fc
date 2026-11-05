import type { DisputeView, RosterView } from '../../../shared/protocol';
import { TIER_LABEL } from '../common';
import { LegendFigure } from '../LegendFigure';
import { PixelBall, PixelCoin } from '../ui';

/**
 * Escalação num campo em leve perspectiva (goleiro em cima, ataque embaixo).
 * Sem rosto: cada jogador aparece pelo nome; a Lenda ganha o selo dourado de rosto amarelo.
 * Coordenadas em “campo”: u de 0 (esquerda) a 1 (direita), v de 0 (fundo, gol de cima) a 1 (frente).
 */

type Slot = { pos: 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'; u: number; v: number };

const DEFENSE: Slot[] = [
  { pos: 'LAT', u: 0.07, v: 0.33 },
  { pos: 'ZAG', u: 0.34, v: 0.25 },
  { pos: 'ZAG', u: 0.66, v: 0.25 },
  { pos: 'LAT', u: 0.93, v: 0.33 },
];

const LAYOUTS: Record<string, Slot[]> = {
  '4-3-3': [
    { pos: 'GOL', u: 0.5, v: 0.06 },
    ...DEFENSE,
    { pos: 'MEI', u: 0.2, v: 0.55 },
    { pos: 'MEI', u: 0.5, v: 0.5 },
    { pos: 'MEI', u: 0.8, v: 0.55 },
    { pos: 'ATA', u: 0.13, v: 0.8 },
    { pos: 'ATA', u: 0.5, v: 0.85 },
    { pos: 'ATA', u: 0.87, v: 0.8 },
  ],
  '4-4-2': [
    { pos: 'GOL', u: 0.5, v: 0.06 },
    ...DEFENSE,
    { pos: 'MEI', u: 0.07, v: 0.59 },
    { pos: 'MEI', u: 0.35, v: 0.51 },
    { pos: 'MEI', u: 0.65, v: 0.51 },
    { pos: 'MEI', u: 0.93, v: 0.59 },
    { pos: 'ATA', u: 0.32, v: 0.82 },
    { pos: 'ATA', u: 0.68, v: 0.82 },
  ],
};

// Campo desenhado num viewBox 100 × 104: fundo mais estreito que a frente (perspectiva).
const VB_H = 104;
const TOP = 7;
const BOTTOM = 99;
function project(u: number, v: number): [number, number] {
  const y = TOP + v * (BOTTOM - TOP);
  const half = 40 + v * 8.5;
  return [50 + (u - 0.5) * 2 * half, y];
}
const pt = (u: number, v: number) => project(u, v).map((n) => n.toFixed(2)).join(',');
const quad = (u0: number, v0: number, u1: number, v1: number) => `${pt(u0, v0)} ${pt(u1, v0)} ${pt(u1, v1)} ${pt(u0, v1)}`;

const STRIPES = 9;

function FieldArt() {
  const [cx, cy] = project(0.5, 0.5);
  const [, spotTop] = project(0.5, 0.11);
  const [, spotBottom] = project(0.5, 0.89);
  return (
    <svg className="field-art" viewBox={`0 0 100 ${VB_H}`} aria-hidden="true" focusable="false">
      {Array.from({ length: STRIPES }, (_, i) => (
        <polygon key={i} points={quad(-0.04, i / STRIPES, 1.04, (i + 1) / STRIPES)} className={i % 2 ? 'stripe-b' : 'stripe-a'} />
      ))}
      <g className="field-lines">
        <polygon points={quad(0, 0, 1, 1)} />
        <line x1={project(0, 0.5)[0]} y1={cy} x2={project(1, 0.5)[0]} y2={cy} />
        <ellipse cx={cx} cy={cy} rx="12" ry="8.6" />
        <polygon points={quad(0.22, 0, 0.78, 0.15)} />
        <polygon points={quad(0.38, 0, 0.62, 0.055)} />
        <polygon points={quad(0.22, 0.85, 0.78, 1)} />
        <polygon points={quad(0.38, 0.945, 0.62, 1)} />
      </g>
      <g className="field-spots">
        <circle cx={cx} cy={cy} r="0.8" />
        <circle cx="50" cy={spotTop} r="0.6" />
        <circle cx="50" cy={spotBottom} r="0.6" />
      </g>
    </svg>
  );
}

/** Moeda do pregão, ao lado do valor pago. */
export function CoinIcon() {
  return <PixelCoin size={12} />;
}

/** “Dieumerci Mbokani” → “D. Mbokani”; nomes curtos (até 10 letras) ficam inteiros. */
export function shortName(name: string): string {
  if (name.length <= 10) return name;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;
  let last = words[words.length - 1]!;
  if (words.length >= 3 && /^(j[uú]nior|jr\.?|filho|neto|sobrinho)$/i.test(last)) last = `${words[words.length - 2]} ${last}`;
  return `${words[0]![0]}. ${last}`;
}

export function SquadPitch({
  d,
  participantId,
  showPrice = true,
  hidden,
  roster: override,
  stats,
}: {
  d: DisputeView;
  participantId: string;
  showPrice?: boolean;
  /** Cartas já compradas que a revelação ainda não mostrou (não aparecem no campo). */
  hidden?: ReadonlySet<string>;
  /** Elenco a mostrar no lugar do comprado (ex.: a convocação em andamento). */
  roster?: RosterView[];
  /** Gols e assistências de cada jogador (carta → [gols, assistências]), mostrados no campo. */
  stats?: Record<string, [number, number]>;
}) {
  const p = d.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const layout = LAYOUTS[p.formation] ?? LAYOUTS['4-3-3']!;
  const roster = (override ?? p.roster).filter((r) => !hidden?.has(r.cardId));
  const used = new Map<string, number>();
  return (
    <div className="squad-field" role="img" aria-label={`Escalação de ${p.name}`}>
      <FieldArt />
      {layout.map((slot, i) => {
        const n = used.get(slot.pos) ?? 0;
        used.set(slot.pos, n + 1);
        const entry = roster.filter((r) => r.position === slot.pos)[n];
        const card = entry ? d.cards[entry.cardId] : undefined;
        const [x, y] = project(slot.u, slot.v);
        const style = { left: `${x}%`, top: `${(y / VB_H) * 100}%` };
        if (!entry || !card) {
          return (
            <div className="field-token field-open" key={i} style={style}>
              <span className="field-ghost">{slot.pos}</span>
            </div>
          );
        }
        const legend = card.tier === 'lenda';
        const band = card.levelMin !== undefined ? `${card.levelMin}–${card.levelMax}` : null;
        const [goals, assists] = stats?.[entry.cardId] ?? [0, 0];
        return (
          <div
            className="field-token"
            key={i}
            style={style}
            data-legend={legend || undefined}
            title={`${card.name} · ${card.club} (${card.year})${card.tier ? ` · ${TIER_LABEL[card.tier]}` : ''}`}
          >
            {legend && (
              <span className="field-hex">
                <LegendFigure club={card.club} kit={card.kit} size={48} />
              </span>
            )}
            <span className="field-pos">{slot.pos}</span>
            <span className="field-name" data-tier={card.tier}>
              {shortName(card.name)}
            </span>
            {stats && (goals > 0 || assists > 0) && (
              <span className="field-stats">
                {goals > 0 && (
                  <span className="field-goals" title={`${goals} ${goals === 1 ? 'gol' : 'gols'}`}>
                    <PixelBall size={10} />
                    {goals}
                  </span>
                )}
                {assists > 0 && (
                  <span className="field-assists" title={`${assists} ${assists === 1 ? 'assistência' : 'assistências'}`}>
                    A{assists}
                  </span>
                )}
              </span>
            )}
            {(band || showPrice) && (
              <span className="field-meta">
                {band && (
                  <span className="field-band" title="Faixa de nível">
                    {band}
                  </span>
                )}
                {showPrice &&
                  (entry.source === 'monte' ? (
                    <span className="field-price" data-monte="true" title="Pego de graça no Monte Final">
                      Monte
                    </span>
                  ) : (
                    <span className="field-price" title={`Pagou ${entry.price} ${entry.price === 1 ? 'moeda' : 'moedas'}`}>
                      <CoinIcon />
                      {entry.price}
                    </span>
                  ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
