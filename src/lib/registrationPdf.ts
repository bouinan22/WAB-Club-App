import type { ClubSettings } from '../types/wab.ts';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function buildSingleImagePdfBlob(jpegDataUrl: string, imgWidth: number, imgHeight: number): Blob {
  const base64 = jpegDataUrl.split(',')[1] || '';
  const binStr = atob(base64);
  const imgBytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    imgBytes[i] = binStr.charCodeAt(i);
  }

  // A4 page in PDF points: 595.28 x 841.89
  const pageW = 595.28;
  const pageH = 841.89;
  const encoder = new TextEncoder();

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0];

  const pushStr = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    offset += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  pushStr('%PDF-1.4\n');

  // 1: Catalog
  offsets.push(offset);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  offsets.push(offset);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page
  offsets.push(offset);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  // 4: Image XObject (DCTDecode JPEG)
  offsets.push(offset);
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`,
  );
  pushBytes(imgBytes);
  pushStr('\nendstream\nendobj\n');

  // 5: Page Content Stream
  const streamContent = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets.push(offset);
  pushStr(`5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`);

  const xrefStart = offset;
  pushStr(`xref\n0 ${offsets.length}\n`);
  pushStr('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const blobParts: BlobPart[] = chunks.map((chunk) => chunk.slice().buffer);
  return new Blob(blobParts, { type: 'application/pdf' });
}

export async function downloadOfficialRegistrationPdf(club: ClubSettings): Promise<void> {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر تهيئة أداة توليد ملف PDF');

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // White A4 background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Outer border frame
  ctx.strokeStyle = '#14532D';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  // Top Header Banner (Dark Green + Light Green bar)
  ctx.fillStyle = '#14532D';
  ctx.fillRect(48, 48, W - 96, 175);
  ctx.fillStyle = '#16A34A';
  ctx.fillRect(48, 223, W - 96, 10);

  // Club Logo
  const logoImg = await loadImage(club.logoUrl);
  if (logoImg) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(W - 210, 68, 136, 136);
    ctx.drawImage(logoImg, W - 202, 76, 120, 120);
  }

  // Header Arabic + English Title
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px Cairo, Tajawal, sans-serif';
  ctx.fillText(`نادي ${club.clubName} (${club.clubShortName})`, W - 235, 118);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 26px Cairo, Tajawal, sans-serif';
  ctx.fillText('استمارة التسجيل والانخراط الإلكتروني الرسمية', W - 235, 165);

  ctx.fillStyle = '#DCFCE7';
  ctx.font = 'bold 20px Cairo, Tajawal, sans-serif';
  ctx.fillText(`الموسم الرياضي: ${club.season}  |  ${club.address || 'بوعنان، الجزائر'}`, W - 235, 202);

  // Photo Placeholder Box on Top-Left of Form Body
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(64, 265, 170, 210);
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 18px Cairo, Tajawal, sans-serif';
  ctx.fillText('صورة اللاعب', 149, 360);
  ctx.font = '15px Cairo, Tajawal, sans-serif';
  ctx.fillText('(تُلصق أو تُرفع', 149, 390);
  ctx.fillText('إلكترونياً)', 149, 416);

  const drawSectionHeader = (title: string, y: number, maxRightX = W - 60) => {
    ctx.fillStyle = '#14532D';
    ctx.fillRect(60, y, maxRightX - 60, 42);
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(maxRightX - 12, y, 12, 42);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px Cairo, Tajawal, sans-serif';
    ctx.fillText(title, maxRightX - 28, y + 29);
  };

  const drawFieldRow = (label: string, y: number, rightX = W - 64, leftX = 64) => {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 20px Cairo, Tajawal, sans-serif';
    ctx.fillText(label, rightX, y);
    const labelW = ctx.measureText(label).width;
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftX, y + 6);
    ctx.lineTo(rightX - labelW - 18, y + 6);
    ctx.stroke();
  };

  // Section 1: Player Information (next to photo box)
  drawSectionHeader('أولاً: المعلومات الشخصية للاعب', 265, W - 60);
  // Keep rows right of photo box (leftX = 258)
  drawFieldRow('الاسم واللقب الكامل:', 345, W - 68, 258);
  drawFieldRow('تاريخ ومكان الميلاد:', 395, W - 68, 258);
  drawFieldRow('رقم بطاقة التعريف / الدفتر العائلي:', 445, W - 68, 258);

  // Category Checkboxes Row
  ctx.textAlign = 'right';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px Cairo, Tajawal, sans-serif';
  ctx.fillText('الفئة العمرية المطلوبة:', W - 68, 505);

  const cats = ['U7', 'U9', 'U11', 'U13', 'U15', 'U17'];
  let cx = W - 310;
  for (const cat of cats) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 24, 486, 24, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(cat, cx - 34, 505);
    cx -= 140;
  }

  // Section 2: Parent / Guardian Details
  drawSectionHeader('ثانياً: معلومات ولي الأمر والتواصل', 540);
  drawFieldRow('اسم الأب أو الأم أو الولي الشرعي:', 620);
  drawFieldRow('رقم الهاتف الأساسي (واتساب):', 670);
  drawFieldRow('رقم هاتف احتياطي / البريد الإلكتروني:', 720);
  drawFieldRow('العنوان الكامل للإقامة:', 770);

  // Section 3: Medical & Sports Info
  drawSectionHeader('ثالثاً: الحالة الصحية والملاحظات الرياضية', 815);
  drawFieldRow('هل يعاني اللاعب من أمراض مزمنة أو حساسية؟ (نعم / لا — حدد):', 895);
  drawFieldRow('فصيلة الدم / إصابات سابقة / ملاحظات إضافية:', 945);
  drawFieldRow('هل سبق للاعب اللعب في نادٍ آخر؟ (اسم النادي السابق إن وجد):', 995);

  // Section 4: Required Checklist
  drawSectionHeader('رابعاً: الوثائق المطلوب إرفاقها عند التسجيل الإلكتروني', 1040);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 19px Cairo, Tajawal, sans-serif';
  const checklist = [
    '1. هذه الاستمارة معبأة بدقة وموقعة من طرف ولي الأمر (ترفع بصيغة PDF أو صورة واضحة).',
    '2. صورة شمسية حديثة للاعب.',
    '3. شهادة طبية تثبت القدرة البدنية على ممارسة كرة القدم (تُقدم عند تأكيد الانخراط).',
    '4. نسخة من شهادة الميلاد أو الدفتر العائلي لإثبات الفئة العمرية.',
  ];
  checklist.forEach((line, idx) => {
    ctx.fillText(line, W - 75, 1118 + idx * 36);
  });

  // Section 5: Parent Commitment & Signatures
  drawSectionHeader('خامساً: تعهد وتوقيع ولي الأمر', 1275);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#111827';
  ctx.font = '19px Cairo, Tajawal, sans-serif';
  ctx.fillText(
    `أنا الممضي(ة) أسفله، أصرح بصحة جميع المعلومات المدونة أعلاه، وأوافق على انخراط ابني/ابنتي في نادي ${club.clubName}`,
    W - 75,
    1350,
  );
  ctx.fillText(
    'والالتزام بالنظام الداخلي للنادي، وبمواعيد التدريبات والمباريات والمحافظة على الروح الرياضية.',
    W - 75,
    1382,
  );

  // Two Signature Boxes
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(W - 600, 1420, 535, 220);
  ctx.strokeRect(W - 600, 1420, 535, 220);
  ctx.fillRect(65, 1420, 535, 220);
  ctx.strokeRect(65, 1420, 535, 220);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px Cairo, Tajawal, sans-serif';
  ctx.fillText('حُرّر بـ: ........................... في: .... / .... / 202..', W - 85, 1460);
  ctx.fillText('توقيع ولي الأمر (مسبوق بعبارة قرأت وصودق عليه):', W - 85, 1505);

  ctx.fillStyle = '#14532D';
  ctx.fillText('خاص بإدارة النادي (W.A.B):', 580, 1460);
  ctx.fillStyle = '#475569';
  ctx.font = '18px Cairo, Tajawal, sans-serif';
  ctx.fillText('رقم الملف الإلكتروني: ..............................', 580, 1505);
  ctx.fillText('القرار والختم الرسمي للنادي:', 580, 1550);

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 16px Cairo, Tajawal, sans-serif';
  ctx.fillText(
    `${club.clubShortName} — ${club.clubName} | المنصة الرسمية للتسجيل الإلكتروني — الموسم الرياضي ${club.season}`,
    W / 2,
    1695,
  );

  const jpegUrl = canvas.toDataURL('image/jpeg', 0.92);
  const pdfBlob = buildSingleImagePdfBlob(jpegUrl, W, H);
  const objectUrl = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `استمارة_التسجيل_WAB_${club.season}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
