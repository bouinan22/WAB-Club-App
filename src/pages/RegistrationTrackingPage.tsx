import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  PartyPopper,
  RefreshCw,
  Send,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { RegistrationFormUploader } from '../components/RegistrationFormUploader.tsx';
import { api, getProtectedFileUrl } from '../lib/api.ts';
import { formatDateAr } from '../lib/labels.ts';
import type {
  ClubSettings,
  NotificationItem,
  PublicUser,
  RegistrationRequest,
  RegistrationRequestStatus,
} from '../types/wab.ts';

const STATUS_META: Record<
  RegistrationRequestStatus,
  {
    emoji: string;
    label: string;
    desc: string;
    badgeClass: string;
    borderClass: string;
    bgClass: string;
  }
> = {
  pending: {
    emoji: '🟡',
    label: 'قيد المراجعة',
    desc: 'الإدارة لم تتخذ قراراً بعد، وسيتم إشعاركم فور دراسة الملف.',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50/70',
  },
  approved: {
    emoji: '🟢',
    label: 'مقبول',
    desc: 'تمت الموافقة الرسمية على تسجيل اللاعب وإدراجه في قائمة النادي.',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50/70',
  },
  rejected: {
    emoji: '🔴',
    label: 'مرفوض',
    desc: 'تعذر قبول الطلب حالياً. يمكنكم الاطلاع على السبب الموضح أدناه.',
    badgeClass: 'bg-red-100 text-[#DC2626] border-red-300',
    borderClass: 'border-red-200',
    bgClass: 'bg-red-50/70',
  },
  incomplete: {
    emoji: '🟠',
    label: 'ملف ناقص',
    desc: 'يجب استكمال الوثائق المطلوبة أدناه وإعادة إرسالها لاستكمال دراسة الملف.',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    borderClass: 'border-orange-300',
    bgClass: 'bg-orange-50/80',
  },
};

