import React from 'react';
import { Calendar, Edit3, Lock, Mail, Phone, Printer, ShieldCheck, Unlock } from 'lucide-react';
import { printHtmlDocument } from '../lib/export.ts';
import { formatDateAr } from '../lib/labels.ts';
import type { ClubSettings, Coach } from '../types/wab.ts';
import { AvatarBadge, Modal } from './UI.tsx';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printCoachCard(coach: Coach, club: ClubSettings) {
  const catsLabel = coach.categoryIds.length > 0 ? coach.categoryIds.join(' · ') : 'غير مسندة';
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>بطاقة مدرب — ${escapeHtml(coach.fullName)}</title>
<style>
  @page { size: A5 landscape; margin: 12mm; }
  body { font-family: 'Cairo', 'Tajawal', Arial, sans-serif; background: #fff; color: #111827; margin: 0; padding: 16px; direction: rtl; }
  .card { border: 2px solid #111827; border-radius: 14px; overflow: hidden; max-width: 640px; margin: 0 auto; }
  .top { background: #111827; color: #fff; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid ${escapeHtml(club.primaryColor)}; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 46px; height: 46px; object-fit: contain; border-radius: 8px; background: rgba(255,255,255,0.08); padding: 2px; }
  .club-title { font-size: 16px; font-weight: 800; }
  .club-sub { font-size: 11px; color: #cbd5e1; }
  .badge { background: ${escapeHtml(club.primaryColor)}; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; }
  .body { padding: 20px; display: flex; gap: 18px; align-items: flex-start; }
  .avatar { width: 112px; height: 112px; border-radius: 14px; object-fit: cover; border: 2px solid #111827; flex-shrink: 0; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; color: #111827; }
  .info { flex: 1; }
  .name { font-size: 20px; font-weight: 800; margin: 0 0 4px 0; }
  .spec { font-size: 13px; font-weight: 700; color: ${escapeHtml(club.primaryColor)}; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; font-size: 12px; }
  .label { color: #64748b; font-size: 11px; }
  .val { font-weight: 700; color: #111827; }
  .foot { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 10px 20px; font-size: 11px; color: #475569; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="brand">
        <img src="${escapeHtml(club.logoUrl)}" alt="${escapeHtml(club.clubName)}" />
        <div>
          <div class="club-title">${escapeHtml(club.clubShortName)} — ${escapeHtml(club.clubName)}</div>
          <div class="club-sub">البطاقة المهنية الرسمية للمدرب · موسم ${escapeHtml(club.season)}</div>
        </div>
      </div>
      <div class="badge">${coach.active ? 'حساب مفعل' : 'معطل'}</div>
    </div>
    <div class="body">
      ${
        coach.photoUrl
          ? `<img class="avatar" src="${escapeHtml(coach.photoUrl)}" alt="${escapeHtml(coach.fullName)}" />`
          : `<div class="avatar">${escapeHtml(coach.fullName.slice(0, 2))}</div>`
      }
      <div class="info">
        <h1 class="name">${escapeHtml(coach.fullName)}</h1>
        <div class="spec">${escapeHtml(coach.specialty || 'مدرب فئات شبانية')}</div>
        <div class="grid">
          <div><div class="label">الفئات المشرف عليها</div><div class="val">${escapeHtml(catsLabel)}</div></div>
          <div><div class="label">الهاتف</div><div class="val">${escapeHtml(coach.phone || '—')}</div></div>
          <div><div class="label">البريد الإلكتروني</div><div class="val">${escapeHtml(coach.email)}</div></div>
          <div><div class="label">تاريخ الانضمام</div><div class="val">${escapeHtml(formatDateAr(coach.joinedAt))}</div></div>
        </div>
      </div>
    </div>
    <div class="foot">
      <span>برنامج التدريب: ${escapeHtml(coach.trainingProgram || 'البرنامج السنوي الرسمي للنادي')}</span>
      <span>${escapeHtml(club.address)}</span>
    </div>
  </div>
</body>
</html>`;
  printHtmlDocument(html);
}

interface CoachProfileModalProps {
  coach: Coach | null;
  club: ClubSettings;
  logsCount?: number;
  onClose: () => void;
  onEdit?: (coach: Coach) => void;
}

export const CoachProfileModal: React.FC<CoachProfileModalProps> = ({
  coach,
  club,
  logsCount = 0,
  onClose,
  onEdit,
}) => {
  if (!coach) return null;

  return (
    <Modal open={!!coach} title="الملف الشخصي والبطاقة الرسمية للمدرب" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Official Coach Card Header */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-4 min-w-0">
              <AvatarBadge name={coach.fullName} photoUrl={coach.photoUrl} size="lg" />
              <div className="min-w-0 space-y-1">
                <h3 className="text-xl font-extrabold text-[#111827] truncate">{coach.fullName}</h3>
                <p className="text-sm font-bold text-[#14532D]">{coach.specialty || 'مدرب فئات شبانية'}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className={coach.active ? 'text-emerald-700 font-bold' : 'text-[#14532D] font-bold'}>
                    {coach.active ? 'حساب مفعل' : 'حساب معطل'}
                  </span>
                  <span className="text-slate-600 flex items-center gap-1">
                    {coach.allowCoachPhotoEdit ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-medium">يحق للمدرب تعديل صورته</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                        <span>الصورة محمية (من الإدارة فقط)</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <img
              src={club.logoUrl}
              alt={club.clubShortName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200 p-1 shrink-0 hidden sm:block"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
              <div className="text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#14532D]" />
                <span>الفئات التي يشرف عليها</span>
              </div>
              <div className="font-mono-num font-extrabold text-[#111827] text-sm">
                {coach.categoryIds.length > 0 ? coach.categoryIds.join(' · ') : 'لم تسند فئة بعد'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
              <div className="text-slate-500 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#14532D]" />
                <span>رقم الهاتف</span>
              </div>
              <div className="font-mono-num font-bold text-[#111827] text-sm">{coach.phone || 'غير مسجل'}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
              <div className="text-slate-500 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#14532D]" />
                <span>البريد الإلكتروني</span>
              </div>
              <div className="font-mono-num font-semibold text-[#111827] truncate">{coach.email}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
              <div className="text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#14532D]" />
                <span>تاريخ الانضمام والنشاط</span>
              </div>
              <div className="font-mono-num text-[#111827] font-semibold">
                {formatDateAr(coach.joinedAt)} · {logsCount} عملية
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs space-y-1">
            <div className="text-slate-500 font-semibold">برنامج التدريب المعتمد:</div>
            <p className="text-slate-700 leading-relaxed">
              {coach.trainingProgram || 'لم تتم إضافة تفاصيل البرنامج التدريبي بعد.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(coach);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[42px]"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>تعديل البيانات والصورة</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => printCoachCard(coach, club)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] min-h-[42px]"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة بطاقة المدرب</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
