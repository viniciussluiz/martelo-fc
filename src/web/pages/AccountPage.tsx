import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { toast, useStore } from '../lib/store';

interface Account {
  username: string | null;
  email: string | null;
  isGuest: boolean;
}

/** Conta: troca de senha e, quando o servidor envia e-mail, o e-mail para recuperar a senha. */
export function AccountPage() {
  const user = useStore((s) => s.user);
  const [account, setAccount] = useState<Account | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || user.isGuest) return;
    void api<{ account: Account; recovery: boolean }>('GET', '/api/account')
      .then((r) => {
        setAccount(r.account);
        setRecovery(r.recovery);
        setEmail(r.account.email ?? '');
      })
      .catch((err: Error) => setEmailError(err.message));
  }, [user?.id, user?.isGuest]);

  if (!user || user.isGuest) {
    return (
      <div className="panel narrow">
        <div className="panel-head">
          <h2>Conta</h2>
        </div>
        <div className="panel-body stack">
          <p>{user ? 'Seu time ainda é de convidado: crie sua conta com e-mail e senha para entrar com ele em qualquer aparelho.' : 'Entre na sua conta para ver estes dados.'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/entrar')}>
            {user ? 'Criar conta' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setEmailError(null);
    try {
      const r = await api<{ account: Account }>('PUT', '/api/account/email', { email, password: emailPass });
      setAccount(r.account);
      setEmailPass('');
      toast({ kind: 'sucesso', title: 'E-mail salvo', body: 'É para ele que vai o link se você esquecer a senha.' });
    } catch (err) {
      setEmailError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) {
      setPassError('As duas senhas novas precisam ser iguais.');
      return;
    }
    setBusy(true);
    setPassError(null);
    try {
      await api('POST', '/api/auth/password', { current, next });
      setCurrent('');
      setNext('');
      setAgain('');
      toast({ kind: 'sucesso', title: 'Senha trocada', body: 'Os outros aparelhos precisam entrar de novo.' });
    } catch (err) {
      setPassError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack account-page">
      <form className="panel auth" onSubmit={saveEmail}>
        <div className="panel-head">
          <h2>Conta</h2>
          <span className="panel-head-aside">{account?.email ?? (user.username ? `@${user.username}` : '')}</span>
        </div>
        <div className="panel-body stack">
          <p className="muted">
            {account?.email
              ? 'É com este e-mail que você entra. Se esquecer a senha, o link para criar outra vai para ele.'
              : 'Sua conta ainda entra pelo usuário antigo. Cadastre um e-mail para entrar com ele e poder recuperar a senha.'}
          </p>
          <div className="row auth-fields">
            <div className="field">
              <label htmlFor="em">E-mail</label>
              <input id="em" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
            </div>
            <div className="field">
              <label htmlFor="emp">Senha atual</label>
              <input id="emp" className="input" type="password" value={emailPass} onChange={(e) => setEmailPass(e.target.value)} autoComplete="current-password" required />
            </div>
          </div>
          {emailError && <p className="error-text">{emailError}</p>}
          <button className="btn btn-primary" disabled={busy || (email.trim().toLowerCase() === (account?.email ?? '') && !!account?.email)}>
            Salvar e-mail
          </button>
        </div>
      </form>
      <form className="panel auth" onSubmit={savePassword}>
        <div className="panel-head">
          <h2>Trocar senha</h2>
          <span className="panel-head-aside">{account?.email ?? (user.username ? `@${user.username}` : '')}</span>
        </div>
        <div className="panel-body stack">
          <div className="field">
            <label htmlFor="cp">Senha atual</label>
            <input id="cp" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="row auth-fields">
            <div className="field">
              <label htmlFor="np">Senha nova</label>
              <input id="np" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
            </div>
            <div className="field">
              <label htmlFor="np2">Repita a senha nova</label>
              <input id="np2" className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={6} required />
            </div>
          </div>
          {passError && <p className="error-text">{passError}</p>}
          <button className="btn btn-primary" disabled={busy}>
            Trocar senha
          </button>
        </div>
      </form>
    </div>
  );
}
