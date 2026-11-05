import { useEffect, useMemo, useState } from 'react';
import type { CrestConfig } from '../../shared/crest';
import { Empty, Spinner, fmtDate } from '../components/common';
import { TeamCrest } from '../components/crest/TeamCrest';
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
  const [owner, setOwner] = useState<{ name: string; crest: CrestConfig | null }>({ name: '', crest: null });
  const [filter, setFilter] = useState<Filter>('todas');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    Promise.all([
      api<Room>('GET', `/api/users/${userId}/trophies`),
      api<{ user: { displayName: string; crest: CrestConfig } }>('GET', `/api/users/${userId}/profile`),
    ])
      .then(([t, p]) => {
        setData(t);
        setOwner({ name: p.user.displayName, crest: p.user.crest });
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

  if (error) return <Empty icon="info">{error}</Empty>;
  if (!data) return <Spinner label="Abrindo a Sala de Troféus…" />;
  const sel = data.trophies.find((t) => t.id === selected) ?? null;
  const isMe = me?.id === userId;
  const recent = [...data.trophies].filter((t) => t.unlocked).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '')).slice(0, 3);

  return (
    <div className="trophy-room">
      <header className="trophy-head">
        <span className="trophy-head-crest">
          <TeamCrest userId={userId} name={owner.name} crest={isMe && me ? me.crest : owner.crest} size={92} />
        </span>
        <div className="trophy-head-text">
          <h1>Sala de Troféus</h1>
          <p>{isMe ? 'Sua estante' : `Estante de ${owner.name}`}. Cada peça aqui foi conquistada em disputa concluída.</p>
        </div>
        <div className="trophy-count">
          <span className="led">
            {data.totals.unlocked}/{data.totals.total}
          </span>
          <span>conquistas</span>
        </div>
      </header>

      <div className="stat-strip">
        {(['comum', 'rara', 'epica', 'lendaria'] as const).map((r) => {
          const v = data.totals.byRarity[r] ?? { unlocked: 0, total: 0 };
          return (
            <div key={r} className="stat">
              <span className={`rarity rarity-${r}`}>{r === 'epica' ? 'Épica' : r === 'lendaria' ? 'Lendária' : r === 'rara' ? 'Rara' : 'Comum'}</span>
              <div className="num">
                {v.unlocked}
                <span className="num-of">/{v.total}</span>
              </div>
            </div>
          );
        })}
        <div className="stat">
          <span className="lbl">Trajetória</span>
          <div className="num num-word">{data.career.name}</div>
          <div className="lbl">{data.career.xp} pontos</div>
        </div>
        <div className="stat">
          <span className="lbl">Títulos</span>
          <div className="num">{data.stats.titles}</div>
          <div className="lbl">
            {data.stats.leagueTitles} ligas, {data.stats.cupTitles} copas
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <p className="small muted">Mais recentes: {recent.map((t) => `${t.name} (${fmtDate(t.unlockedAt)})`).join(', ')}.</p>
      )}

      {sel && (
        <div className="trophy-detail" aria-live="polite" key={sel.id}>
          <div className="trophy trophy-big" data-unlocked={sel.unlocked} data-rarity={sel.rarity}>
            <span className="trophy-ribbon" aria-hidden="true" />
            <div className="trophy-medal">
              <Icon name={sel.icon} />
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8 }}>
              <strong className="trophy-detail-name">{sel.name}</strong>
              <span className={`rarity rarity-${sel.rarity}`}>{sel.rarityLabel}</span>
              <span className="badge">{sel.categoryLabel}</span>
            </div>
            <p>{sel.description}</p>
            <p className="small muted">Como conquistar: {sel.criteria}</p>
            {sel.unlocked ? (
              <p className="trophy-when">
                <Icon name="medalha" size={16} /> Conquistada em {fmtDate(sel.unlockedAt)}.
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

      <div className="seg seg-gold" role="group" aria-label="Filtrar">
        {(['todas', 'conquistadas', 'bloqueadas'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'todas' ? 'Todas' : f === 'conquistadas' ? 'Conquistadas' : 'Bloqueadas'}
          </button>
        ))}
      </div>

      {groups.length === 0 && <Empty icon="estante">Nada aqui com esse filtro.</Empty>}
      {groups.map((g) => (
        <section className="shelf" key={g.label}>
          <div className="shelf-title">
            <h2>{g.label}</h2>
            <span className="shelf-count">
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
                <span className="trophy-ribbon" aria-hidden="true" />
                <div className="trophy-medal">
                  <Icon name={t.unlocked || !t.secret ? t.icon : 'segredo'} />
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
