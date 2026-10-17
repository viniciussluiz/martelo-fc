import { useEffect, useMemo, useState } from 'react';
import { Spinner, fmtDate } from '../components/common';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useStore } from '../lib/store';

interface Trophy {
  id: string;
  name: string;
  description: string;
  criteria: string;
  icon: string;
  category: string;
  categoryLabel: string;
  rarity: 'comum' | 'rara' | 'epica' | 'lendaria';
  rarityLabel: string;
  secret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number; ratio: number };
}

interface Room {
  userId: string;
  stats: Record<string, number>;
  career: { level: number; name: string; xp: number; nextXp: number | null };
  totals: { unlocked: number; total: number; byRarity: Record<string, { unlocked: number; total: number }> };
  trophies: Trophy[];
}

type Filter = 'todas' | 'conquistadas' | 'bloqueadas';

export function TrophyPage({ userId }: { userId: string }) {
  const me = useStore((s) => s.user);
  const [data, setData] = useState<Room | null>(null);
  const [owner, setOwner] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('todas');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    Promise.all([api<Room>('GET', `/api/users/${userId}/trophies`), api<{ user: { displayName: string } }>('GET', `/api/users/${userId}/profile`)])
      .then(([t, p]) => {
        setData(t);
        setOwner(p.user.displayName);
        const firstUnlocked = [...t.trophies].filter((x) => x.unlocked).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))[0];
        setSelected(firstUnlocked?.id ?? t.trophies[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [userId]);

  const groups = useMemo(() => {
    if (!data) return [];
    const list = data.trophies.filter((t) => (filter === 'todas' ? true : filter === 'conquistadas' ? t.unlocked : !t.unlocked));
    const map = new Map<string, { label: string; items: Trophy[] }>();
    for (const t of list) {
      const g = map.get(t.category) ?? { label: t.categoryLabel, items: [] };
      g.items.push(t);
      map.set(t.category, g);
    }
    return [...map.values()];
  }, [data, filter]);

  if (error) return <div className="empty">{error}</div>;
  if (!data) return <Spinner label="Abrindo a Sala de Troféus…" />;
  const sel = data.trophies.find((t) => t.id === selected) ?? null;
  const isMe = me?.id === userId;
  const recent = [...data.trophies].filter((t) => t.unlocked).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '')).slice(0, 3);

  return (
    <div className="trophy-room stack" style={{ gap: 20 }}>
      <div className="spread">
        <div className="stack" style={{ gap: 6 }}>
          <h1>Sala de Troféus</h1>
          <p className="muted">{isMe ? 'Sua estante' : `Estante de ${owner}`}. Cada peça aqui foi conquistada em disputa concluída.</p>
        </div>
        <div className="stack" style={{ gap: 2, textAlign: 'right' }}>
          <span className="num" style={{ fontSize: '3rem', color: 'var(--gold)', lineHeight: 1 }}>
            {data.totals.unlocked}/{data.totals.total}
          </span>
          <span className="small muted">conquistas</span>
        </div>
      </div>

      <div className="stat-strip">
        {(['comum', 'rara', 'epica', 'lendaria'] as const).map((r) => {
          const v = data.totals.byRarity[r] ?? { unlocked: 0, total: 0 };
          return (
            <div key={r} className="stat" style={{ background: '#18233f', borderColor: '#2c3a60' }}>
              <span className={`rarity rarity-${r}`}>{r === 'epica' ? 'Épica' : r === 'lendaria' ? 'Lendária' : r === 'rara' ? 'Rara' : 'Comum'}</span>
              <div className="num" style={{ marginTop: 6 }}>
                {v.unlocked}
                <span className="small muted">/{v.total}</span>
              </div>
            </div>
          );
        })}
        <div className="stat" style={{ background: '#18233f', borderColor: '#2c3a60' }}>
          <span className="small muted">Trajetória</span>
          <div className="num" style={{ fontSize: '1.4rem', marginTop: 4 }}>
            {data.career.name}
          </div>
          <div className="small muted">{data.career.xp} pontos</div>
        </div>
        <div className="stat" style={{ background: '#18233f', borderColor: '#2c3a60' }}>
          <span className="small muted">Títulos</span>
          <div className="num" style={{ marginTop: 4 }}>
            {data.stats.titles}
          </div>
          <div className="small muted">
            {data.stats.leagueTitles} ligas, {data.stats.cupTitles} copas
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <p className="small muted">Mais recentes: {recent.map((t) => `${t.name} (${fmtDate(t.unlockedAt)})`).join(', ')}.</p>
      )}

      {sel && (
        <div className="trophy-detail" aria-live="polite">
          <div className="trophy" data-unlocked={sel.unlocked} data-rarity={sel.rarity} style={{ cursor: 'default', padding: 0 }}>
            <div className="trophy-medal">
              <Icon name={sel.icon} />
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8 }}>
              <strong style={{ fontFamily: 'var(--f-display)', fontSize: '1.5rem' }}>{sel.name}</strong>
              <span className={`rarity rarity-${sel.rarity}`}>{sel.rarityLabel}</span>
              <span className="badge">{sel.categoryLabel}</span>
            </div>
            <p>{sel.description}</p>
            <p className="small muted">Como conquistar: {sel.criteria}</p>
            {sel.unlocked ? (
              <p className="small" style={{ color: 'var(--gold)' }}>
                Conquistada em {fmtDate(sel.unlockedAt)}.
              </p>
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                <div className="trophy-prog" style={{ width: '100%' }}>
                  <span style={{ width: `${Math.round(sel.progress.ratio * 100)}%` }} />
                </div>
                <span className="small muted">
                  {sel.secret ? 'Progresso escondido.' : `Progresso: ${sel.progress.current} de ${sel.progress.target}.`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="seg" role="group" aria-label="Filtrar" style={{ alignSelf: 'flex-start', borderColor: '#46557a' }}>
        {(['todas', 'conquistadas', 'bloqueadas'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'var(--gold)' : '#18233f', color: filter === f ? '#2a1d00' : '#dfe5f0' }}>
            {f === 'todas' ? 'Todas' : f === 'conquistadas' ? 'Conquistadas' : 'Bloqueadas'}
          </button>
        ))}
      </div>

      {groups.length === 0 && <div className="empty">Nada aqui com esse filtro.</div>}
      {groups.map((g) => (
        <section className="shelf" key={g.label}>
          <div className="shelf-title">
            <span>{g.label}</span>
            <span className="small muted">
              {g.items.filter((t) => t.unlocked).length}/{g.items.length}
            </span>
          </div>
          <div className="shelf-row">
            {g.items.map((t) => (
              <button
                key={t.id}
                type="button"
                className="trophy"
                data-unlocked={t.unlocked}
                data-rarity={t.rarity}
                aria-pressed={selected === t.id}
                onClick={() => setSelected(t.id)}
                aria-label={`${t.name}: ${t.unlocked ? 'conquistada' : 'bloqueada'}`}
              >
                <div className="trophy-medal">
                  <Icon name={t.icon} />
                </div>
                <span className="trophy-name">{t.name}</span>
                {!t.unlocked && !t.secret && t.progress.target > 1 && (
                  <span className="trophy-prog" aria-hidden="true">
                    <span style={{ width: `${Math.round(t.progress.ratio * 100)}%` }} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
