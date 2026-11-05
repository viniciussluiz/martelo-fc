import { useEffect, useState } from 'react';
import type { PublicUserView } from '../shared/protocol';
import { Spinner } from './components/common';
import { TeamCrest } from './components/crest/TeamCrest';
import { Icon, Logo } from './components/Icon';
import { StatusLight } from './components/ui';
import { api, ApiError } from './lib/api';
import { matchPath, navigate, usePath } from './lib/router';
import { socket } from './lib/socket';
import { persistToken, store, useStore } from './lib/store';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { RivalPage } from './pages/RivalPage';
import { RoomPage } from './pages/RoomPage';
import { RulesPage } from './pages/RulesPage';
import { TrophyPage } from './pages/TrophyPage';

export async function signIn(token: string, user: PublicUserView) {
  persistToken(token);
  store.set({ token, user });
  socket.start();
}

export function signOut() {
  const token = store.get().token;
  if (token) void api('POST', '/api/auth/logout').catch(() => undefined);
  persistToken(null);
  socket.stop();
  store.set({ token: null, user: null, room: null, roomCode: null });
  navigate('/');
}

function useBoot() {
  useEffect(() => {
    const token = store.get().token;
    if (!token) {
      store.set({ booting: false });
      return;
    }
    api<{ user: PublicUserView }>('GET', '/api/me')
      .then(({ user }) => {
        store.set({ user, booting: false });
        socket.start();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          persistToken(null);
          store.set({ token: null, user: null, booting: false });
        } else {
          store.set({ booting: false });
        }
      });
  }, []);
}

function TopBar() {
  const user = useStore((s) => s.user);
  const conn = useStore((s) => s.connection);
  const path = usePath();
  const link = (href: string, label: string, icon: string, current: boolean) => (
    <a
      href={href}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </a>
  );
  return (
    <header className="topbar">
      <div className="topbar-in">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <span className="brand-crest">
            <Logo size={46} />
          </span>
          <span className="brand-name">Martelo FC</span>
        </a>
        <nav className="nav" aria-label="Principal">
          {link('/', 'Jogar', 'bola', path === '/' || path.startsWith('/sala'))}
          {user && link(`/perfil/${user.id}`, 'Perfil', 'perfil', path.startsWith('/perfil'))}
          {user && link(`/trofeus/${user.id}`, 'Troféus', 'trofeu', path.startsWith('/trofeus'))}
          {link('/regras', 'Regras', 'apito', path.startsWith('/regras'))}
        </nav>
        {user && (
          <a
            className="me-chip"
            href={`/perfil/${user.id}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/perfil/${user.id}`);
            }}
            title={conn === 'online' ? 'Conectado' : 'Reconectando…'}
          >
            <TeamCrest userId={user.id} name={user.displayName} crest={user.crest} size={30} />
            <span className="me-name">{user.displayName}</span>
            <span className="conn" data-state={conn}>
              <StatusLight on={conn === 'online'} />
              <span className="sr-only">{conn === 'online' ? 'Conectado' : 'Reconectando'}</span>
            </span>
          </a>
        )}
      </div>
    </header>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} role={t.kind === 'erro' ? 'alert' : 'status'}>
          <span className="toast-icon">
            <Icon name={t.icon ?? (t.kind === 'erro' ? 'info' : t.kind === 'conquista' ? 'trofeu' : 'lacre')} />
          </span>
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <div className="small">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Routes() {
  const path = usePath();
  const booting = useStore((s) => s.booting);
  const user = useStore((s) => s.user);
  if (booting) return <Spinner label="Abrindo o pregão…" />;
  let m: Record<string, string> | null;
  if ((m = matchPath('/sala/:code', path))) return user ? <RoomPage code={m.code!.toUpperCase()} /> : <HomePage joinCode={m.code!} />;
  if ((m = matchPath('/perfil/:id/rival/:opp', path))) return user ? <RivalPage userId={m.id!} opponentId={m.opp!} /> : <HomePage />;
  if ((m = matchPath('/perfil/:id', path))) return user ? <ProfilePage userId={m.id!} /> : <HomePage />;
  if ((m = matchPath('/trofeus/:id', path))) return user ? <TrophyPage userId={m.id!} /> : <HomePage />;
  if (matchPath('/entrar', path)) return <AuthPage />;
  if (matchPath('/regras', path)) return <RulesPage />;
  return <HomePage />;
}

/** Rodapé com versão e baralho do servidor: ajuda a saber qual cópia do jogo está rodando. */
function Footer() {
  const [info, setInfo] = useState<{ version: string; deck: string; cards: number } | null>(null);
  useEffect(() => {
    void api<{ version: string; deck: string; cards: number }>('GET', '/api/health')
      .then(setInfo)
      .catch(() => undefined);
  }, []);
  if (!info) return null;
  return (
    <footer className="app-footer">
      <span>Martelo FC {info.version}</span>
      <span>
        Baralho {info.deck}, {info.cards} cartas
      </span>
    </footer>
  );
}

export function App() {
  useBoot();
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <Routes />
      </main>
      <Footer />
      <Toasts />
    </div>
  );
}
