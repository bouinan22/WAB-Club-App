import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import { api, getProtectedFileUrl } from '../lib/api.ts';
import { compressImageFile, formatBytesKb } from '../lib/imageUtils.ts';
import { AvatarBadge, Modal } from './UI.tsx';

interface PhotoUploaderProps {
  name: string;
  value: string;
  onChange: (nextUrl: string) => void;
  prefix?: 'coach' | 'player' | 'logo';
  publicMode?: boolean;
  disabled?: boolean;
  onImmediateSave?: (nextUrl: string) => Promise<void>;
  compact?: boolean;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  name,
  value,
  onChange,
  prefix = 'coach',
  publicMode = false,
  disabled = false,
  onImmediateSave,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string>('');
  const [liveCameraOpen, setLiveCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const processAndUploadBlob = async (file: File | Blob) => {
    setError(null);
    setCompressionNote(null);
    setBusy(true);
    try {
      const targetSize = prefix === 'logo' || prefix === 'coach' || prefix === 'player' ? 300 * 1024 : 500 * 1024;
      const compressed = await compressImageFile(file, { maxDimension: 640, targetSizeBytes: targetSize });
      const { url } = publicMode
        ? await api.uploadPublicPlayerPhoto(compressed.dataUrl)
        : await api.uploadImage(compressed.dataUrl, prefix);
      if (onImmediateSave) {
        await onImmediateSave(url);
      }
      setLocalPreview(compressed.dataUrl);
      onChange(url);
      setCompressionNote(
        `تم تحسين وضغط الصورة (${formatBytesKb(compressed.originalBytes)} ← ${formatBytesKb(compressed.compressedBytes)})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر رفع الصورة.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processAndUploadBlob(file);
  };

  const openLiveCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraFileInputRef.current?.click();
      return;
    }

    try {
      setLiveCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setLiveCameraOpen(false);
      stopCameraStream();
      cameraFileInputRef.current?.click();
    }
  };

  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 640;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    stopCameraStream();
    setLiveCameraOpen(false);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) {
      await processAndUploadBlob(blob);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setCompressionNote(null);
    setBusy(true);
    try {
      if (onImmediateSave) {
        await onImmediateSave('');
      }
      setLocalPreview('');
      onChange('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الصورة.');
    } finally {
      setBusy(false);
    }
  };

  const displayPhotoUrl =
    value && localPreview
      ? localPreview
      : value && value.startsWith('/api/registration-files/')
        ? getProtectedFileUrl(value)
        : value;

  return (
    <div className="space-y-2.5">
      <div
        className={`rounded-2xl border border-slate-200 bg-slate-50 p-3.5 flex flex-col sm:flex-row sm:items-center gap-4 ${
          compact ? 'p-3' : ''
        }`}
      >
        <div className="flex items-center gap-3.5 shrink-0">
          <AvatarBadge name={name || 'W.A.B'} photoUrl={displayPhotoUrl} size={compact ? 'md' : 'lg'} />
          <div className="sm:hidden min-w-0">
            <div className="text-xs font-extrabold text-[#111827] truncate">{value ? 'معاينة الصورة' : 'بدون صورة حالياً'}</div>
            <div className="text-[11px] text-slate-500">PNG / JPG / WEBP (ضغط تلقائي)</div>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div className="hidden sm:block">
            <div className="text-xs font-extrabold text-[#111827]">{value ? 'معاينة الصورة الشخصية' : 'رفع الصورة الشخصية'}</div>
            <div className="text-[11px] text-slate-500">
              يتم ضغط الصورة وتحسين حجمها تلقائياً قبل الحفظ (الحد الأقصى 1.5 ميغابايت)
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
              disabled={disabled || busy}
            />
            <input
              ref={cameraFileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileChange}
              className="hidden"
              disabled={disabled || busy}
            />

            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] disabled:opacity-50 min-h-[40px]"
            >
              {value ? <RefreshCw className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{busy ? 'جاري المعالجة...' : value ? 'تغيير الصورة' : 'رفع صورة'}</span>
            </button>

            <button
              type="button"
              disabled={disabled || busy}
              onClick={openLiveCamera}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] disabled:opacity-50 min-h-[40px]"
            >
              <Camera className="w-3.5 h-3.5 text-[#14532D]" />
              <span>التقاط بالكاميرا</span>
            </button>

            {value && (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-[#DC2626] hover:bg-red-100 disabled:opacity-50 min-h-[40px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الصورة</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {compressionNote && (
        <div className="text-[11px] text-emerald-700 font-semibold">{compressionNote}</div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">{error}</div>
      )}

      <Modal
        open={liveCameraOpen}
        title="التقاط صورة شخصية بالكاميرا"
        onClose={() => {
          stopCameraStream();
          setLiveCameraOpen(false);
        }}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-200 aspect-square flex items-center justify-center">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                <Video className="w-6 h-6 text-[#14532D]" />
                <span>جاري تشغيل الكاميرا...</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => cameraFileInputRef.current?.click()}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-[#111827]"
            >
              كاميرا الجهاز
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  setLiveCameraOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
                <span>إلغاء</span>
              </button>
              <button
                type="button"
                disabled={!cameraReady}
                onClick={handleCaptureSnapshot}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>التقاط وحفظ</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
