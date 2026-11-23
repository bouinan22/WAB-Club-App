import React, { useState } from 'react';
import { ExternalLink, WifiOff, X } from 'lucide-react';
import { useLang } from '../lib/i18n.tsx';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC<{
  alwaysShowLanding?: boolean;
}> = ({ alwaysShowLanding = false }) => {
  const { lang } = useLang();
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowInstallGuide(true);
      }
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    setShowInstallGuide(true);
  };

  const browserLaunchUrl =
    typeof window !== 'undefined' ? window.location.href : '/';

  if (!alwaysShowLanding && isInstalled) {
    return null;
  }

  return (
    <>
      {alwaysShowLanding ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full rounded-2xl border-2 border-[#14532D] bg-white hover:bg-[#DCFCE7]/50 text-[#111827] px-5 py-4 text-center transition-colors min-h-[60px]"
        >
          <div className="text-base sm:text-lg font-extrabold text-[#14532D]">
            تنزيل التطبيق | Télécharger l’application
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            {isInstalled
              ? lang === 'fr'
                ? 'Application installée sur votre appareil'
                : 'التطبيق مثبت ويعمل حالياً على جهازك'
              : isInstallable
                ? lang === 'fr'
                  ? 'Cliquez pour installer l’application directement sur votre appareil'
                  : 'اضغط هنا لتنزيل وتثبيت التطبيق مباشرة على هاتفك'
                : isIOS
                  ? lang === 'fr'
                    ? 'Appuyez pour installer sur iPhone (Safari)'
                    : 'اضغط لعرض خطوات تنزيل التطبيق على iPhone'
                  : lang === 'fr'
                    ? 'Appuyez pour télécharger et installer sur Android / navigateur'
                    : 'اضغط هنا لتنزيل التطبيق على الهاتف (Android / المتصفح)'}
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex items-center justify-center rounded-xl bg-[#14532D] hover:bg-[#166534] px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
        >
          <span>{lang === 'fr' ? "Télécharger l'application" : 'تنزيل التطبيق'}</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#111827]">
                تنزيل تطبيق W.A.B على iPhone
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#111827] hover:bg-slate-100"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="space-y-2 text-sm text-slate-700 leading-relaxed list-decimal list-inside">
              <li>افتح التطبيق في متصفح Safari واضغط على زر المشاركة (Share) أسفل الشاشة.</li>
              <li>اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
              <li>اضغط «إضافة» (Ajouter) ليتم تنزيل التطبيق بشعار نادي وداد أمل بوعنان.</li>
            </ol>
            <div className="rounded-xl bg-[#F8FAFC] border border-gray-200 p-3 text-xs text-gray-600 leading-relaxed" dir="ltr">
              <strong>iPhone (Safari):</strong> Partager → Sur l’écran d’accueil → Ajouter.
            </div>
            {isInIframe && (
              <a
                href={browserLaunchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#14532D] bg-[#DCFCE7] py-2.5 px-4 text-xs font-extrabold text-[#14532D]"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح التطبيق مباشرة في Safari للتنزيل</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full rounded-xl bg-[#14532D] py-3 text-sm font-bold text-white hover:bg-[#166534] transition-colors"
            >
              حسناً · Compris
            </button>
          </div>
        </div>
      )}

      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#111827]">
                تنزيل تطبيق W.A.B على الهاتف
              </h3>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#111827] hover:bg-slate-100"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {isInstalled ? (
              <p className="text-sm text-[#14532D] font-bold">
                التطبيق مثبت ويعمل حالياً كتطبيق مستقل على جهازك.
              </p>
            ) : (
              <>
                {isInIframe && (
                  <div className="rounded-xl border border-emerald-200 bg-[#DCFCE7]/60 p-3.5 space-y-2.5 text-xs text-[#111827]">
                    <p className="font-bold text-[#14532D]">
                      أنت تعرض التطبيق داخل إطار معاينة — افتح الرابط في المتصفح مباشرة لتنزيله بضغطة واحدة:
                    </p>
                    <a
                      href={browserLaunchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] hover:bg-[#166534] py-2.5 px-4 text-xs font-bold text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>فتح للتنزيل المباشر في المتصفح</span>
                    </a>
                  </div>
                )}
                <ol className="space-y-2 text-sm text-slate-700 leading-relaxed list-decimal list-inside">
                  <li>على هاتف Android (Chrome): افتح قائمة المتصفح (⋮) بالأعلى.</li>
                  <li>اضغط على «تنزيل التطبيق» أو «تثبيت التطبيق» (Install app).</li>
                  <li>أكد التثبيت ليظهر التطبيق مباشرة على الشاشة الرئيسية لهاتفك.</li>
                </ol>
                <div className="rounded-xl bg-[#F8FAFC] border border-gray-200 p-3 text-xs text-gray-600 leading-relaxed" dir="ltr">
                  <strong>Android (Chrome):</strong> Menu (⋮) → Installer l’application / Ajouter à l’écran d’accueil.
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              className="w-full rounded-xl border border-gray-300 bg-white py-3 text-sm font-bold text-[#111827] hover:border-[#14532D] transition-colors"
            >
              إغلاق · Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>وضع عدم الاتصال — التغييرات محفوظة محلياً وستُزامن تلقائياً عند عودة الإنترنت</span>
    </div>
  );
};
