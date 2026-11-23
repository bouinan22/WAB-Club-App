import React from 'react';
import { Download, Printer } from 'lucide-react';
import { downloadReceiptHtml } from '../lib/export.ts';
import { formatDateAr, formatMoney, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../lib/labels.ts';
import type { ClubSettings, PaymentRecord } from '../types/wab.ts';
import { Modal } from './UI.tsx';

export const ReceiptModal: React.FC<{
  payment: PaymentRecord | null;
  club: ClubSettings;
  onClose: () => void;
}> = ({ payment, club, onClose }) => {
  if (!payment) return null;

  const seasonDisplay = payment.seasonName || payment.month || club.season;

  const buildReceiptHtml = () => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>وصل دفع ${payment.receiptNumber}</title>
<style>
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #fff; color: #111827; padding: 24px; }
  .sheet { max-width: 680px; margin: 0 auto; border: 2px solid #111827; border-radius: 12px; padding: 24px; }
  .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${club.primaryColor}; padding-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 64px; height: 64px; object-fit: contain; }
  h1 { font-size: 20px; margin: 0; }
  .sub { font-size: 12px; color: #475569; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
  .lbl { font-size: 11px; color: #64748b; }
  .val { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .total { background: #111827; color: #fff; padding: 14px 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .foot { margin-top: 22px; display: flex; justify-content: space-between; font-size: 12px; color: #475569; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        <img src="${club.logoUrl}" alt="${club.clubName}" />
        <div>
          <h1>${club.clubShortName} — ${club.clubName}</h1>
          <div class="sub">${club.address}${club.phone ? ` · ${club.phone}` : ''}</div>
        </div>
      </div>
      <div style="text-align:left">
        <div style="font-weight:800;color:${club.primaryColor}">وصل دفع اشتراك سنوي رسمي</div>
        <div style="font-size:13px;font-family:monospace">${payment.receiptNumber}</div>
      </div>
    </div>
    <div class="grid">
      <div class="box"><div class="lbl">اسم اللاعب</div><div class="val">${payment.playerName}</div></div>
      <div class="box"><div class="lbl">الفئة العمرية</div><div class="val">${payment.categoryId}</div></div>
      <div class="box"><div class="lbl">الموسم الرياضي</div><div class="val">${seasonDisplay}</div></div>
      <div class="box"><div class="lbl">تاريخ الدفع</div><div class="val">${formatDateAr(payment.paymentDate)}</div></div>
      <div class="box"><div class="lbl">طريقة الدفع</div><div class="val">${PAYMENT_METHOD_LABELS[payment.method] || payment.method}</div></div>
      <div class="box"><div class="lbl">حالة الدفعة</div><div class="val">${PAYMENT_STATUS_LABELS[payment.status] || payment.status}</div></div>
    </div>
    <div class="total">
      <span>المبلغ المستلم</span>
      <strong style="font-size:20px">${formatMoney(payment.amount, club.currency)}</strong>
    </div>
    ${payment.notes ? `<p style="margin-top:12px;font-size:12px;color:#475569">ملاحظات: ${payment.notes}</p>` : ''}
    <div class="foot">
      <span>أمين المال / الإدارة: ${payment.recordedByName}</span>
      <span>ختم نادي ${club.clubName}</span>
    </div>
  </div>
</body>
</html>`;

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(buildReceiptHtml());
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1200);
      }, 300);
    }
  };

  return (
    <Modal open={!!payment} title={`وصل الدفع رقم ${payment.receiptNumber}`} onClose={onClose}>
      <div className="rounded-xl bg-white text-[#111827] p-5 sm:p-6 space-y-5 border border-slate-200">
        <div className="flex items-center justify-between gap-4 border-b-2 border-[#14532D] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={club.logoUrl}
              alt={club.clubName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 object-contain rounded-lg border border-slate-200"
            />
            <div>
              <div className="text-base sm:text-lg font-extrabold">
                {club.clubShortName} — {club.clubName}
              </div>
              <div className="text-xs text-slate-600">
                {club.address}
                {club.phone ? ` · ${club.phone}` : ''}
              </div>
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-[#14532D]">وصل اشتراك سنوي رسمي</div>
            <div className="text-sm font-mono-num font-bold">{payment.receiptNumber}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">اللاعب</div>
            <div className="font-bold mt-0.5">{payment.playerName}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">الفئة العمرية</div>
            <div className="font-bold mt-0.5">{payment.categoryId}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">الموسم الرياضي</div>
            <div className="font-bold font-mono-num mt-0.5">{seasonDisplay}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">تاريخ التسوية</div>
            <div className="font-bold mt-0.5">{formatDateAr(payment.paymentDate)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">طريقة الدفع</div>
            <div className="font-bold mt-0.5">{PAYMENT_METHOD_LABELS[payment.method] || payment.method}</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-500">حالة الدفعة</div>
            <div className="font-bold mt-0.5">{PAYMENT_STATUS_LABELS[payment.status] || payment.status}</div>
          </div>
        </div>

        <div className="rounded-xl bg-[#111827] text-white px-5 py-4 flex items-center justify-between">
          <span className="text-sm text-slate-300">المبلغ المدفوع</span>
          <span className="text-xl font-extrabold font-mono-num">{formatMoney(payment.amount, club.currency)}</span>
        </div>

        {payment.notes && <p className="text-xs text-slate-600">ملاحظة: {payment.notes}</p>}

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
          <span>المسجل: {payment.recordedByName}</span>
          <span>موسم {seasonDisplay}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => downloadReceiptHtml(buildReceiptHtml(), `receipt-${payment.receiptNumber}`)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#111827] hover:border-[#14532D]"
        >
          <Download className="w-4 h-4" />
          <span>تحميل الوصل</span>
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#166534]"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة / حفظ PDF</span>
        </button>
      </div>
    </Modal>
  );
};
