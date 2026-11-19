import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminCardView, AdminFaces, AdminNewCard } from '../../shared/protocol';
import { Empty, POSITION_NAME, Spinner, TIER_LABEL } from '../components/common';
import { Icon } from '../components/Icon';
import { PosChip } from '../components/ui';
import { api } from '../lib/api';
import { legendArtUrl } from '../lib/legendArt';
import { toast } from '../lib/store';
import { tierForLevel } from '../../engine/types';

/**
 * Página de admin (só o dono do site): todos os jogadores do baralho, com filtro por clube e por
 * posição. Dá para marcar quem é Lenda e mudar o nível (faixa mínima–máxima). Mostra quem tem face
 * (retrato ilustrado) — a face só aparece no jogo quando a carta é Lenda.
 * Também cria jogadores (e exclui os criados aqui). Os ajustes valem para as disputas que começarem
 * depois; as que já estão rolando não mudam.
 */

const PAGE = 150;
const POSITIONS = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const;
const GROUPS: Array<{ id: string; label: string }> = [
  { id: 'A', label: 'Série A' },
  { id: 'B', label: 'Série B' },
  { id: 'EU', label: 'Europa' },
  { id: 'SEL', label: 'Seleções' },
];
type Show = 'todos' | 'lendas' | 'lendas-sem-face' | 'com-face' | 'editados' | 'criados';
const SHOW_LABEL: Record<Show, string> = {
  todos: 'Todos',
  lendas: 'Só Lendas',
  'lendas-sem-face': 'Lendas sem face',
  'com-face': 'Com face',
  editados: 'Ajustados por você',
  criados: 'Criados por você',
};

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function AdminPage() {
  const [cards, setCards] = useState<AdminCardView[] | null>(null);
  const [faces, setFaces] = useState<AdminFaces | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [club, setClub] = useState('');
  const [pos, setPos] = useState('');
  const [show, setShow] = useState<Show>('todos');
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ cards: AdminCardView[]; faces: AdminFaces }>('GET', '/api/admin/cards')
      .then((r) => {
        setCards(r.cards);
        setFaces(r.faces);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => setLimit(PAGE), [query, club, pos, show]);

  const clubsByGroup = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const c of cards ?? []) {
      const g = c.series ?? 'outros';
      if (!out.has(g)) out.set(g, new Set());
      out.get(g)!.add(c.club);
    }
    return out;
  }, [cards]);

  const filtered = useMemo(() => {
    const q = plain(query.trim());
    return (cards ?? [])
      .filter((c) => {
        if (club && c.club !== club) return false;
        if (pos && c.position !== pos) return false;
        if (q && !plain(c.name).includes(q)) return false;
        const face = !!legendArtUrl(c.id);
        if (show === 'lendas' && c.tier !== 'lenda') return false;
        if (show === 'lendas-sem-face' && (c.tier !== 'lenda' || face)) return false;
        if (show === 'com-face' && !face) return false;
        if (show === 'editados' && !c.original) return false;
        if (show === 'criados' && !c.custom) return false;
        return true;
      })
      .sort((a, b) => b.levelMin + b.levelMax - (a.levelMin + a.levelMax) || a.name.localeCompare(b.name));
  }, [cards, query, club, pos, show]);

  const replace = (next: AdminCardView, f: AdminFaces) => {
    setCards((list) => list?.map((c) => (c.id === next.id ? next : c)) ?? null);
    setFaces(f);
  };
  const removed = (id: string, f: AdminFaces) => {
    setCards((list) => list?.filter((c) => c.id !== id) ?? null);
    setFaces(f);
  };
  const created = (card: AdminCardView, f: AdminFaces) => {
    setCards((list) => [...(list ?? []), card]);
    setFaces(f);
    // Mostra o jogador novo na lista.
    setClub('');
    setPos('');
    setShow('todos');
    setQuery(card.name);
    setCreating(false);
  };

  if (error) return <Empty icon="cadeado">{error}</Empty>;
  if (!cards) return <Spinner label="Carregando o baralho…" />;

  const legends = cards.filter((c) => c.tier === 'lenda');
  const legendsNoFace = legends.filter((c) => !legendArtUrl(c.id)).length;
  const edited = cards.filter((c) => c.original).length;
  const own = cards.filter((c) => c.custom).length;

  return (
    <div className="admin-page stack">
      <header className="rooms-head">
        <div>
          <h1>Jogadores · admin</h1>
          <p>
            {cards.length} cartas · {legends.length} Lendas ({legendsNoFace} sem face) · {edited} ajustadas e {own} criadas por você. Tudo vale para as disputas que
            começarem a partir de agora.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="mais" size={18} /> Criar jogador
        </button>
      </header>
      {faces && <FacesPanel faces={faces} onChange={setFaces} />}
      <CreatePlayerDialog open={creating} clubsByGroup={clubsByGroup} onClose={() => setCreating(false)} onCreated={created} />

      <div className="admin-filters">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jogador" aria-label="Buscar jogador" />
        <select className="input" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Clube">
          <option value="">Todos os clubes</option>
          {[...GROUPS, { id: 'outros', label: 'Outros' }].map((g) => {
            const list = clubsByGroup.get(g.id);
            if (!list?.size) return null;
            return (
              <optgroup key={g.id} label={g.label}>
                {[...list].sort((a, b) => a.localeCompare(b)).map((name) => (
                  <option key={`${g.id}-${name}`} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <select className="input" value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Posição">
          <option value="">Todas as posições</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_NAME[p]}
            </option>
          ))}
        </select>
        <select className="input" value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Mostrar">
          {(Object.keys(SHOW_LABEL) as Show[]).map((s) => (
            <option key={s} value={s}>
              {SHOW_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <p className="small muted">
        {filtered.length} {filtered.length === 1 ? 'carta' : 'cartas'}, do maior nível para o menor.
      </p>

      {filtered.length === 0 ? (
        <Empty icon="info">Nenhuma carta com esses filtros.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Face</th>
                <th>Jogador</th>
                <th>Clube</th>
                <th>Pos.</th>
                <th>Faixa</th>
                <th>Overall (mín.–máx.)</th>
                <th>Lenda</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((c) => (
                <AdminRow key={c.id} card={c} onSaved={replace} onRemoved={removed} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > limit && (
        <button className="btn" onClick={() => setLimit((n) => n + PAGE)}>
          Mostrar mais ({filtered.length - limit} restantes)
        </button>
      )}
    </div>
  );
}

function AdminRow({
  card,
  onSaved,
  onRemoved,
}: {
  card: AdminCardView;
  onSaved: (c: AdminCardView, f: AdminFaces) => void;
  onRemoved: (id: string, f: AdminFaces) => void;
}) {
  const [min, setMin] = useState(String(card.levelMin));
  const [max, setMax] = useState(String(card.levelMax));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ faces: AdminFaces }>('DELETE', `/api/admin/custom-cards/${encodeURIComponent(card.id)}`);
      onRemoved(card.id, r.faces);
      toast({ kind: 'sucesso', title: 'Jogador excluído', body: `${card.name} (${card.club})` });
    } catch (e) {
      toast({ kind: 'erro', title: 'Não foi possível excluir', body: (e as Error).message });
      setBusy(false);
      setConfirmDelete(false);
    }
  };
  useEffect(() => {
    setMin(String(card.levelMin));
    setMax(String(card.levelMax));
  }, [card.levelMin, card.levelMax]);
  const face = legendArtUrl(card.id);
  const legend = card.tier === 'lenda';
  const nMin = Number(min);
  const nMax = Number(max);
  const valid = Number.isInteger(nMin) && Number.isInteger(nMax) && nMin >= 1 && nMax <= 100 && nMin <= nMax;
  const dirty = nMin !== card.levelMin || nMax !== card.levelMax;

  const send = async (method: 'PATCH' | 'DELETE', body?: Record<string, unknown>, done?: string) => {
    setBusy(true);
    try {
      const r = await api<{ card: AdminCardView; faces: AdminFaces }>(method, `/api/admin/cards/${encodeURIComponent(card.id)}`, body);
      onSaved(r.card, r.faces);
      const toFace = body?.legend === true && !legendArtUrl(r.card.id);
      if (done) {
        toast({
          kind: 'sucesso',
          title: done,
          body: `${r.card.name} (${r.card.club}): ${TIER_LABEL[r.card.tier]}, ${r.card.levelMin}–${r.card.levelMax}${toFace ? '. Sem face: entrou na lista de faces para gerar.' : ''}`,
        });
      }
    } catch (e) {
      toast({ kind: 'erro', title: 'Não foi possível salvar', body: (e as Error).message });
      setMin(String(card.levelMin));
      setMax(String(card.levelMax));
    } finally {
      setBusy(false);
    }
  };
  const saveLevel = () => {
    if (valid && dirty) void send('PATCH', { levelMin: nMin, levelMax: nMax }, 'Overall salvo');
  };

  return (
    <tr data-legend={legend || undefined} data-edited={card.original ? true : undefined}>
      <td>
        {face ? (
          <span className="admin-face" title={legend ? 'Tem face' : 'Tem face (só aparece no jogo se for Lenda)'}>
            <img src={face} alt="" loading="lazy" />
            <span className="badge badge-face">com face</span>
          </span>
        ) : (
          <span className="badge badge-noface">sem face</span>
        )}
      </td>
      <td>
        <strong>{card.name}</strong>
        <div className="small muted">
          {card.year}
          {card.custom && <span className="badge badge-custom">criado por você</span>}
        </div>
      </td>
      <td>{card.club}</td>
      <td>
        <PosChip pos={card.position} />
      </td>
      <td>
        <span className="admin-tier" data-tier={card.tier}>
          {TIER_LABEL[card.tier]}
        </span>
        {card.original && (
          <div className="small muted" title="Como está no arquivo do baralho">
            era {TIER_LABEL[card.original.tier]}, {card.original.levelMin}–{card.original.levelMax}
          </div>
        )}
      </td>
      <td>
        <form
          className="admin-level"
          onSubmit={(e) => {
            e.preventDefault();
            saveLevel();
          }}
        >
          <input className="input" type="number" min={1} max={100} value={min} onChange={(e) => setMin(e.target.value)} aria-label={`Nível mínimo de ${card.name}`} />
          <span aria-hidden="true">–</span>
          <input className="input" type="number" min={1} max={100} value={max} onChange={(e) => setMax(e.target.value)} aria-label={`Nível máximo de ${card.name}`} />
          <span className="small muted admin-mid">média {valid ? Math.round((nMin + nMax) / 2) : '—'}</span>
          {dirty && (
            <button className="btn btn-sm btn-primary" disabled={busy || !valid}>
              Salvar
            </button>
          )}
        </form>
      </td>
      <td>
        <label className="check">
          <input type="checkbox" checked={legend} disabled={busy} onChange={(e) => void send('PATCH', { legend: e.target.checked }, e.target.checked ? 'Agora é Lenda' : 'Não é mais Lenda')} />
          <span className="check-box" aria-hidden="true" />
          <span className="sr-only">Lenda</span>
        </label>
        {card.original && (
          <button type="button" className="link-btn small" disabled={busy} onClick={() => void send('DELETE', undefined, 'Ajuste desfeito')}>
            Desfazer
          </button>
        )}
        {card.custom && (
          <button type="button" className="link-btn small admin-delete" disabled={busy} onClick={() => void remove()} onBlur={() => setConfirmDelete(false)}>
            {confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
          </button>
        )}
      </td>
    </tr>
  );
}

const POSITION_ONE: Record<string, string> = { GOL: 'Goleiro', LAT: 'Lateral', ZAG: 'Zagueiro', MEI: 'Meia', ATA: 'Atacante' };

/** Uma linha da lista de faces, para colar onde for gerar a arte. A chave é como o retrato se liga ao jogador. */
function faceLine(f: AdminFaces['items'][number]): string {
  return `${f.name} · ${f.club} (${f.year}) · ${POSITION_ONE[f.position] ?? f.position} · chave ${f.key}`;
}

/**
 * Faces para gerar: quem foi marcado como Lenda e não tem retrato ilustrado. A lista sai pronta para
 * copiar e colar; quem ganha o retrato (arte nova no site) ou deixa de ser Lenda sai sozinho.
 */
function FacesPanel({ faces, onChange }: { faces: AdminFaces; onChange: (f: AdminFaces) => void }) {
  const [busy, setBusy] = useState(false);
  const text = faces.items.map(faceLine).join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ kind: 'sucesso', title: 'Lista copiada', body: `${faces.items.length} ${faces.items.length === 1 ? 'jogador' : 'jogadores'}` });
    } catch {
      toast({ kind: 'info', title: 'Não deu para copiar sozinho', body: 'Selecione o texto da caixa e copie.' });
    }
  };
  const call = async (method: 'POST' | 'DELETE', path: string) => {
    setBusy(true);
    try {
      onChange((await api<{ faces: AdminFaces }>(method, path)).faces);
    } catch (e) {
      toast({ kind: 'erro', title: 'Não foi possível atualizar a lista', body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="faces-panel" open={faces.items.length > 0}>
      <summary>
        <strong>Faces para gerar ({faces.items.length})</strong>
        <span className="small muted"> · quem você marcou como Lenda e ainda não tem retrato</span>
      </summary>
      <div className="faces-body stack">
        {faces.items.length === 0 ? (
          <p className="small muted">Nenhuma face pendente. Quando você marcar como Lenda alguém sem face, ele aparece aqui.</p>
        ) : (
          <>
            <textarea className="input faces-text" readOnly value={text} rows={Math.min(10, faces.items.length + 1)} aria-label="Lista de faces para gerar" onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy()}>
                <Icon name="copiar" size={16} /> Copiar lista
              </button>
            </div>
            <ul className="faces-chips">
              {faces.items.map((f) => (
                <li key={f.key}>
                  <span>{f.name}</span>
                  <button type="button" className="faces-x" disabled={busy} onClick={() => void call('DELETE', `/api/admin/faces/${encodeURIComponent(f.key)}`)} aria-label={`Tirar ${f.name} da lista`} title="Tirar da lista">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {faces.missing > 0 && (
          <button type="button" className="link-btn small" disabled={busy} onClick={() => void call('POST', '/api/admin/faces/fill')}>
            Pôr na lista também as {faces.missing} Lendas do baralho que já estão sem face
          </button>
        )}
      </div>
    </details>
  );
}

const GROUP_NAME: Record<string, string> = { A: 'Série A', B: 'Série B', EU: 'Europa', SEL: 'Seleção' };
const NEW_CLUB = '__novo__';

/**
 * Criar jogador: nome, posição, clube (um do baralho ou um novo, com o grupo e as cores), ano, overall
 * e Lenda. Clube do baralho empresta o grupo e as cores dele.
 */
function CreatePlayerDialog({
  open,
  clubsByGroup,
  onClose,
  onCreated,
}: {
  open: boolean;
  clubsByGroup: Map<string, Set<string>>;
  onClose: () => void;
  onCreated: (c: AdminCardView, f: AdminFaces) => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const year = new Date().getFullYear();
  const blank = { name: '', position: 'ATA', club: '', newClub: '', series: 'A', kit1: '#1D3FC2', kit2: '#FFFFFF', year: String(year), min: '70', max: '76', legend: false };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof blank>) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setF(blank);
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const isNew = f.club === NEW_CLUB;
  const min = Number(f.min);
  const max = Number(f.max);
  const submit = async () => {
    setBusy(true);
    setError(null);
    const body: AdminNewCard = {
      name: f.name.trim(),
      position: f.position as AdminNewCard['position'],
      club: isNew ? f.newClub.trim() : f.club,
      ...(isNew ? { newClub: { series: f.series as NonNullable<AdminNewCard['newClub']>['series'], kit: [f.kit1, f.kit2] } } : {}),
      year: Number(f.year),
      levelMin: min,
      levelMax: max,
      legend: f.legend,
    };
    try {
      const r = await api<{ card: AdminCardView; faces: AdminFaces }>('POST', '/api/admin/cards', body);
      const toFace = r.card.tier === 'lenda';
      toast({
        kind: 'sucesso',
        title: 'Jogador criado',
        body: `${r.card.name} (${r.card.club}, ${r.card.year}): ${TIER_LABEL[r.card.tier]}, ${r.card.levelMin}–${r.card.levelMax}${toFace ? '. Entrou na lista de faces para gerar.' : ''}`,
      });
      onCreated(r.card, r.faces);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = f.name.trim().length >= 2 && (isNew ? f.newClub.trim().length >= 2 : !!f.club) && Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 100 && min <= max;
  return (
    <dialog ref={ref} className="dialog dialog-narrow" onClose={onClose} aria-labelledby="create-player-title">
      <div className="dialog-head">
        <h2 id="create-player-title">Criar jogador</h2>
        <button type="button" className="dialog-x" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <div className="dialog-body stack">
          <div className="field">
            <label htmlFor="np-name">Nome</label>
            <input id="np-name" className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} autoComplete="off" autoFocus />
          </div>
          <div className="admin-form-row">
            <div className="field">
              <label htmlFor="np-pos">Posição</label>
              <select id="np-pos" className="input" value={f.position} onChange={(e) => set({ position: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {POSITION_NAME[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="np-year">Ano</label>
              <input id="np-year" className="input" type="number" min={1900} max={year + 1} value={f.year} onChange={(e) => set({ year: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="np-club">Clube</label>
            <select id="np-club" className="input" value={f.club} onChange={(e) => set({ club: e.target.value })}>
              <option value="">Escolha o clube</option>
              <option value={NEW_CLUB}>Outro clube (novo)…</option>
              {[...GROUPS, { id: 'outros', label: 'Outros' }].map((g) => {
                const list = clubsByGroup.get(g.id);
                if (!list?.size) return null;
                return (
                  <optgroup key={g.id} label={g.label}>
                    {[...list].sort((a, b) => a.localeCompare(b)).map((name) => (
                      <option key={`${g.id}-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {!isNew && f.club && <p className="hint">O jogador pega o grupo e as cores do {f.club}.</p>}
          </div>
          {isNew && (
            <div className="admin-new-club stack">
              <div className="field">
                <label htmlFor="np-newclub">Nome do clube</label>
                <input id="np-newclub" className="input" value={f.newClub} onChange={(e) => set({ newClub: e.target.value })} maxLength={40} autoComplete="off" />
              </div>
              <div className="admin-form-row">
                <div className="field">
                  <label htmlFor="np-series">Grupo</label>
                  <select id="np-series" className="input" value={f.series} onChange={(e) => set({ series: e.target.value })}>
                    {Object.entries(GROUP_NAME).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Cores do uniforme</label>
                  <span className="admin-colors">
                    <input type="color" value={f.kit1} onChange={(e) => set({ kit1: e.target.value })} aria-label="Cor principal" />
                    <input type="color" value={f.kit2} onChange={(e) => set({ kit2: e.target.value })} aria-label="Cor secundária" />
                  </span>
                </div>
              </div>
              <p className="hint">Clube novo entra sem escudo oficial (fica o selo do jogo) e aparece só nas salas que usam o grupo escolhido.</p>
            </div>
          )}
          <div className="field">
            <label>Overall (mín.–máx.)</label>
            <span className="admin-level">
              <input className="input" type="number" min={1} max={100} value={f.min} onChange={(e) => set({ min: e.target.value })} aria-label="Nível mínimo" />
              <span aria-hidden="true">–</span>
              <input className="input" type="number" min={1} max={100} value={f.max} onChange={(e) => set({ max: e.target.value })} aria-label="Nível máximo" />
              <span className="small muted">
                média {Number.isFinite(min + max) ? Math.round((min + max) / 2) : '—'}
                {!f.legend && Number.isInteger(min) && Number.isInteger(max) && min <= max ? ` · ${TIER_LABEL[tierOf(min, max)]}` : ''}
              </span>
            </span>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.legend} onChange={(e) => set({ legend: e.target.checked })} />
            <span className="check-box" aria-hidden="true" />
            <span>Lenda</span>
          </label>
          {error && <p className="error-text">{error}</p>}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !ready}>
            Criar jogador
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** A faixa que o nível dá sem ser Lenda (a mesma conta do servidor: nunca acima de Craque). */
function tierOf(min: number, max: number): string {
  const t = tierForLevel((min + max) / 2);
  return t === 'lenda' ? 'craque' : t;
}
