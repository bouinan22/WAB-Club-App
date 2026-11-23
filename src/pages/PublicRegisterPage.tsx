import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  HeartPulse,
  KeyRound,
  Lock,
  MapPin,
  Phone,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { PhotoUploader } from '../components/PhotoUploader.tsx';
import { RegistrationFormUploader } from '../components/RegistrationFormUploader.tsx';
import { api, setStoredToken } from '../lib/api.ts';
import { formatDateAr } from '../lib/labels.ts';
import { downloadOfficialRegistrationPdf } from '../lib/registrationPdf.ts';
import type { ClubSettings, PublicUser, RegistrationRequest } from '../types/wab.ts';

const CATEGORIES = [
  { id: 'U7', label: 'U7 — أقل من 7 سنوات (البراعم)' },
  { id: 'U9', label: 'U9 — أقل من 9 سنوات' },
  { id: 'U11', label: 'U11 — أقل من 11 سنة' },
  { id: 'U13', label: 'U13 — أقل من 13 سنة' },
  { id: 'U15', label: 'U15 — أقل من 15 سنة' },
  { id: 'U17', label: 'U17 — أقل من 17 سنة' },
];

function suggestCategoryByBirthDate(birthDate: string): string | null {
  if (!birthDate) return null;
  const year = Number(birthDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 1995 || year > new Date().getFullYear()) return null;
  const age = new Date().getFullYear() - year;
  if (age <= 7) return 'U7';
  if (age <= 9) return 'U9';
  if (age <= 11) return 'U11';
  if (age <= 13) return 'U13';
  if (age <= 15) return 'U15';
  return 'U17';
}

function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$!*';
  const all = upper + lower + digits + symbols;
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  const chars = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];
  for (let i = 4; i < length; i++) {
    chars.push(all[arr[i] % all.length]);
  }
  return chars.sort(() => (arr[0] % 3) - 1).join('');
}

