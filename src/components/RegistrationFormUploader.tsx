import React, { useRef, useState } from 'react';
import { CheckCircle2, FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.ts';

interface RegistrationFormUploaderProps {
  label?: string;
  hint?: string;
  required?: boolean;
  publicMode?: boolean;
  value?: { url: string; name: string; mime: string } | null;
  onChange: (doc: { url: string; name: string; mime: string } | null) => void;
}

async function compressImageDataUrl(file: File, maxDim = 1400, quality = 0.84): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('الملف المختار ليس صورة صالحة.'));
    i.src = rawUrl;
  });

  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * ratio));
  canvas.height = Math.max(1, Math.round(img.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawUrl;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
    reader.readAsDataURL(file);
  });
}

export const RegistrationFormUploader: React.FC<RegistrationFormUploaderProps> = ({
  label = 'رفع استمارة التسجيل المعبأة والموقعة (PDF أو صورة)',
  hint = 'صيغ مدعومة: PDF حتى 5 ميغابايت، أو صورة واضحة (JPG / PNG / WEBP)',
  required = false,
  publicMode = true,
  value,
  onChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type.startsWith('image/');

      if (!isPdf && !isImage) {
        throw new Error('يرجى اختيار ملف بصيغة PDF أو صورة واضحة (JPG / PNG / WEBP).');
      }
      if (isPdf && file.size > 5 * 1024 * 1024) {
        throw new Error('حجم ملف PDF يتجاوز الحد الأقصى المسموح (5 ميغابايت).');
      }

      const dataUrl = isPdf
        ? await readFileAsDataUrl(file)
        : await compressImageDataUrl(file);

      const res = publicMode
        ? await api.uploadPublicRegistrationDocument(dataUrl, file.name)
        : await api.uploadProtectedRegistrationDocument(dataUrl, file.name);

      onChange(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الملف.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-bold text-[#111827]">
          {label} {required && <span className="text-[#14532D]">*</span>}
        </label>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              {value.mime === 'application/pdf' ? (
                <FileText className="w-5 h-5" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{value.name || 'تم رفع الملف بنجاح'}</span>
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                {value.mime === 'application/pdf' ? 'ملف PDF مرفق ومؤمّن' : 'صورة مرفقة ومؤمّنة'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-[#111827] hover:border-[#14532D]"
            >
              تغيير
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1.5 rounded-lg border border-red-200 bg-white text-[#DC2626] hover:bg-red-50"
              aria-label="إزالة الملف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-[#14532D] bg-slate-50/70 p-4 text-center transition-colors flex flex-col items-center justify-center gap-1.5 min-h-[96px]"
        >
          {busy ? (
            <>
              <Loader2 className="w-6 h-6 text-[#14532D] animate-spin" />
              <span className="text-xs font-bold text-[#111827]">جاري معالجة ورفع الملف بأمان...</span>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#14532D] flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-extrabold text-[#111827]">
                اضغط لاختيار ملف الاستمارة (PDF أو صورة)
              </span>
              <span className="text-[11px] text-slate-500">{hint}</span>
            </>
          )}
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-[#DC2626]">
          {error}
        </div>
      )}
    </div>
  );
};
