export interface CompressedImageResult {
  dataUrl: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_RAW_BYTES = 15 * 1024 * 1024; // 15 MB raw limit

export function validateImageFile(file: File | Blob): string | null {
  if (file.type && !ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    return 'صيغة الملف غير مدعومة. يرجى اختيار صورة بصيغة PNG أو JPG أو WEBP.';
  }
  if (file.size > MAX_RAW_BYTES) {
    return 'حجم الصورة الأصلي كبير جداً (الحد الأقصى 15 ميغابايت قبل الضغط).';
  }
  if (file.size === 0) {
    return 'ملف الصورة فارغ أو تالف.';
  }
  return null;
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const b64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Resizes and compresses an image File/Blob client-side using HTML5 Canvas.
 * Supports target size bytes (e.g. 300KB for coach/player photos, 500KB for posts/banners),
 * WebP conversion when supported, and dimension scaling.
 */
export async function compressImageFile(
  file: File | Blob,
  options: { maxDimension?: number; targetSizeBytes?: number } = {},
): Promise<CompressedImageResult> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);

  const targetSizeBytes = options.targetSizeBytes ?? (300 * 1024); // default 300KB for player/coach photos
  let maxDimension = options.maxDimension ?? 800;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة. يرجى تجربة صورة أخرى.'));
      el.src = objectUrl;
    });

    let targetW = img.naturalWidth || img.width;
    let targetH = img.naturalHeight || img.height;
    if (targetW <= 0 || targetH <= 0) {
      throw new Error('أبعاد الصورة غير صالحة.');
    }

    if (targetW > maxDimension || targetH > maxDimension) {
      if (targetW >= targetH) {
        targetH = Math.max(1, Math.round((targetH * maxDimension) / targetW));
        targetW = maxDimension;
      } else {
        targetW = Math.max(1, Math.round((targetW * maxDimension) / targetH));
        targetH = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('تعذر معالجة الصورة في المتصفح.');
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);

    let quality = 0.90;
    let dataUrl = canvas.toDataURL('image/webp', quality);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    let compressedBytes = estimateDataUrlBytes(dataUrl);

    // Iteratively compress until target size or quality threshold reached
    while (compressedBytes > targetSizeBytes && quality > 0.45) {
      quality -= 0.10;
      dataUrl = canvas.toDataURL('image/webp', quality);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      compressedBytes = estimateDataUrlBytes(dataUrl);
    }

    // If still over target size, reduce dimensions once more
    if (compressedBytes > targetSizeBytes && maxDimension > 400) {
      maxDimension = Math.floor(maxDimension * 0.75);
      return compressImageFile(file, { maxDimension, targetSizeBytes });
    }

    return {
      dataUrl,
      originalBytes: file.size,
      compressedBytes,
      width: targetW,
      height: targetH,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatBytesKb(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 ك.ب';
  if (bytes < 1024) return `${bytes} بايت`;
  return `${Math.round(bytes / 1024)} ك.ب`;
}