export const RegistrationTrackingPage: React.FC<{
  club: ClubSettings;
  user: PublicUser | null;
  onLogin: (user: PublicUser) => void;
  onLogout: () => void;
  onBackHome: () => void;
  onGoRegister: () => void;
  onGoParentPortal: () => void;
}> = ({ club, user, onLogin, onLogout, onBackHome, onGoRegister, onGoParentPortal }) => {
  // Login / Recovery state when unauthenticated
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotId, setForgotId] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // Authenticated tracking state
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Resubmission state per incomplete request id
  const [resubmitDocMap, setResubmitDocMap] = useState<
    Record<string, { url: string; name: string; mime: string } | null>
  >({});
  const [resubmitNoteMap, setResubmitNoteMap] = useState<Record<string, string>>({});
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);

  // Change password state
  const [showChangePass, setShowChangePass] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
  const [passBusy, setPassBusy] = useState(false);
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [reqs, notifs] = await Promise.all([
        api.getMyRegistrationRequests(),
        api.getNotifications(),
      ]);
      setRequests(reqs);
      setNotifications(notifs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الطلب.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user?.id]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const loggedUser = await api.login(username.trim(), password, 'parent');
      onLogin(loggedUser);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotSuccess(null);
    setAuthBusy(true);
    try {
      const res = await api.forgotPassword(forgotId.trim(), forgotNote.trim());
      setForgotSuccess(res.message);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'تعذر إرسال طلب الاسترجاع.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResubmitDocs = async (reqId: string) => {
    const doc = resubmitDocMap[reqId];
    if (!doc?.url) {
      setError('يرجى رفع الوثيقة المطلوبة أولاً.');
      return;
    }
    setError(null);
    setFeedback(null);
    setResubmittingId(reqId);
    try {
      await api.resubmitRegistrationDocuments(reqId, {
        documents: [doc],
        note: (resubmitNoteMap[reqId] || '').trim() || undefined,
      });
      setResubmitDocMap((prev) => ({ ...prev, [reqId]: null }));
      setResubmitNoteMap((prev) => ({ ...prev, [reqId]: '' }));
      setFeedback('تم رفع الوثائق المطلوبة بنجاح وإحالة الملف مجدداً للمراجعة.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال الوثائق.');
    } finally {
      setResubmittingId(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (passForm.next.length < 8) {
      setPassMsg({ ok: false, text: 'كلمة المرور الجديدة يجب أن تتكون من 8 أحرف على الأقل.' });
      return;
    }
    if (passForm.next !== passForm.confirm) {
      setPassMsg({ ok: false, text: 'كلمتا المرور غير متطابقتين.' });
      return;
    }
    setPassBusy(true);
    try {
      const res = await api.changePassword(passForm.current, passForm.next);
      setPassMsg({ ok: true, text: res.message });
      setPassForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPassMsg({ ok: false, text: err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.' });
    } finally {
      setPassBusy(false);
    }
  };

  const handleMarkNotifRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      // ignore
    }
  };

  if (!user) {
    return (
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[42px]"
          >
            <ArrowRight className="w-4 h-4 text-[#14532D]" />
            <span>العودة للرئيسية</span>
          </button>

          <button
            type="button"
            onClick={onGoRegister}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] text-white px-4 py-2.5 text-xs font-bold hover:bg-[#166534] min-h-[42px]"
          >
            <UserPlus className="w-4 h-4" />
            <span>التسجيل في النادي</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 rounded-2xl bg-[#111827] text-white p-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src={club.logoUrl}
                  alt={club.clubName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-contain bg-white p-1"
                />
                <div>
                  <div className="text-xs font-bold text-[#14532D]">{club.clubShortName} — {club.season}</div>
                  <h1 className="text-xl font-extrabold text-white">متابعة طلب التسجيل</h1>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                سجّل الدخول باستخدام اسم المستخدم وكلمة المرور اللذين أنشأتهما عند إرسال طلب التسجيل للاطلاع على حالة
                الملف، ملاحظات الإدارة، أو استكمال الوثائق المطلوبة.
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-300 border-t border-white/10 pt-4">
              <div className="font-bold text-white mb-1">دليل حالات الطلب:</div>
              <div>🟡 قيد المراجعة: الملف لدى الإدارة للدراسة</div>
              <div>🟢 مقبول: تمت الموافقة وإدراج اللاعب</div>
              <div>🟠 ملف ناقص: يتطلب رفع وثيقة إضافية</div>
              <div>🔴 مرفوض: تعذر القبول مع توضيح السبب</div>
            </div>
          </div>

          <div className="lg:col-span-7 wab-card rounded-2xl p-6 sm:p-8 flex flex-col justify-center space-y-5">
            {forgotMode ? (
              <>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
                    <KeyRound className="w-4 h-4" />
                    <span>استرجاع كلمة المرور</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-[#111827]">طلب إعادة تعيين كلمة مرور المتابعة</h2>
                  <p className="text-xs text-slate-500">
                    أدخل اسم المستخدم المسجل ورقم الهاتف ليتم إشعار إدارة النادي وإعادة تعيين كلمة المرور بأمان.
                  </p>
                </div>

                {authError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-[#DC2626]">
                    {authError}
                  </div>
                )}
                {forgotSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
                    {forgotSuccess}
                  </div>
                )}

                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5">اسم المستخدم *</label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={forgotId}
                      onChange={(e) => setForgotId(e.target.value)}
                      placeholder="username"
                      className="wab-input font-mono-num text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5">رقم الهاتف للتواصل</label>
                    <input
                      type="text"
                      value={forgotNote}
                      onChange={(e) => setForgotNote(e.target.value)}
                      placeholder="0550..."
                      className="wab-input font-mono-num"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(false);
                        setAuthError(null);
                        setForgotSuccess(null);
                      }}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
                    >
                      العودة للدخول
                    </button>
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="flex-1 rounded-xl bg-[#14532D] py-2.5 px-4 text-sm font-bold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[44px]"
                    >
                      {authBusy ? 'جاري الإرسال...' : 'إرسال طلب الاسترجاع'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
                    <ClipboardCheck className="w-4 h-4" />
                    <span>بوابة المسجلين</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-[#111827]">تسجيل الدخول لمتابعة طلب التسجيل</h2>
                </div>

                {authError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-[#DC2626]">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5">اسم المستخدم</label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ahmed_parent2026"
                      className="wab-input font-mono-num text-left"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#111827]">كلمة المرور</label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotMode(true);
                          setForgotId(username);
                          setAuthError(null);
                        }}
                        className="text-xs font-bold text-[#14532D] hover:underline"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="wab-input pl-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute left-3 top-2.5 text-slate-400 hover:text-[#111827]"
                        aria-label="إظهار أو إخفاء كلمة المرور"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-3 px-4 text-sm font-extrabold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[48px]"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{authBusy ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}</span>
                  </button>
                </form>

                <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>لم ترسل طلب تسجيل بعد؟</span>
                  <button
                    type="button"
                    onClick={onGoRegister}
                    className="font-extrabold text-[#14532D] hover:underline"
                  >
                    قدّم طلب تسجيل جديد الآن
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  const hasApproved = requests.some((r) => r.status === 'approved');
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Applicant Top Summary Header */}
      <div className="rounded-2xl bg-[#111827] text-white p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={club.logoUrl}
            alt={club.clubName}
            referrerPolicy="no-referrer"
            className="w-14 h-14 rounded-2xl object-contain bg-white p-1 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#14532D]">
              لوحة متابعة طلبات التسجيل · @{user.username}
            </div>
            <h1 className="text-xl font-extrabold text-white truncate">مرحباً، {user.fullName}</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              نادي {club.clubName} — الموسم الرياضي {club.season}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 min-h-[40px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          {hasApproved && (
            <button
              type="button"
              onClick={onGoParentPortal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 min-h-[40px]"
            >
              <span>الدخول إلى فضاء الأولياء</span>
            </button>
          )}

          <button
            type="button"
            onClick={onGoRegister}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[40px]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>تسجيل لاعب آخر</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/15 min-h-[40px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-[#DC2626]">
          {error}
        </div>
      )}
      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {feedback}
        </div>
      )}

      {/* Requests List */}
      {loading && requests.length === 0 ? (
        <div className="wab-card rounded-2xl p-10 text-center text-sm text-slate-500">
          جاري استرجاع ملفات طلبات التسجيل...
        </div>
      ) : requests.length === 0 ? (
        <div className="wab-card rounded-2xl p-8 text-center space-y-3">
          <ClipboardCheck className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="text-lg font-extrabold text-[#111827]">لا توجد طلبات تسجيل مسجلة على هذا الحساب</h2>
          <p className="text-xs text-slate-500">يمكنك تقديم طلب تسجيل إلكتروني جديد لأحد أبنائك من الزر التالي.</p>
          <button
            type="button"
            onClick={onGoRegister}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white"
          >
            <UserPlus className="w-4 h-4" />
            <span>تقديم طلب تسجيل جديد</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {requests.map((reqItem) => {
            const st = STATUS_META[reqItem.status] || STATUS_META.pending;
            return (
              <div
                key={reqItem.id}
                className={`wab-card rounded-2xl p-5 sm:p-6 border-2 ${st.borderClass} space-y-5`}
              >
                {/* Header Row: Player Name + Color-Coded Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {reqItem.photoUrl ? (
                      <img
                        src={getProtectedFileUrl(reqItem.photoUrl)}
                        alt={reqItem.fullName}
                        className="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-slate-100 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-[#111827] text-white flex items-center justify-center font-extrabold text-lg shrink-0">
                        {reqItem.fullName.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-lg sm:text-xl font-extrabold text-[#111827] truncate">
                        {reqItem.fullName}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                        <span>
                          رقم الطلب:{' '}
                          <strong className="font-mono-num text-[#111827]">{reqItem.id}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          الفئة المطلوبة:{' '}
                          <strong className="font-mono-num text-[#14532D]">{reqItem.categoryId}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-extrabold shrink-0 ${st.badgeClass}`}
                  >
                    <span>{st.emoji}</span>
                    <span>{st.label}</span>
                  </div>
                </div>

                {/* Status Banner */}
                <div className={`rounded-xl border p-4 space-y-2 ${st.borderClass} ${st.bgClass}`}>
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#111827]">
                    {reqItem.status === 'approved' ? (
                      <PartyPopper className="w-5 h-5 text-emerald-600" />
                    ) : reqItem.status === 'rejected' ? (
                      <XCircle className="w-5 h-5 text-[#14532D]" />
                    ) : reqItem.status === 'incomplete' ? (
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-amber-600" />
                    )}
                    <span>
                      {reqItem.status === 'approved'
                        ? `تهانينا! تم قبول تسجيل اللاعب ${reqItem.fullName} في نادي ${club.clubName}`
                        : `حالة الملف: ${st.emoji} ${st.label}`}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{st.desc}</p>

                  {reqItem.status === 'approved' && reqItem.approvedAt && (
                    <div className="text-xs font-bold text-emerald-800 pt-1">
                      تاريخ القبول الرسمي:{' '}
                      <span className="font-mono-num">{formatDateAr(reqItem.approvedAt)}</span>
                    </div>
                  )}

                  {reqItem.status === 'rejected' && reqItem.rejectionReason && (
                    <div className="rounded-lg bg-white border border-red-200 p-3 text-xs sm:text-sm text-[#111827]">
                      <strong className="text-[#DC2626]">سبب الرفض الموضح من الإدارة:</strong>{' '}
                      {reqItem.rejectionReason}
                    </div>
                  )}

                  {reqItem.status === 'incomplete' && reqItem.missingDocumentNote && (
                    <div className="rounded-lg bg-white border border-orange-300 p-3 text-xs sm:text-sm text-[#111827]">
                      <strong className="text-orange-700">الوثيقة أو المعلومة المطلوب استكمالها:</strong>{' '}
                      {reqItem.missingDocumentNote}
                    </div>
                  )}
                </div>

                {/* Key Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <span className="text-slate-500">تاريخ إرسال الطلب</span>
                    <div className="font-mono-num font-bold text-[#111827] mt-1">
                      {formatDateAr(reqItem.submittedAt)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <span className="text-slate-500">تاريخ ميلاد اللاعب</span>
                    <div className="font-mono-num font-bold text-[#111827] mt-1">
                      {formatDateAr(reqItem.birthDate)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <span className="text-slate-500">استمارة التسجيل المرفقة</span>
                    <div className="mt-1">
                      {reqItem.signedFormUrl ? (
                        <a
                          href={getProtectedFileUrl(reqItem.signedFormUrl, true)}
                          download={reqItem.signedFormName || 'registration-form'}
                          className="inline-flex items-center gap-1 font-bold text-[#14532D] hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>تحميل الاستمارة المرسلة</span>
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Admin Notes */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1">
                  <div className="font-extrabold text-[#111827]">الملاحظات الصادرة عن الإدارة:</div>
                  <p className="text-slate-700 leading-relaxed">
                    {reqItem.adminNotes || 'لا توجد ملاحظات إضافية من الإدارة حتى الآن.'}
                  </p>
                </div>

                {/* Incomplete Document Resubmission Form */}
                {reqItem.status === 'incomplete' && (
                  <div className="rounded-2xl border border-orange-300 bg-orange-50/50 p-4 space-y-3">
                    <div className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
                      <FileText className="w-4 h-4 text-orange-600" />
                      <span>إعادة رفع الوثيقة المطلوبة</span>
                    </div>
                    <RegistrationFormUploader
                      required
                      publicMode={false}
                      label="رفع الوثيقة الناقصة (PDF أو صورة)"
                      value={resubmitDocMap[reqItem.id] || null}
                      onChange={(doc) => setResubmitDocMap((prev) => ({ ...prev, [reqItem.id]: doc }))}
                    />
                    <input
                      type="text"
                      value={resubmitNoteMap[reqItem.id] || ''}
                      onChange={(e) =>
                        setResubmitNoteMap((prev) => ({ ...prev, [reqItem.id]: e.target.value }))
                      }
                      placeholder="ملاحظة توضيحية للإدارة (اختياري)"
                      className="wab-input"
                    />
                    <button
                      type="button"
                      disabled={resubmittingId === reqItem.id}
                      onClick={() => handleResubmitDocs(reqItem.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 text-xs font-extrabold disabled:opacity-50 min-h-[42px]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {resubmittingId === reqItem.id ? 'جاري الإرسال...' : 'إرسال الوثيقة وإعادة المراجعة'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notifications & Password Security Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 wab-card rounded-2xl p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#14532D]" />
              <span>إشعارات الطلبات ({unreadNotifs} غير مقروء)</span>
            </h2>
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">لا توجد إشعارات حالياً.</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && handleMarkNotifRead(n.id)}
                  className={`rounded-xl border p-3 text-xs space-y-1 cursor-pointer transition-colors ${
                    n.read ? 'border-slate-200 bg-slate-50' : 'border-[#DC2626]/40 bg-red-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[#111827]">{n.title}</span>
                    <span className="font-mono-num text-[11px] text-slate-500">
                      {formatDateAr(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 wab-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[#111827] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#14532D]" />
              <span>أمان الحساب وتغيير كلمة المرور</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowChangePass((v) => !v)}
              className="text-xs font-bold text-[#14532D] hover:underline"
            >
              {showChangePass ? 'إغلاق' : 'تغيير كلمة المرور'}
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
              <span>حساب محمي بتشفير كلمة المرور</span>
            </div>
            <div className="text-slate-600">
              اسم المستخدم: <strong className="font-mono-num text-[#111827]">@{user.username}</strong>
            </div>
          </div>

          {showChangePass && (
            <form onSubmit={handleChangePassword} className="space-y-3">
              {passMsg && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    passMsg.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-[#DC2626]'
                  }`}
                >
                  {passMsg.text}
                </div>
              )}
              <input
                type="password"
                required
                value={passForm.current}
                onChange={(e) => setPassForm({ ...passForm, current: e.target.value })}
                placeholder="كلمة المرور الحالية"
                className="wab-input"
              />
              <input
                type="password"
                required
                minLength={8}
                value={passForm.next}
                onChange={(e) => setPassForm({ ...passForm, next: e.target.value })}
                placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)"
                className="wab-input"
              />
              <input
                type="password"
                required
                minLength={8}
                value={passForm.confirm}
                onChange={(e) => setPassForm({ ...passForm, confirm: e.target.value })}
                placeholder="تأكيد كلمة المرور الجديدة"
                className="wab-input"
              />
              <button
                type="submit"
                disabled={passBusy}
                className="w-full rounded-xl bg-[#111827] hover:bg-slate-800 text-white py-2.5 text-xs font-bold min-h-[42px]"
              >
                {passBusy ? 'جاري التحديث...' : 'حفظ كلمة المرور الجديدة'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
};
