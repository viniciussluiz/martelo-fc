import { useState } from 'react';
import {
  CREST_COLORS,
  KIT_BRANDS,
  KIT_BRAND_LABEL,
  KIT_MASTERS,
  KIT_MASTER_LABEL,
  KIT_PATTERNS,
  colorDistance,
  kitsOf,
  type CrestConfig,
  type KitColors,
  type KitPattern,
  type TeamKits,
} from '../../../shared/crest';
import { Icon } from '../Icon';
import { inkOn } from './Crest';
import { ColorRow } from './CrestEditor';
import { BrandMark, Jersey } from './Jersey';

/**
 * Criador de uniformes: a camisa grande em cima (setas trocam entre o uniforme 1 e o 2), e embaixo
 * três abas — o desenho da camisa, as cores e os patrocínios (master e material esportivo).
 */

const PATTERN_LABEL: Record<KitPattern, string> = {
  liso: 'Lisa',
  listras: 'Listras',
  'listras-finas': 'Listras finas',
  aros: 'Listras deitadas',
  'faixa-central': 'Faixa central',
  'faixa-peito': 'Faixa no peito',
  'faixa-diagonal': 'Faixa diagonal',
  divisa: 'Divisa',
  xadrez: 'Xadrez',
  metade: 'Meio a meio',
  cruz: 'Cruz',
  mangas: 'Mangas de outra cor',
};

type Tab = 'padroes' | 'cores' | 'patrocinios';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'padroes', label: 'Padrões' },
  { id: 'cores', label: 'Cores' },
  { id: 'patrocinios', label: 'Patrocínios' },
];

const pickOne = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

export function KitEditor({ value, onChange, teamName }: { value: CrestConfig; onChange: (c: CrestConfig) => void; teamName: string }) {
  const [which, setWhich] = useState<'home' | 'away'>('home');
  const [tab, setTab] = useState<Tab>('padroes');
  const [pop, setPop] = useState(0);
  const kits = kitsOf(value);
  const kit = kits[which];
  const n = which === 'home' ? 1 : 2;
  const setKits = (next: TeamKits) => {
    onChange({ ...value, kits: next });
    setPop((k) => k + 1);
  };
  const setKit = (patch: Partial<KitColors>) => setKits({ ...kits, [which]: { ...kit, ...patch } });
  const flip = () => setWhich((w) => (w === 'home' ? 'away' : 'home'));
  const roll = () => {
    const shirt = pickOne(CREST_COLORS).hex;
    const trim = pickOne(CREST_COLORS.filter((c) => colorDistance(c.hex, shirt) > 150)).hex;
    setKit({ shirt, trim, pattern: pickOne(KIT_PATTERNS) });
  };
  const reset = () => {
    const { kits: _dropped, ...rest } = value;
    onChange(rest);
    setPop((k) => k + 1);
  };

  return (
    <div className="kit-editor">
      <div className="kit-stage">
        <button type="button" className="kit-arrow" onClick={flip} aria-label="Uniforme anterior">
          ‹
        </button>
        <div className="kit-show">
          <div className="kit-preview" key={`${which}-${pop}`}>
            <Jersey kit={kit} kits={kits} crest={value} size={250} title={`Uniforme ${n} de ${teamName || 'seu time'}`} />
          </div>
          <div className="seg kit-which" role="group" aria-label="Uniforme">
            <button type="button" aria-pressed={which === 'home'} onClick={() => setWhich('home')}>
              Uniforme 1
            </button>
            <button type="button" aria-pressed={which === 'away'} onClick={() => setWhich('away')}>
              Uniforme 2
            </button>
          </div>
          <button type="button" className="btn btn-sm ce-roll" onClick={roll}>
            <Icon name="dado" /> Sortear
          </button>
        </div>
        <button type="button" className="kit-arrow" onClick={flip} aria-label="Próximo uniforme">
          ›
        </button>
      </div>

      <div className="ce-tools">
        <div className="ce-tabs" role="tablist" aria-label="Peças do uniforme">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ce-panel" role="tabpanel">
          {tab === 'padroes' && (
            <div className="kit-patterns" role="group" aria-label={`Desenho do uniforme ${n}`}>
              {KIT_PATTERNS.map((p) => (
                <button key={p} type="button" className="kit-pattern" aria-pressed={(kit.pattern ?? 'liso') === p} onClick={() => setKit({ pattern: p })} title={PATTERN_LABEL[p]}>
                  <Jersey kit={{ ...kit, pattern: p }} size={58} simple title={PATTERN_LABEL[p]} />
                  <span>{PATTERN_LABEL[p]}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'cores' && (
            <>
              <ColorRow label={`Camisa ${n}`} value={kit.shirt} onPick={(hex) => setKit({ shirt: hex })} />
              <ColorRow label={`Detalhes e desenho ${n}`} value={kit.trim} onPick={(hex) => setKit({ trim: hex })} />
              <p className="small muted kit-note">
                {value.kits
                  ? 'O uniforme 2 entra em campo quando a camisa 1 se confunde com a do adversário. No campinho, os jogadores são bolinhas na cor da camisa.'
                  : 'Por enquanto os uniformes seguem as cores do escudo: o 1 na cor principal e o 2 ao contrário (claro se ela for escura, escuro se for clara). Mude à vontade.'}
              </p>
              {value.kits && (
                <button type="button" className="btn btn-sm btn-ghost kit-reset" onClick={reset}>
                  Voltar para as cores do escudo
                </button>
              )}
            </>
          )}

          {tab === 'patrocinios' && (
            <>
              <span className="ce-label">Patrocínio master (peito)</span>
              <div className="ce-chips" role="group" aria-label="Patrocínio master">
                {KIT_MASTERS.map((m) => (
                  <button key={m} type="button" className="ce-chip" aria-pressed={(kits.master ?? 'nenhum') === m} onClick={() => setKits({ ...kits, master: m })}>
                    {KIT_MASTER_LABEL[m]}
                  </button>
                ))}
              </div>
              <span className="ce-label">Material esportivo</span>
              <div className="kit-brands" role="group" aria-label="Material esportivo">
                {KIT_BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className="kit-brand"
                    aria-pressed={(kits.brand ?? 'nenhum') === b}
                    aria-label={KIT_BRAND_LABEL[b]}
                    title={KIT_BRAND_LABEL[b]}
                    onClick={() => setKits({ ...kits, brand: b })}
                  >
                    {/* Só o desenho; a opção vazia leva o texto, para não ficar um quadro em branco. */}
                    {b === 'nenhum' ? (
                      <span className="kit-brand-none">{KIT_BRAND_LABEL[b]}</span>
                    ) : (
                      <svg viewBox="-4 -3 72 46" width="84" height="54" aria-hidden="true" style={{ background: kit.shirt }}>
                        <BrandMark brand={b} color={inkOn(kit.shirt)} />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <p className="small muted kit-note">Valem para os dois uniformes. O master são as marcas da casa; as marcas de material esportivo são inventadas.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
