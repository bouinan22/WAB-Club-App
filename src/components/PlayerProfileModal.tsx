import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  ATTENDANCE_STATUS_LABELS,
  formatDateAr,
  formatMoney,
  PAYMENT_STATUS_LABELS,
  PLAYER_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '../lib/labels.ts';
import type {
  AnnualSubscription,
  AttendanceRecord,
  ClubSettings,
  EvaluationRecord,
  PaymentRecord,
  Player,
  UserRole,
} from '../types/wab.ts';
import { EvaluationRadarChart } from './Charts.tsx';
import { ReceiptModal } from './ReceiptModal.tsx';
import { AvatarBadge, Modal } from './UI.tsx';

export const PlayerProfileModal: React.FC<{
  playerId: string | null;
  role: UserRole;
  club: ClubSettings;
  onClose: () => void;
}> = ({ playerId, role, club, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    player: Player;
    attendance: AttendanceRecord[];
    subscriptions: AnnualSubscription[];
    payments: PaymentRecord[];
    evaluations: EvaluationRecord[];
  } | null>(null);
  const [tab, setTab] = useState<'info' | 'attendance' | 'payments' | 'evaluations'>('info');
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);

  useEffect(() => {
    if (!playerId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setTab('info');
    api
      .getPlayerProfile(playerId)
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الملف الشخصي.'))
      .finally(() => setLoading(false));
  }, [playerId]);

  const attendanceRate =
    data && data.attendance.length > 0
      ? Math.round((data.attendance.filter((a) => a.status === 'present').length / data.attendance.length) * 100)
      : 0;

  const printPlayerCard = () => {
    if (!data) return;
    const p = data.player;
    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>بطاقة اللاعب - ${p.fullName}</title>
<style>
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #fff; color: #111827; padding: 28px; }
  .card { max-width: 520px; margin: 0 auto; border: 2px solid #111827; border-radius: 14px; overflow: hidden; }
  .head { background: #111827; color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid ${club.primaryColor}; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 48px; height: 48px; object-fit: contain; border-radius: 8px; background: #fff; padding: 2px; }
  .body { padding: 20px; }
  .hero { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
  .avatar { width: 78px; height: 78px; border-radius: 12px; object-fit: cover; border: 2px solid ${club.primaryColor}; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; }
  .cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; }
  .lbl { font-size: 11px; color: #64748b; }
  .val { font-weight: 700; margin-top: 2px; }
  .foot { padding: 12px 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #475569; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="brand">
        <img src="${club.logoUrl}" alt="${club.clubShortName}" />
        <div>
          <div style="font-weight:800;font-size:16px">${club.clubShortName} — ${club.clubName}</div>
          <div style="font-size:11px;color:#cbd5e1">بطاقة تعريف لاعب رسمية · موسم ${club.season}</div>
        </div>
      </div>
      <div style="font-weight:800;font-size:18px;color:${club.primaryColor}">${p.categoryId}</div>
    </div>
    <div class="body">
      <div class="hero">
        ${
          p.photoUrl
            ? `<img class="avatar" src="${p.photoUrl}" alt="${p.fullName}" />`
            : `<div class="avatar">${p.fullName.slice(0, 2)}</div>`
        }
        <div>
          <div style="font-size:20px;font-weight:800">${p.fullName}</div>
          <div style="font-size:13px;color:#475569">${p.position || 'لاعب أكاديمية'}${p.jerseyNumber ? ` · قميص #${p.jerseyNumber}` : ''}</div>
          <div style="font-size:12px;color:${club.primaryColor};font-weight:700;margin-top:2px">${PLAYER_STATUS_LABELS[p.status] || p.status}</div>
        </div>
      </div>
      <div class="grid">
        <div class="cell"><div class="lbl">تاريخ الميلاد</div><div class="val">${formatDateAr(p.birthDate)}</div></div>
        <div class="cell"><div class="lbl">تاريخ التسجيل</div><div class="val">${formatDateAr(p.registrationDate)}</div></div>
        <div class="cell"><div class="lbl">اسم الولي</div><div class="val">${p.parentName || '—'}</div></div>
        <div class="cell"><div class="lbl">هاتف الولي</div><div class="val">${p.parentPhone || '—'}</div></div>
        <div class="cell" style="grid-column:span 2"><div class="lbl">الملاحظات الطبية</div><div class="val">${p.medicalNotes || 'لائق للمنافسة والتدريب'}</div></div>
      </div>
    </div>
    <div class="foot">
      <span>المعرف: ${p.id}</span>
      <span>توقيع وختم الإدارة</span>
    </div>
  </div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1200);
      }, 300);
    }
  };

  return (
    <>
      <Modal open={!!playerId} title="الملف الشخصي للاعب" onClose={onClose} maxWidth="max-w-3xl">
        {loading && <div className="py-12 text-center text-sm text-slate-500">جاري تحميل بيانات اللاعب...</div>}
        {error && <div className="py-6 text-center text-sm text-[#DC2626] font-semibold">{error}</div>}
        {data && (
          <div className="space-y-6">
            {/* Hero Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <AvatarBadge name={data.player.fullName} photoUrl={data.player.photoUrl} size="lg" />
                <div>
                  <h3 className="text-xl font-extrabold text-[#111827]">{data.player.fullName}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-bold text-[#14532D]">{data.player.categoryId}</span>
                    <span aria-hidden="true">·</span>
                    <span>{data.player.position || 'لاعب أكاديمية'}</span>
                    {data.player.jerseyNumber && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">رقم {data.player.jerseyNumber}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{PLAYER_STATUS_LABELS[data.player.status] || data.player.status}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-center">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-2">
                  <div className="text-lg font-extrabold font-mono-num text-[#111827]">{attendanceRate}%</div>
                  <div className="text-[11px] text-slate-500">نسبة الحضور</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-2">
                  <div className="text-lg font-extrabold font-mono-num text-[#14532D]">
                    {data.evaluations[0]?.overallAverage ?? '—'}
                  </div>
                  <div className="text-[11px] text-slate-500">آخر تقييم</div>
                </div>
                <button
                  type="button"
                  onClick={printPlayerCard}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D]"
                >
                  <Printer className="w-4 h-4" />
                  <span>بطاقة اللاعب</span>
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'info', label: 'البيانات الشخصية' },
                { id: 'attendance', label: `سجل الحضور (${data.attendance.length})` },
                ...(role === 'admin'
                  ? [{ id: 'payments', label: `الاشتراكات السنوية (${data.subscriptions.length})` }]
                  : []),
                { id: 'evaluations', label: `التقييمات الفنية (${data.evaluations.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as typeof tab)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    tab === t.id ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'info' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">تاريخ الميلاد</div>
                  <div className="font-bold text-[#111827] mt-1 font-mono-num">{formatDateAr(data.player.birthDate)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">تاريخ التسجيل</div>
                  <div className="font-bold text-[#111827] mt-1 font-mono-num">{formatDateAr(data.player.registrationDate)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">اسم الولي</div>
                  <div className="font-bold text-[#111827] mt-1">{data.player.parentName || '—'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">هاتف الولي</div>
                  <div className="font-bold text-[#111827] mt-1 font-mono-num">{data.player.parentPhone || '—'}</div>
                </div>
                {data.player.address && (
                  <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                    <div className="text-xs text-slate-500">العنوان</div>
                    <div className="font-bold text-[#111827] mt-1">{data.player.address}</div>
                  </div>
                )}
                <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">الملاحظات الطبية والجاهزية</div>
                  <div className="text-sm text-slate-700 mt-1">{data.player.medicalNotes || 'لا توجد ملاحظات طبية مسجلة.'}</div>
                </div>
                {role === 'admin' && (
                  <div className="sm:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                    <div className="text-xs text-slate-500">ملاحظات الإدارة</div>
                    <div className="text-sm text-slate-700 mt-1">{data.player.adminNotes || '—'}</div>
                  </div>
                )}
              </div>
            )}

            {tab === 'attendance' && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data.attendance.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">لا توجد سجلات حضور مسجلة لهذا اللاعب بعد.</p>
                ) : (
                  data.attendance.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-bold text-[#111827]">{a.sessionTitle}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono-num">{formatDateAr(a.date)}</span>
                          {a.notes && ` · ${a.notes}`}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-extrabold ${
                          a.status === 'present'
                            ? 'text-emerald-700'
                            : a.status === 'excused'
                              ? 'text-amber-700'
                              : 'text-[#14532D]'
                        }`}
                      >
                        {ATTENDANCE_STATUS_LABELS[a.status]}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'payments' && role === 'admin' && (
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {data.subscriptions.length === 0 && data.payments.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">لا توجد اشتراكات سنوية أو مدفوعات مسجلة لهذا اللاعب.</p>
                ) : (
                  <>
                    {data.subscriptions.map((sub) => (
                      <div
                        key={sub.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[#111827]">اشتراك الموسم الرياضي {sub.seasonName}</span>
                          <span className="text-xs font-bold text-[#14532D]">
                            {SUBSCRIPTION_STATUS_LABELS[sub.status] || sub.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 flex flex-wrap gap-3 font-mono-num">
                          <span>الإجمالي: {formatMoney(sub.totalFee, club.currency)}</span>
                          <span className="text-emerald-700 font-bold">المدفوع: {formatMoney(sub.paidAmount, club.currency)}</span>
                          <span className="text-amber-700 font-bold">المتبقي: {formatMoney(sub.remainingAmount, club.currency)}</span>
                        </div>
                      </div>
                    ))}
                    {data.payments.map((pay) => (
                      <div
                        key={pay.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      >
                        <div>
                          <div className="font-bold text-[#111827]">
                            موسم <span className="font-mono-num">{pay.seasonName || pay.month}</span> ·{' '}
                            <span className="font-mono-num text-slate-600">{pay.receiptNumber}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {formatMoney(pay.amount, club.currency)} ·{' '}
                            <span className={pay.status === 'paid' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                              {PAYMENT_STATUS_LABELS[pay.status]}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(pay)}
                          className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#111827] hover:border-[#14532D]"
                        >
                          عرض الوصل
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {tab === 'evaluations' && (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {data.evaluations.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">لا توجد تقييمات فنية منشورة بعد.</p>
                ) : (
                  data.evaluations.map((ev) => (
                    <div key={ev.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <EvaluationRadarChart scores={ev.scores} />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-extrabold text-[#111827]">{ev.period}</span>
                          <span className="text-lg font-extrabold font-mono-num text-[#14532D]">
                            {ev.overallAverage} / 10
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          المدرب: {ev.coachName} · {formatDateAr(ev.date)}
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed pt-2 border-t border-slate-200">
                          {ev.notes || 'لا توجد ملاحظات إضافية.'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      <ReceiptModal payment={selectedReceipt} club={club} onClose={() => setSelectedReceipt(null)} />
    </>
  );
};
