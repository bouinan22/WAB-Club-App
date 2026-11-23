import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  Check,
  CheckSquare,
  Copy,
  FileBarChart,
  Layers,
  Lock,
  Megaphone,
  MessageCircle,
  Plus,
  Printer,
  Share2,
  ShieldCheck,
  Star,
  Trophy,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { CategoryBarChart } from '../components/Charts.tsx';
import { printCoachCard } from '../components/CoachProfileModal.tsx';
import { PhotoUploader } from '../components/PhotoUploader.tsx';
import { PWAInstallButton } from '../components/PWAInstallButton.tsx';
import { AvatarBadge, EmptyState, StatCard } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { useLang } from '../lib/i18n.tsx';
import { ANNOUNCEMENT_TYPE_LABELS, formatDateAr, formatMoney, ROLE_LABELS } from '../lib/labels.ts';
import type { ClubSettings, Coach, DashboardSummary, PublicUser } from '../types/wab.ts';

export const DashboardOverview: React.FC<{
  user: PublicUser;
  club: ClubSettings;
  onNavigate: (tab: string) => void;
  onUserUpdated?: (user: PublicUser) => void;
}> = ({ user, club, onNavigate, onUserUpdated }) => {
  const { lang, t } = useLang();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [myCoach, setMyCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getDashboard(),
      user.role === 'coach' ? api.getCoaches().catch(() => []) : Promise.resolve([] as Coach[]),
    ])
      .then(([dash, coachesList]) => {
        setSummary(dash);
        setMyCoach(coachesList[0] || null);
      })
      .finally(() => setLoading(false));
  }, [user.id, user.role]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const appUrl = origin || 'https://wab-bouanan.dz';
  const parentUrl = `${appUrl}/parent`;
  const coachUrl = `${appUrl}/coach`;

  const copyLink = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // ignore clipboard restriction
    }
  };

  const whatsappHref = (label: string, url: string) => {
    const msg = `${club.clubShortName} — ${club.clubName}\n${label}:\n${url}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  if (loading || !summary) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-xl bg-gray-200/70" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-200/70" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Official Club Welcome Hero (Flat Design) */}
      <div className="wab-card rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <img
              src={club.logoUrl}
              alt={club.clubName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-contain bg-white border border-gray-200 p-1 shrink-0"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="font-mono-num text-[#14532D] bg-[#DCFCE7] px-2 py-0.5 rounded-md">
                  {club.clubShortName}
                </span>
                <span className="text-gray-300" aria-hidden="true">·</span>
                <span className="text-gray-600">{ROLE_LABELS[user.role]}</span>
                <span className="text-gray-300" aria-hidden="true">·</span>
                <span className="font-mono-num text-[#111827]">
                  {t.seasonLabel} {club.season}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827] truncate">
                {lang === 'fr' ? `Bienvenue, ${user.fullName}` : `مرحباً، ${user.fullName}`}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                {club.clubName} —{' '}
                {lang === 'fr'
                  ? 'Portail officiel de gestion et de suivi sportif'
                  : 'بوابة المتابعة والإدارة الرياضية الرسمية'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <PWAInstallButton />
            {user.role === 'admin' && (
              <button
                type="button"
                onClick={() => onNavigate('share')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
              >
                <Share2 className="w-4 h-4 text-[#14532D]" />
                <span>{lang === 'fr' ? "Partager l'application" : 'مشاركة التطبيق'}</span>
              </button>
            )}
            {user.role === 'parent' && (
              <button
                type="button"
                onClick={() => onNavigate('children')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Users className="w-4 h-4" />
                <span>{lang === 'fr' ? 'Fiche de mon enfant' : 'بطاقة ابني'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ⭐ W.A.B TALENTS – فضاء المواهب Quick Portal Strip */}
      <div className="rounded-2xl border-2 border-[#14532D]/30 bg-[#DCFCE7]/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#14532D] text-white flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 fill-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-extrabold text-[#111827]">
              ⭐ W.A.B TALENTS – فضاء المواهب
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              {user.role === 'admin'
                ? lang === 'fr'
                  ? 'Modération des vidéos, défis hebdomadaires, talents mis en avant et signalements.'
                  : 'مراجعة الفيديوهات، إدارة المسابقات الأسبوعية، اختيار مواهب الأسبوع ومراجعة البلاغات.'
                : user.role === 'coach'
                  ? lang === 'fr'
                    ? 'Découvrir les vidéos de talents, gérer votre watchlist et inviter aux essais officiels.'
                    : 'استكشاف مواهب اللاعبين، إدارة قائمة المتابعة وإرسال دعوات التجارب الرسمية.'
                  : lang === 'fr'
                    ? 'Publier une vidéo de talent (max 60s), suivre les défis et répondre aux invitations d’essai.'
                    : 'رفع فيديو موهبة (حتى 60 ثانية)، متابعة المسابقات الأسبوعية والرد على دعوات التجارب.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('talents')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] shrink-0 min-h-[44px]"
        >
          <Star className="w-4 h-4" />
          <span>
            {user.role === 'admin'
              ? lang === 'fr'
                ? 'Gérer W.A.B TALENTS'
                : 'إدارة فضاء المواهب'
              : lang === 'fr'
                ? 'Ouvrir W.A.B TALENTS'
                : 'فتح فضاء المواهب'}
          </span>
        </button>
      </div>

      {/* Admin Quick Actions + Dedicated Shareable Portal Links (/parent & /coach) */}
      {user.role === 'admin' && (
        <div className="wab-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#111827]">{t.adminQuickActions}</h2>
            <span className="text-xs font-semibold text-[#14532D] bg-[#DCFCE7] px-2.5 py-1 rounded-lg self-start">
              {lang === 'fr' ? 'Accès direct' : 'وصول مباشر للفضاءات'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('parents')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] hover:bg-[#166534] text-white px-4 py-3 text-sm font-bold transition-colors min-h-[48px]"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{t.manageParentsBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('coaches')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#14532D] bg-white hover:bg-[#DCFCE7]/50 text-[#14532D] px-4 py-3 text-sm font-bold transition-colors min-h-[48px]"
            >
              <UserCog className="w-4 h-4" />
              <span>{t.manageCoachesBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => copyLink('app', appUrl)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-[#F8FAFC] hover:border-[#14532D] text-[#111827] px-4 py-3 text-sm font-bold transition-colors min-h-[48px]"
            >
              {copiedKey === 'app' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4 text-[#14532D]" />}
              <span>{copiedKey === 'app' ? t.copiedDone : t.copyAppShareBtn}</span>
            </button>
          </div>

          {/* Dedicated /parent and /coach Portal Share Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-200">
            {[
              { key: 'parent', title: t.parentLinkTitle, url: parentUrl, waLabel: t.parentLinkTitle },
              { key: 'coach', title: t.coachLinkTitle, url: coachUrl, waLabel: t.coachLinkTitle },
            ].map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-3.5 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#111827]">{item.title}</span>
                  <span className="text-[11px] font-mono-num font-bold text-[#14532D] truncate" dir="ltr">
                    {item.url}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyLink(item.key, item.url)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
                  >
                    {copiedKey === item.key ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#14532D]" />
                    )}
                    <span>{copiedKey === item.key ? t.copiedDone : t.copyLink}</span>
                  </button>
                  <a
                    href={whatsappHref(item.waLabel, item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] px-3 py-2 text-xs font-bold text-white min-h-[40px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{t.shareWhatsapp}</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Registration Requests Banner (Admin) */}
      {user.role === 'admin' && summary.pendingRegistrationsCount > 0 && (
        <div className="rounded-2xl border border-[#14532D]/30 bg-[#DCFCE7]/50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#14532D] text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-extrabold text-[#111827]">
                يوجد <span className="font-mono-num text-[#14532D]">{summary.pendingRegistrationsCount}</span> طلب تسجيل لاعب جديد قيد المراجعة
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                راجع بيانات اللاعب وولي الأمر واعتمد الطلب أو ارفضه مباشرة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('requests')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] shrink-0 min-h-[44px]"
          >
            <span>مراجعة الطلبات</span>
          </button>
        </div>
      )}

      {/* Coach Personal Card & Quick Actions in Coach Dashboard */}
      {user.role === 'coach' && myCoach && (
        <div className="wab-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <AvatarBadge name={myCoach.fullName} photoUrl={myCoach.photoUrl} size="lg" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-[#111827] truncate">{myCoach.fullName}</h2>
                  <span className={`text-xs font-bold ${myCoach.active ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                    {myCoach.active ? 'حساب مفعل' : 'معطل'}
                  </span>
                </div>
                <p className="text-xs font-bold text-[#14532D]">{myCoach.specialty}</p>
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    الفئات:{' '}
                    <strong className="font-mono-num text-[#111827]">
                      {myCoach.categoryIds.join(' · ') || 'غير مسندة'}
                    </strong>
                  </span>
                  <span className="font-mono-num">{myCoach.phone || '—'}</span>
                  <span className="font-mono-num text-gray-500">{myCoach.email}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <FileBarChart className="w-4 h-4" />
                <span>{t.sendReportToAdmin}</span>
              </button>
              <button
                type="button"
                onClick={() => printCoachCard(myCoach, club)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
              >
                <Printer className="w-4 h-4 text-[#14532D]" />
                <span>طباعة بطاقتي</span>
              </button>
            </div>
          </div>

          {myCoach.allowCoachPhotoEdit ? (
            <div className="pt-3 border-t border-gray-200 space-y-2">
              <div className="text-xs font-bold text-gray-700">
                تحديث الصورة الشخصية (مسموح لك من طرف الإدارة):
              </div>
              <PhotoUploader
                compact
                name={myCoach.fullName}
                value={myCoach.photoUrl || ''}
                prefix="coach"
                onChange={() => {}}
                onImmediateSave={async (nextUrl) => {
                  const res = await api.updateMyCoachPhoto(nextUrl);
                  setMyCoach(res.coach);
                  if (onUserUpdated) onUserUpdated(res.user);
                }}
              />
            </div>
          ) : (
            <div className="pt-2.5 border-t border-gray-200 flex items-center gap-2 text-[11px] text-gray-500">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>تغيير الصورة الشخصية محمي ويتم حصرياً من لوحة إدارة النادي.</span>
            </div>
          )}
        </div>
      )}

      {/* Quick Admin Setup Strip when DB is fresh */}
      {user.role === 'admin' && summary.totalPlayers === 0 && (
        <div className="wab-card rounded-2xl p-5 border-[#14532D]/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-[#111827]">قاعدة البيانات نظيفة وجاهزة للإعداد</h2>
            <p className="text-xs text-gray-600 mt-1">
              ابدأ بإضافة أول مدرب، أول ولي أمر، وتسجيل أول لاعب لتشغيل النادي بالبيانات الحقيقية.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('coaches')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <UserPlus className="w-4 h-4 text-[#14532D]" />
              <span>إضافة أول مدرب</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('parents')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <UserPlus className="w-4 h-4 text-[#14532D]" />
              <span>إضافة أول ولي</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('players')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أول لاعب</span>
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid (100% Real DB Values) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label={user.role === 'parent' ? 'الأبناء المسجلون' : t.playersLabel}
          value={summary.totalPlayers}
          hint={`${summary.activePlayers} لاعب نشط حالياً`}
          icon={<Users className="w-5 h-5" />}
        />

        <StatCard
          label="المدربون"
          value={summary.totalCoaches}
          hint="الطاقم الفني النشط"
          icon={<UserCheck className="w-5 h-5" />}
        />

        <StatCard
          label="الفئات العمرية"
          value={summary.categoriesCount}
          hint={user.role === 'coach' ? `${summary.playersByCategory.length} فئة مسندة لك` : 'من U7 إلى U17'}
          icon={<Layers className="w-5 h-5" />}
        />

        <StatCard
          label="إحصائيات الحضور"
          value={`${summary.monthlyAttendanceRate}%`}
          hint={`المعدل السنوي: ${summary.annualAttendanceRate}%`}
          accent
          icon={<CheckSquare className="w-5 h-5" />}
        />

        {user.role === 'admin' ? (
          <StatCard
            label="الاشتراكات السنوية"
            value={formatMoney(summary.seasonCollectedRevenue, club.currency)}
            hint={`${summary.paidSubscriptionsCount} مسدد · ${summary.unpaidSubscriptionsCount} غير مكتمل`}
            icon={<Wallet className="w-5 h-5" />}
          />
        ) : (
          <StatCard
            label="التدريبات والمباريات"
            value={summary.upcomingTrainings.length + summary.upcomingMatches.length}
            hint={`${summary.upcomingTrainings.length} حصة · ${summary.upcomingMatches.length} مباراة`}
            icon={<Calendar className="w-5 h-5" />}
          />
        )}
      </div>

      {/* Category Distribution + Upcoming Trainings & Matches */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 wab-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#111827]">توزيع اللاعبين حسب الفئات</h2>
            <button
              type="button"
              onClick={() => onNavigate(user.role === 'parent' ? 'children' : 'players')}
              className="text-xs font-bold text-[#14532D] hover:underline"
            >
              عرض القائمة
            </button>
          </div>
          {summary.totalPlayers === 0 ? (
            <EmptyState
              title="لا يوجد لاعبون مسجلون حالياً."
              description="عند إضافة اللاعبين سيتم عرض توزيع الفئات العمرية هنا تلقائياً."
              action={
                user.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('players')}
                    className="rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white min-h-[44px]"
                  >
                    إضافة أول لاعب
                  </button>
                )
              }
            />
          ) : (
            <CategoryBarChart
              data={summary.playersByCategory.map((c, idx) => ({
                label: c.categoryName,
                value: c.count,
                accent: idx % 2 === 0,
              }))}
              unit="لاعب"
            />
          )}
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Upcoming Trainings */}
          <div className="wab-card rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#14532D]" />
                <span>التدريبات القادمة</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('trainings')}
                className="text-xs font-bold text-gray-600 hover:text-[#14532D]"
              >
                الجدول الكامل
              </button>
            </div>
            {summary.upcomingTrainings.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">لا توجد تدريبات مبرمجة.</p>
            ) : (
              <div className="space-y-2.5">
                {summary.upcomingTrainings.map((tItem) => (
                  <div
                    key={tItem.id}
                    className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#111827] truncate">{tItem.title}</span>
                      <span className="font-mono-num font-extrabold text-[#14532D] bg-[#DCFCE7] px-2 py-0.5 rounded-md shrink-0">
                        {tItem.categoryId}
                      </span>
                    </div>
                    <div className="text-gray-600 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <AvatarBadge name={tItem.coachName || 'مدرب'} photoUrl={tItem.coachPhotoUrl} size="sm" />
                        <span className="truncate">{tItem.coachName || tItem.venue}</span>
                      </span>
                      <span className="font-mono-num shrink-0 text-gray-700">
                        {formatDateAr(tItem.date)} · {tItem.startTime}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Matches */}
          <div className="wab-card rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#14532D]" />
                <span>المباريات القادمة</span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('matches')}
                className="text-xs font-bold text-gray-600 hover:text-[#14532D]"
              >
                مركز المباريات
              </button>
            </div>
            {summary.upcomingMatches.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">لا توجد مباريات مجدولة.</p>
            ) : (
              <div className="space-y-2.5">
                {summary.upcomingMatches.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#111827] truncate">
                        W.A.B ضد {m.opponent}
                      </span>
                      <span className="font-mono-num font-extrabold text-[#14532D] bg-[#DCFCE7] px-2 py-0.5 rounded-md shrink-0">
                        {m.categoryId}
                      </span>
                    </div>
                    <div className="text-gray-600 flex items-center justify-between gap-2">
                      <span className="truncate">
                        {m.locationType === 'home' ? 'داخل الديار' : 'خارج الديار'} · {m.venue}
                      </span>
                      <span className="font-mono-num shrink-0 text-gray-700">
                        {formatDateAr(m.date)} · {m.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Announcements & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className={`${user.role === 'parent' ? 'lg:col-span-12' : 'lg:col-span-6'} wab-card rounded-2xl p-5 space-y-3.5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#14532D]" />
              <span>آخر الإعلانات</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('announcements')}
              className="text-xs font-bold text-gray-600 hover:text-[#14532D]"
            >
              كل الإعلانات
            </button>
          </div>
          {summary.recentAnnouncements.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">لا توجد إعلانات منشورة حالياً.</p>
          ) : (
            <div className="space-y-2.5">
              {summary.recentAnnouncements.map((a) => (
                <div key={a.id} className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#111827]">{a.title}</span>
                    <span className="text-[11px] text-[#14532D] font-bold shrink-0">
                      {ANNOUNCEMENT_TYPE_LABELS[a.type] || a.type}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600 line-clamp-2 leading-relaxed">{a.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {user.role !== 'parent' && (
          <div className="lg:col-span-6 wab-card rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#14532D]" />
                <span>آخر النشاطات</span>
              </h2>
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => onNavigate('logs')}
                  className="text-xs font-bold text-gray-600 hover:text-[#14532D]"
                >
                  السجل الكامل
                </button>
              )}
            </div>
            {summary.recentActivities.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">لا توجد نشاطات مسجلة بعد.</p>
            ) : (
              <div className="space-y-2">
                {summary.recentActivities.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-[#F8FAFC] px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#111827] truncate">
                        {log.action} · <span className="text-gray-600 font-normal">{log.actorName}</span>
                      </div>
                      <div className="text-gray-500 mt-0.5 truncate">{log.details}</div>
                    </div>
                    <span className="text-[11px] font-mono-num text-gray-500 shrink-0">
                      {formatDateAr(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
