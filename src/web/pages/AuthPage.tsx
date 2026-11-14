import { useEffect, useState } from 'react';
import { randomCrest, teamInitials, type CrestConfig } from '../../shared/crest';
import type { PublicUserView } from '../../shared/protocol';
import { CrestEditor } from '../components/crest/CrestEditor';
import { Icon } from '../components/Icon';
import { signIn } from '../App';
import { api } from '../lib/api';
import { navigate, queryParam } from '../lib/router';
import { store, toast, useStore } from '../lib/store';

type Mode = 'entrar' | 'criar' | 'converter' | 'esqueci';

export function AuthPage() {
  const user = useStore((s) => s.user);
  const [mode, setMode] = useState<Mode>(user?.isGuest ? 'converter' : queryParam('modo') === 'criar' ? 'criar' : 'entrar');
  // Veio de um convite para uma sala: depois de entrar, vai direto para ela.
  const room = queryParam('sala');
  const done = () => navigate(room && /^[A-Za-z0-9]{4,10}$/.test(room) ? `/sala/${room.toUpperCase()}` : '/');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  // E-mail e “Esqueci a senha” só aparecem quando o servidor consegue enviar e-mail (SMTP configurado).
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    void api<{ recovery: boolean }>('GET', '/api/auth/options')
      .then((r) => setRecovery(r.recovery))
      .catch(() => undefined);
  }, []);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [crest, setCrest] = useState<CrestConfig>(() => randomCrest(user?.displayName ?? 'Seu Time'));

  if (user && !user.isGuest) {
    return (
      <div className="panel narrow">
        <div className="panel-head">
          <h2>Você já está em campo</h2>
        </div>
        <div className="panel-body stack">
          <p>Conectado como {user.displayName}.</p>
          <button className="btn btn-primary" onClick={done}>
            Ir para o início
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'esqueci') {
        await api('POST', '/api/auth/forgot', { identifier });
        setSent(true);
        return;
      }
      if (mode === 'converter') {
        const r = await api<{ user: PublicUserView }>('POST', '/api/auth/upgrade', { username, password, ...(recovery ? { email } : {}) });
        store.set({ user: r.user });
        toast({ kind: 'sucesso', title: 'Conta criada', body: 'Seu histórico e seus troféus ficaram guardados.' });
      } else {
        const r = await api<{ token: string; user: PublicUserView }>(
          'POST',
          mode === 'entrar' ? '/api/auth/login' : '/api/auth/register',
          mode === 'entrar' ? { username, password } : { username, password, displayName, crest, ...(recovery ? { email } : {}) },
        );
        await signIn(r.token, r.user);
      }
      done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={mode === 'criar' ? 'panel auth auth-wide' : 'panel auth'} onSubmit={submit}>
      <div className="panel-head">
        <h2>{mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : mode === 'esqueci' ? 'Esqueci a senha' : 'Guardar meu progresso'}</h2>
      </div>
      <div className="panel-body stack">
        <div className="seg" role="group" aria-label="Tipo de acesso">
          {user?.isGuest && (
            <button type="button" aria-pressed={mode === 'converter'} onClick={() => setMode('converter')}>
              Guardar este time
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
        {mode === 'converter' && (
          <p className="muted">Escolha usuário e senha. Seus resultados, seu escudo e seus troféus continuam valendo, e você entra com eles em qualquer aparelho.</p>
        )}
        {mode === 'entrar' && (
          <p className="muted">
            Use o usuário e a senha da sua conta.
            {user?.isGuest ? ' Atenção: ao entrar em outra conta, o time convidado deste aparelho fica para trás.' : ''}
          </p>
        )}
        {mode === 'criar' && <p className="muted">Com usuário e senha, seu time, seus troféus e seu histórico valem em qualquer aparelho.</p>}
        {mode === 'criar' && (
          <div className="field">
            <label htmlFor="dn">Nome do time</label>
            <input
              id="dn"
              className="input"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setCrest((c) => ({ ...c, initials: teamInitials(e.target.value || 'Seu Time') }));
              }}
              maxLength={28}
              required
            />
          </div>
        )}
        {mode === 'criar' && <CrestEditor value={crest} onChange={setCrest} teamName={displayName || 'Seu Time'} compact />}
        {mode === 'esqueci' &&
          (sent ? (
            <p className="notice-ok">
              Se existe uma conta com esse e-mail ou usuário, o link para criar a senha nova já foi enviado. Ele vale por 1 hora. Confira também a
              caixa de spam.
            </p>
          ) : (
            <>
              <p className="muted">Diga o e-mail (ou o usuário) da conta. Mandamos um link para o e-mail cadastrado nela.</p>
              <div className="field">
                <label htmlFor="idf">E-mail ou usuário</label>
                <input id="idf" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" maxLength={254} required />
              </div>
            </>
          ))}
        {recovery && (mode === 'criar' || mode === 'converter') && (
          <div className="field">
            <label htmlFor="em">E-mail</label>
            <input id="em" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
            <span className="small muted">Só para recuperar a senha se você esquecer. Não aparece para ninguém.</span>
          </div>
        )}
        {mode !== 'esqueci' && (
        <div className="row auth-fields">
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
        </div>
        )}
        {error && <p className="error-text">{error}</p>}
        {!(mode === 'esqueci' && sent) && (
          <button className="btn btn-primary btn-lg" disabled={busy}>
            <Icon name="play" /> {mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : mode === 'esqueci' ? 'Enviar link' : 'Guardar progresso'}
          </button>
        )}
        {mode === 'entrar' && recovery && (
          <p className="small">
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setIdentifier(username);
                setError(null);
                setSent(false);
                setMode('esqueci');
              }}
            >
              Esqueci a senha
            </button>
          </p>
        )}
        {mode === 'esqueci' && (
          <p className="small">
            <button type="button" className="link-btn" onClick={() => setMode('entrar')}>
              Voltar para Entrar
            </button>
          </p>
        )}
      </div>
    </form>
  );
}
