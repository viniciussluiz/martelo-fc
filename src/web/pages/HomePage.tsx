import { useEffect, useRef, useState } from 'react';
import { randomCrest, teamInitials, type CrestConfig } from '../../shared/crest';
import type { PublicUserView } from '../../shared/protocol';
import { signIn, signOut } from '../App';
import { EnvelopeArt } from '../components/common';
import { CrestEditor, CrestEditorDialog } from '../components/crest/CrestEditor';
import { TeamCrest } from '../components/crest/TeamCrest';
import { Icon, Logo } from '../components/Icon';
import { PixelCoin, PosChip } from '../components/ui';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { toast, useStore } from '../lib/store';

interface ActiveRoom {
  code: string;
  mode: string;
  status: string;
}

/** Tela de abertura: o nome do jogo e a cena do pregão (figurinha, envelope lacrado e moedas). */
function TitleScreen({ compact }: { compact?: boolean }) {
  return (
    <section className="title-screen" data-compact={compact || undefined}>
      <div className="ts-copy">
        <h1 className="ts-logo">
          <span className="ts-logo-crest" aria-hidden="true">
            <Logo size={compact ? 74 : 104} />
          </span>
          <span className="ts-logo-word">Martelo FC</span>
        </h1>
        <p className="ts-tag">
          Leilão às cegas de futebol. Cada técnico tem 100 moedas e um envelope: você escreve quanto vale cada nome e só descobre se comprou
          um craque ou uma furada quando o martelo bate.
        </p>
      </div>
      <div className="ts-scene" aria-hidden="true">
        <div className="ts-card">
          <div className="ts-card-band">
            <PosChip pos="ATA" />
          </div>
          <div className="ts-card-name">Zeca Trovão</div>
          <div className="ts-card-club">Unidos da Várzea (1998)</div>
        </div>
        <div className="ts-envelope">
          <EnvelopeArt amount="37" label="lance" sealed />
        </div>
        <span className="ts-coin c1">
          <PixelCoin size={34} />
        </span>
        <span className="ts-coin c2">
          <PixelCoin size={26} />
        </span>
        <span className="ts-coin c3">
          <PixelCoin size={22} />
        </span>
      </div>
      <div className="ts-pitch" aria-hidden="true" />
    </section>
  );
}

