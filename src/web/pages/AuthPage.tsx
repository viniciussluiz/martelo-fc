import { useEffect, useState } from 'react';
import { randomCrest, teamInitials, type CrestConfig } from '../../shared/crest';
import type { PublicUserView } from '../../shared/protocol';
import { ClubLookEditor } from '../components/crest/CrestEditor';
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
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  // “Esqueci a senha” só aparece quando o servidor consegue enviar e-mail (SMTP configurado).
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
        const r = await api<{ user: PublicUserView }>('POST', '/api/auth/upgrade', { email, password });
        store.set({ user: r.user });
        toast({ kind: 'sucesso', title: 'Conta criada', body: 'Seu histórico e seus troféus ficaram guardados.' });
      } else {
        const r = await api<{ token: string; user: PublicUserView }>(
          'POST',
          mode === 'entrar' ? '/api/auth/login' : '/api/auth/register',
          mode === 'entrar' ? { email, password } : { email, password, displayName, crest },
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
          <p className="muted">Informe seu e-mail e crie uma senha. Seus resultados, seu escudo e seus troféus continuam valendo, e você entra com eles em qualquer aparelho.</p>
        )}
        {mode === 'entrar' && (
          <p className="muted">
            Use o e-mail e a senha da sua conta.
            {user?.isGuest ? ' Atenção: ao entrar em outra conta, o time convidado deste aparelho fica para trás.' : ''}
          </p>
        )}
        {mode === 'criar' && <p className="muted">Com e-mail e senha, seu time, seus troféus e seu histórico valem em qualquer aparelho.</p>}
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
        {mode === 'criar' && <ClubLookEditor value={crest} onChange={setCrest} teamName={displayName || 'Seu Time'} compact />}
        {mode === 'esqueci' &&
          (sent ? (
            <p className="notice-ok">
              Se existe uma conta com esse e-mail, o link para criar a senha nova já foi enviado. Ele vale por 1 hora. Confira também a
              caixa de spam.
            </p>
          ) : (
            <>
              <p className="muted">Diga o e-mail da conta. Mandamos para ele um link para criar a senha nova.</p>
              <div className="field">
                <label htmlFor="idf">E-mail</label>
                <input id="idf" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" maxLength={254} required />
              </div>
            </>
          ))}
        {mode !== 'esqueci' && (
        <div className="row auth-fields">
          <div className="field">
            <label htmlFor="em">E-mail</label>
            {/* No "Entrar" o campo aceita também o usuário das contas antigas, por isso não é type="email". */}
            <input
              id="em"
              className="input"
              type={mode === 'entrar' ? 'text' : 'email'}
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete={mode === 'entrar' ? 'username' : 'email'}
              autoCapitalize="none"
              maxLength={254}
              required
            />
            {mode !== 'entrar' && <span className="small muted">É com ele que você entra e recupera a senha. Não aparece para ninguém.</span>}
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
                setIdentifier(email);
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
