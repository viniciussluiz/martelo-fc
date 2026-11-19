import { useEffect, useRef, useState } from 'react';
import { randomCrest, teamInitials, type CrestConfig } from '../../shared/crest';
import { ROOM_PASSWORD_MAX, ROOM_PASSWORD_MIN, type PublicUserView } from '../../shared/protocol';
import { signIn, signOut } from '../App';
import { EnvelopeArt } from '../components/common';
import { ClubEditorDialog, ClubLookEditor } from '../components/crest/CrestEditor';
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
          <span className="ts-logo-word">Leilão FC</span>
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
        <div className="account-bar">
          <span>
            <strong>Já tem conta?</strong> Entre com e-mail e senha e jogue com o mesmo time em qualquer aparelho.
          </span>
          <span className="account-bar-actions">
            <button type="button" className="btn btn-sm" onClick={() => navigate(`/entrar${joinCode ? `?sala=${encodeURIComponent(joinCode.toUpperCase())}` : ''}`)}>
              Entrar
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => navigate(`/entrar?modo=criar${joinCode ? `&sala=${encodeURIComponent(joinCode.toUpperCase())}` : ''}`)}
            >
              Criar conta
            </button>
          </span>
        </div>
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
        <ClubLookEditor value={crest} onChange={onCrest} teamName={name || 'Seu Time'} compact />
        {error && <p className="error-text">{error}</p>}
        <div className="found-foot">
          <p className="small muted">
            Sem cadastro, o time fica só neste aparelho. Dá para criar a conta com e-mail e senha depois, sem perder nada.
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
      <div className="club-card-sub">{user.isGuest ? 'Técnico convidado' : user.username ? `@${user.username}` : 'Conta registrada'}</div>
      <div className="club-card-actions">
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
          <Icon name="pincel" /> Editar clube
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate(`/perfil/${user.id}`)}>
          <Icon name="perfil" /> Perfil
        </button>
        {!user.isGuest && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('/conta')}>
            <Icon name="cadeado" /> Conta e senha
          </button>
        )}
      </div>
      {user.isGuest && (
        <div className="club-card-guest">
          <span className="small">Este time só existe neste aparelho. Crie sua conta com e-mail e senha para entrar em qualquer lugar e não perder o histórico.</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('/entrar')}>
            Criar conta
          </button>
        </div>
      )}
      <p className="small club-card-note">
        <button className="link-btn" onClick={signOut}>
          Sair
        </button>
      </p>
      <ClubEditorDialog open={editing} onClose={() => setEditing(false)} initial={user.crest} teamName={user.displayName} />
    </aside>
  );
}

export function HomePage({ joinCode }: { joinCode?: string }) {
  const user = useStore((s) => s.user);
  const [active, setActive] = useState<ActiveRoom | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ activeRoom: ActiveRoom | null }>('GET', '/api/me')
      .then((r) => setActive(r.activeRoom))
      .catch(() => undefined);
  }, [user]);

  const create = async (mode: 'solo' | 'online', access?: { password: string; hidden: boolean }) => {
    setBusy(mode);
    try {
      const r = await api<{ code: string }>('POST', '/api/rooms', {
        mode,
        settings: mode === 'solo' ? { cpuCount: 3 } : { hidden: !!access?.hidden },
        ...(access?.password ? { password: access.password } : {}),
      });
      setCreating(false);
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
              <span className="mode-title">Single player</span>
              <span className="mode-desc">Só você contra a CPU, sem outros jogadores: leilão, liga e copa. No fim, dá para jogar de novo na mesma sala.</span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="play" size={22} />
            </span>
          </button>
          <button className="mode mode-online" onClick={() => setCreating(true)} disabled={!!busy}>
            <span className="mode-icon">
              <Icon name="turma" size={34} />
            </span>
            <span className="mode-text">
              <span className="mode-title">Sala com amigos</span>
              <span className="mode-desc">Crie a sala, mande o código e disputem o mesmo pregão. Aberta ou com senha. Até 20 técnicos.</span>
            </span>
            <span className="mode-go" aria-hidden="true">
              <Icon name="play" size={22} />
            </span>
          </button>
          <button className="mode mode-rooms" onClick={() => navigate('/salas')}>
            <span className="mode-icon">
              <Icon name="campo" size={34} />
            </span>
            <span className="mode-text">
              <span className="mode-title">Salas em andamento</span>
              <span className="mode-desc">Veja as salas abertas agora e entre numa delas. As fechadas pedem senha.</span>
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
      <CreateRoomDialog open={creating} busy={busy === 'online'} onClose={() => setCreating(false)} onCreate={(access) => void create('online', access)} />
    </div>
  );
}

/**
 * Criar sala com amigos: escolhe-se antes quem pode entrar — aberta (qualquer um), fechada (com senha)
 * — e se ela aparece na lista de salas em andamento. Dá para mudar depois, no lobby.
 */
function CreateRoomDialog({
  open,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (access: { password: string; hidden: boolean }) => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setLocked(false);
      setPassword('');
      setHidden(false);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  const pass = password.trim();
  const invalid = locked && (pass.length < ROOM_PASSWORD_MIN || pass.length > ROOM_PASSWORD_MAX);
  return (
    <dialog ref={ref} className="dialog dialog-narrow" onClose={onClose} aria-labelledby="create-room-title">
      <div className="dialog-head">
        <h2 id="create-room-title">Sala com amigos</h2>
        <button type="button" className="dialog-x" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onCreate({ password: locked ? pass : '', hidden });
        }}
      >
        <div className="dialog-body stack">
          <div className="field">
            <label>Quem pode entrar</label>
            <div className="seg seg-grid" role="group" aria-label="Quem pode entrar">
              <button type="button" aria-pressed={!locked} onClick={() => setLocked(false)}>
                Sala aberta
              </button>
              <button type="button" aria-pressed={locked} onClick={() => setLocked(true)}>
                Sala fechada (com senha)
              </button>
            </div>
            <p className="hint">{locked ? 'Só entra quem tiver a senha.' : 'Entra quem tiver o código ou achar a sala na lista.'}</p>
          </div>
          {locked && (
            <div className="field">
              <label htmlFor="new-room-password">Senha da sala</label>
              <input
                id="new-room-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={ROOM_PASSWORD_MAX}
                autoComplete="off"
                autoFocus
              />
              <p className="hint">
                De {ROOM_PASSWORD_MIN} a {ROOM_PASSWORD_MAX} caracteres. Você passa a senha para os amigos junto com o código.
              </p>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            <span className="check-box" aria-hidden="true" />
            <span>Ocultar a sala (não aparece em “Salas em andamento”)</span>
          </label>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || invalid}>
            Criar sala
          </button>
        </div>
      </form>
    </dialog>
  );
}
