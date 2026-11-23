import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  Printer,
  RotateCcw,
  Send,
  Share2,
  Smartphone,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { printHtmlDocument } from '../lib/export.ts';
import { useLang } from '../lib/i18n.tsx';
import { PageHeader } from '../components/UI.tsx';
import type { ClubSettings } from '../types/wab.ts';

const OFFICIAL_SHARE_MESSAGE =
  'مرحباً بكم في التطبيق الرسمي لنادي وداد أمل بوعنان W.A.B. يمكنكم من خلاله متابعة أخبار النادي وبرامج التدريبات ومباريات أبنائكم.';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ShareAppPage: React.FC<{ club: ClubSettings }> = ({ club }) => {
  const { t } = useLang();
  const [serverAppUrl, setServerAppUrl] = useState('');
  const [message, setMessage] = useState(OFFICIAL_SHARE_MESSAGE);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'url' | 'full' | 'parent' | 'coach' | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicClub()
      .then((res) => {
        if (res.appUrl) setServerAppUrl(res.appUrl);
      })
      .catch(() => {
        // fallback cleanly to window.location.origin
      });
  }, []);

  const appUrl = useMemo(() => {
    const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    if (serverAppUrl && /^https?:\/\//i.test(serverAppUrl) && !serverAppUrl.includes('localhost')) {
      return serverAppUrl;
    }
    return browserOrigin || serverAppUrl;
  }, [serverAppUrl]);

  const parentPortalUrl = `${appUrl}/parent`;
  const coachPortalUrl = `${appUrl}/coach`;

  const fullShareText = useMemo(() => `${message.trim()}\n${appUrl}`, [message, appUrl]);

  useEffect(() => {
    if (!appUrl) return;
    QRCode.toDataURL(appUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#14532D',
        light: '#FFFFFF',
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [appUrl]);

  const supportsWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyToClipboard = async (text: string, type: 'url' | 'full' | 'parent' | 'coach') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setShareStatus(
        type === 'full'
          ? 'تم نسخ رسالة الدعوة والرابط بنجاح.'
          : 'تم نسخ الرابط بنجاح.',
      );
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      setShareStatus('تعذر النسخ التلقائي — يرجى تحديد الرابط ونسخه يدوياً.');
    }
  };

  const handleNativeShare = async () => {
    setShareStatus(null);
    if (supportsWebShare) {
      try {
        await navigator.share({
          title: `${club.clubShortName} — ${club.clubName}`,
          text: message.trim(),
          url: appUrl,
        });
        setShareStatus('تمت مشاركة التطبيق بنجاح.');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }
    await copyToClipboard(fullShareText, 'full');
    setShareStatus('جهازك أو المتصفح لا يدعم نافذة المشاركة المباشرة — تم نسخ الرابط والرسالة للمشاركة فوراً.');
  };

  const handleDownloadQrPng = async () => {
    if (!qrDataUrl) return;
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#14532D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#16A34A';
    ctx.fillRect(0, 0, canvas.width, 14);

    try {
      const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = club.logoUrl;
      });
      ctx.drawImage(logoImg, (canvas.width - 104) / 2, 42, 104, 104);
    } catch {
      // skip logo if blocked
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px Cairo, Arial, sans-serif';
    ctx.fillText(`${club.clubShortName} — ${club.clubName}`, canvas.width / 2, 192);

    ctx.fillStyle = '#DCFCE7';
    ctx.font = '20px Cairo, Arial, sans-serif';
    ctx.fillText('امسح رمز الاستجابة السريعة لفتح التطبيق الرسمي', canvas.width / 2, 230);

    const qrBoxSize = 460;
    const qrBoxX = (canvas.width - qrBoxSize) / 2;
    const qrBoxY = 266;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);

    const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    ctx.drawImage(qrImg, qrBoxX + 24, qrBoxY + 24, qrBoxSize - 48, qrBoxSize - 48);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '18px monospace';
    const shortDisplayUrl = appUrl.length > 56 ? `${appUrl.slice(0, 53)}...` : appUrl;
    ctx.fillText(shortDisplayUrl, canvas.width / 2, 782);

    ctx.fillStyle = '#DCFCE7';
    ctx.font = 'bold 20px Cairo, Arial, sans-serif';
    ctx.fillText(`الموسم الرياضي ${club.season} · ${club.address}`, canvas.width / 2, 835);

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `WAB-QR-${club.clubShortName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handlePrintQrPoster = () => {
    if (!qrDataUrl) return;
    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>رمز QR — ${escapeHtml(club.clubName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Cairo', 'Tajawal', Arial, sans-serif; background: #fff; color: #111827; margin: 0; padding: 20px; direction: rtl; text-align: center; }
  .poster { border: 3px solid #14532D; border-radius: 18px; padding: 32px 24px; max-width: 560px; margin: 0 auto; }
  .top-bar { height: 8px; background: #14532D; border-radius: 6px; margin-bottom: 24px; }
  .logo { width: 96px; height: 96px; object-fit: contain; border-radius: 14px; border: 1px solid #cbd5e1; padding: 4px; }
  h1 { font-size: 26px; font-weight: 800; margin: 14px 0 6px; color: #14532D; }
  .sub { font-size: 14px; color: #475569; margin: 0 0 22px; }
  .qr-wrap { display: inline-block; padding: 18px; border: 2px solid #14532D; border-radius: 16px; background: #fff; }
  .qr-wrap img { width: 280px; height: 280px; display: block; }
  .msg { margin: 22px auto 14px; font-size: 14px; line-height: 1.8; color: #1e293b; max-width: 440px; }
  .url { font-family: monospace; font-size: 12px; color: #475569; background: #f1f5f9; padding: 8px 12px; border-radius: 8px; word-break: break-all; display: inline-block; }
  .foot { margin-top: 24px; font-size: 12px; color: #14532D; font-weight: 700; }
</style>
</head>
<body>
  <div class="poster">
    <div class="top-bar"></div>
    <img class="logo" src="${escapeHtml(club.logoUrl)}" alt="${escapeHtml(club.clubName)}" />
    <h1>${escapeHtml(club.clubShortName)} — ${escapeHtml(club.clubName)}</h1>
    <p class="sub">امسح رمز الاستجابة السريعة (QR) بهاتفك للدخول إلى المنصة الرسمية للنادي</p>
    <div class="qr-wrap">
      <img src="${escapeHtml(qrDataUrl)}" alt="QR Code" />
    </div>
    <p class="msg">${escapeHtml(message)}</p>
    <div class="url">${escapeHtml(appUrl)}</div>
    <div class="foot">الموسم الرياضي ${escapeHtml(club.season)} · ${escapeHtml(club.address)}</div>
  </div>
</body>
</html>`;
    printHtmlDocument(html);
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(fullShareText)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}&quote=${encodeURIComponent(message)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(message)}`;
  const smsHref = `sms:?body=${encodeURIComponent(fullShareText)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مشاركة التطبيق الرسمي للنادي"
        subtitle="نشر رابط المنصة، روابط فضاء الأولياء والمدربين، ورمز QR القابل للطباعة والتحميل"
      />

      {shareStatus && (
        <div className="rounded-xl border border-emerald-200 bg-[#DCFCE7] px-4 py-3 text-xs font-bold text-[#14532D] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-[#14532D]" />
          <span>{shareStatus}</span>
        </div>
      )}

      {/* Dedicated Parent & Coach Portal Share Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { key: 'parent' as const, title: t.parentLinkTitle, url: parentPortalUrl },
          { key: 'coach' as const, title: t.coachLinkTitle, url: coachPortalUrl },
        ].map((portal) => (
          <div key={portal.key} className="wab-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#111827]">{portal.title}</h3>
              <span className="text-[11px] font-mono-num font-bold text-[#14532D] bg-[#DCFCE7] px-2 py-0.5 rounded-md">
                /{portal.key}
              </span>
            </div>
            <div
              dir="ltr"
              className="rounded-xl bg-[#F8FAFC] border border-gray-200 px-3 py-2 text-xs font-mono-num text-[#111827] truncate"
            >
              {portal.url}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(portal.url, portal.key)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[42px]"
              >
                {copiedType === portal.key ? (
                  <Check className="w-4 h-4 text-[#16A34A]" />
                ) : (
                  <Copy className="w-4 h-4 text-[#14532D]" />
                )}
                <span>{copiedType === portal.key ? t.copiedDone : t.copyLink}</span>
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${club.clubShortName} — ${portal.title}:\n${portal.url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] px-3 py-2.5 text-xs font-bold text-white min-h-[42px]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t.shareWhatsapp}</span>
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Main Column: Link, Message & Share Channels */}
        <div className="lg:col-span-7 space-y-5">
          {/* Branded Club Link Card */}
          <div className="wab-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3.5 pb-4 border-b border-gray-200">
              <img
                src={club.logoUrl}
                alt={club.clubName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl object-contain bg-white border border-gray-200 p-1 shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold text-[#111827] truncate">
                  {club.clubShortName} — {club.clubName}
                </h2>
                <p className="text-xs text-gray-500 truncate">
                  المنصة الرسمية للنادي · الموسم الرياضي {club.season}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">رابط التطبيق الرئيسي</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div
                  dir="ltr"
                  className="flex-1 rounded-xl bg-gray-50 border border-gray-300 px-3.5 py-2.5 text-xs font-mono-num text-[#111827] flex items-center justify-between gap-2 overflow-x-auto min-h-[44px]"
                >
                  <span className="truncate">{appUrl}</span>
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-[#14532D] shrink-0"
                    title="فتح الرابط"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(appUrl, 'url')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] shrink-0 min-h-[44px]"
                >
                  {copiedType === 'url' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4 text-[#14532D]" />}
                  <span>{copiedType === 'url' ? 'تم النسخ' : 'نسخ رابط التطبيق'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-700">رسالة المشاركة الجاهزة</label>
                {message !== OFFICIAL_SHARE_MESSAGE && (
                  <button
                    type="button"
                    onClick={() => setMessage(OFFICIAL_SHARE_MESSAGE)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14532D] hover:underline"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>استعادة النص الرسمي</span>
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="wab-input leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] px-5 py-3 text-sm font-bold text-white hover:bg-[#166534] transition-colors min-h-[46px]"
              >
                <Share2 className="w-4 h-4" />
                <span>مشاركة التطبيق</span>
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(fullShareText, 'full')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[46px]"
              >
                {copiedType === 'full' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4 text-[#14532D]" />}
                <span>{copiedType === 'full' ? 'تم نسخ الرسالة والرابط' : 'نسخ الرسالة مع الرابط'}</span>
              </button>
            </div>
          </div>

          {/* Direct Share Channels */}
          <div className="wab-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-[#111827]">المشاركة المباشرة عبر التطبيقات</h3>
              <p className="text-xs text-gray-600 mt-0.5">
                أرسل الدعوة الرسمية مباشرة إلى مجموعات الأولياء أو اللاعبين عبر المنصة المفضلة
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-[#DCFCE7] px-4 py-3 text-xs font-bold text-[#14532D] hover:bg-emerald-200/70 transition-colors min-h-[46px]"
              >
                <MessageCircle className="w-4 h-4 text-[#14532D] shrink-0" />
                <span>WhatsApp</span>
              </a>

              <a
                href={facebookHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800 hover:bg-blue-100 transition-colors min-h-[46px]"
              >
                <ExternalLink className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Facebook</span>
              </a>

              <a
                href={telegramHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-800 hover:bg-sky-100 transition-colors min-h-[46px]"
              >
                <Send className="w-4 h-4 text-sky-700 shrink-0" />
                <span>Telegram</span>
              </a>

              <a
                href={smsHref}
                className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors min-h-[46px]"
              >
                <MessageSquare className="w-4 h-4 text-amber-700 shrink-0" />
                <span>رسالة SMS</span>
              </a>

              <button
                type="button"
                onClick={handleNativeShare}
                className="col-span-2 sm:col-span-2 flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-xs font-bold text-[#111827] hover:border-[#14532D] transition-colors min-h-[46px]"
              >
                <Smartphone className="w-4 h-4 text-[#14532D] shrink-0" />
                <span>
                  {supportsWebShare ? 'التطبيقات الأخرى المتاحة في الهاتف' : 'نسخ للمشاركة في أي تطبيق'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Official QR Code & Link Preview */}
        <div className="lg:col-span-5 space-y-5">
          <div className="wab-card rounded-2xl p-5 sm:p-6 flex flex-col items-center text-center space-y-4">
            <div className="flex items-center gap-2.5">
              <img
                src={club.logoUrl}
                alt={club.clubName}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-contain bg-white border border-gray-200 p-0.5"
              />
              <div className="text-right">
                <h3 className="text-sm font-extrabold text-[#111827]">{club.clubShortName} — {club.clubName}</h3>
                <p className="text-[11px] text-gray-500">رمز الاستجابة السريعة (QR Code)</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border-4 border-[#14532D]">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR Code ${club.clubName}`} className="w-52 h-52 sm:w-56 sm:h-56 block" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-gray-500">
                  جاري توليد رمز QR...
                </div>
              )}
            </div>

            <p className="text-xs text-gray-600 leading-relaxed max-w-xs">
              يمكن للأولياء والمدربين مسح هذا الرمز بكاميرا الهاتف للدخول المباشر إلى التطبيق الرسمي.
            </p>

            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={!qrDataUrl}
                onClick={handleDownloadQrPng}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] disabled:opacity-50 min-h-[44px]"
              >
                <Download className="w-4 h-4 text-[#14532D]" />
                <span>تحميل رمز QR</span>
              </button>
              <button
                type="button"
                disabled={!qrDataUrl}
                onClick={handlePrintQrPoster}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#166534] disabled:opacity-50 min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة ملصق QR</span>
              </button>
            </div>
          </div>

          {/* Link Preview Card */}
          <div className="wab-card rounded-2xl p-4 space-y-3">
            <div className="text-xs font-bold text-gray-600">معاينة بطاقة الرابط عند المشاركة</div>
            <div className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-3.5 flex items-center gap-3.5">
              <img
                src={club.logoUrl}
                alt={club.clubName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-contain bg-white border border-gray-200 p-1 shrink-0"
              />
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-extrabold text-[#111827] truncate">
                  {club.clubShortName} – {club.clubName} | منصة إدارة النادي
                </div>
                <div className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">{message}</div>
                <div dir="ltr" className="text-[10px] font-mono-num font-bold text-[#14532D] truncate text-right">
                  {appUrl}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
