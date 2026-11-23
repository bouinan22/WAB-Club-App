import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileText,
  HeartPulse,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  Search,
  User,
  XCircle,
} from 'lucide-react';
import { AvatarBadge, EmptyState, Modal, PageHeader, StatCard } from '../components/UI.tsx';
import { api, getProtectedFileUrl } from '../lib/api.ts';
import { formatDateAr } from '../lib/labels.ts';
import type { ClubSettings, RegistrationRequest, RegistrationRequestStatus } from '../types/wab.ts';

const CATEGORIES = ['U7', 'U9', 'U11', 'U13', 'U15', 'U17'];

const STATUS_META: Record<
  RegistrationRequestStatus,
  { emoji: string; label: string; textClass: string; badgeClass: string }
> = {
  pending: {
    emoji: '🟡',
    label: 'قيد المراجعة',
    textClass: 'text-amber-700',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  incomplete: {
    emoji: '🟠',
    label: 'ملف ناقص',
    textClass: 'text-orange-700',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  approved: {
    emoji: '🟢',
    label: 'مقبول',
    textClass: 'text-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  rejected: {
    emoji: '🔴',
    label: 'مرفوض',
    textClass: 'text-[#14532D]',
    badgeClass: 'bg-red-100 text-[#DC2626] border-red-200',
  },
};

function sanitizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return `213${digits.slice(1)}`;
  }
  return digits;
}

