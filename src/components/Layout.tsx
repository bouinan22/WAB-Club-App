import React, { useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  Calendar,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileBarChart,
  Home,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Trophy,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { type AppLang, LanguageSwitcher, useLang } from '../lib/i18n.tsx';
import { ROLE_LABELS } from '../lib/labels.ts';
import type { ClubSettings, PublicUser } from '../types/wab.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { AvatarBadge } from './UI.tsx';

export interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

const FR_LABELS: Record<string, string> = {
  dashboard: 'Accueil',
  requests: 'Inscriptions',
  'my-requests': "Suivi d'inscription",
  players: 'Joueurs',
  children: 'Enfants',
  coaches: 'Entraîneurs',
  parents: 'Parents',
  categories: 'Catégories',
  attendance: 'Présences',
  subscriptions: 'Cotisations',
  finance: 'Finances',
  trainings: 'Entraînements',
  matches: 'Matchs',
  evaluations: 'Évaluations',
  announcements: 'Annonces',
  notifications: 'Notifications',
  reports: 'Rapports',
  share: 'Partage',
  accounts: 'Comptes',
  settings: 'Paramètres',
  logs: "Journal d'activité",
  account: 'Mon compte',
};

const FR_ROLE_LABELS: Record<PublicUser['role'], string> = {
  admin: 'Administration du club',
  coach: 'Entraîneur',
  parent: 'Parent / Tuteur',
};

export function getNavItemsForRole(
  role: PublicUser['role'],
  unreadCount: number,
  pendingRegistrationsCount = 0,
  lang: AppLang = 'ar',
): NavItem[] {
  const arList: NavItem[] =
    role === 'admin'
      ? [
          { id: 'dashboard', label: 'الرئيسية', icon: Home },
          { id: 'requests', label: 'طلبات التسجيل الإلكتروني', icon: ClipboardList, badge: pendingRegistrationsCount },
          { id: 'players', label: 'اللاعبون', icon: Users },
          { id: 'coaches', label: 'المدربون', icon: UserCog },
          { id: 'parents', label: 'الأولياء', icon: ShieldCheck },
          { id: 'categories', label: 'الفئات العمرية', icon: Layers },
          { id: 'attendance', label: 'الحضور', icon: CheckSquare },
          { id: 'subscriptions', label: 'الاشتراكات السنوية', icon: CreditCard },
          { id: 'finance', label: 'الإدارة المالية', icon: Wallet },
          { id: 'trainings', label: 'التدريبات', icon: Calendar },
          { id: 'matches', label: 'المباريات', icon: Trophy },
          { id: 'evaluations', label: 'التقييمات الفنية', icon: Award },
          { id: 'announcements', label: 'الإعلانات', icon: Megaphone },
          { id: 'notifications', label: 'الإشعارات', icon: Bell, badge: unreadCount },
          { id: 'reports', label: 'التقارير والإحصائيات', icon: FileBarChart },
          { id: 'share', label: 'مشاركة التطبيق', icon: Share2 },
          { id: 'accounts', label: 'إدارة الحسابات', icon: BarChart3 },
          { id: 'settings', label: 'إعدادات النادي', icon: Settings },
          { id: 'logs', label: 'سجل النشاطات', icon: Activity },
          { id: 'account', label: 'حسابي', icon: UserCircle },
        ]
      : role === 'coach'
        ? [
            { id: 'dashboard', label: 'الرئيسية', icon: Home },
            { id: 'players', label: 'اللاعبون', icon: Users },
            { id: 'attendance', label: 'الحضور', icon: CheckSquare },
            { id: 'trainings', label: 'جدول التدريبات', icon: Calendar },
            { id: 'matches', label: 'جدول المباريات', icon: Trophy },
            { id: 'evaluations', label: 'التقييمات الفنية', icon: Award },
            { id: 'reports', label: 'التقارير التدريبية', icon: FileBarChart },
            { id: 'announcements', label: 'الإعلانات', icon: Megaphone },
            { id: 'notifications', label: 'الإشعارات', icon: Bell, badge: unreadCount },
            { id: 'account', label: 'حسابي', icon: UserCircle },
          ]
        : [
            { id: 'dashboard', label: 'الرئيسية', icon: Home },
            { id: 'my-requests', label: 'متابعة طلب التسجيل', icon: ClipboardCheck },
            { id: 'children', label: 'الأبناء', icon: Users },
            { id: 'attendance', label: 'الحضور', icon: CheckSquare },
            { id: 'trainings', label: 'مواعيد التدريبات', icon: Calendar },
            { id: 'matches', label: 'مواعيد المباريات', icon: Trophy },
            { id: 'evaluations', label: 'التقييمات الفنية', icon: Award },
            { id: 'announcements', label: 'الإعلانات', icon: Megaphone },
            { id: 'notifications', label: 'الإشعارات', icon: Bell, badge: unreadCount },
            { id: 'account', label: 'حسابي', icon: UserCircle },
          ];

  if (lang === 'fr') {
    return arList.map((item) => ({
      ...item,
      label: FR_LABELS[item.id] || item.label,
    }));
  }
  return arList;
}

interface LayoutProps {
  user: PublicUser;
  club: ClubSettings;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  unreadCount: number;
  pendingRegistrationsCount: number;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  user,
  club,
  activeTab,
  onSelectTab,
  unreadCount,
  pendingRegistrationsCount,
  onLogout,
  children,
}) => {
  const { lang, dir, t } = useLang();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navItems = getNavItemsForRole(user.role, unreadCount, pendingRegistrationsCount, lang);
  const roleLabel = lang === 'fr' ? FR_ROLE_LABELS[user.role] : ROLE_LABELS[user.role];

  const mobileBottomTabs: NavItem[] = [
    { id: 'dashboard', label: t.home, icon: Home },
    {
      id: user.role === 'parent' ? 'children' : 'players',
      label: t.playersLabel,
      icon: Users,
    },
    { id: 'attendance', label: t.attendanceLabel, icon: CheckSquare },
    { id: 'announcements', label: t.announcementsLabel, icon: Megaphone },
    {
      id: 'account',
      label: t.myAccount,
      icon: UserCircle,
      badge: user.role === 'admin' ? pendingRegistrationsCount : undefined,
    },
  ];

  const handleSelect = (id: string) => {
    onSelectTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#111827] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:w-64 xl:w-72 shrink-0 ${
          dir === 'rtl' ? 'border-l' : 'border-r'
        } border-gray-200 bg-white no-print`}
      >
        <div className="p-5 border-b border-gray-200 flex items-center gap-3">
          <img
            src={club.logoUrl}
            alt={club.clubName}
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-xl object-contain bg-white border border-gray-200 p-0.5 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-[#111827] truncate">
              {club.clubShortName} — {club.clubName}
            </div>
            <div className="text-xs text-[#14532D] font-bold truncate">{roleLabel}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#14532D] text-white'
                    : 'text-[#111827] hover:bg-[#DCFCE7]/50 hover:text-[#14532D]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[11px] font-mono-num font-bold rounded-md ${
                      active ? 'bg-white text-[#14532D]' : 'bg-[#14532D] text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2.5 bg-gray-50">
          <button
            type="button"
            onClick={() => handleSelect('account')}
            className={`w-full px-1 flex items-center gap-2.5 ${dir === 'rtl' ? 'text-right' : 'text-left'} hover:opacity-80`}
          >
            <AvatarBadge name={user.fullName} photoUrl={user.photoUrl} size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#111827] truncate">{user.fullName}</div>
              <div className="text-[11px] text-gray-500 truncate">{user.email}</div>
            </div>
          </button>
          <div className="flex flex-col gap-2">
            <PWAInstallButton />
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-2.5 text-xs font-bold text-[#111827] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors min-h-[42px]"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.logout}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Flat Top Bar */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-gray-200 bg-gray-50 text-[#111827] min-w-[42px] min-h-[42px] flex items-center justify-center"
              aria-label={lang === 'fr' ? 'Menu principal' : 'القائمة الرئيسية'}
            >
              <Menu className="w-5 h-5" />
            </button>
            <img
              src={club.logoUrl}
              alt={club.clubName}
              referrerPolicy="no-referrer"
              className="lg:hidden w-9 h-9 rounded-xl object-contain bg-white border border-gray-200 p-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-[#111827] truncate">
                {navItems.find((n) => n.id === activeTab)?.label || club.clubName}
              </div>
              <div className="text-[11px] font-semibold text-gray-500 truncate">
                {roleLabel} · {t.seasonLabel} {club.season}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher compact />

            <button
              type="button"
              onClick={() => handleSelect('notifications')}
              className="relative p-2 rounded-xl border border-gray-200 bg-gray-50 text-[#111827] hover:border-[#14532D] min-w-[42px] min-h-[42px] flex items-center justify-center"
              aria-label={t.notifications}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-md bg-[#14532D] text-[10px] font-bold font-mono-num text-white flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="lg:hidden p-2 rounded-xl border border-gray-200 bg-gray-50 text-[#111827] hover:border-[#DC2626] hover:text-[#DC2626] min-w-[42px] min-h-[42px] flex items-center justify-center"
              aria-label={t.logout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/45" onClick={() => setMobileMenuOpen(false)} />
          <div
            className={`relative z-10 w-72 max-w-[85vw] bg-white ${
              dir === 'rtl' ? 'border-l' : 'border-r'
            } border-gray-200 h-full flex flex-col`}
          >
            <div className="p-4 border-b border-gray-200 bg-[#14532D] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={club.logoUrl}
                  alt={club.clubName}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-xl object-contain bg-white p-0.5"
                />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold truncate">{club.clubShortName}</div>
                  <div className="text-[11px] text-[#DCFCE7] font-bold truncate">{roleLabel}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-white/80 hover:text-white"
                aria-label={lang === 'fr' ? 'Fermer le menu' : 'إغلاق القائمة'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-sm font-bold ${
                      active ? 'bg-[#14532D] text-white' : 'text-[#111827] hover:bg-[#DCFCE7]/50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`px-1.5 py-0.5 text-[11px] font-mono-num rounded-md ${
                          active ? 'bg-white text-[#14532D]' : 'bg-[#14532D] text-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col gap-2">
              <PWAInstallButton />
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3 text-sm font-bold text-[#111827] hover:border-[#DC2626] hover:text-[#DC2626]"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flat Mobile Compact Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 px-1.5 py-1 grid grid-cols-5 gap-1 no-print">
        {mobileBottomTabs.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl min-h-[48px] transition-colors ${
                active ? 'text-[#14532D] bg-[#DCFCE7]' : 'text-gray-600 hover:text-[#111827]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-extrabold truncate max-w-full px-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1 left-2 min-w-[16px] h-[16px] px-1 rounded-full bg-[#14532D] text-[9px] font-mono-num font-bold text-white flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
