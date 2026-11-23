import * as XLSX from 'xlsx';
import type { ClubSettings } from '../types/wab.ts';

export function exportToExcel(rows: Record<string, unknown>[], fileName: string, sheetName = 'التقرير') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type PdfCellValue = string | number | { text: string; avatarUrl?: string };

function renderPdfCell(cell: PdfCellValue): string {
  if (typeof cell === 'object' && cell !== null) {
    const avatarHtml = cell.avatarUrl
      ? `<img src="${escapeHtml(cell.avatarUrl)}" alt="${escapeHtml(cell.text)}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-left:8px;border:1px solid #cbd5e1;" />`
      : '';
    return `<div style="display:flex;align-items:center;">${avatarHtml}<span>${escapeHtml(cell.text)}</span></div>`;
  }
  return escapeHtml(cell);
}

/**
 * Generates an official Arabic RTL printable PDF report using a hidden iframe
 * (never uses window.open so it works reliably inside embedded iframes and mobile).
 */
export function printArabicPdfReport(opts: {
  title: string;
  subtitle?: string;
  club: ClubSettings;
  columns: string[];
  rows: PdfCellValue[][];
  summaryItems?: { label: string; value: string }[];
}) {
  const { title, subtitle, club, columns, rows, summaryItems } = opts;
  const nowStr = new Date().toLocaleString('ar-DZ');

  const summaryHtml =
    summaryItems && summaryItems.length > 0
      ? `<div class="summary-grid">${summaryItems
          .map(
            (s) =>
              `<div class="summary-box"><div class="summary-label">${escapeHtml(s.label)}</div><div class="summary-val">${escapeHtml(s.value)}</div></div>`,
          )
          .join('')}</div>`
      : '';

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Cairo', 'Tajawal', Arial, sans-serif; color: #111827; background: #fff; margin: 0; padding: 12px; direction: rtl; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid ${escapeHtml(club.primaryColor || '#14532D')}; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; }
  .club-name { font-size: 20px; font-weight: 800; color: #111827; }
  .club-sub { font-size: 12px; color: #475569; }
  .meta { text-align: left; font-size: 11px; color: #475569; }
  h1 { font-size: 18px; margin: 0 0 4px 0; color: ${escapeHtml(club.primaryColor || '#14532D')}; }
  .sub { font-size: 12px; color: #475569; margin: 0 0 14px 0; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .summary-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .summary-label { font-size: 11px; color: #64748b; }
  .summary-val { font-size: 15px; font-weight: 700; color: #111827; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #14532D; color: #fff; padding: 8px 10px; text-align: right; font-weight: 700; }
  td { border-bottom: 1px solid #e2e8f0; padding: 7px 10px; text-align: right; vertical-align: middle; }
  tr:nth-child(even) td { background: #f8fafc; }
  .footer { margin-top: 18px; border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img src="${escapeHtml(club.logoUrl)}" alt="${escapeHtml(club.clubName)}" />
      <div>
        <div class="club-name">${escapeHtml(club.clubShortName)} — ${escapeHtml(club.clubName)}</div>
        <div class="club-sub">${escapeHtml(club.address)} · ${escapeHtml(club.phone)}</div>
      </div>
    </div>
    <div class="meta">
      <div>الموسم الرياضي: ${escapeHtml(club.season)}</div>
      <div>تاريخ الاستخراج: ${escapeHtml(nowStr)}</div>
    </div>
  </div>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ''}
  ${summaryHtml}
  <table>
    <thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>${r.map((cell) => `<td>${renderPdfCell(cell)}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <div class="footer">
    <span>وثيقة رسمية صادرة عن منصة ${escapeHtml(club.clubName)} (${escapeHtml(club.clubShortName)})</span>
    <span>تأسيس ${escapeHtml(club.foundedYear)}</span>
  </div>
</body>
</html>`;

  printHtmlDocument(html);
}

export function printHtmlDocument(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
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
      setTimeout(() => {
        iframe.remove();
      }, 1500);
    }, 350);
  }
}

export function downloadReceiptHtml(htmlContent: string, fileName: string) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
