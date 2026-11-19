import { useEffect, useMemo, useState } from 'react';
import type { AdminCardView } from '../../shared/protocol';
import { Empty, POSITION_NAME, Spinner, TIER_LABEL } from '../components/common';
import { PosChip } from '../components/ui';
import { api } from '../lib/api';
import { legendArtUrl } from '../lib/legendArt';
import { toast } from '../lib/store';

/**
 * Página de admin (só o dono do site): todos os jogadores do baralho, com filtro por clube e por
 * posição. Dá para marcar quem é Lenda e mudar o nível (faixa mínima–máxima). Mostra quem tem face
 * (retrato ilustrado) — a face só aparece no jogo quando a carta é Lenda.
 * Os ajustes valem para as disputas que começarem depois; as que já estão rolando não mudam.
 */

const PAGE = 150;
const POSITIONS = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA'] as const;
const GROUPS: Array<{ id: string; label: string }> = [
  { id: 'A', label: 'Série A' },
  { id: 'B', label: 'Série B' },
  { id: 'EU', label: 'Europa' },
  { id: 'SEL', label: 'Seleções' },
];
type Show = 'todos' | 'lendas' | 'lendas-sem-face' | 'com-face' | 'editados';
const SHOW_LABEL: Record<Show, string> = {
  todos: 'Todos',
  lendas: 'Só Lendas',
  'lendas-sem-face': 'Lendas sem face',
  'com-face': 'Com face',
  editados: 'Ajustados por você',
};

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function AdminPage() {
  const [cards, setCards] = useState<AdminCardView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [club, setClub] = useState('');
  const [pos, setPos] = useState('');
  const [show, setShow] = useState<Show>('todos');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    api<{ cards: AdminCardView[] }>('GET', '/api/admin/cards')
      .then((r) => setCards(r.cards))
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
        return true;
      })
      .sort((a, b) => b.levelMin + b.levelMax - (a.levelMin + a.levelMax) || a.name.localeCompare(b.name));
  }, [cards, query, club, pos, show]);

  const replace = (next: AdminCardView) => setCards((list) => list?.map((c) => (c.id === next.id ? next : c)) ?? null);

  if (error) return <Empty icon="cadeado">{error}</Empty>;
  if (!cards) return <Spinner label="Carregando o baralho…" />;

  const legends = cards.filter((c) => c.tier === 'lenda');
  const legendsNoFace = legends.filter((c) => !legendArtUrl(c.id)).length;
  const edited = cards.filter((c) => c.original).length;

  return (
    <div className="admin-page stack">
      <header className="rooms-head">
        <div>
          <h1>Jogadores · admin</h1>
          <p>
            {cards.length} cartas · {legends.length} Lendas ({legendsNoFace} sem face) · {edited} ajustadas por você. Os ajustes valem para as disputas que começarem a
            partir de agora.
          </p>
        </div>
      </header>

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
                <AdminRow key={c.id} card={c} onSaved={replace} />
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

function AdminRow({ card, onSaved }: { card: AdminCardView; onSaved: (c: AdminCardView) => void }) {
  const [min, setMin] = useState(String(card.levelMin));
  const [max, setMax] = useState(String(card.levelMax));
  const [busy, setBusy] = useState(false);
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
      const r = await api<{ card: AdminCardView }>(method, `/api/admin/cards/${encodeURIComponent(card.id)}`, body);
      onSaved(r.card);
      if (done) toast({ kind: 'sucesso', title: done, body: `${r.card.name} (${r.card.club}): ${TIER_LABEL[r.card.tier]}, ${r.card.levelMin}–${r.card.levelMax}` });
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
        <div className="small muted">{card.year}</div>
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
      </td>
    </tr>
  );
}
