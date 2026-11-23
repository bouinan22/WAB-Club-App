import React, { useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { ArrowLeft, ArrowRight, ShieldAlert } from 'lucide-react';
import { AuthScreen, type PortalPath } from './components/AuthScreen.tsx';
import { Layout } from './components/Layout.tsx';
import { OfflineIndicator } from './components/PWAInstallButton.tsx';
import { api, getStoredToken, setStoredToken } from './lib/api.ts';
import {
  auth,
  authPersistenceReady,
  isTransientNetworkError,
  SUPER_ADMIN_EMAIL,
  testConnection,
} from './lib/firebase.ts';
import { firebaseStore, getCachedFirebaseUserProfile } from './lib/firebaseStore.ts';
import { LanguageSwitcher, useLang } from './lib/i18n.tsx';
import { ROLE_LABELS } from './lib/labels.ts';
import {
  AccountsPage,
  ActivityLogsPage,
  ReportsPage,
  SettingsPage,
} from './pages/AdminGovernancePages.tsx';
import {
  AnnouncementsPage,
  NotificationsPage,
} from './pages/AnnouncementsAndNotificationsPages.tsx';
import { AttendancePage } from './pages/AttendancePage.tsx';
import { CategoriesPage, CoachesPage, ParentsPage } from './pages/CoachesAndParentsPages.tsx';
import { DashboardOverview } from './pages/DashboardOverview.tsx';
import { EvaluationsPage } from './pages/EvaluationsPage.tsx';
import { MyAccountPage } from './pages/MyAccountPage.tsx';
import { ParentChildrenPage } from './pages/ParentChildrenPage.tsx';
import { PlayersPage } from './pages/PlayersPage.tsx';
import { PublicRegisterPage } from './pages/PublicRegisterPage.tsx';
import { RegistrationRequestsPage } from './pages/RegistrationRequestsPage.tsx';
import { RegistrationTrackingPage } from './pages/RegistrationTrackingPage.tsx';
import { ShareAppPage } from './pages/ShareAppPage.tsx';
import { FinancePage, SubscriptionsPage } from './pages/SubscriptionsAndFinancePages.tsx';
import { MatchesPage, TrainingsPage } from './pages/TrainingsAndMatchesPages.tsx';
import type { ClubSettings, PublicUser } from './types/wab.ts';

const FALLBACK_CLUB: ClubSettings = {
  clubName: 'وداد أمل بوعنان',
  clubShortName: 'W.A.B',
  clubEnglishName: 'WIDAD AMEL BOUINAN',
  foundedYear: '2021',
  logoUrl: '/assets/aistudio/FB_IMG_1792160849908_80558759.jpg',
  primaryColor: '#14532D',
  secondaryColor: '#16A34A',
  surfaceColor: '#F3F4F6',
  phone: '',
  email: '',
  address: 'بوعنان، الجزائر',
  season: '2026-2027',
  seasonStartDate: '2026-09-01',
  seasonEndDate: '2027-06-30',
  subscriptionStartDate: '2026-09-01',
  subscriptionEndDate: '2027-06-30',
  defaultAnnualFee: 16000,
  allowInstallments: true,
  venues: ['الملعب البلدي بوعنان — الرئيسي', 'ملعب التدريب الملحق بوعنان'],
  currency: 'دج',
};

function parsePortalPath(_rawPath: string): PortalPath {
  return '/admin';
}

export default function App() {
  const { lang, dir, t } = useLang();
  const [portalPath, setPortalPath] = useState<PortalPath>('/admin');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [club, setClub] = useState<ClubSettings>(FALLBACK_CLUB);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);

  const navigateToPath = (nextPath: PortalPath) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setPortalPath(nextPath);
  };

  useEffect(() => {
    const onPopState = () => {
      const next = parsePortalPath(window.location.pathname);
      setPortalPath(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshCounts = async () => {
    try {
      const [notifs, dash] = await Promise.all([api.getNotifications(), api.getDashboard()]);
      setUnreadCount(notifs.filter((n) => !n.read).length);
      setPendingRegistrationsCount(
        (dash.pendingRegistrationsCount || 0) + (dash.incompleteRegistrationsCount || 0),
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    let unsubscribeAuth: (() => void) | undefined;

    const init = async () => {
      await authPersistenceReady;
      void testConnection();
      await getRedirectResult(auth).catch(() => {});

      try {
        const pub = await api.getPublicClub();
        if (active) setClub(pub.clubSettings);
      } catch {
        // use fallback club settings
      }

      unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
        if (!active) return;

        if (fbUser) {
          try {
            const restored = await firebaseStore.restoreSession(fbUser);
            if (!active) return;
            setUser(restored);
            const settings = await api.getSettings().catch(() => null);
            if (active && settings) setClub(settings);
            await refreshCounts();
          } catch (err) {
            if (!active) return;
            // NEVER wipe persistent auth session on temporary offline/network failure
            if (isTransientNetworkError(err)) {
              const cached = getCachedFirebaseUserProfile();
              if (cached) {
                setUser(cached);
              } else if (fbUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL && fbUser.emailVerified) {
                setUser({
                  id: fbUser.uid,
                  username: 'boudiafrabeh8',
                  email: SUPER_ADMIN_EMAIL,
                  fullName: fbUser.displayName || 'مدير نادي وداد أمل بوعنان',
                  role: 'admin',
                  phone: '',
                  active: true,
                  categoryIds: ['U7', 'U9', 'U11', 'U13', 'U15', 'U17'],
                  createdAt: new Date().toISOString(),
                });
              }
            }
          } finally {
            if (active) setBooting(false);
          }
          return;
        }

        // Fallback: legacy token check (e.g., parent child-login without email)
        if (getStoredToken()) {
          try {
            const me = await api.me();
            if (!active) return;
            setUser(me.user);
            await refreshCounts();
          } catch (err) {
            // Only clear legacy token on explicit rejection, NEVER on offline/network errors
            if (!isTransientNetworkError(err)) {
              const msg = err instanceof Error ? err.message : '';
              if (
                msg.includes('انتهت') ||
                msg.includes('غير صالحة') ||
                msg.includes('غير مفعل') ||
                msg.includes('تسجيل الدخول')
              ) {
                setStoredToken(null);
              }
            }
          }
        }
        if (active) setBooting(false);
      });
    };

    void init();
    return () => {
      active = false;
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  const handleLogin = async (loggedUser: PublicUser, targetPath?: PortalPath) => {
    setUser(loggedUser);
    setActiveTab('dashboard');
    const resolvedPath: PortalPath =
      targetPath ||
      (portalPath === '/track' && loggedUser.role === 'parent'
        ? '/track'
        : (`/${loggedUser.role}` as PortalPath));
    navigateToPath(resolvedPath);
    try {
      const settings = await api.getSettings();
      setClub(settings);
      await refreshCounts();
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setActiveTab('dashboard');
    setUnreadCount(0);
    setPendingRegistrationsCount(0);
    navigateToPath('/');
  };

  useEffect(() => {
    document.title = `${club.clubShortName} – ${club.clubName}`;
    document.documentElement.style.setProperty('--wab-primary', club.primaryColor || '#14532D');
  }, [club]);

  if (booting) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#111827] flex flex-col items-center justify-center gap-4">
        <img
          src={club.logoUrl}
          alt={club.clubName}
          className="w-20 h-20 rounded-2xl object-contain border border-gray-200 p-1 bg-white"
        />
        <div className="text-base font-extrabold">{club.clubShortName} — {club.clubName}</div>
        <div className="text-xs font-semibold text-gray-500">
          {lang === 'fr' ? 'Chargement de la plateforme...' : 'جاري تهيئة المنصة...'}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          club={club}
          portalPath={portalPath}
          onNavigatePath={navigateToPath}
          onLogin={handleLogin}
        />
        <OfflineIndicator />
      </>
    );
  }

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  // Standalone Authenticated Applicant Tracking (/track) & Parent Multi-Child Registration (/register)
  if (user.role === 'parent' && (portalPath === '/track' || portalPath === '/register')) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#111827] flex flex-col">
        <header className="sticky top-0 z-30 w-full bg-white border-b border-gray-200 px-4 sm:px-8 py-3 flex items-center justify-between gap-3 no-print">
          <button
            type="button"
            onClick={() => navigateToPath('/')}
            className={`flex items-center gap-3 min-w-0 ${dir === 'rtl' ? 'text-right' : 'text-left'} hover:opacity-90 transition-opacity`}
          >
            <img
              src={club.logoUrl}
              alt={club.clubName}
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-xl object-contain bg-white border border-gray-200 p-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-extrabold text-[#111827] tracking-tight truncate">
                {club.clubShortName} — {club.clubName}
              </div>
              <div className="text-[11px] font-semibold text-gray-500 truncate">
                {club.clubEnglishName} · {t.seasonLabel} {club.season}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher compact />
            <button
              type="button"
              onClick={() => {
                setActiveTab('dashboard');
                navigateToPath('/parent');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
            >
              <BackIcon className="w-3.5 h-3.5 text-[#14532D]" />
              <span>{t.parentPortal}</span>
            </button>
          </div>
        </header>

        {portalPath === '/register' ? (
          <PublicRegisterPage
            club={club}
            currentUser={user}
            onBackHome={() => navigateToPath('/')}
            onGoToTracking={() => navigateToPath('/track')}
          />
        ) : (
          <RegistrationTrackingPage
            club={club}
            user={user}
            onLogin={(u) => handleLogin(u, '/track')}
            onLogout={handleLogout}
            onBackHome={() => navigateToPath('/')}
            onGoRegister={() => navigateToPath('/register')}
            onGoParentPortal={() => {
              setActiveTab('dashboard');
              navigateToPath('/parent');
            }}
          />
        )}
        <OfflineIndicator />
      </div>
    );
  }

  // Strict Role-to-Route Guard (allows shared /talents space across authenticated roles)
  const expectedUserPath = `/${user.role}` as PortalPath;
  if (portalPath !== '/' && portalPath !== expectedUserPath) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#111827] flex items-center justify-center p-4">
        <div className="wab-card rounded-2xl max-w-md w-full p-7 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#DC2626] flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-[#111827]">
            {lang === 'fr' ? 'Accès refusé — Non autorisé' : 'تم رفض الوصول — غير مصرح'}
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            {lang === 'fr' ? (
              <>
                Vous êtes connecté en tant que <strong className="text-[#14532D]">{ROLE_LABELS[user.role]}</strong> et
                n&apos;avez pas accès à <span className="font-mono-num font-bold text-[#111827]">{portalPath}</span>.
              </>
            ) : (
              <>
                أنت مسجل الدخول بصلاحية <strong className="text-[#14532D]">{ROLE_LABELS[user.role]}</strong>، ولا
                تملك صلاحية فتح المسار <span className="font-mono-num font-bold text-[#111827]">{portalPath}</span>.
              </>
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => navigateToPath(expectedUserPath)}
              className="flex-1 rounded-xl bg-[#14532D] py-3 px-4 text-sm font-bold text-white hover:bg-[#166534]"
            >
              {lang === 'fr' ? `Aller vers mon espace (${expectedUserPath})` : `الانتقال إلى فضائي (${expectedUserPath})`}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-gray-300 bg-white py-3 px-4 text-sm font-bold text-[#111827] hover:border-[#DC2626] hover:text-[#DC2626]"
            >
              {t.logout}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardOverview
            user={user}
            club={club}
            onNavigate={setActiveTab}
            onUserUpdated={setUser}
          />
        );
      case 'requests':
        return user.role === 'admin' ? (
          <RegistrationRequestsPage club={club} onRequestsChanged={refreshCounts} />
        ) : null;
      case 'my-requests':
        return user.role === 'parent' ? (
          <RegistrationTrackingPage
            club={club}
            user={user}
            onLogin={(u) => handleLogin(u)}
            onLogout={handleLogout}
            onBackHome={() => setActiveTab('dashboard')}
            onGoRegister={() => navigateToPath('/register')}
            onGoParentPortal={() => setActiveTab('dashboard')}
          />
        ) : null;
      case 'children':
        return user.role === 'parent' ? (
          <ParentChildrenPage user={user} club={club} onNavigate={setActiveTab} />
        ) : (
          <PlayersPage user={user} club={club} />
        );
      case 'players':
        return <PlayersPage user={user} club={club} />;
      case 'coaches':
        return user.role === 'admin' ? <CoachesPage club={club} /> : null;
      case 'parents':
        return user.role === 'admin' ? <ParentsPage /> : null;
      case 'categories':
        return user.role === 'admin' ? <CategoriesPage club={club} /> : null;
      case 'attendance':
        return <AttendancePage user={user} club={club} />;
      case 'subscriptions':
        return user.role === 'admin' ? <SubscriptionsPage user={user} club={club} /> : null;
      case 'finance':
        return user.role === 'admin' ? <FinancePage club={club} /> : null;
      case 'trainings':
        return <TrainingsPage user={user} club={club} />;
      case 'matches':
        return <MatchesPage user={user} club={club} />;
      case 'evaluations':
        return <EvaluationsPage user={user} />;
      case 'announcements':
        return <AnnouncementsPage user={user} />;
      case 'notifications':
        return <NotificationsPage onUnreadCountChange={setUnreadCount} />;
      case 'reports':
        return user.role !== 'parent' ? <ReportsPage user={user} club={club} /> : null;
      case 'share':
        return user.role === 'admin' ? <ShareAppPage club={club} /> : null;
      case 'accounts':
        return user.role === 'admin' ? <AccountsPage /> : null;
      case 'settings':
        return user.role === 'admin' ? <SettingsPage club={club} onClubUpdated={setClub} /> : null;
      case 'logs':
        return user.role === 'admin' ? <ActivityLogsPage /> : null;
      case 'account':
        return (
          <MyAccountPage
            user={user}
            club={club}
            unreadCount={unreadCount}
            pendingRegistrationsCount={pendingRegistrationsCount}
            onSelectTab={setActiveTab}
            onLogout={handleLogout}
            onUserUpdated={setUser}
          />
        );
      default:
        return (
          <DashboardOverview
            user={user}
            club={club}
            onNavigate={setActiveTab}
            onUserUpdated={setUser}
          />
        );
    }
  };

  return (
    <>
      <Layout
        user={user}
        club={club}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        unreadCount={unreadCount}
        pendingRegistrationsCount={pendingRegistrationsCount}
        onLogout={handleLogout}
      >
        {renderContent()}
      </Layout>
      <OfflineIndicator />
    </>
  );
}
