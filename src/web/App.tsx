import { useEffect } from 'react';
import type { PublicUserView } from '../shared/protocol';
import { Spinner } from './components/common';
import { TeamCrest } from './components/crest/TeamCrest';
import { Icon, Logo } from './components/Icon';
import { StatusLight } from './components/ui';
import { api, ApiError } from './lib/api';
import { matchPath, navigate, usePath } from './lib/router';
import { socket } from './lib/socket';
import { persistToken, store, useStore } from './lib/store';
import { AdSlot, CookieNotice } from './components/Ads';
import { useSiteInfo } from './lib/site';
import { pageMeta } from '../shared/seo';
import { AccountPage } from './pages/AccountPage';
import { AboutPage, ContactPage, PrivacyPage } from './pages/InfoPages';
import { SupportPage } from './pages/SupportPage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { AuthPage } from './pages/AuthPage';
import { ResetPage } from './pages/ResetPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { RivalPage } from './pages/RivalPage';
import { RoomPage } from './pages/RoomPage';
import { RoomsPage } from './pages/RoomsPage';
import { AdminPage } from './pages/AdminPage';
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
          <span className="brand-name">Leilão FC</span>
        </a>
        <nav className="nav" aria-label="Principal">
          {link('/', 'Jogar', 'bola', path === '/' || path.startsWith('/sala'))}
          {user && link(`/perfil/${user.id}`, 'Perfil', 'perfil', path.startsWith('/perfil'))}
          {user && link(`/trofeus/${user.id}`, 'Troféus', 'trofeu', path.startsWith('/trofeus'))}
          {link('/regras', 'Regras', 'apito', path.startsWith('/regras'))}
          {user?.admin && link('/admin', 'Admin', 'cadeado', path.startsWith('/admin'))}
        </nav>
        {(!user || user.isGuest) && !path.startsWith('/entrar') && (
          <a
            className={user ? 'btn btn-sm header-login' : 'btn btn-sm btn-primary header-login'}
            href="/entrar"
            title={user ? 'Crie sua conta com e-mail e senha para entrar com este time em qualquer aparelho' : 'Entrar com e-mail e senha'}
            onClick={(e) => {
              e.preventDefault();
              navigate('/entrar');
            }}
          >
            {user ? 'Criar conta' : 'Entrar'}
          </a>
        )}
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
  if (matchPath('/salas', path)) return user ? <RoomsPage /> : <HomePage />;
  if (matchPath('/admin', path)) return user ? <AdminPage /> : <HomePage />;
  if (matchPath('/entrar', path)) return <AuthPage />;
  if (matchPath('/redefinir', path)) return <ResetPage />;
  if (matchPath('/conta', path)) return <AccountPage />;
  if (matchPath('/regras', path)) return <RulesPage />;
  if (matchPath('/como-jogar', path)) return <HowToPlayPage />;
  if (matchPath('/apoiar', path)) return <SupportPage />;
  if (matchPath('/sobre', path)) return <AboutPage />;
  if (matchPath('/contato', path)) return <ContactPage />;
  if (matchPath('/privacidade', path)) return <PrivacyPage />;
  return <HomePage />;
}

/** Rodapé: as páginas institucionais e, embaixo, a versão e o baralho do servidor. */
function Footer() {
  const info = useSiteInfo();
  const link = (href: string, label: string) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      {label}
    </a>
  );
  return (
    <footer className="app-footer">
      <nav className="app-footer-links" aria-label="Institucional">
        {link('/apoiar', 'Apoie')}
        {link('/sobre', 'Sobre')}
        {link('/como-jogar', 'Como jogar')}
        {link('/regras', 'Regras')}
        {link('/contato', 'Contato')}
        {link('/privacidade', 'Privacidade')}
      </nav>
      {info && (
        <span className="app-footer-meta">
          Leilão FC {info.version} · Baralho {info.deck}, {info.cards} cartas
        </span>
      )}
    </footer>
  );
}

/** Anúncio só fora do jogo: páginas abertas e o resumo depois da disputa; nunca no leilão nem na partida. */
function PageAd() {
  const path = usePath();
  const status = useStore((s) => s.room?.status);
  const quiet = ['/entrar', '/redefinir', '/conta', '/privacidade', '/contato', '/apoiar'].some((p) => path.startsWith(p));
  if (quiet || (path.startsWith('/sala') && status !== 'post_dispute')) return null;
  return (
    <>
      <aside className="support-strip">
        <span>
          <strong>Curtiu o Leilão FC?</strong> O jogo é gratuito e feito por uma pessoa só.
        </span>
        <a
          className="btn btn-sm btn-primary"
          href="/apoiar"
          onClick={(e) => {
            e.preventDefault();
            navigate('/apoiar');
          }}
        >
          Apoiar com Pix
        </a>
      </aside>
      <AdSlot />
    </>
  );
}

/** Ao navegar, a aba e o resumo da página acompanham a rota (o servidor já entrega certo no primeiro carregamento). */
function usePageMeta() {
  const path = usePath();
  useEffect(() => {
    const meta = pageMeta(path);
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [path]);
}

export function App() {
  useBoot();
  usePageMeta();
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <Routes />
        <PageAd />
      </main>
      <Footer />
      <CookieNotice />
      <Toasts />
    </div>
  );
}
