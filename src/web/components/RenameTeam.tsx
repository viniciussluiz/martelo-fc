import { useState } from 'react';
import type { PublicUserView } from '../../shared/protocol';
import { api } from '../lib/api';
import { store, toast } from '../lib/store';

/** Formulário de troca do nome do time (cartão do clube no início e no perfil). */
export function RenameTeamForm({ user, onDone }: { user: PublicUserView; onDone: () => void }) {
  const [name, setName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (next === user.displayName) {
      onDone();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ user: PublicUserView }>('PATCH', '/api/me', { displayName: next });
      store.set({ user: r.user });
      toast({ kind: 'sucesso', title: 'Nome do time alterado', body: r.user.displayName });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="club-card-rename" onSubmit={submit}>
      <label className="sr-only" htmlFor="club-name">
        Nome do time
      </label>
      <input id="club-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={28} minLength={2} required autoFocus />
      {error && <p className="error-text small">{error}</p>}
      <div className="club-card-actions">
        <button className="btn btn-sm btn-primary" disabled={saving}>
          Salvar
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