/** Entrada sem cadastro: nome do time e escudo, montado na hora. */
function GuestForm({ joinCode }: { joinCode?: string }) {
  const [name, setName] = useState('');
  const [crest, setCrest] = useState<CrestConfig>(() => randomCrest('Seu Time'));
  const touched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onName = (v: string) => {
    setName(v);
    // A sigla acompanha o nome até a pessoa mexer nela.
    if (!touched.current) {
      const ini = teamInitials(v || 'Seu Time');
      setCrest((c) => ({ ...c, initials: ini, motto: c.motto === c.initials || !c.motto ? ini : c.motto }));
    }
  };
  const onCrest = (c: CrestConfig) => {
    if (c.initials !== crest.initials) touched.current = true;
    setCrest(c);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: PublicUserView }>('POST', '/api/auth/guest', { displayName: name, crest });
      await signIn(r.token, r.user);
      if (joinCode) navigate(`/sala/${joinCode.toUpperCase()}`, true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel found-club" onSubmit={submit}>
      <div className="panel-head">
        <h2>{joinCode ? `Você foi chamado para a sala ${joinCode.toUpperCase()}` : 'Funde o seu clube'}</h2>
        <span className="panel-head-aside">Leva 30 segundos</span>
      </div>
      <div className="panel-body stack">
        <div className="field found-name">
          <label htmlFor="team">Nome do time</label>
          <input
            id="team"
            className="input input-lg"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Ex.: Unidos do Pregão"
            maxLength={28}
            autoComplete="off"
            required
          />
        </div>
        <CrestEditor value={crest} onChange={onCrest} teamName={name || 'Seu Time'} compact />
        {error && <p className="error-text">{error}</p>}
        <div className="found-foot">
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
          <button className="btn btn-primary btn-lg" disabled={busy || name.trim().length < 2}>
            <Icon name="play" /> {joinCode ? 'Entrar na sala' : 'Entrar no pregão'}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Cartão do seu clube no menu: escudo, nome e atalhos. */
function MyClubCard({ user }: { user: PublicUserView }) {
  const [editing, setEditing] = useState(false);
  return (
    <aside className="club-card">
      <div className="club-card-crest">
        <TeamCrest userId={user.id} name={user.displayName} crest={user.crest} size={128} />
      </div>
      <div className="club-card-name">{user.displayName}</div>
      <div className="club-card-sub">{user.isGuest ? 'Técnico convidado' : `@${user.username}`}</div>
      <div className="club-card-actions">
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
          <Icon name="pincel" /> Editar escudo
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate(`/perfil/${user.id}`)}>
          <Icon name="perfil" /> Perfil
        </button>
      </div>
      <p className="small club-card-note">
        {user.isGuest && (
          <>
            <a
              href="/entrar"
              onClick={(e) => {
                e.preventDefault();
                navigate('/entrar');
              }}
            >
              Transformar em conta
            </a>{' '}
            para não perder o histórico.{' '}
          </>
        )}
        <button className="link-btn" onClick={signOut}>
          Sair
        </button>
      </p>
      <CrestEditorDialog open={editing} onClose={() => setEditing(false)} initial={user.crest} teamName={user.displayName} />
    </aside>
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

  if (!user) {
    return (
      <div className="home">
        <TitleScreen />
        <GuestForm {...(joinCode ? { joinCode } : {})} />
      </div>
    );
  }

  return (
    <div className="home">
      <TitleScreen compact />
      {active && (
        <div className="continue-banner">
          <span className="continue-banner-icon">
            <Icon name="apito" size={26} />
          </span>
          <div className="continue-banner-text">
            <strong>Você tem uma sala aberta: {active.code}</strong>
            <span>{active.status === 'in_dispute' ? 'A disputa está rolando sem você.' : 'A sala está esperando você.'}</span>
          </div>
          <button className="btn btn-primary" onClick={() => navigate(`/sala/${active.code}`)}>
            Voltar para a sala
          </button>
        </div>
      )}
      <div className="menu">
        <section className="menu-modes" aria-label="Modos de jogo">
          <button className="mode mode-solo" onClick={() => create('solo')} disabled={!!busy}>
            <span className="mode-icon">
              <Icon name="martelo" size={34} />
            </span>
            <span className="mode-text">
              <span className="mode-title">Partida rápida</span>
              <span className="mode-desc">Você contra a CPU: leilão, liga e copa. No fim, dá para jogar de novo na mesma sala.</span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="play" size={22} />
            </span>
          </button>
          <button className="mode mode-online" onClick={() => create('online')} disabled={!!busy}>
            <span className="mode-icon">
              <Icon name="turma" size={34} />
            </span>
            <span className="mode-text">
              <span className="mode-title">Sala com amigos</span>
              <span className="mode-desc">Crie a sala, mande o código e disputem o mesmo pregão. Até 20 técnicos.</span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="play" size={22} />
            </span>
          </button>
          <form
            className="mode mode-code"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length >= 4) navigate(`/sala/${code.trim().toUpperCase()}`);
            }}
          >
            <span className="mode-icon">
              <Icon name="envelope" size={34} />
            </span>
            <span className="mode-text">
              <span className="mode-title">Entrar com código</span>
              <span className="mode-code-row">
                <input
                  className="input code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="ABC123"
                  aria-label="Código da sala"
                />
                <button className="btn" disabled={code.length < 6}>
                  Entrar na sala
                </button>
              </span>
            </span>
          </form>
        </section>
        <MyClubCard user={user} />
      </div>
    </div>
  );
}
