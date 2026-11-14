import { useState } from 'react';
import type { PublicUserView } from '../../shared/protocol';
import { signIn } from '../App';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { navigate, queryParam } from '../lib/router';
import { toast } from '../lib/store';

/** Chegou pelo link do e-mail: cria a senha nova e já entra. */
export function ResetPage() {
  const token = queryParam('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== again) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: PublicUserView }>('POST', '/api/auth/reset', { token, password });
      await signIn(r.token, r.user);
      toast({ kind: 'sucesso', title: 'Senha nova criada', body: 'Você já está dentro. Os outros aparelhos precisam entrar de novo.' });
      navigate('/', true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel auth" onSubmit={submit}>
      <div className="panel-head">
        <h2>Criar senha nova</h2>
      </div>
      <div className="panel-body stack">
        {!token && <p className="error-text">Este endereço está incompleto. Abra o link do e-mail de novo ou peça outro em “Esqueci a senha”.</p>}
        <div className="row auth-fields">
          <div className="field">
            <label htmlFor="np">Senha nova</label>
            <input id="np" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
          </div>
          <div className="field">
            <label htmlFor="np2">Repita a senha</label>
            <input id="np2" className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={6} required />
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy || !token}>
          <Icon name="play" /> Salvar e entrar
        </button>
        <p className="small muted">
          <a
            href="/entrar"
            onClick={(e) => {
              e.preventDefault();
              navigate('/entrar');
            }}
          >
            Voltar para Entrar
          </a>
        </p>
      </div>
    </form>
  );
}