export const RegistrationRequestsPage: React.FC<{
  club: ClubSettings;
  onRequestsChanged?: () => void;
}> = ({ club, onRequestsChanged }) => {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | RegistrationRequestStatus>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RegistrationRequest | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const [approveTarget, setApproveTarget] = useState<RegistrationRequest | null>(null);
  const [approveCategory, setApproveCategory] = useState('U11');

  const [incompleteTarget, setIncompleteTarget] = useState<RegistrationRequest | null>(null);
  const [missingDocNote, setMissingDocNote] = useState('');

  const [rejectTarget, setRejectTarget] = useState<RegistrationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.getRegistrationRequests();
      setRequests(list);
      if (selected) {
        const refreshed = list.find((item) => item.id === selected.id) || null;
        setSelected(refreshed);
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تحميل طلبات التسجيل.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      incomplete: requests.filter((r) => r.status === 'incomplete').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    }),
    [requests],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        r.parentName.toLowerCase().includes(q) ||
        r.parentPhone.toLowerCase().includes(q) ||
        r.categoryId.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q)
      );
    });
  }, [requests, tab, search]);

  const openDetails = (item: RegistrationRequest) => {
    setSelected(item);
    setNoteInput(item.adminNotes || '');
  };

  const handleSaveAdminNote = async () => {
    if (!selected) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const res = await api.updateRegistrationRequestNote(selected.id, noteInput.trim());
      setSelected(res.request);
      setFeedback({ type: 'ok', text: 'تم حفظ الملاحظة الإدارية وإشعار ولي الأمر.' });
      await load();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر حفظ الملاحظة.' });
    } finally {
      setActionBusy(false);
    }
  };

  const openIncompleteModal = (reqItem: RegistrationRequest) => {
    setIncompleteTarget(reqItem);
    setMissingDocNote(reqItem.missingDocumentNote || '');
  };

  const handleConfirmRequestDocs = async () => {
    if (!incompleteTarget) return;
    if (missingDocNote.trim().length < 3) {
      setFeedback({ type: 'err', text: 'يرجى تحديد الوثيقة المطلوبة بوضوح.' });
      return;
    }
    setActionBusy(true);
    setFeedback(null);
    try {
      await api.requestMissingDocuments(incompleteTarget.id, {
        missingDocumentNote: missingDocNote.trim(),
        adminNotes: selected?.id === incompleteTarget.id ? noteInput.trim() : undefined,
      });
      setFeedback({
        type: 'ok',
        text: `تم تصنيف ملف «${incompleteTarget.fullName}» كملف ناقص وإشعار ولي الأمر لاستكمال الوثائق.`,
      });
      setIncompleteTarget(null);
      setSelected(null);
      await load();
      if (onRequestsChanged) onRequestsChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر إرسال طلب استكمال الوثائق.' });
    } finally {
      setActionBusy(false);
    }
  };

  const openApproveModal = (reqItem: RegistrationRequest) => {
    setApproveTarget(reqItem);
    setApproveCategory(reqItem.categoryId || 'U11');
  };

  const handleConfirmApprove = async () => {
    if (!approveTarget) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const res = await api.approveRegistrationRequest(approveTarget.id, {
        categoryId: approveCategory,
        adminNotes: selected?.id === approveTarget.id ? noteInput.trim() : undefined,
      });
      setFeedback({
        type: 'ok',
        text: `تم قبول تسجيل اللاعب «${res.player.fullName}» وإدراجه في القائمة الرسمية (${res.player.categoryId}) وإرسال التهنئة لولي الأمر.`,
      });
      setApproveTarget(null);
      setSelected(null);
      await load();
      if (onRequestsChanged) onRequestsChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر قبول الطلب.' });
    } finally {
      setActionBusy(false);
    }
  };

  const openRejectModal = (reqItem: RegistrationRequest) => {
    setRejectTarget(reqItem);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    if (rejectionReason.trim().length < 3) {
      setFeedback({ type: 'err', text: 'يرجى كتابة سبب رفض الطلب قبل التأكيد.' });
      return;
    }
    setActionBusy(true);
    setFeedback(null);
    try {
      await api.rejectRegistrationRequest(rejectTarget.id, {
        rejectionReason: rejectionReason.trim(),
        adminNotes: selected?.id === rejectTarget.id ? noteInput.trim() : undefined,
      });
      setFeedback({
        type: 'ok',
        text: `تم رفض طلب التسجيل الخاص بـ «${rejectTarget.fullName}» مع حفظ السبب وإشعار ولي الأمر.`,
      });
      setRejectTarget(null);
      setSelected(null);
      await load();
      if (onRequestsChanged) onRequestsChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر رفض الطلب.' });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات التسجيل الإلكتروني"
        subtitle={`مراجعة الاستمارات الموقعة وطلبات الانضمام إلى نادي ${club.clubName} (${club.clubShortName})`}
      />

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#DC2626]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="الطلبات قيد المراجعة"
          value={counts.pending}
          hint="طلبات جديدة تنتظر القرار"
          accent
          icon={<ClipboardList className="w-5 h-5" />}
        />
        <StatCard
          label="الملفات الناقصة"
          value={counts.incomplete}
          hint="بانتظار استكمال الوثائق"
          icon={<AlertTriangle className="w-5 h-5" />}
        />
        <StatCard
          label="الطلبات المقبولة"
          value={counts.approved}
          hint="أُدرجوا في قائمة اللاعبين"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <StatCard
          label="الطلبات المرفوضة"
          value={counts.rejected}
          hint="محفوظة في سجل الطلبات"
          icon={<XCircle className="w-5 h-5" />}
        />
      </div>

      {/* Filter Tabs & Search */}
      <div className="wab-card rounded-2xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
            {(
              [
                { id: 'pending', label: `🟡 قيد المراجعة (${counts.pending})` },
                { id: 'incomplete', label: `🟠 ملفات ناقصة (${counts.incomplete})` },
                { id: 'approved', label: `🟢 مقبولة (${counts.approved})` },
                { id: 'rejected', label: `🔴 مرفوضة (${counts.rejected})` },
                { id: 'all', label: `الكل (${counts.all})` },
              ] as { id: 'all' | RegistrationRequestStatus; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === t.id ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الطلب، الاسم، الولي..."
              className="wab-input pr-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">جاري تحميل طلبات التسجيل الإلكتروني...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="لا توجد طلبات في هذا التبويب حالياً."
            description="تظهر هنا جميع الاستمارات والطلبات الواردة من صفحة «التسجيل في النادي»."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((item) => {
              const st = STATUS_META[item.status] || STATUS_META.pending;
              const canDecide = item.status === 'pending' || item.status === 'incomplete';
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3.5 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarBadge
                        name={item.fullName}
                        photoUrl={getProtectedFileUrl(item.photoUrl)}
                        size="md"
                      />
                      <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-[#111827] truncate">{item.fullName}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
                          <span className="font-mono-num font-bold text-[#14532D]">{item.categoryId}</span>
                          <span>·</span>
                          <span className="font-mono-num">{formatDateAr(item.birthDate)}</span>
                          <span>·</span>
                          <span className="font-mono-num text-[11px] text-slate-500">{item.id}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold shrink-0 ${st.badgeClass}`}>
                      {st.emoji} {st.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                      <span className="truncate">الولي: {item.parentName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono-num">
                      <Phone className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                      <span>{item.parentPhone}</span>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                      <span className="truncate">{item.address}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-mono-num text-slate-500">
                      أُرسل: {formatDateAr(item.submittedAt)}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDetails(item)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[38px]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>التفاصيل</span>
                      </button>

                      {canDecide && (
                        <>
                          <button
                            type="button"
                            onClick={() => openIncompleteModal(item)}
                            className="inline-flex items-center gap-1 rounded-xl border border-orange-300 bg-orange-50 px-2.5 py-2 text-xs font-bold text-orange-800 hover:bg-orange-100 min-h-[38px]"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>وثائق</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openApproveModal(item)}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 min-h-[38px]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>قبول</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openRejectModal(item)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#14532D] px-3 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[38px]"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>رفض</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Request Detail Modal */}
      <Modal
        open={!!selected}
        title="مراجعة ملف التسجيل الإلكتروني"
        onClose={() => setSelected(null)}
        maxWidth="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-4 min-w-0">
                <AvatarBadge
                  name={selected.fullName}
                  photoUrl={getProtectedFileUrl(selected.photoUrl)}
                  size="lg"
                />
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-[#111827]">{selected.fullName}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                    <span className="font-mono-num font-bold text-[#14532D]">{selected.categoryId}</span>
                    <span>·</span>
                    <span className="font-mono-num">{selected.id}</span>
                    {selected.applicantUsername && (
                      <>
                        <span>·</span>
                        <span className="font-mono-num">حساب: @{selected.applicantUsername}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-xl border text-xs font-extrabold ${
                  (STATUS_META[selected.status] || STATUS_META.pending).badgeClass
                }`}
              >
                {(STATUS_META[selected.status] || STATUS_META.pending).emoji}{' '}
                {(STATUS_META[selected.status] || STATUS_META.pending).label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#14532D]" />
                  <span>تاريخ الميلاد</span>
                </div>
                <div className="font-bold font-mono-num text-[#111827] mt-1">{formatDateAr(selected.birthDate)}</div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">تاريخ إرسال الطلب</div>
                <div className="font-bold font-mono-num text-[#111827] mt-1">
                  {formatDateAr(selected.submittedAt)}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">اسم ولي الأمر</div>
                <div className="font-bold text-[#111827] mt-1">{selected.parentName}</div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500">هاتف ولي الأمر</div>
                <div className="font-bold font-mono-num text-[#111827] mt-1">{selected.parentPhone}</div>
              </div>

              <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#14532D]" />
                  <span>العنوان</span>
                </div>
                <div className="font-bold text-[#111827] mt-1">{selected.address}</div>
              </div>

              {/* Signed Registration Form & Additional Docs */}
              <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#14532D]" />
                  <span>استمارة التسجيل الموقعة والوثائق المرفقة</span>
                </div>
                {selected.signedFormUrl ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 p-2.5 text-xs">
                    <span className="font-bold text-[#111827] truncate">
                      {selected.signedFormName || 'استمارة التسجيل الموقعة'}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={getProtectedFileUrl(selected.signedFormUrl, false)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-bold text-[#111827] hover:border-[#14532D]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة</span>
                      </a>
                      <a
                        href={getProtectedFileUrl(selected.signedFormUrl, true)}
                        download={selected.signedFormName || 'registration-form'}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#111827] text-white px-2.5 py-1.5 font-bold hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل الاستمارة</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">لا توجد استمارة مرفقة.</div>
                )}

                {selected.additionalDocuments && selected.additionalDocuments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-bold text-slate-500">الوثائق المكملة المرفوعة لاحقاً:</div>
                    {selected.additionalDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-200 p-2 text-xs"
                      >
                        <span className="truncate font-semibold text-[#111827]">{doc.name}</span>
                        <a
                          href={getProtectedFileUrl(doc.url, true)}
                          download={doc.name}
                          className="inline-flex items-center gap-1 font-bold text-[#14532D] hover:underline shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>تحميل</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <HeartPulse className="w-3.5 h-3.5 text-[#14532D]" />
                  <span>المعلومات الصحية والملاحظات الإضافية</span>
                </div>
                <div className="text-sm text-slate-700 mt-1 space-y-1">
                  <div>{selected.medicalNotes || 'لا توجد ملاحظات صحية مسجلة.'}</div>
                  {selected.additionalNotes && (
                    <div className="text-xs text-slate-600 whitespace-pre-line">{selected.additionalNotes}</div>
                  )}
                </div>
              </div>

              {selected.missingDocumentNote && (
                <div className="sm:col-span-2 rounded-xl bg-orange-50 border border-orange-200 p-3">
                  <div className="text-xs font-bold text-orange-800">الوثيقة المطلوبة للاستكمال:</div>
                  <div className="text-sm text-slate-800 mt-1">{selected.missingDocumentNote}</div>
                </div>
              )}

              {selected.rejectionReason && (
                <div className="sm:col-span-2 rounded-xl bg-red-50 border border-red-200 p-3">
                  <div className="text-xs font-bold text-[#DC2626]">سبب الرفض المسجل:</div>
                  <div className="text-sm text-slate-800 mt-1">{selected.rejectionReason}</div>
                </div>
              )}

              {/* Admin Note Editor */}
              <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <label className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
                  <MessageSquarePlus className="w-4 h-4 text-[#14532D]" />
                  <span>ملاحظة الإدارة (تظهر في حساب ولي الأمر)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="اكتب ملاحظة لولي الأمر..."
                    className="wab-input flex-1"
                  />
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleSaveAdminNote}
                    className="rounded-xl bg-[#111827] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 shrink-0 min-h-[40px]"
                  >
                    حفظ الملاحظة
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
              <a
                href={`https://wa.me/${sanitizeWhatsAppPhone(selected.parentPhone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-[#111827] hover:border-emerald-600"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>تواصل واتساب مع الولي</span>
              </a>

              {(selected.status === 'pending' || selected.status === 'incomplete') && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openIncompleteModal(selected)}
                    className="rounded-xl border border-orange-300 bg-orange-50 px-3.5 py-2.5 text-xs font-bold text-orange-800 hover:bg-orange-100 min-h-[42px]"
                  >
                    طلب استكمال الوثائق
                  </button>
                  <button
                    type="button"
                    onClick={() => openRejectModal(selected)}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-[#DC2626] hover:bg-red-100 min-h-[42px]"
                  >
                    رفض الطلب
                  </button>
                  <button
                    type="button"
                    onClick={() => openApproveModal(selected)}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 min-h-[42px]"
                  >
                    قبول الطلب وإضافة اللاعب
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Request Missing Documents Modal */}
      <Modal
        open={!!incompleteTarget}
        title="طلب استكمال الوثائق (ملف ناقص)"
        onClose={() => setIncompleteTarget(null)}
        maxWidth="max-w-md"
      >
        {incompleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              ستتغير حالة ملف اللاعب <strong className="text-[#111827]">{incompleteTarget.fullName}</strong> إلى{' '}
              <strong className="text-orange-700">🟠 ملف ناقص</strong> وسيُشعر ولي الأمر لرفع الوثيقة المطلوبة.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1.5">
                تحديد الوثيقة أو المعلومة المطلوبة *
              </label>
              <textarea
                rows={3}
                required
                value={missingDocNote}
                onChange={(e) => setMissingDocNote(e.target.value)}
                placeholder="مثال: يرجى إعادة رفع استمارة التسجيل موقعة بوضوح مع نسخة من شهادة الميلاد..."
                className="wab-input"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIncompleteTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[42px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleConfirmRequestDocs}
                className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50 min-h-[42px]"
              >
                {actionBusy ? 'جاري الإرسال...' : 'إرسال طلب الاستكمال'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Approve Confirmation Modal */}
      <Modal
        open={!!approveTarget}
        title="تأكيد قبول طلب التسجيل"
        onClose={() => setApproveTarget(null)}
        maxWidth="max-w-md"
      >
        {approveTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              سيتم اعتماد انضمام اللاعب <strong className="text-[#111827]">{approveTarget.fullName}</strong> وإدراجه
              تلقائياً في قائمة اللاعبين الرسمية مع إشعار تهنئة لولي الأمر.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1.5">اعتماد الفئة العمرية للاعب</label>
              <select
                value={approveCategory}
                onChange={(e) => setApproveCategory(e.target.value)}
                className="wab-input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[42px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleConfirmApprove}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[42px]"
              >
                {actionBusy ? 'جاري الاعتماد...' : 'تأكيد القبول'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Confirmation Modal */}
      <Modal
        open={!!rejectTarget}
        title="تأكيد رفض طلب التسجيل"
        onClose={() => setRejectTarget(null)}
        maxWidth="max-w-md"
      >
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              لن تتم إضافة <strong className="text-[#111827]">{rejectTarget.fullName}</strong> إلى قائمة اللاعبين،
              وسيبقى الطلب محفوظاً في السجل مع ظهور سبب الرفض في حساب ولي الأمر.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1.5">سبب الرفض *</label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="مثال: عدم مطابقة السن للفئة المطلوبة أو نقص شرط أساسي..."
                className="wab-input"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[42px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleConfirmReject}
                className="rounded-xl bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#166534] disabled:opacity-50 min-h-[42px]"
              >
                {actionBusy ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
