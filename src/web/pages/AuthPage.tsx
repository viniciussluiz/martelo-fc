import { useState } from 'react';
import type { PublicUserView } from '../../shared/protocol';
import { signIn } from '../App';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { store, toast, useStore } from '../lib/store';

type Mode = 'entrar' | 'criar' | 'converter';

export function AuthPage() {
  const user = useStore((s) => s.user);
  const [mode, setMode] = useState<Mode>(user?.isGuest ? 'converter' : 'entrar');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && !user.isGuest) {
    return (
      <div className="panel stack" style={{ maxWidth: 480 }}>
        <div className="panel-title">Você já está conectado como {user.displayName}.</div>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Ir para o início
        </button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'converter') {
        const r = await api<{ user: PublicUserView }>('POST', '/api/auth/upgrade', { username, password });
        store.set({ user: r.user });
        toast({ kind: 'sucesso', title: 'Conta criada', body: 'Seu histórico e seus troféus ficaram guardados.' });
      } else {
        const r = await api<{ token: string; user: PublicUserView }>(
          'POST',
          mode === 'entrar' ? '/api/auth/login' : '/api/auth/register',
          mode === 'entrar' ? { username, password } : { username, password, displayName },
        );
        await signIn(r.token, r.user);
      }
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel stack" style={{ maxWidth: 480 }} onSubmit={submit}>
      <h2>{mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Guardar meu progresso'}</h2>
      <div className="seg" role="group" aria-label="Tipo de acesso">
        {user?.isGuest && (
          <button type="button" aria-pressed={mode === 'converter'} onClick={() => setMode('converter')}>
            Converter convidado
          </button>
        )}
        <button type="button" aria-pressed={mode === 'entrar'} onClick={() => setMode('entrar')}>
          Entrar
        </button>
        {!user && (
          <button type="button" aria-pressed={mode === 'criar'} onClick={() => setMode('criar')}>
            Criar conta
          </button>
        )}
      </div>
      {mode === 'converter' && <p className="muted">Escolha usuário e senha. Seus resultados como convidado continuam valendo.</p>}
      {mode === 'criar' && (
        <div className="field">
          <label htmlFor="dn">Nome do time</label>
          <input id="dn" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={28} required />
        </div>
      )}
      <div className="field">
        <label htmlFor="un">Usuário</label>
        <input id="un" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="pw">Senha</label>
        <input
          id="pw"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Guardar progresso'}
      </button>
    </form>
  );
}
