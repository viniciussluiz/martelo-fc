import type { DisputeView } from '../../../shared/protocol';
import { CardAvatar, TierBadge } from '../common';

const FORMATION: Record<string, Record<string, number>> = {
  '4-3-3': { GOL: 1, LAT: 2, ZAG: 2, MEI: 3, ATA: 3 },
  '4-4-2': { GOL: 1, LAT: 2, ZAG: 2, MEI: 4, ATA: 2 },
};

/** Escalação em campo: ataque em cima, goleiro embaixo. Vagas vazias tracejadas. */
export function SquadPitch({ d, participantId, showPrice = true }: { d: DisputeView; participantId: string; showPrice?: boolean }) {
  const p = d.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const f = FORMATION[p.formation]!;
  const byPos = (pos: string) => p.roster.filter((r) => r.position === pos);
  const lines: Array<[string, string[]]> = [
    ['ATA', ['ATA']],
    ['MEI', ['MEI']],
    ['DEF', ['LAT', 'ZAG', 'ZAG', 'LAT']],
    ['GOL', ['GOL']],
  ];
  return (
    <div className="pitch" aria-label={`Escalação de ${p.name}`}>
      {lines.map(([key, positions]) => {
        let slots: Array<{ pos: string; entry: (typeof p.roster)[number] | undefined }>;
        if (key === 'DEF') {
          const lat = byPos('LAT');
          const zag = byPos('ZAG');
          slots = [
            { pos: 'LAT', entry: lat[0] },
            { pos: 'ZAG', entry: zag[0] },
            { pos: 'ZAG', entry: zag[1] },
            { pos: 'LAT', entry: lat[1] },
          ];
        } else {
          const pos = positions[0]!;
          const got = byPos(pos);
          slots = Array.from({ length: f[pos]! }, (_, i) => ({ pos, entry: got[i] }));
        }
        return (
          <div className="pitch-line" key={key}>
            {slots.map((s, i) => {
              const card = s.entry ? d.cards[s.entry.cardId] : undefined;
              if (!s.entry || !card) {
                return (
                  <div className="pitch-slot empty" key={i}>
                    <div className="small">{s.pos}</div>
                  </div>
                );
              }
              return (
                <div className="pitch-slot" key={i} title={`${card.name} (${card.club}, ${card.year})`} data-legend={card.tier === 'lenda' || undefined}>
                  <CardAvatar card={card} size={34} />
                  <div className="nm">{card.name}</div>
                  <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
                    {card.levelMin !== undefined ? (
                      <span className="band" style={{ fontSize: '0.9rem' }}>
                        {card.levelMin}–{card.levelMax}
                      </span>
                    ) : (
                      <TierBadge tier={card.tier} />
                    )}
                    {showPrice && <span className="small muted">{s.entry.source === 'monte' ? 'monte' : `${s.entry.price}`}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
