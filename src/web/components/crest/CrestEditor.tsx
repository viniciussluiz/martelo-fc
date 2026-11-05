import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  CREST_BORDERS,
  CREST_COLORS,
  CREST_PATTERNS,
  CREST_SHAPES,
  CREST_SYMBOLS,
  randomCrest,
  teamInitials,
  type CrestConfig,
} from '../../../shared/crest';
import type { PublicUserView } from '../../../shared/protocol';
import { api } from '../../lib/api';
import { store, toast } from '../../lib/store';
import { Icon } from '../Icon';
import { Crest } from './Crest';
import { SYMBOL_LABEL } from './symbols';

/**
 * Criador de escudos: escudo grande à esquerda, que muda na hora, e as peças à direita
 * em quatro abas (formato, cores, símbolo e enfeites). Tudo por clique, sem formulário.
 */

const SHAPE_LABEL: Record<string, string> = {
  classico: 'Clássico',
  frances: 'Francês',
  redondo: 'Redondo',
  moderno: 'Moderno',
  retro: 'Retrô',
  brasao: 'Brasão',
  oval: 'Oval',
  diamante: 'Losango',
};

const PATTERN_LABEL: Record<string, string> = {
  liso: 'Liso',
  listras: 'Listras',
  faixa: 'Faixa diagonal',
  metade: 'Meio a meio',
  meio: 'Metade de baixo',
  aros: 'Listras deitadas',
  cruz: 'Cruz',
  chevron: 'Divisa',
  quartos: 'Quartos',
  topo: 'Faixa no topo',
  central: 'Faixa central',
};

const BORDER_LABEL: Record<string, string> = { simples: 'Simples', dupla: 'Dupla', grossa: 'Grossa' };

/** Combinações prontas (fundo, padrão, detalhes). */
const COMBOS: Array<{ name: string; colors: [string, string, string] }> = [
  { name: 'Rubro-negro', colors: ['#D2392B', '#1A1A1A', '#FFC81E'] },
  { name: 'Alvinegro', colors: ['#1A1A1A', '#FFFFFF', '#FFC81E'] },
  { name: 'Tricolor', colors: ['#FFFFFF', '#D2392B', '#1C2E6B'] },
  { name: 'Alviverde', colors: ['#2E8B3A', '#FFFFFF', '#FFC81E'] },
  { name: 'Celeste', colors: ['#6EC1F0', '#FFFFFF', '#1C2E6B'] },
  { name: 'Canarinho', colors: ['#FFC81E', '#2E8B3A', '#1C2E6B'] },
  { name: 'Grená', colors: ['#7D1C2C', '#1C2E6B', '#FFC81E'] },
  { name: 'Laranja mecânica', colors: ['#F07D1A', '#1A1A1A', '#FFFFFF'] },
];

type Tab = 'formato' | 'cores' | 'simbolo' | 'enfeites';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'formato', label: 'Formato' },
  { id: 'cores', label: 'Cores' },
  { id: 'simbolo', label: 'Símbolo' },
  { id: 'enfeites', label: 'Enfeites' },
];

function ColorRow({ label, value, onPick }: { label: string; value: string; onPick: (hex: string) => void }) {
  const custom = !CREST_COLORS.some((c) => c.hex === value.toUpperCase());
  return (
    <div className="ce-colors">
      <span className="ce-label">{label}</span>
      <div className="ce-swatches" role="group" aria-label={label}>
        {CREST_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ce-swatch"
            style={{ background: c.hex }}
            aria-label={c.name}
            title={c.name}
            aria-pressed={value.toUpperCase() === c.hex}
            onClick={() => onPick(c.hex)}
          />
        ))}
        <label className="ce-swatch ce-swatch-free" data-on={custom || undefined} title="Outra cor" style={custom ? { background: value } : undefined}>
          <input type="color" value={value} onChange={(e) => onPick(e.target.value.toUpperCase())} aria-label={`${label}: outra cor`} />
          {!custom && <span aria-hidden="true">+</span>}
        </label>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="ce-toggle" aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span className="ce-toggle-knob" aria-hidden="true" />
      {label}
    </button>
  );
}

