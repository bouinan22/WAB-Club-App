import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, LogOut, Mail, Phone, Printer, Shield } from 'lucide-react';
import { printCoachCard } from '../components/CoachProfileModal.tsx';
import { getNavItemsForRole } from '../components/Layout.tsx';
import { PhotoUploader } from '../components/PhotoUploader.tsx';
import { PWAInstallButton } from '../components/PWAInstallButton.tsx';
import { AvatarBadge, PageHeader } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { LanguageSwitcher, useLang } from '../lib/i18n.tsx';
import { ROLE_LABELS } from '../lib/labels.ts';
import type { ClubSettings, Coach, PublicUser } from '../types/wab.ts';

export const MyAccountPage: React.FC<{
  user: PublicUser;
  club: ClubSettings;
  unreadCount: number;
  pendingRegistrationsCount: number;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  onUserUpdated: (user: PublicUser) => void;
}> = ({
  user,
  club,
  unreadCount,
  pendingRegistrationsCount,
  onSelectTab,
  onLogout,
  onUserUpdated,
}) => {
  const { lang, dir, t } = useLang();
  const [myCoach, setMyCoach] = useState<Coach | null>(null);
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [passFeedback, setPassFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (user.role === 'coach') {
      api
        .getCoaches()
        .then((list) => setMyCoach(list[0] || null))
        .catch(() => setMyCoach(null));
    }
  }, [user.role, user.id]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassFeedback(null);
    if (passForm.next.length < 8) {
      setPassFeedback({ ok: false, text: 'يجب أن لا تقل كلمة المرور الجديدة عن 8 أحرف.' });
      return;
    }
    if (passForm.next !== passForm.confirm) {
      setPassFeedback({ ok: false, text: 'كلمة المرور الجديدة وتأكيدها غير متطابقين.' });
      return;
    }
    setPassBusy(true);
    try {
      const res = await api.changePassword(passForm.current, passForm.next);
      setPassFeedback({ ok: true, text: res.message || 'تم تحديث كلمة المرور بنجاح.' });
      setPassForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPassFeedback({ ok: false, text: err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.' });
    } finally {
      setPassBusy(false);
    }
  };

  const navItems = getNavItemsForRole(user.role, unreadCount, pendingRegistrationsCount, lang).filter(
    (item) => item.id !== 'account',
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={lang === 'fr' ? 'Mon compte et paramètres' : 'حسابي وإعدادات الفضاء'}
        subtitle={`${ROLE_LABELS[user.role]} · ${club.clubShortName} — ${club.clubName}`}
      />

      {/* User Hero Profile Card */}
      <div className="wab-card rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-4 min-w-0">
            <AvatarBadge name={user.fullName} photoUrl={myCoach?.photoUrl || user.photoUrl} size="lg" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-extrabold text-[#111827] truncate">{user.fullName}</h2>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
                <Shield className="w-3.5 h-3.5" />
                <span>{ROLE_LABELS[user.role]}</span>
              </div>
              <div className="text-xs text-gray-500">
                {t.seasonLabel} {club.season}
              </div>
            </div>
          </div>

          <img
            src={club.logoUrl}
            alt={club.clubName}
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-xl object-contain bg-gray-50 border border-gray-200 p-1 shrink-0 hidden sm:block"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-[#F8FAFC] border border-gray-200 p-3.5 flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-[#14532D] shrink-0" />
            <div className="min-w-0">
              <div className="text-gray-500">{lang === 'fr' ? 'Identifiant / E-mail' : 'البريد الإلكتروني'}</div>
              <div className="font-mono-num font-bold text-[#111827] truncate mt-0.5">{user.email}</div>
            </div>
          </div>

          <div className="rounded-xl bg-[#F8FAFC] border border-gray-200 p-3.5 flex items-center gap-2.5">
            <Phone className="w-4 h-4 text-[#14532D] shrink-0" />
            <div className="min-w-0">
              <div className="text-gray-500">{lang === 'fr' ? 'Téléphone' : 'رقم الهاتف'}</div>
              <div className="font-mono-num font-bold text-[#111827] truncate mt-0.5">{user.phone || 'غير مسجل'}</div>
            </div>
          </div>
        </div>

        {user.role === 'coach' && myCoach && (
          <div className="pt-3 border-t border-gray-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-[#111827]">
                الفئات المشرف عليها: <span className="font-mono-num text-[#14532D]">{myCoach.categoryIds.join(' · ') || '—'}</span>
              </div>
              <button
                type="button"
                onClick={() => printCoachCard(myCoach, club)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D]"
              >
                <Printer className="w-3.5 h-3.5 text-[#14532D]" />
                <span>طباعة بطاقتي المهنية</span>
              </button>
            </div>

            {myCoach.allowCoachPhotoEdit ? (
              <PhotoUploader
                compact
                name={myCoach.fullName}
                value={myCoach.photoUrl || ''}
                prefix="coach"
                onChange={() => {}}
                onImmediateSave={async (nextUrl) => {
                  const res = await api.updateMyCoachPhoto(nextUrl);
                  setMyCoach(res.coach);
                  onUserUpdated(res.user);
                }}
              />
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#F8FAFC] rounded-xl p-3 border border-gray-200">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>تعديل الصورة الشخصية يتم حصرياً عبر إدارة النادي.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Role-scoped Full Directory Links */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <h3 className="text-base font-extrabold text-[#111827]">
          {lang === 'fr' ? 'Sections disponibles' : 'أقسام الفضاء المتاحة لك'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`rounded-xl border border-gray-200 bg-[#F8FAFC] hover:border-[#14532D] hover:bg-white p-3.5 ${
                  dir === 'rtl' ? 'text-right' : 'text-left'
                } transition-colors flex items-center justify-between gap-2 min-h-[56px]`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-[#DCFCE7] text-[#14532D] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-bold text-[#111827] truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-[11px] font-mono-num font-bold rounded-md bg-[#14532D] text-white shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Security & Change Password */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#14532D]" />
            <h3 className="text-base font-extrabold text-[#111827]">
              {lang === 'fr' ? 'Sécurité et mot de passe' : 'الأمان وتغيير كلمة المرور'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="text-xs font-bold text-gray-600 hover:text-[#14532D] inline-flex items-center gap-1"
          >
            {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPass ? 'إخفاء' : 'إظهار'}</span>
          </button>
        </div>

        {passFeedback && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
              passFeedback.ok
                ? 'border-emerald-200 bg-[#DCFCE7] text-[#14532D]'
                : 'border-red-200 bg-red-50 text-[#DC2626]'
            }`}
          >
            {passFeedback.text}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">كلمة المرور الحالية</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={passForm.current}
              onChange={(e) => setPassForm((prev) => ({ ...prev, current: e.target.value }))}
              className="wab-input"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">كلمة المرور الجديدة (8 أحرف+)</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              value={passForm.next}
              onChange={(e) => setPassForm((prev) => ({ ...prev, next: e.target.value }))}
              className="wab-input"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">تأكيد كلمة المرور الجديدة</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              value={passForm.confirm}
              onChange={(e) => setPassForm((prev) => ({ ...prev, confirm: e.target.value }))}
              className="wab-input"
              placeholder="••••••••"
            />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={passBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] hover:bg-[#166534] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60 min-h-[42px]"
            >
              <KeyRound className="w-4 h-4" />
              <span>{passBusy ? 'جاري التحديث...' : 'تحديث كلمة المرور'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Language, App Install & Logout */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <h3 className="text-base font-extrabold text-[#111827]">
          {lang === 'fr' ? 'Préférences et session' : 'تفضيلات التطبيق والجلسة'}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <LanguageSwitcher />
          <PWAInstallButton />
        </div>

        <div className="pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onLogout}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 hover:bg-[#DC2626] hover:text-white px-6 py-3 text-sm font-bold text-[#DC2626] transition-colors min-h-[48px]"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.logout}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
