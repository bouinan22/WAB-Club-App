import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ClipboardCheck,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Shield,
  ShieldCheck,
  Star,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { LanguageSwitcher, useLang } from '../lib/i18n.tsx';
import { PublicRegisterPage } from '../pages/PublicRegisterPage.tsx';
import { RegistrationTrackingPage } from '../pages/RegistrationTrackingPage.tsx';
import type { ClubSettings, PublicUser, UserRole } from '../types/wab.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

export type PortalPath = '/' | '/admin' | '/coach' | '/parent' | '/register' | '/track';

interface AuthScreenProps {
  club: ClubSettings;
  portalPath: PortalPath;
  onNavigatePath: (path: PortalPath) => void;
  onLogin: (user: PublicUser, targetPath?: PortalPath) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  club,
  portalPath,
  onNavigatePath,
  onLogin,
}) => {
  const { lang, dir, t } = useLang();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Simple parent login state (Child Full Name + Birth Date — no email required)
  const [parentLoginMode, setParentLoginMode] = useState<'child' | 'email'>('child');
  const [childFullName, setChildFullName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotId, setForgotId] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [checkingSetup, setCheckingSetup] = useState<boolean>(false);
  const [adminSetupForm, setAdminSetupForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const portalMeta: Record<
    UserRole,
    {
      path: PortalPath;
      title: string;
      subtitle: string;
      btnLabel: string;
      cardDesc: string;
      shortLabel: string;
      icon: React.FC<{ className?: string }>;
    }
  > = {
    admin: {
      path: '/admin',
      title: t.adminPortal,
      subtitle:
        lang === 'fr'
          ? 'Connexion réservée à la direction du club et à la trésorerie'
          : 'تسجيل الدخول المخصص للإدارة العليا وأمانة المال',
      btnLabel: t.adminBtn,
      cardDesc: t.adminDesc,
      shortLabel: lang === 'fr' ? 'Admin' : 'الإدارة',
      icon: Shield,
    },
    coach: {
      path: '/coach',
      title: t.coachPortal,
      subtitle:
        lang === 'fr'
          ? 'Connexion dédiée au staff technique et responsables de catégories'
          : 'تسجيل الدخول المخصص للطاقم الفني ومشرفي الفئات',
      btnLabel: t.coachBtn,
      cardDesc: t.coachDesc,
      shortLabel: lang === 'fr' ? 'Entraîneurs' : 'المدربين',
      icon: UserCheck,
    },
    parent: {
      path: '/parent',
      title: t.parentPortal,
      subtitle:
        lang === 'fr'
          ? "Accès direct avec le nom complet et la date de naissance de l'enfant"
          : 'دخول مباشر للأولياء باسم الابن الكامل وتاريخ ميلاده دون بريد إلكتروني',
      btnLabel: t.parentBtn,
      cardDesc: t.parentDesc,
      shortLabel: lang === 'fr' ? 'Parents' : 'الأولياء',
      icon: Users,
    },
  };

  useEffect(() => {
    setError(null);
    setForgotMode(false);
    setForgotSuccess(null);
    setPassword('');
    if (portalPath === '/parent') {
      setParentLoginMode('child');
    }
    if (portalPath === '/admin') {
      setIdentifier('boudiafrabeh8@gmail.com');
      setPassword('widad123');
      setCheckingSetup(true);
      api
        .getSetupStatus()
        .then((res) => setHasAdmin(res.hasAdmin))
        .catch(() => setHasAdmin(true))
        .finally(() => setCheckingSetup(false));
    }
  }, [portalPath]);

  const activeRole: UserRole | null =
    portalPath === '/admin'
      ? 'admin'
      : portalPath === '/coach'
        ? 'coach'
        : portalPath === '/parent'
          ? 'parent'
          : null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRole) return;
    setError(null);
    setNeedsVerification(false);
    setVerificationMsg(null);
    setLoading(true);
    try {
      const user = await api.login(identifier.trim(), password, activeRole);
      onLogin(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : lang === 'fr' ? 'Connexion impossible.' : 'تعذر تسجيل الدخول.';
      if (msg.startsWith('EMAIL_NOT_VERIFIED:')) {
        setNeedsVerification(true);
        setError(msg.replace('EMAIL_NOT_VERIFIED:', '').trim());
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!activeRole) return;
    setError(null);
    setNeedsVerification(false);
    setVerificationMsg(null);
    setLoading(true);
    try {
      const user = await api.loginWithGoogle(activeRole);
      onLogin(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'fr'
            ? 'Connexion Google impossible.'
            : 'تعذر تسجيل الدخول بحساب Google.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setVerificationMsg(null);
    try {
      await api.resendVerificationEmail();
      setVerificationMsg(
        lang === 'fr'
          ? 'Lien de vérification envoyé. Vérifiez votre boîte mail.'
          : 'تم إرسال رابط تأكيد البريد الإلكتروني مجدداً.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال رابط التأكيد.');
    }
  };

  const handleCheckVerified = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await api.reloadVerifiedSession();
      setNeedsVerification(false);
      onLogin(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'لم يتم تأكيد البريد بعد.';
      setError(msg.replace('EMAIL_NOT_VERIFIED:', '').trim());
    } finally {
      setLoading(false);
    }
  };

  const handleParentChildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.parentChildLogin(childFullName.trim(), childBirthDate.trim());
      onLogin(user, '/parent');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'fr'
            ? "Aucun joueur trouvé avec ces informations."
            : 'تعذر التحقق من بيانات اللاعب.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotSuccess(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword(forgotId.trim(), forgotNote.trim());
      setForgotSuccess(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'fr' ? 'Envoi impossible.' : 'تعذر إرسال الطلب.');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (adminSetupForm.password !== adminSetupForm.confirmPassword) {
      setError(lang === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'كلمتا المرور غير متطابقتين.');
      return;
    }
    if (adminSetupForm.password.length < 8) {
      setError(
        lang === 'fr'
          ? 'Le mot de passe doit contenir au moins 8 caractères.'
          : 'يرجى اختيار كلمة مرور قوية لا تقل عن 8 أحرف.',
      );
      return;
    }
    setLoading(true);
    try {
      const user = await api.bootstrapAdmin({
        fullName: adminSetupForm.fullName,
        email: adminSetupForm.email,
        phone: adminSetupForm.phone,
        password: adminSetupForm.password,
      });
      onLogin(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'fr'
            ? 'Impossible de créer le compte administrateur.'
            : 'تعذر إنشاء حساب مدير النادي.',
      );
    } finally {
      setLoading(false);
    }
  };

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#111827] flex flex-col">
      {/* Flat Top Header */}
      <header className="sticky top-0 z-30 w-full bg-white border-b border-gray-200 px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigatePath('/')}
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
          {portalPath !== '/' && (
            <button
              type="button"
              onClick={() => onNavigatePath('/')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
            >
              <BackIcon className="w-3.5 h-3.5 text-[#14532D]" />
              <span>{t.home}</span>
            </button>
          )}
        </div>
      </header>

      {portalPath === '/register' ? (
        <PublicRegisterPage
          club={club}
          onBackHome={() => onNavigatePath('/')}
          onGoToTracking={(loggedUser) => {
            if (loggedUser) {
              onLogin(loggedUser, '/track');
            } else {
              onNavigatePath('/track');
            }
          }}
        />
      ) : portalPath === '/track' ? (
        <RegistrationTrackingPage
          club={club}
          user={null}
          onLogin={(loggedUser) => onLogin(loggedUser, '/track')}
          onLogout={() => {}}
          onBackHome={() => onNavigatePath('/')}
          onGoRegister={() => onNavigatePath('/register')}
          onGoParentPortal={() => onNavigatePath('/parent')}
        />
      ) : portalPath === '/' || !activeRole ? (
        /* Flat Landing Portal (/) */
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-5">
              {/* Club Identity Banner */}
              <div className="wab-card rounded-2xl p-5 flex items-center gap-4">
                <img
                  src={club.logoUrl}
                  alt={club.clubName}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-xl object-contain bg-white border border-gray-200 p-1 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-[#14532D]">
                    {club.clubEnglishName} · {lang === 'fr' ? `Fondé en ${club.foundedYear}` : `تأسيس ${club.foundedYear}`}
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight text-[#111827] mt-1">
                    {lang === 'fr' ? `Club ${club.clubName}` : `نادي ${club.clubName}`}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1 leading-relaxed">
                    {t.clubOfficialPlatform}
                  </p>
                </div>
              </div>

              {/* Public Club Registration & Applicant Tracking CTAs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onNavigatePath('/register')}
                  className={`rounded-2xl bg-[#14532D] hover:bg-[#166534] text-white p-4 ${dir === 'rtl' ? 'text-right' : 'text-left'} flex flex-col justify-between gap-3 transition-colors min-h-[116px]`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <UserPlus className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[11px] font-extrabold bg-[#DCFCE7] text-[#14532D] px-2.5 py-1 rounded-lg">
                      {lang === 'fr' ? 'Formulaire PDF' : 'استمارة + تسجيل'}
                    </span>
                  </div>
                  <div>
                    <div className="text-base font-extrabold">{t.registerInClub}</div>
                    <div className="text-[11px] text-white/90 mt-0.5 leading-relaxed">{t.registerSub}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigatePath('/track')}
                  className={`rounded-2xl bg-white border-2 border-[#14532D] hover:bg-[#DCFCE7]/50 text-[#111827] p-4 ${dir === 'rtl' ? 'text-right' : 'text-left'} flex flex-col justify-between gap-3 transition-colors min-h-[116px]`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-11 h-11 rounded-xl bg-[#DCFCE7] text-[#14532D] flex items-center justify-center shrink-0">
                      <ClipboardCheck className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-extrabold bg-gray-100 text-[#111827] px-2.5 py-1 rounded-lg">
                      {lang === 'fr' ? 'Suivi dossier' : 'حساب المتابعة'}
                    </span>
                  </div>
                  <div>
                    <div className="text-base font-extrabold text-[#14532D]">{t.trackRequest}</div>
                    <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{t.trackSub}</div>
                  </div>
                </button>
              </div>

              {/* Direct App Download Button */}
              <div className="space-y-3">
                <PWAInstallButton alwaysShowLanding />
              </div>

              {/* 3 Large Role Portal Buttons */}
              <div className="space-y-2.5">
                <div className="text-xs font-extrabold text-gray-500 px-1">{t.memberPortals}</div>
                {(['admin', 'coach', 'parent'] as UserRole[]).map((roleKey) => {
                  const cfg = portalMeta[roleKey];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={roleKey}
                      type="button"
                      onClick={() => onNavigatePath(cfg.path)}
                      className={`w-full wab-card rounded-2xl p-4 ${dir === 'rtl' ? 'text-right' : 'text-left'} flex items-center justify-between gap-4 hover:border-[#14532D] transition-colors group min-h-[72px]`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-[#DCFCE7] text-[#14532D] flex items-center justify-center shrink-0 group-hover:bg-[#14532D] group-hover:text-white transition-colors">
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-extrabold text-[#111827]">{cfg.btnLabel}</div>
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cfg.cardDesc}</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono-num font-bold text-gray-400 group-hover:text-[#14532D] shrink-0">
                        {cfg.path}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Flat Club Crest & Overview Card (Zero 3D) */}
            <div className="lg:col-span-6 space-y-4">
              <div className="wab-card rounded-2xl p-6 sm:p-8 bg-white space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-28 h-28 rounded-2xl bg-[#F3F4F6] border border-gray-200 p-2 flex items-center justify-center">
                    <img
                      src={club.logoUrl}
                      alt={club.clubName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 rounded-lg bg-[#DCFCE7] text-[#14532D] px-3 py-1 text-xs font-extrabold">
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t.seasonLabel} {club.season}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#111827]">
                      {club.clubShortName} — {club.clubName}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                      {lang === 'fr'
                        ? 'Un espace moderne et rapide pour la direction, les entraîneurs et les parents.'
                        : 'تصميم بسيط وعملي يجمع إدارة النادي، المدربين، وأولياء اللاعبين في منصة موحدة وآمنة.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-gray-200">
                  {(['admin', 'coach', 'parent'] as UserRole[]).map((r) => {
                    const m = portalMeta[r];
                    const Icon = m.icon;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => onNavigatePath(m.path)}
                        className="rounded-xl border border-gray-200 bg-[#F8FAFC] hover:border-[#14532D] hover:bg-[#DCFCE7]/40 p-3 text-center space-y-1.5 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-[#14532D] text-white flex items-center justify-center mx-auto">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="text-xs font-extrabold text-[#111827]">{m.shortLabel}</div>
                        <div className="text-[11px] font-mono-num text-[#14532D] font-bold">{m.path}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="wab-card rounded-2xl p-3.5">
                  <div className="text-base sm:text-xl font-extrabold font-mono-num text-[#111827]">U7 – U17</div>
                  <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5 font-semibold">
                    {lang === 'fr' ? '6 catégories' : '6 فئات شبانية'}
                  </div>
                </div>
                <div className="wab-card rounded-2xl p-3.5">
                  <div className="text-base sm:text-xl font-extrabold font-mono-num text-[#14532D]">3</div>
                  <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5 font-semibold">
                    {lang === 'fr' ? 'Espaces dédiés' : 'فضاءات محمية'}
                  </div>
                </div>
                <div className="wab-card rounded-2xl p-3.5">
                  <div className="text-base sm:text-xl font-extrabold font-mono-num text-[#111827]">{club.season}</div>
                  <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5 font-semibold">
                    {lang === 'fr' ? 'Saison active' : 'الموسم النشط'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Role-specific Login Portal (/admin, /coach, /parent) */
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-8 flex items-center justify-center">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Flat Dark Green Portal Info Column */}
            <div className="lg:col-span-5 rounded-2xl bg-[#14532D] text-white p-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img
                    src={club.logoUrl}
                    alt={club.clubName}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-xl object-contain bg-white p-1"
                  />
                  <div>
                    <div className="text-xs font-bold text-[#DCFCE7] font-mono-num">{portalPath}</div>
                    <h1 className="text-xl font-extrabold text-white">{portalMeta[activeRole].title}</h1>
                  </div>
                </div>
                <p className="text-sm text-white/90 leading-relaxed">
                  {portalMeta[activeRole].subtitle}.{' '}
                  {lang === 'fr'
                    ? 'Vérification sécurisée côté serveur avant tout accès aux données.'
                    : 'التحقق من الهوية والصلاحية يتم بشكل صارم من الخادم قبل فتح أي بيانات.'}
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t border-white/15">
                <p className="text-xs font-semibold text-white/80">
                  {lang === 'fr' ? 'Changer de portail :' : 'الانتقال إلى بوابة أخرى:'}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'coach', 'parent'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onNavigatePath(portalMeta[r].path)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-colors min-h-[42px] ${
                        activeRole === r
                          ? 'bg-white border-white text-[#14532D]'
                          : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                      }`}
                    >
                      {portalMeta[r].shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Login / Parent Simple Login / Forgot Password / First-Time Admin Setup Form */}
            <div className="lg:col-span-7 wab-card rounded-2xl p-6 sm:p-8 flex flex-col justify-center space-y-5">
              {portalPath === '/admin' && checkingSetup ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  {lang === 'fr' ? 'Vérification de la configuration...' : 'جاري التحقق من تهيئة الإدارة...'}
                </div>
              ) : portalPath === '/admin' && !hasAdmin ? (
                <>
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D]">
                      <UserPlus className="w-4 h-4" />
                      <span>{lang === 'fr' ? 'Configuration initiale' : 'تهيئة المنصة لأول مرة'}</span>
                    </div>
                    <h2 className="text-xl font-extrabold text-[#111827]">
                      {lang === 'fr' ? 'Créer le premier compte Administrateur' : 'إنشاء حساب مدير النادي الأول'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {lang === 'fr'
                        ? 'Aucun administrateur configuré. Créez le compte officiel du club pour commencer.'
                        : 'قاعدة البيانات فارغة حالياً ولا يوجد حساب إدارة. أنشئ حساب مدير النادي الرسمي للبدء.'}
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-[#DC2626]">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleBootstrapAdmin} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          {lang === 'fr' ? 'Nom complet *' : 'الاسم الكامل للمدير *'}
                        </label>
                        <input
                          type="text"
                          required
                          value={adminSetupForm.fullName}
                          onChange={(e) => setAdminSetupForm({ ...adminSetupForm, fullName: e.target.value })}
                          placeholder="مثال: رابح بودياف"
                          className="wab-input"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          {lang === 'fr' ? 'Téléphone' : 'رقم الهاتف'}
                        </label>
                        <input
                          type="text"
                          value={adminSetupForm.phone}
                          onChange={(e) => setAdminSetupForm({ ...adminSetupForm, phone: e.target.value })}
                          placeholder="0550..."
                          className="wab-input font-mono-num"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#111827] mb-1">
                        {lang === 'fr' ? 'E-mail administratif *' : 'البريد الإلكتروني للإدارة *'}
                      </label>
                      <input
                        type="email"
                        required
                        value={adminSetupForm.email}
                        onChange={(e) => setAdminSetupForm({ ...adminSetupForm, email: e.target.value })}
                        placeholder="admin@example.com"
                        className="wab-input"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          {lang === 'fr' ? 'Mot de passe (8+ car.) *' : 'كلمة المرور (8 أحرف على الأقل) *'}
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            value={adminSetupForm.password}
                            onChange={(e) => setAdminSetupForm({ ...adminSetupForm, password: e.target.value })}
                            className="wab-input pl-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute left-3 top-2.5 text-gray-400 hover:text-[#111827]"
                            aria-label="Toggle password"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          {lang === 'fr' ? 'Confirmer le mot de passe *' : 'تأكيد كلمة المرور *'}
                        </label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={adminSetupForm.confirmPassword}
                          onChange={(e) => setAdminSetupForm({ ...adminSetupForm, confirmPassword: e.target.value })}
                          className="wab-input"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-3 px-4 text-sm font-bold text-white hover:bg-[#166534] transition-colors disabled:opacity-60 min-h-[48px]"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {loading
                          ? lang === 'fr'
                            ? 'Création...'
                            : 'جاري إنشاء الحساب...'
                          : lang === 'fr'
                            ? "Créer le compte Admin et entrer"
                            : 'إنشاء حساب الإدارة والدخول للمنصة'}
                      </span>
                    </button>
                  </form>
                </>
              ) : forgotMode ? (
                <>
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D]">
                      <KeyRound className="w-4 h-4" />
                      <span>{lang === 'fr' ? 'Réinitialisation' : 'استعادة كلمة المرور'}</span>
                    </div>
                    <h2 className="text-xl font-extrabold text-[#111827]">
                      {lang === 'fr' ? 'Demande de réinitialisation' : 'طلب إعادة تعيين كلمة المرور'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {lang === 'fr'
                        ? "Saisissez votre e-mail ou identifiant pour alerter l'administration."
                        : 'أدخل بريدك الإلكتروني أو اسم المستخدم لإشعار إدارة النادي بإعادة تعيين كلمة مرورك.'}
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-[#DC2626]">
                      {error}
                    </div>
                  )}
                  {forgotSuccess && (
                    <div className="rounded-xl border border-emerald-200 bg-[#DCFCE7] px-4 py-3 text-xs sm:text-sm font-semibold text-[#14532D]">
                      {forgotSuccess}
                    </div>
                  )}

                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#111827] mb-1.5">{t.emailOrUser} *</label>
                      <input
                        type="text"
                        required
                        value={forgotId}
                        onChange={(e) => setForgotId(e.target.value)}
                        placeholder="example@domain.com"
                        className="wab-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#111827] mb-1.5">
                        {lang === 'fr' ? 'Note complémentaire (optionnel)' : 'ملاحظة إضافية للإدارة (اختياري)'}
                      </label>
                      <input
                        type="text"
                        value={forgotNote}
                        onChange={(e) => setForgotNote(e.target.value)}
                        placeholder={lang === 'fr' ? 'Numéro de téléphone' : 'رقم الهاتف للتواصل'}
                        className="wab-input"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotMode(false);
                          setError(null);
                          setForgotSuccess(null);
                        }}
                        className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 min-h-[44px]"
                      >
                        {lang === 'fr' ? 'Retour' : 'العودة لتسجيل الدخول'}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-2.5 px-4 text-sm font-bold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[44px]"
                      >
                        <span>
                          {loading
                            ? lang === 'fr'
                              ? 'Envoi...'
                              : 'جاري الإرسال...'
                            : lang === 'fr'
                              ? 'Envoyer la demande'
                              : 'إرسال طلب الاستعادة'}
                        </span>
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <h2 className="text-xl font-extrabold text-[#111827]">
                      {t.signInBtn} — {portalMeta[activeRole].title}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {activeRole === 'parent'
                        ? lang === 'fr'
                          ? "Accédez directement avec les informations de votre enfant (sans e-mail)"
                          : 'يمكنك الدخول مباشرة باسم الابن الكامل وتاريخ ميلاده دون الحاجة إلى بريد إلكتروني'
                        : lang === 'fr'
                          ? 'Saisissez votre e-mail et votre mot de passe autorisé'
                          : 'أدخل البريد الإلكتروني وكلمة المرور المعتمدة لحسابك في هذا الفضاء'}
                    </p>
                  </div>

                  {/* Parent Portal Toggle: Simple Child Login (Default) vs Email Login */}
                  {activeRole === 'parent' && (
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-gray-100 border border-gray-200 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setParentLoginMode('child');
                          setError(null);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors min-h-[40px] ${
                          parentLoginMode === 'child'
                            ? 'bg-[#14532D] text-white'
                            : 'text-gray-700 hover:text-[#111827]'
                        }`}
                      >
                        {t.parentSimpleTab}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setParentLoginMode('email');
                          setError(null);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors min-h-[40px] ${
                          parentLoginMode === 'email'
                            ? 'bg-[#14532D] text-white'
                            : 'text-gray-700 hover:text-[#111827]'
                        }`}
                      >
                        {t.parentEmailTab}
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-[#DC2626] leading-relaxed space-y-2.5">
                      <div>{error}</div>
                      {needsVerification && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleCheckVerified}
                            className="rounded-lg bg-[#14532D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#166534]"
                          >
                            {lang === 'fr' ? "J'ai vérifié mon e-mail" : 'لقد أكدت بريدي — متابعة'}
                          </button>
                          <button
                            type="button"
                            onClick={handleResendVerification}
                            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-[#111827] hover:bg-gray-50"
                          >
                            {lang === 'fr' ? 'Renvoyer le lien' : 'إعادة إرسال رابط التأكيد'}
                          </button>
                        </div>
                      )}
                      {verificationMsg && (
                        <div className="text-xs font-bold text-[#14532D]">{verificationMsg}</div>
                      )}
                    </div>
                  )}

                  {activeRole === 'parent' && parentLoginMode === 'child' ? (
                    <form onSubmit={handleParentChildSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="child-full-name" className="block text-xs font-bold text-[#111827] mb-1.5">
                          {t.childFullNameLabel}
                        </label>
                        <input
                          id="child-full-name"
                          type="text"
                          value={childFullName}
                          onChange={(e) => setChildFullName(e.target.value)}
                          required
                          className="wab-input"
                          placeholder={t.childFullNamePlaceholder}
                        />
                      </div>

                      <div>
                        <label htmlFor="child-birth-date" className="block text-xs font-bold text-[#111827] mb-1.5">
                          {t.childBirthDateLabel}
                        </label>
                        <div className="relative">
                          <input
                            id="child-birth-date"
                            type="date"
                            value={childBirthDate}
                            onChange={(e) => setChildBirthDate(e.target.value)}
                            required
                            className="wab-input font-mono-num"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-3 px-4 text-sm font-bold text-white hover:bg-[#166534] transition-colors disabled:opacity-60 min-h-[48px]"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>{loading ? t.verifying : t.signInBtn}</span>
                      </button>

                      <div className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-3 flex items-center gap-2 text-[11px] text-gray-600">
                        <Calendar className="w-4 h-4 text-[#14532D] shrink-0" />
                        <span>
                          {lang === 'fr'
                            ? "L'accès est strictement limité au profil de votre enfant en lecture seule."
                            : 'يتم التحقق من الاسم الكامل وتاريخ الميلاد من الخادم، ويُفتح ملف ابنك فقط بوضع القراءة.'}
                        </span>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="login-email" className="block text-xs font-bold text-[#111827] mb-1.5">
                          {t.emailOrUser}
                        </label>
                        <input
                          id="login-email"
                          type="text"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          required
                          autoComplete="username"
                          className="wab-input"
                          placeholder="name@example.com"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label htmlFor="login-pass" className="text-xs font-bold text-[#111827]">
                            {t.passwordLabel}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setForgotMode(true);
                              setForgotId(identifier);
                              setError(null);
                            }}
                            className="text-xs font-bold text-[#14532D] hover:underline"
                          >
                            {t.forgotPassword}
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            id="login-pass"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            className="wab-input pl-10"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute left-3 top-2.5 text-gray-400 hover:text-[#111827]"
                            aria-label={showPassword ? 'Hide' : 'Show'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-3 px-4 text-sm font-bold text-white hover:bg-[#166534] transition-colors disabled:opacity-60 min-h-[48px]"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>{loading ? t.verifying : t.signInBtn}</span>
                      </button>

                      <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-gray-200" />
                        <span className="mx-3 shrink text-[11px] font-bold text-gray-400">
                          {lang === 'fr' ? 'OU' : 'أو'}
                        </span>
                        <div className="flex-grow border-t border-gray-200" />
                      </div>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleGoogleLogin}
                        className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-gray-300 bg-white py-3 px-4 text-sm font-bold text-[#111827] hover:border-[#14532D] hover:bg-gray-50 transition-colors disabled:opacity-60 min-h-[48px]"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#14532D]" />
                        <span>
                          {lang === 'fr'
                            ? 'Continuer avec Google'
                            : 'تسجيل الدخول الآمن بحساب Google'}
                        </span>
                      </button>
                    </form>
                  )}

                  <div className="pt-3 border-t border-gray-200 flex items-center gap-2 text-[11px] text-gray-500">
                    <Lock className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                    <span>
                      {lang === 'fr'
                        ? 'Les comptes des entraîneurs et des parents sont créés exclusivement par la direction du club.'
                        : 'يتم إنشاء حسابات المدربين والأولياء حصرياً من طرف إدارة النادي.'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
};