export function CrestEditor({
  value,
  onChange,
  teamName,
  compact,
}: {
  value: CrestConfig;
  onChange: (c: CrestConfig) => void;
  teamName: string;
  /** Pré-visualização menor (formulário de entrada). */
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('formato');
  const [pop, setPop] = useState(0);
  const uid = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const set = (patch: Partial<CrestConfig>) => {
    onChange({ ...value, ...patch });
    setPop((n) => n + 1);
  };
  const roll = () => {
    const r = randomCrest(teamName || 'Martelo FC');
    onChange({ ...r, initials: value.initials || r.initials, motto: value.motto || r.motto });
    setPop((n) => n + 1);
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const t = TABS[(to + TABS.length) % TABS.length]!;
    setTab(t.id);
    tabRefs.current[t.id]?.focus();
  };

  return (
    <div className="crest-editor" data-compact={compact || undefined}>
      <div className="ce-stage">
        <div className="ce-spot">
          <div className="ce-preview" key={pop}>
            <Crest crest={value} size={compact ? 168 : 210} title={`Escudo de ${teamName || 'seu time'}`} />
          </div>
          <div className="ce-pedestal" aria-hidden="true" />
        </div>
        <button type="button" className="btn btn-sm ce-roll" onClick={roll}>
          <Icon name="dado" /> Sortear
        </button>
      </div>

      <div className="ce-tools">
        <div className="ce-tabs" role="tablist" aria-label="Peças do escudo">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${uid}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ce-panel" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
          {tab === 'formato' && (
            <>
              <span className="ce-label">Formato</span>
              <div className="ce-grid" role="group" aria-label="Formato">
                {CREST_SHAPES.map((s) => (
                  <button key={s} type="button" className="ce-tile" aria-pressed={value.shape === s} onClick={() => set({ shape: s })}>
                    <Crest crest={{ ...value, shape: s, stars: 0, ribbon: false, laurel: false }} size={50} simple />
                    <span>{SHAPE_LABEL[s]}</span>
                  </button>
                ))}
              </div>
              <span className="ce-label">Padrão</span>
              <div className="ce-grid" role="group" aria-label="Padrão">
                {CREST_PATTERNS.map((p) => (
                  <button key={p} type="button" className="ce-tile" aria-pressed={value.pattern === p} onClick={() => set({ pattern: p })}>
                    <Crest crest={{ ...value, pattern: p, symbol: 'nenhum', stars: 0, ribbon: false, laurel: false }} size={50} simple />
                    <span>{PATTERN_LABEL[p]}</span>
                  </button>
                ))}
              </div>
              <span className="ce-label">Borda</span>
              <div className="ce-chips" role="group" aria-label="Borda">
                {CREST_BORDERS.map((b) => (
                  <button key={b} type="button" className="ce-chip" aria-pressed={value.border === b} onClick={() => set({ border: b })}>
                    {BORDER_LABEL[b]}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === 'cores' && (
            <>
              <span className="ce-label">Combinações prontas</span>
              <div className="ce-combos" role="group" aria-label="Combinações prontas">
                {COMBOS.map((c) => {
                  const on = value.primary === c.colors[0] && value.secondary === c.colors[1] && value.detail === c.colors[2];
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className="ce-combo"
                      aria-pressed={on}
                      onClick={() => set({ primary: c.colors[0], secondary: c.colors[1], detail: c.colors[2] })}
                    >
                      <span className="ce-combo-dots" aria-hidden="true">
                        {c.colors.map((hex) => (
                          <i key={hex} style={{ background: hex }} />
                        ))}
                      </span>
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <ColorRow label="Cor principal" value={value.primary} onPick={(hex) => set({ primary: hex })} />
              <ColorRow label="Cor secundária" value={value.secondary} onPick={(hex) => set({ secondary: hex })} />
              <ColorRow label="Cor dos detalhes" value={value.detail} onPick={(hex) => set({ detail: hex })} />
            </>
          )}

          {tab === 'simbolo' && (
            <>
              <div className="ce-grid ce-grid-symbols" role="group" aria-label="Símbolo">
                {CREST_SYMBOLS.map((s) => (
                  <button key={s} type="button" className="ce-tile" aria-pressed={value.symbol === s} onClick={() => set({ symbol: s })}>
                    <Crest crest={{ ...value, symbol: s, stars: 0, ribbon: false, laurel: false }} size={50} simple />
                    <span>{SYMBOL_LABEL[s]}</span>
                  </button>
                ))}
              </div>
              <div className="ce-row">
                <label className="ce-field">
                  <span className="ce-label">Sigla</span>
                  <input
                    className="input ce-initials"
                    value={value.initials}
                    maxLength={4}
                    onChange={(e) => set({ initials: e.target.value.toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÂÊÔÃÕÇ]/gi, '').slice(0, 4) || teamInitials(teamName) })}
                    aria-describedby={`${uid}-sigla`}
                  />
                </label>
                <span className="small muted" id={`${uid}-sigla`}>
                  Aparece no símbolo “Sigla” e na faixa do topo.
                </span>
              </div>
              <Toggle label="Medalhão atrás do símbolo" checked={value.medallion} onChange={(v) => set({ medallion: v })} />
            </>
          )}

          {tab === 'enfeites' && (
            <>
              <span className="ce-label">Estrelas em cima</span>
              <div className="ce-stars" role="group" aria-label="Estrelas em cima">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="ce-chip" aria-pressed={value.stars === n} onClick={() => set({ stars: n })} aria-label={`${n} estrelas`}>
                    {n === 0 ? (
                      'Nenhuma'
                    ) : (
                      <span className="ce-star-row" aria-hidden="true">
                        {Array.from({ length: n }, (_, i) => (
                          <Icon key={i} name="estrela-cheia" size={13} />
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Toggle label="Faixa embaixo" checked={value.ribbon} onChange={(v) => set({ ribbon: v })} />
              {value.ribbon && (
                <label className="ce-field">
                  <span className="ce-label">Texto da faixa</span>
                  <input
                    className="input"
                    value={value.motto}
                    maxLength={10}
                    placeholder="Ex.: 1998, RAÇA"
                    onChange={(e) => set({ motto: e.target.value.toUpperCase().slice(0, 10) })}
                  />
                </label>
              )}
              <Toggle label="Ramos de louro" checked={value.laurel} onChange={(v) => set({ laurel: v })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Janela com o criador para quem já tem time: salva na conta e vale em todas as telas. */
export function CrestEditorDialog({ open, onClose, initial, teamName }: { open: boolean; onClose: () => void; initial: CrestConfig; teamName: string }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(initial);
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
    // `initial` só importa na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: PublicUserView }>('PUT', '/api/me/crest', { crest: draft });
      store.set((s) => ({
        user: r.user,
        room: s.room ? { ...s.room, crests: { ...s.room.crests, [r.user.id]: r.user.crest } } : s.room,
      }));
      toast({ kind: 'sucesso', title: 'Escudo salvo', body: 'Ele já aparece no placar, na tabela e no seu perfil.', icon: 'escudo' });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog ref={ref} className="dialog crest-dialog" onClose={onClose} aria-labelledby="crest-dialog-title">
      <div className="dialog-head">
        <h2 id="crest-dialog-title">Escudo do {teamName}</h2>
        <button type="button" className="dialog-x" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>
      <div className="dialog-body">
        <CrestEditor value={draft} onChange={setDraft} teamName={teamName} />
      </div>
      <div className="dialog-foot">
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          <Icon name="escudo" /> Salvar escudo
        </button>
      </div>
    </dialog>
  );
}