export const PublicRegisterPage: React.FC<{
  club: ClubSettings;
  currentUser?: PublicUser | null;
  onBackHome: () => void;
  onGoToTracking: (loggedInUser?: PublicUser) => void;
}> = ({ club, currentUser, onBackHome, onGoToTracking }) => {
  const formSectionRef = useRef<HTMLFormElement>(null);
  const isLoggedParent = currentUser?.role === 'parent';

  const [formOpen, setFormOpen] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    birthDate: '',
    categoryId: 'U11',
    parentName: currentUser?.fullName || '',
    parentPhone: currentUser?.phone || '',
    address: '',
    photoUrl: '',
    medicalNotes: '',
    additionalNotes: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
  });
  const [signedForm, setSignedForm] = useState<{ url: string; name: string; mime: string } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    request: RegistrationRequest;
    username: string;
    user: PublicUser;
  } | null>(null);

  const handleDownloadPdf = async () => {
    setPdfNotice(null);
    setDownloadingPdf(true);
    try {
      await downloadOfficialRegistrationPdf(club);
      setPdfNotice('تم تحميل استمارة التسجيل الرسمية بصيغة PDF بنجاح. يمكنك تعبئتها وتوقيعها ثم رفعها أدناه.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر توليد ملف PDF، يمكنك استخدام زر الطباعة كبديل.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrintForm = () => {
    window.print();
  };

  const handleStartRegistration = () => {
    setFormOpen(true);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleBirthDateChange = (nextDate: string) => {
    const suggested = suggestCategoryByBirthDate(nextDate);
    setSuggestedCategory(suggested);
    setForm((prev) => ({
      ...prev,
      birthDate: nextDate,
      categoryId: suggested || prev.categoryId,
    }));
  };

  const handleGeneratePassword = () => {
    const pwd = generateSecurePassword(12);
    setShowPass(true);
    setCopiedPass(false);
    setForm((prev) => ({ ...prev, password: pwd, confirmPassword: pwd }));
  };

  const handleCopyPassword = async () => {
    if (!form.password) return;
    try {
      await navigator.clipboard.writeText(form.password);
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!signedForm?.url) {
      setError('يرجى رفع استمارة التسجيل المعبأة والموقعة (PDF أو صورة) قبل إرسال الطلب.');
      return;
    }

    if (!isLoggedParent) {
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(form.username.trim())) {
        setError('يرجى اختيار اسم مستخدم فريد من 3 إلى 30 حرفاً (أحرف إنجليزية وأرقام فقط أو . _ -).');
        return;
      }
      if (form.password.length < 8) {
        setError('يرجى إدخال كلمة مرور آمنة لا تقل عن 8 أحرف.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('كلمتا المرور غير متطابقتين.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.submitRegistrationRequest({
        fullName: form.fullName.trim(),
        birthDate: form.birthDate,
        categoryId: form.categoryId,
        parentName: form.parentName.trim(),
        parentPhone: form.parentPhone.trim(),
        address: form.address.trim(),
        photoUrl: form.photoUrl,
        signedFormUrl: signedForm.url,
        signedFormName: signedForm.name,
        signedFormMime: signedForm.mime,
        medicalNotes: form.medicalNotes.trim(),
        additionalNotes: form.additionalNotes.trim(),
        username: isLoggedParent ? undefined : form.username.trim().toLowerCase(),
        password: isLoggedParent ? undefined : form.password,
        email: isLoggedParent ? undefined : form.email.trim() || undefined,
      });

      if (res.token) {
        setStoredToken(res.token);
      }

      setSubmittedResult({
        request: res.request,
        username: res.username,
        user: res.user,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال طلب التسجيل، يرجى المحاولة لاحقاً.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      fullName: '',
      birthDate: '',
      categoryId: 'U11',
      parentName: currentUser?.fullName || '',
      parentPhone: currentUser?.phone || '',
      address: '',
      photoUrl: '',
      medicalNotes: '',
      additionalNotes: '',
      username: '',
      password: '',
      confirmPassword: '',
      email: '',
    });
    setSignedForm(null);
    setSuggestedCategory(null);
    setSubmittedResult(null);
    setError(null);
  };

  return (
    <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Screen-only Interactive Registration Flow */}
      <div className="no-print space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] transition-colors min-h-[42px]"
          >
            <ArrowRight className="w-4 h-4 text-[#14532D]" />
            <span>العودة للرئيسية</span>
          </button>

          <button
            type="button"
            onClick={() => onGoToTracking(submittedResult?.user || currentUser || undefined)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[42px]"
          >
            <ClipboardCheck className="w-4 h-4 text-[#14532D]" />
            <span>متابعة طلب مسجل</span>
          </button>
        </div>

        {/* Hero Club Banner + PDF Download & Instructions */}
        <section className="rounded-2xl bg-[#111827] text-white p-5 sm:p-7 border border-slate-900 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <img
              src={club.logoUrl}
              alt={club.clubName}
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-2xl object-contain bg-white p-1.5 shrink-0"
            />
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-2 text-xs font-extrabold text-[#14532D]">
                <span>التسجيل الإلكتروني الرسمي — {club.clubShortName}</span>
                <span className="text-slate-500">·</span>
                <span className="font-mono-num text-white">الموسم الرياضي {club.season}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                التسجيل في نادي {club.clubName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                حمّل استمارة التسجيل الرسمية، عبّئها ووقّعها، ثم أرسل الملف الإلكتروني وأنشئ حساب متابعة خاصاً بك.
              </p>
            </div>
          </div>

          {/* Action Buttons: Download PDF / Print / Start Electronic Registration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-[#111827] hover:bg-slate-100 py-3.5 px-4 text-xs sm:text-sm font-extrabold transition-colors min-h-[48px] disabled:opacity-60"
            >
              <FileDown className="w-4 h-4 text-[#14532D]" />
              <span>{downloadingPdf ? 'جاري تجهيز PDF...' : 'تحميل استمارة التسجيل (PDF)'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintForm}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/15 py-3.5 px-4 text-xs sm:text-sm font-bold transition-colors min-h-[48px]"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الاستمارة ورقياً</span>
            </button>

            <button
              type="button"
              onClick={handleStartRegistration}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] hover:bg-[#166534] text-white py-3.5 px-4 text-xs sm:text-sm font-extrabold transition-colors min-h-[48px] shadow-[#14532D]/30"
            >
              <Send className="w-4 h-4" />
              <span>بدء التسجيل الإلكتروني</span>
            </button>
          </div>

          {pdfNotice && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200 flex items-center gap-2">
              <Download className="w-4 h-4 shrink-0" />
              <span>{pdfNotice}</span>
            </div>
          )}

          {/* Instructions Box */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
            <div className="text-xs font-extrabold text-[#14532D]">تعليمات التسجيل خطوة بخطوة:</div>
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 leading-relaxed">
              <li className="rounded-lg bg-white/5 p-3 border border-white/5">
                <span className="font-mono-num font-extrabold text-white block mb-1">1. تحميل وتعبئة الاستمارة</span>
                حمّل استمارة التسجيل بصيغة PDF أو اطبعها، ثم عبّئ بيانات اللاعب ووقّع عليها من طرف ولي الأمر.
              </li>
              <li className="rounded-lg bg-white/5 p-3 border border-white/5">
                <span className="font-mono-num font-extrabold text-white block mb-1">2. رفع الملف وإرسال الطلب</span>
                قم بتصوير الاستمارة الموقعة أو مسحها ضوئياً (PDF أو صورة) وارفعها مع بيانات اللاعب وصورته.
              </li>
              <li className="rounded-lg bg-white/5 p-3 border border-white/5">
                <span className="font-mono-num font-extrabold text-white block mb-1">3. حساب المتابعة الفوري</span>
                اختر اسم مستخدم وكلمة مرور لحساب ولي الأمر لمتابعة حالة الملف وتلقي إشعارات الإدارة.
              </li>
            </ol>
          </div>
        </section>

        {submittedResult ? (
          <div className="wab-card rounded-2xl p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#111827]">
                تم إرسال طلب التسجيل وإنشاء حساب المتابعة بنجاح
              </h2>
              <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                طلبكم الآن بحالة <strong className="text-amber-700">قيد المراجعة</strong> لدى إدارة نادي {club.clubName}.
                احتفظ برقم الطلب واسم المستخدم لمتابعة حالة الملف في أي وقت.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:p-5 text-right grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className="text-slate-500">رقم الطلب الرسمي:</span>
                <div className="font-mono-num font-extrabold text-[#14532D] text-sm mt-0.5">
                  {submittedResult.request.id}
                </div>
              </div>
              <div>
                <span className="text-slate-500">اسم مستخدم حساب المتابعة:</span>
                <div className="font-mono-num font-extrabold text-[#111827] text-sm mt-0.5">
                  @{submittedResult.username}
                </div>
              </div>
              <div>
                <span className="text-slate-500">الاسم واللقب للاعب:</span>
                <div className="font-bold text-[#111827] mt-0.5">{submittedResult.request.fullName}</div>
              </div>
              <div>
                <span className="text-slate-500">الفئة المطلوبة:</span>
                <div className="font-mono-num font-bold text-[#14532D] mt-0.5">
                  {submittedResult.request.categoryId}
                </div>
              </div>
              <div>
                <span className="text-slate-500">ولي الأمر:</span>
                <div className="font-bold text-[#111827] mt-0.5">{submittedResult.request.parentName}</div>
              </div>
              <div>
                <span className="text-slate-500">تاريخ الإرسال:</span>
                <div className="font-mono-num font-bold text-[#111827] mt-0.5">
                  {formatDateAr(submittedResult.request.submittedAt)}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => onGoToTracking(submittedResult.user)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-3.5 px-5 text-sm font-extrabold text-white hover:bg-[#166534] transition-colors min-h-[48px] shadow-[#14532D]/20"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>الانتقال الآن إلى متابعة طلب التسجيل</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 bg-white py-3.5 px-5 text-sm font-bold text-[#111827] hover:border-[#14532D] transition-colors min-h-[48px]"
              >
                تسجيل طلب لاعب آخر
              </button>
            </div>
          </div>
        ) : (
          formOpen && (
            <form ref={formSectionRef} onSubmit={handleSubmit} className="wab-card rounded-2xl p-5 sm:p-7 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-lg font-extrabold text-[#111827]">استمارة التسجيل الإلكتروني</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    املأ جميع الحقول المطلوبة وأرفق استمارة التسجيل الموقعة
                  </p>
                </div>
                <span className="text-xs font-mono-num font-bold text-[#14532D] bg-[#DCFCE7] px-3 py-1 rounded-lg">
                  موسم {club.season}
                </span>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-[#DC2626]">
                  {error}
                </div>
              )}

              {/* 1. Player Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#111827] pb-2 border-b border-slate-200">
                  <User className="w-4 h-4 text-[#14532D]" />
                  <span>1. معلومات اللاعب</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#111827] mb-1.5">الاسم واللقب *</label>
                    <input
                      type="text"
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      placeholder="أدخل الاسم واللقب الكامل للاعب"
                      className="wab-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#14532D]" />
                      <span>تاريخ الميلاد *</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={form.birthDate}
                      onChange={(e) => handleBirthDateChange(e.target.value)}
                      className="wab-input font-mono-num"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5 flex items-center justify-between gap-2">
                      <span>الفئة العمرية *</span>
                      {suggestedCategory && (
                        <span className="text-[11px] font-bold text-[#14532D]">
                          مقترح تلقائياً: {suggestedCategory}
                        </span>
                      )}
                    </label>
                    <select
                      required
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="wab-input"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Parent & Contact Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#111827] pb-2 border-b border-slate-200">
                  <Users className="w-4 h-4 text-[#14532D]" />
                  <span>2. معلومات الأب أو الأم أو الولي والتواصل</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5">
                      اسم الأب أو الأم أو الولي *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.parentName}
                      onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                      placeholder="الاسم الكامل لولي الأمر"
                      className="wab-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#14532D]" />
                      <span>رقم الهاتف *</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={form.parentPhone}
                      onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                      placeholder="0550 00 00 00"
                      className="wab-input font-mono-num"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#111827] mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#14532D]" />
                      <span>العنوان *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="الحي / البلدية / الولاية"
                      className="wab-input"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Signed Form Upload + Player Photo + Notes */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#111827] pb-2 border-b border-slate-200">
                  <FileText className="w-4 h-4 text-[#14532D]" />
                  <span>3. الوثائق المرفقة وصورة اللاعب</span>
                </div>

                <RegistrationFormUploader
                  required
                  publicMode={!currentUser}
                  value={signedForm}
                  onChange={setSignedForm}
                  label="رفع استمارة التسجيل المعبأة والموقعة (PDF أو صورة)"
                />

                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1.5">صورة اللاعب</label>
                  <PhotoUploader
                    compact
                    publicMode
                    name={form.fullName || 'لاعب جديد'}
                    value={form.photoUrl}
                    prefix="player"
                    onChange={(url) => setForm((prev) => ({ ...prev, photoUrl: url }))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-[#14532D]" />
                      <span>معلومات صحية ضرورية (اختيارية)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={form.medicalNotes}
                      onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
                      placeholder="حساسية، ربو، فصيلة الدم..."
                      className="wab-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1.5">ملاحظات إضافية (اختيارية)</label>
                    <textarea
                      rows={2}
                      value={form.additionalNotes}
                      onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })}
                      placeholder="أي ملاحظات أو مركز لعب مفضل..."
                      className="wab-input"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Applicant Tracking Account Creation */}
              <div className="space-y-4 rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#111827]">
                    <KeyRound className="w-4 h-4 text-[#14532D]" />
                    <span>4. حساب خاص لمتابعة الطلب</span>
                  </div>
                  {!isLoggedParent && (
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-[#111827] hover:border-[#14532D]"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#14532D]" />
                      <span>توليد كلمة مرور آمنة</span>
                    </button>
                  )}
                </div>

                {isLoggedParent ? (
                  <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    أنت مسجل الدخول حالياً بالحساب <strong className="font-mono-num">@{currentUser.username}</strong>؛
                    سيُربط هذا الطلب مباشرة بحسابك لمتابعته دون الحاجة لإنشاء حساب جديد.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      اختر اسم مستخدم وكلمة مرور لاستخدامهما في صفحة «متابعة طلب التسجيل». تُشفّر كلمة المرور فوراً ولا
                      تظهر أبداً في قاعدة البيانات أو للإدارة.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1.5">اسم المستخدم الفريد *</label>
                        <input
                          type="text"
                          required
                          dir="ltr"
                          value={form.username}
                          onChange={(e) => setForm({ ...form, username: e.target.value })}
                          placeholder="ahmed_parent2026"
                          className="wab-input font-mono-num text-left"
                        />
                        <span className="text-[11px] text-slate-500 mt-1 block">
                          أحرف إنجليزية وأرقام فقط (3 أحرف على الأقل)
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1.5">
                          البريد الإلكتروني (اختياري)
                        </label>
                        <input
                          type="email"
                          dir="ltr"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="parent@example.com"
                          className="wab-input font-mono-num text-left"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1.5">
                          كلمة المرور (8 أحرف على الأقل) *
                        </label>
                        <div className="relative">
                          <input
                            type={showPass ? 'text' : 'password'}
                            required
                            minLength={8}
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            placeholder="••••••••"
                            className="wab-input pl-16"
                          />
                          <div className="absolute left-2 top-2 flex items-center gap-1">
                            {form.password && (
                              <button
                                type="button"
                                onClick={handleCopyPassword}
                                className="p-1 text-slate-500 hover:text-[#14532D]"
                                title="نسخ كلمة المرور"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowPass((v) => !v)}
                              className="p-1 text-slate-500 hover:text-[#111827]"
                              aria-label="إظهار أو إخفاء كلمة المرور"
                            >
                              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        {copiedPass && (
                          <span className="text-[11px] font-bold text-emerald-700 mt-1 block">
                            تم نسخ كلمة المرور، احتفظ بها في مكان آمن.
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1.5">تأكيد كلمة المرور *</label>
                        <input
                          type={showPass ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={form.confirmPassword}
                          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                          placeholder="••••••••"
                          className="wab-input"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#14532D] py-3.5 px-5 text-sm sm:text-base font-extrabold text-white hover:bg-[#166534] transition-colors disabled:opacity-60 min-h-[52px] shadow-[#14532D]/20"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'جاري إرسال الملف وإنشاء الحساب...' : 'إرسال طلب التسجيل'}</span>
                </button>
                <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                  <Lock className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>جميع الوثائق والبيانات محمية ولا يطّلع عليها سوى إدارة نادي {club.clubName} وصاحب الطلب.</span>
                </div>
              </div>
            </form>
          )
        )}
      </div>

      {/* Print-Only Clean A4 Registration Form Sheet */}
      <div className="hidden print:block bg-white text-black p-6 border-2 border-black space-y-5">
        <div className="flex items-center justify-between border-b-4 border-[#14532D] pb-4">
          <div className="flex items-center gap-4">
            <img src={club.logoUrl} alt={club.clubName} className="w-20 h-20 object-contain" />
            <div>
              <h1 className="text-2xl font-extrabold">نادي {club.clubName} ({club.clubShortName})</h1>
              <p className="text-base font-bold">استمارة التسجيل والانخراط الإلكتروني الرسمية</p>
              <p className="text-sm">الموسم الرياضي: {club.season}</p>
            </div>
          </div>
          <div className="w-28 h-32 border-2 border-dashed border-black flex items-center justify-center text-xs text-center p-2">
            صورة اللاعب الشمسية
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <h2 className="font-extrabold bg-black text-white px-3 py-1.5">أولاً: المعلومات الشخصية للاعب</h2>
          <p>الاسم واللقب الكامل: ......................................................................................</p>
          <p>تاريخ ومكان الميلاد: .........................................................................................</p>
          <p>الفئة العمرية: [ ] U7   [ ] U9   [ ] U11   [ ] U13   [ ] U15   [ ] U17</p>
        </div>

        <div className="space-y-3 text-sm">
          <h2 className="font-extrabold bg-black text-white px-3 py-1.5">ثانياً: معلومات ولي الأمر والتواصل</h2>
          <p>اسم الأب أو الأم أو الولي: ..................................................................................</p>
          <p>رقم الهاتف (واتساب): .......................................................................................</p>
          <p>العنوان الكامل للإقامة: .....................................................................................</p>
        </div>

        <div className="space-y-3 text-sm">
          <h2 className="font-extrabold bg-black text-white px-3 py-1.5">ثالثاً: الحالة الصحية والملاحظات</h2>
          <p>الأمراض المزمنة أو الحساسية (إن وجدت): ..................................................................</p>
          <p>ملاحظات إضافية: ...........................................................................................</p>
        </div>

        <div className="space-y-2 text-sm pt-2">
          <h2 className="font-extrabold bg-black text-white px-3 py-1.5">رابعاً: تعهد وتوقيع ولي الأمر</h2>
          <p>
            أصرح بصحة المعلومات المذكورة وأوافق على انخراط ابني/ابنتي في نادي {club.clubName} والالتزام بالنظام
            الداخلي للنادي.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="border border-black p-4 h-28">تاريخ وتوقيع ولي الأمر:</div>
            <div className="border border-black p-4 h-28">تأشيرة وختم إدارة النادي:</div>
          </div>
        </div>
      </div>
    </main>
  );
};
