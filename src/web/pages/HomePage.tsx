import { useEffect, useState } from 'react';
import type { PublicUserView } from '../../shared/protocol';
import { signIn, signOut } from '../App';
import { EnvelopeArt } from '../components/common';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { toast, useStore } from '../lib/store';

interface ActiveRoom {
  code: string;
  mode: string;
  status: string;
}

function GuestForm({ joinCode }: { joinCode?: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: PublicUserView }>('POST', '/api/auth/guest', { displayName: name });
      await signIn(r.token, r.user);
      if (joinCode) navigate(`/sala/${joinCode.toUpperCase()}`, true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel stack" onSubmit={submit} style={{ maxWidth: 460 }}>
      <div className="panel-title">{joinCode ? `Você foi chamado para a sala ${joinCode.toUpperCase()}` : 'Como se chama o seu time?'}</div>
      <div className="field">
        <label htmlFor="team">Nome do time</label>
        <input id="team" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Unidos do Pregão" maxLength={28} autoComplete="off" required />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>
        {joinCode ? 'Entrar na sala' : 'Entrar no pregão'}
      </button>
      <p className="small muted">
        Não precisa de cadastro. Para guardar troféus e histórico em outro aparelho,{' '}
        <a
          href="/entrar"
          onClick={(e) => {
            e.preventDefault();
            navigate('/entrar');
          }}
        >
          crie uma conta ou entre
        </a>
        .
      </p>
    </form>
  );
}

export function HomePage({ joinCode }: { joinCode?: string }) {
  const user = useStore((s) => s.user);
  const [active, setActive] = useState<ActiveRoom | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ activeRoom: ActiveRoom | null }>('GET', '/api/me')
      .then((r) => setActive(r.activeRoom))
      .catch(() => undefined);
  }, [user]);

  const create = async (mode: 'solo' | 'online') => {
    setBusy(mode);
    try {
      const r = await api<{ code: string }>('POST', '/api/rooms', { mode, settings: mode === 'solo' ? { cpuCount: 3 } : {} });
      navigate(`/sala/${r.code}`);
    } catch (err) {
      toast({ kind: 'erro', title: 'Não foi possível criar a sala', body: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack" style={{ gap: 30 }}>
      <section className="hero">
        <div>
          <h1>Lance às cegas.</h1>
          <p className="lede">
            Cada técnico tem 100 moedas e um envelope. Você escreve quanto vale cada nome — e só descobre se comprou um craque ou uma furada
            quando todos os envelopes abrem.
          </p>
        </div>
        <div className="hero-envelope">
          <EnvelopeArt amount="37" label="Zeca Trovão, ATA" sealed />
        </div>
      </section>

      {!user ? (
        <GuestForm {...(joinCode ? { joinCode } : {})} />
      ) : (
        <>
          {active && (
            <div className="continue-banner spread">
              <div>
                <strong>Você tem uma sala aberta: {active.code}</strong>
                <div className="small muted">{active.status === 'in_dispute' ? 'A disputa está em andamento.' : 'A sala está esperando você.'}</div>
              </div>
              <button className="btn btn-cone" onClick={() => navigate(`/sala/${active.code}`)}>
                Voltar para a sala
              </button>
            </div>
          )}
          <section className="modes" aria-label="Modos de jogo">
            <button className="mode mode-solo" onClick={() => create('solo')} disabled={!!busy}>
              <Icon name="martelo" size={28} />
              <h3>Partida rápida</h3>
              <span>Você contra a CPU: leilão, liga e copa. Ao final, dá para jogar de novo na mesma sala.</span>
            </button>
            <button className="mode mode-online" onClick={() => create('online')} disabled={!!busy}>
              <Icon name="turma" size={28} />
              <h3>Sala com amigos</h3>
              <span>Crie a sala, mande o código e disputem o mesmo pregão. Até 20 técnicos.</span>
            </button>
            <form
              className="mode"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim().length >= 4) navigate(`/sala/${code.trim().toUpperCase()}`);
              }}
            >
              <Icon name="envelope" size={28} />
              <h3>Entrar com código</h3>
              <input
                className="input code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                aria-label="Código da sala"
              />
              <button className="btn btn-primary" disabled={code.length < 6}>
                Entrar na sala
              </button>
            </form>
          </section>
          <p className="small muted">
            Jogando como <strong>{user.displayName}</strong>
            {user.isGuest ? ' (convidado)' : ''}.{' '}
            {user.isGuest && (
              <a
                href="/entrar"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/entrar');
                }}
              >
                Transformar em conta
              </a>
            )}{' '}
            <button className="btn btn-ghost btn-sm" onClick={signOut}>
              Sair
            </button>
          </p>
        </>
      )}
    </div>
  );
}
