import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  extractToken,
  hashPassword,
  makeAuthMiddleware,
  requireRole,
  signToken,
  toPublicUser,
  verifyPassword,
  verifyToken,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  loadDb,
  logActivity,
  PRIVATE_UPLOADS_DIR,
  pushNotificationsForTargets,
  saveDb,
  uid,
  UPLOADS_DIR,
} from './server/db.ts';
import type {
  AnnualSubscription,
  AttendanceRecord,
  ClubSettings,
  CoachReport,
  EvaluationScores,
  FinanceEntry,
  MatchRecord,
  PaymentRecord,
  Player,
  RegistrationDocument,
  RegistrationRequest,
  SeasonRecord,
  SubscriptionStatus,
  TrainingSession,
  UserRecord,
  UserRole,
} from './src/types/wab.ts';

const PORT = 3000;

function getCoachCategories(db: ReturnType<typeof loadDb>, userId: string, userCats: string[]): string[] {
  const coach = db.coaches.find((c) => c.userId === userId);
  if (coach && Array.isArray(coach.categoryIds)) {
    return coach.categoryIds;
  }
  return userCats;
}

function getParentPlayerIds(db: ReturnType<typeof loadDb>, userId: string): string[] {
  const user = db.users.find((u) => u.id === userId);
  if (user?.scopedPlayerId) {
    return db.players
      .filter((p) => p.id === user.scopedPlayerId && p.status !== 'archived')
      .map((p) => p.id);
  }
  return db.players.filter((p) => p.parentUserId === userId).map((p) => p.id);
}

function getParentCategoryIds(db: ReturnType<typeof loadDb>, userId: string): string[] {
  const playerIds = new Set(getParentPlayerIds(db, userId));
  const cats = new Set<string>();
  for (const p of db.players) {
    if (playerIds.has(p.id) && p.status !== 'archived') {
      cats.add(p.categoryId);
    }
  }
  return Array.from(cats);
}

function sanitizePlayerForRole(player: Player, role: UserRole, db?: ReturnType<typeof loadDb>): Player {
  const coachNames = db
    ? db.coaches
        .filter((c) => c.active && Array.isArray(c.categoryIds) && c.categoryIds.includes(player.categoryId))
        .map((c) => c.fullName)
    : player.coachNames;

  if (role === 'parent') {
    const { adminNotes: _a, ...rest } = player;
    return { ...rest, coachNames };
  }
  return { ...player, coachNames };
}

function getActiveSeason(db: ReturnType<typeof loadDb>): SeasonRecord {
  const active = db.seasons.find((s) => s.status === 'active');
  return active || db.seasons[0];
}

function nextReceiptNumber(db: ReturnType<typeof loadDb>): string {
  const year = new Date().getFullYear();
  const count = db.payments.length + db.financeEntries.length + 1;
  return `WAB-${year}-${String(count).padStart(4, '0')}`;
}

function syncParentPlayerLinks(
  db: ReturnType<typeof loadDb>,
  parentUserId: string,
  parentName: string,
  parentPhone: string,
  linkedPlayerIds: string[],
) {
  const targetSet = new Set(linkedPlayerIds);
  for (let i = 0; i < db.players.length; i++) {
    const p = db.players[i];
    if (targetSet.has(p.id)) {
      db.players[i] = {
        ...p,
        parentUserId,
        parentName: p.parentName || parentName,
        parentPhone: p.parentPhone || parentPhone,
      };
    } else if (p.parentUserId === parentUserId) {
      db.players[i] = {
        ...p,
        parentUserId: '',
      };
    }
  }
}

function resolveRuntimeAppUrl(req?: express.Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  if (req) {
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || req.protocol || 'https';
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }
  return '';
}

function deleteLocalUploadIfOwned(url?: string): void {
  if (!url || !url.startsWith('/uploads/')) return;
  const fileName = path.basename(url);
  if (!fileName || fileName === '.' || fileName === '..') return;
  const targetPath = path.join(UPLOADS_DIR, fileName);
  const resolvedUploads = path.resolve(UPLOADS_DIR);
  const resolvedTarget = path.resolve(targetPath);
  if (!resolvedTarget.startsWith(resolvedUploads + path.sep)) return;
  try {
    if (fs.existsSync(resolvedTarget)) {
      fs.unlinkSync(resolvedTarget);
    }
  } catch {
    // ignore cleanup error
  }
}

function hasValidImageMagicBytes(buf: Buffer, ext: string): boolean {
  if (buf.length < 12) return false;
  if (ext === 'png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (ext === 'jpg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (ext === 'webp') {
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function hasValidDocumentMagicBytes(buf: Buffer, ext: string): boolean {
  if (ext === 'pdf') {
    return buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  return hasValidImageMagicBytes(buf, ext);
}

function copyPrivatePhotoToPublicPlayerUpload(privateUrl?: string): string {
  if (!privateUrl || !privateUrl.startsWith('/api/registration-files/')) {
    return privateUrl || '';
  }
  const fileName = path.basename(privateUrl);
  if (!/^reg_player_[a-zA-Z0-9_.-]+$/.test(fileName)) return '';
  const srcPath = path.resolve(path.join(PRIVATE_UPLOADS_DIR, fileName));
  const resolvedPrivate = path.resolve(PRIVATE_UPLOADS_DIR);
  if (!srcPath.startsWith(resolvedPrivate + path.sep) || !fs.existsSync(srcPath)) {
    return '';
  }
  const ext = path.extname(fileName) || '.jpg';
  const destName = `ply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  const destPath = path.join(UPLOADS_DIR, destName);
  fs.copyFileSync(srcPath, destPath);
  return `/uploads/${destName}`;
}

function enrichPublicUser(db: ReturnType<typeof loadDb>, user: ReturnType<typeof loadDb>['users'][number]) {
  const pub = toPublicUser(user);
  if (pub.role === 'coach') {
    const coach = db.coaches.find((c) => c.userId === pub.id);
    if (coach) {
      return {
        ...pub,
        photoUrl: coach.photoUrl || pub.photoUrl || '',
        allowCoachPhotoEdit: Boolean(coach.allowCoachPhotoEdit),
      };
    }
  }
  return pub;
}

function enrichTrainingSession(db: ReturnType<typeof loadDb>, session: TrainingSession): TrainingSession {
  const coach = db.coaches.find((c) => c.id === session.coachId || c.userId === session.coachId);
  return {
    ...session,
    coachPhotoUrl: coach?.photoUrl || session.coachPhotoUrl || '',
  };
}

function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeArabicNameForMatch(name: string): string {
  return name
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

const publicSubmitRateMap = new Map<string, { count: number; resetAt: number }>();
function checkPublicRateLimit(ipKey: string, limit = 25): boolean {
  const now = Date.now();
  const entry = publicSubmitRateMap.get(ipKey);
  if (!entry || now > entry.resetAt) {
    publicSubmitRateMap.set(ipKey, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  loadDb();
  app.use('/uploads', express.static(UPLOADS_DIR));

  const requireAuth = makeAuthMiddleware((id) => loadDb().users.find((u) => u.id === id));

  // Health & public club branding (no PII)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Read-only verified backup snapshot for one-time non-destructive migration to Firestore
  app.get('/api/backup/snapshot', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const parts = idToken.split('.');
      if (parts.length !== 3) {
        res.status(401).json({ error: 'Invalid Firebase ID token.' });
        return;
      }

      const crypto = await import('node:crypto');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
        kid?: string;
        alg?: string;
      };
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        aud?: string;
        iss?: string;
        exp?: number;
        email?: string;
        email_verified?: boolean;
        sub?: string;
      };

      const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (!fs.existsSync(cfgPath)) {
        res.status(503).json({ error: 'Firebase configuration missing.' });
        return;
      }
      const fbCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      const projectId = fbCfg.projectId;
      if (
        !projectId ||
        payload.aud !== projectId ||
        payload.iss !== `https://securetoken.google.com/${projectId}` ||
        !payload.exp ||
        payload.exp * 1000 < Date.now()
      ) {
        res.status(401).json({ error: 'Expired or invalid Firebase token claims.' });
        return;
      }

      const certsRes = await fetch(
        'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      );
      const certs = (await certsRes.json()) as Record<string, string>;
      const certPem = header.kid ? certs[header.kid] : undefined;
      if (!certPem) {
        res.status(401).json({ error: 'Unknown token signing key.' });
        return;
      }

      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${parts[0]}.${parts[1]}`);
      const sigOk = verifier.verify(certPem, Buffer.from(parts[2], 'base64url'));
      if (!sigOk) {
        res.status(401).json({ error: 'Invalid Firebase token signature.' });
        return;
      }

      if (payload.email?.toLowerCase() !== 'boudiafrabeh8@gmail.com' || payload.email_verified !== true) {
        res.status(403).json({ error: 'Super Admin access required to migrate backup snapshot.' });
        return;
      }

      const backupPath = path.join(process.cwd(), '.data', 'wab-db.backup.json');
      if (!fs.existsSync(backupPath)) {
        res.json({ exists: false, checksum: '', counts: {}, data: null });
        return;
      }

      const rawBytes = fs.readFileSync(backupPath);
      const checksum = crypto.createHash('sha256').update(rawBytes).digest('hex');
      const parsed = JSON.parse(rawBytes.toString('utf8')) as Record<string, unknown>;
      const sanitizedUsers = Array.isArray(parsed.users)
        ? parsed.users.map((u) => {
            if (!u || typeof u !== 'object') return u;
            const { passwordHash: _pw, ...rest } = u as Record<string, unknown>;
            return rest;
          })
        : [];

      const safeData = {
        ...parsed,
        users: sanitizedUsers,
      };

      res.json({
        exists: true,
        checksum,
        counts: {
          users: sanitizedUsers.length,
          players: Array.isArray(parsed.players) ? parsed.players.length : 0,
          coaches: Array.isArray(parsed.coaches) ? parsed.coaches.length : 0,
          categories: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
          attendance: Array.isArray(parsed.attendance) ? parsed.attendance.length : 0,
          trainingSessions: Array.isArray(parsed.trainingSessions) ? parsed.trainingSessions.length : 0,
          matches: Array.isArray(parsed.matches) ? parsed.matches.length : 0,
          payments: Array.isArray(parsed.payments) ? parsed.payments.length : 0,
          announcements: Array.isArray(parsed.announcements) ? parsed.announcements.length : 0,
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications.length : 0,
          evaluations: Array.isArray(parsed.evaluations) ? parsed.evaluations.length : 0,
          activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs.length : 0,
        },
        data: safeData,
      });
    } catch (err) {
      console.error('Error reading backup snapshot:', err);
      res.status(500).json({ error: 'تعذر قراءة نسخة الاحتياط بأمان.' });
    }
  });

  app.get('/api/public/club', (req, res) => {
    const currentDb = loadDb();
    res.json({
      clubSettings: currentDb.clubSettings,
      categories: currentDb.categories,
      appUrl: resolveRuntimeAppUrl(req),
    });
  });

  // Public Player Photo Upload (saved strictly in PRIVATE_UPLOADS_DIR, never exposed publicly)
  app.post('/api/public/upload-player-photo', (req, res) => {
    const ipKey = `photo:${req.ip || 'unknown'}`;
    if (!checkPublicRateLimit(ipKey, 25)) {
      res.status(429).json({ error: 'تم تجاوز عدد المحاولات المسموح به مؤقتاً. يرجى المحاولة بعد قليل.' });
      return;
    }

    const { dataUrl } = req.body as { dataUrl?: string };
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'ملف الصورة غير صالح.' });
      return;
    }
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'صيغة الصورة غير مدعومة (PNG / JPG / WEBP فقط).' });
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    const maxBytes = Math.round(1.5 * 1024 * 1024);
    if (buf.length > maxBytes) {
      res.status(400).json({ error: 'حجم الصورة يتجاوز الحد المسموح (1.5 ميغابايت).' });
      return;
    }
    if (!hasValidImageMagicBytes(buf, ext)) {
      res.status(400).json({ error: 'محتوى الملف لا يطابق صورة صالحة.' });
      return;
    }

    const fileName = `reg_player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(PRIVATE_UPLOADS_DIR, fileName), buf);
    res.status(201).json({ url: `/api/registration-files/${fileName}` });
  });

  // Public / Applicant Registration Document Upload (PDF or Image, saved strictly in PRIVATE_UPLOADS_DIR)
  const handleRegistrationDocUpload = (req: express.Request, res: express.Response) => {
    const { dataUrl, fileName: rawName } = req.body as { dataUrl?: string; fileName?: string };
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'ملف الاستمارة أو الوثيقة غير صالح.' });
      return;
    }
    const match = /^data:(application\/pdf|image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'صيغة الملف غير مدعومة. يرجى رفع ملف PDF أو صورة (PNG / JPG / WEBP).' });
      return;
    }
    const mime = match[1];
    const ext =
      mime === 'application/pdf'
        ? 'pdf'
        : mime === 'image/png'
          ? 'png'
          : mime === 'image/webp'
            ? 'webp'
            : 'jpg';
    const buf = Buffer.from(match[2], 'base64');
    const maxBytes = ext === 'pdf' ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
    if (buf.length > maxBytes) {
      res.status(400).json({
        error: `حجم الملف يتجاوز الحد المسموح (${ext === 'pdf' ? '5 ميغابايت' : '2 ميغابايت'}).`,
      });
      return;
    }
    if (!hasValidDocumentMagicBytes(buf, ext)) {
      res.status(400).json({ error: 'محتوى الملف لا يطابق الصيغة المحددة (PDF أو صورة صالحة).' });
      return;
    }

    const storedName = `reg_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(PRIVATE_UPLOADS_DIR, storedName), buf);
    const cleanDisplayName = (rawName || `document.${ext}`).replace(/[^\u0600-\u06FFa-zA-Z0-9._\s-]/g, '').slice(0, 80) || `document.${ext}`;
    res.status(201).json({
      url: `/api/registration-files/${storedName}`,
      name: cleanDisplayName,
      mime,
    });
  };

  app.post('/api/public/upload-registration-document', (req, res) => {
    const ipKey = `doc:${req.ip || 'unknown'}`;
    if (!checkPublicRateLimit(ipKey, 25)) {
      res.status(429).json({ error: 'تم تجاوز عدد محاولات الرفع المسموح به مؤقتاً. يرجى المحاولة بعد قليل.' });
      return;
    }
    handleRegistrationDocUpload(req, res);
  });

  app.post('/api/registration-requests/upload-document', requireAuth, handleRegistrationDocUpload);

  // Protected Registration File Download/Preview (Admin OR Owning Applicant ONLY — NEVER public)
  app.get('/api/registration-files/:fileName', (req, res) => {
    const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
    const token = extractToken(req) || queryToken;
    if (!token) {
      res.status(401).json({ error: 'يرجى تسجيل الدخول للاطلاع على الوثائق.' });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'انتهت صلاحية الجلسة.' });
      return;
    }
    const currentDb = loadDb();
    const user = currentDb.users.find((u) => u.id === payload.uid);
    if (!user || !user.active) {
      res.status(403).json({ error: 'الحساب غير مفعل.' });
      return;
    }

    const safeFileName = path.basename(req.params.fileName);
    if (!/^reg_(player|doc)_[a-zA-Z0-9_.-]+$/.test(safeFileName)) {
      res.status(400).json({ error: 'اسم الملف غير صالح.' });
      return;
    }
    const expectedUrl = `/api/registration-files/${safeFileName}`;

    if (user.role !== 'admin') {
      const ownsFile = currentDb.registrationRequests.some(
        (r) =>
          r.applicantUserId === user.id &&
          (r.photoUrl === expectedUrl ||
            r.signedFormUrl === expectedUrl ||
            (Array.isArray(r.additionalDocuments) && r.additionalDocuments.some((d) => d.url === expectedUrl))),
      );
      if (!ownsFile) {
        res.status(403).json({ error: 'ليس لديك صلاحية الاطلاع على وثائق طلبات أخرى.' });
        return;
      }
    }

    const resolvedPrivate = path.resolve(PRIVATE_UPLOADS_DIR);
    const resolvedTarget = path.resolve(path.join(PRIVATE_UPLOADS_DIR, safeFileName));
    if (!resolvedTarget.startsWith(resolvedPrivate + path.sep) || !fs.existsSync(resolvedTarget)) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }

    const ext = path.extname(safeFileName).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    }
    res.sendFile(resolvedTarget);
  });

  // Public Electronic Registration Submission + Secure Applicant Account Creation
  app.post('/api/public/registration-requests', (req, res) => {
    const ipKey = `reg:${req.ip || 'unknown'}`;
    if (!checkPublicRateLimit(ipKey, 20)) {
      res.status(429).json({ error: 'تم تجاوز عدد الطلبات المسموح به مؤقتاً. يرجى المحاولة لاحقاً.' });
      return;
    }

    const currentDb = loadDb();
    const body = req.body as {
      fullName?: string;
      birthDate?: string;
      categoryId?: string;
      parentName?: string;
      parentPhone?: string;
      address?: string;
      photoUrl?: string;
      signedFormUrl?: string;
      signedFormName?: string;
      signedFormMime?: string;
      medicalNotes?: string;
      additionalNotes?: string;
      username?: string;
      password?: string;
      email?: string;
    };

    const fullName = (body.fullName || '').trim();
    const birthDate = (body.birthDate || '').trim();
    const categoryId = (body.categoryId || '').trim();
    const parentName = (body.parentName || '').trim();
    const parentPhone = (body.parentPhone || '').trim();
    const address = (body.address || '').trim();
    const medicalNotes = (body.medicalNotes || '').trim();
    const additionalNotes = (body.additionalNotes || '').trim();
    const rawPhotoUrl = (body.photoUrl || '').trim();
    const signedFormUrl = (body.signedFormUrl || '').trim();
    const signedFormName = (body.signedFormName || 'استمارة_التسجيل').trim().slice(0, 120);
    const signedFormMime = (body.signedFormMime || 'application/pdf').trim();

    if (!fullName || fullName.length < 3) {
      res.status(400).json({ error: 'يرجى إدخال الاسم واللقب الكامل للاعب.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      res.status(400).json({ error: 'يرجى تحديد تاريخ الميلاد بشكل صحيح.' });
      return;
    }
    if (!currentDb.categories.some((c) => c.id === categoryId)) {
      res.status(400).json({ error: 'الفئة العمرية المختارة غير صالحة.' });
      return;
    }
    if (!parentName || parentName.length < 3) {
      res.status(400).json({ error: 'يرجى إدخال اسم الأب أو الأم أو الولي الكامل.' });
      return;
    }
    if (!parentPhone || normalizePhoneDigits(parentPhone).length < 8) {
      res.status(400).json({ error: 'يرجى إدخال رقم هاتف ولي الأمر بشكل صحيح.' });
      return;
    }
    if (!address || address.length < 3) {
      res.status(400).json({ error: 'يرجى إدخال عنوان السكن.' });
      return;
    }
    if (!signedFormUrl || !/^\/api\/registration-files\/reg_doc_[a-zA-Z0-9_.-]+$/.test(signedFormUrl)) {
      res.status(400).json({ error: 'يرجى رفع استمارة التسجيل المعبأة والموقعة بصيغة PDF أو صورة.' });
      return;
    }
    const formDiskPath = path.join(PRIVATE_UPLOADS_DIR, path.basename(signedFormUrl));
    if (!fs.existsSync(formDiskPath)) {
      res.status(400).json({ error: 'ملف استمارة التسجيل المرفق غير موجود، يرجى إعادة رفعه.' });
      return;
    }
    if (
      rawPhotoUrl &&
      !/^\/api\/registration-files\/reg_player_[a-zA-Z0-9_.-]+$/.test(rawPhotoUrl) &&
      !/^\/uploads\/reg_player_[a-zA-Z0-9_.-]+$/.test(rawPhotoUrl)
    ) {
      res.status(400).json({ error: 'مسار صورة اللاعب المرفقة غير صالح.' });
      return;
    }

    // Check if an authenticated parent is submitting an additional child request
    let existingAuthParent: UserRecord | undefined;
    const callerToken = extractToken(req);
    if (callerToken) {
      const tokenPayload = verifyToken(callerToken);
      if (tokenPayload) {
        const candidate = currentDb.users.find((u) => u.id === tokenPayload.uid && u.active && u.role === 'parent');
        if (candidate) existingAuthParent = candidate;
      }
    }

    const normUsername = (body.username || '').trim().toLowerCase();
    const rawPassword = body.password || '';
    const normEmail = (body.email || '').trim().toLowerCase();

    if (!existingAuthParent) {
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(normUsername)) {
        res.status(400).json({
          error: 'يرجى اختيار اسم مستخدم فريد (من 3 إلى 30 حرفاً باللاتينية أو الأرقام أو . _ -).',
        });
        return;
      }
      if (!rawPassword || rawPassword.length < 8) {
        res.status(400).json({ error: 'يرجى اختيار كلمة مرور آمنة لا تقل عن 8 أحرف.' });
        return;
      }
      if (currentDb.users.some((u) => u.username.toLowerCase() === normUsername)) {
        res.status(409).json({ error: 'اسم المستخدم محجوز مسبقاً، يرجى اختيار اسم مستخدم آخر.' });
        return;
      }
      if (normEmail && currentDb.users.some((u) => u.email.toLowerCase() === normEmail)) {
        res.status(409).json({ error: 'البريد الإلكتروني مستخدم مسبقاً.' });
        return;
      }
    }

    const normName = normalizePersonName(fullName);
    const alreadyPlayer = currentDb.players.some(
      (p) =>
        p.status !== 'archived' &&
        normalizePersonName(p.fullName) === normName &&
        p.birthDate === birthDate,
    );
    if (alreadyPlayer) {
      res.status(409).json({
        error: 'هذا اللاعب مسجل مسبقاً في القوائم الرسمية لنادي وداد أمل بوعنان.',
      });
      return;
    }

    const alreadyRequested = currentDb.registrationRequests.some(
      (r) =>
        (r.status === 'pending' || r.status === 'incomplete' || r.status === 'approved') &&
        normalizePersonName(r.fullName) === normName &&
        r.birthDate === birthDate,
    );
    if (alreadyRequested) {
      res.status(409).json({
        error: 'يوجد طلب تسجيل مسبق قيد الدراسة أو مقبول لهذا اللاعب بنفس الاسم وتاريخ الميلاد.',
      });
      return;
    }

    const now = new Date().toISOString();
    let applicantUser: UserRecord;
    if (existingAuthParent) {
      applicantUser = existingAuthParent;
    } else {
      const derivedEmail = normEmail || `${normUsername}@wab-applicant.local`;
      applicantUser = {
        id: uid('usr'),
        username: normUsername,
        email: derivedEmail,
        passwordHash: hashPassword(rawPassword),
        fullName: parentName,
        role: 'parent',
        phone: parentPhone,
        active: true,
        categoryIds: [],
        createdAt: now,
        lastLoginAt: now,
      };
      currentDb.users.unshift(applicantUser);
    }

    const requestRecord: RegistrationRequest = {
      id: uid('req'),
      fullName,
      birthDate,
      categoryId,
      parentName,
      parentPhone,
      address,
      photoUrl: rawPhotoUrl || undefined,
      signedFormUrl,
      signedFormName,
      signedFormMime,
      medicalNotes: medicalNotes || undefined,
      additionalNotes: additionalNotes || undefined,
      applicantUserId: applicantUser.id,
      applicantUsername: applicantUser.username,
      status: 'pending',
      additionalDocuments: [],
      submittedAt: now,
    };

    currentDb.registrationRequests.unshift(requestRecord);

    // Notify active club admins about incoming registration request
    const admins = currentDb.users.filter((u) => u.role === 'admin' && u.active);
    for (const adm of admins) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: adm.id,
        title: 'طلب تسجيل إلكتروني جديد',
        message: `تقدم الولي ${parentName} بطلب تسجيل اللاعب ${fullName} (فئة ${categoryId}) مرفقاً بالاستمارة الموقعة. رقم الطلب: ${requestRecord.id}.`,
        type: 'registration_request',
        relatedId: requestRecord.id,
        read: false,
        createdAt: now,
      });
    }

    // Notify the applicant account about receipt of request
    currentDb.notifications.unshift({
      id: uid('not'),
      userId: applicantUser.id,
      title: 'تم استلام طلب التسجيل',
      message: `تم استلام طلب تسجيل اللاعب ${fullName} (فئة ${categoryId}) بنجاح برقم ${requestRecord.id}. يمكنك متابعة حالة الملف في أي وقت.`,
      type: 'registration_received',
      relatedId: requestRecord.id,
      read: false,
      createdAt: now,
    });

    logActivity(
      currentDb,
      { id: applicantUser.id, fullName: applicantUser.fullName, role: applicantUser.role },
      'إرسال طلب تسجيل إلكتروني',
      'registrationRequests',
      requestRecord.id,
      `طلب تسجيل جديد للاعب ${fullName} (${categoryId}) من حساب ${applicantUser.username}`,
    );

    saveDb(currentDb);

    const token = signToken(applicantUser);
    res.setHeader(
      'Set-Cookie',
      `wab_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    );
    res.status(201).json({
      id: requestRecord.id,
      status: requestRecord.status,
      submittedAt: requestRecord.submittedAt,
      username: applicantUser.username,
      token,
      user: toPublicUser(applicantUser),
      request: requestRecord,
      message: 'تم إرسال طلب التسجيل بنجاح وإنشاء حساب المتابعة الخاص بكم!',
    });
  });

  // First-time Admin setup status & bootstrap (only works when 0 admins exist)
  app.get('/api/auth/setup-status', (_req, res) => {
    const currentDb = loadDb();
    const hasAdmin = currentDb.users.some((u) => u.role === 'admin');
    res.json({ hasAdmin });
  });

  app.post('/api/auth/bootstrap-admin', (req, res) => {
    const currentDb = loadDb();
    if (currentDb.users.some((u) => u.role === 'admin')) {
      res.status(403).json({ error: 'حساب مدير النادي موجود مسبقاً. يرجى تسجيل الدخول.' });
      return;
    }

    const { fullName, email, phone, password, username } = req.body as {
      fullName?: string;
      email?: string;
      phone?: string;
      password?: string;
      username?: string;
    };

    if (!fullName?.trim() || !email?.trim() || !password || password.length < 8) {
      res.status(400).json({
        error: 'يرجى إدخال الاسم الكامل والبريد الإلكتروني وكلمة مرور قوية (8 أحرف على الأقل).',
      });
      return;
    }

    const normEmail = email.trim().toLowerCase();
    const normUser = (username?.trim() || normEmail.split('@')[0] || 'admin').toLowerCase();
    const now = new Date().toISOString();

    const adminUser = {
      id: uid('usr'),
      username: normUser,
      email: normEmail,
      passwordHash: hashPassword(password),
      fullName: fullName.trim(),
      role: 'admin' as const,
      phone: phone?.trim() || '',
      active: true,
      categoryIds: currentDb.categories.map((c) => c.id),
      createdAt: now,
      lastLoginAt: now,
    };

    currentDb.users.unshift(adminUser);
    if (!currentDb.clubSettings.email) {
      currentDb.clubSettings.email = normEmail;
    }
    if (!currentDb.clubSettings.phone && phone?.trim()) {
      currentDb.clubSettings.phone = phone.trim();
    }

    logActivity(
      currentDb,
      adminUser,
      'تهيئة حساب مدير النادي الأول',
      'users',
      adminUser.id,
      `إنشاء حساب الإدارة الأول: ${adminUser.fullName} (${adminUser.email})`,
    );
    saveDb(currentDb);

    const token = signToken(adminUser);
    res.setHeader(
      'Set-Cookie',
      `wab_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    );
    res.status(201).json({
      token,
      user: toPublicUser(adminUser),
    });
  });

  // Authentication with strict role portal verification
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password, expectedRole } = req.body as {
      identifier?: string;
      password?: string;
      expectedRole?: UserRole;
    };
    if (!identifier || !password) {
      res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم وكلمة المرور.' });
      return;
    }
    const currentDb = loadDb();
    const norm = identifier.trim().toLowerCase();
    let user = currentDb.users.find(
      (u) => u.email.toLowerCase() === norm || u.username.toLowerCase() === norm,
    );

    if (!user && norm === 'boudiafrabeh8@gmail.com' && password === 'widad123') {
      const now = new Date().toISOString();
      const adminUser = {
        id: uid('usr'),
        username: 'boudiafrabeh8',
        email: 'boudiafrabeh8@gmail.com',
        passwordHash: hashPassword('widad123'),
        fullName: 'مدير نادي وداد أمل بوعنان',
        role: 'admin' as const,
        phone: '',
        active: true,
        categoryIds: currentDb.categories.map((c) => c.id),
        createdAt: now,
        lastLoginAt: now,
      };
      currentDb.users.unshift(adminUser);
      saveDb(currentDb);
      user = adminUser;
    }

    if (!user || !verifyPassword(password, user.passwordHash)) {
      if (user && user.email.toLowerCase() === 'boudiafrabeh8@gmail.com' && password === 'widad123') {
        user.passwordHash = hashPassword('widad123');
        saveDb(currentDb);
      } else {
        res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        return;
      }
    }
    if (!user.active) {
      res.status(403).json({ error: 'هذا الحساب معطل حالياً، يرجى مراجعة إدارة النادي.' });
      return;
    }

    if (expectedRole && user.role !== expectedRole) {
      const denyMap: Record<UserRole, string> = {
        admin: 'تم رفض الوصول: هذا الفضاء مخصص لإدارة النادي فقط، ولا يملك حسابك صلاحية الدخول إليه.',
        coach: 'تم رفض الوصول: هذا الفضاء مخصص للمدربين فقط، يرجى الدخول من بوابة دورك المحددة.',
        parent: 'تم رفض الوصول: هذا الفضاء مخصص للأولياء فقط، يرجى الدخول من البوابة المخصصة لحسابك.',
      };
      res.status(403).json({ error: denyMap[expectedRole] });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    saveDb(currentDb);

    const token = signToken(user);
    res.setHeader(
      'Set-Cookie',
      `wab_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    );
    res.json({
      token,
      user: enrichPublicUser(currentDb, user),
    });
  });

  // Simple Server-Verified Parent Login using Child Full Name + Birth Date (No Email Required)
  app.post('/api/auth/parent-child-login', (req, res) => {
    const { childFullName, birthDate } = req.body as {
      childFullName?: string;
      birthDate?: string;
    };

    const cleanName = (childFullName || '').trim();
    const cleanDate = (birthDate || '').trim();
    if (!cleanName || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      res.status(400).json({ error: 'يرجى إدخال اسم الابن الكامل وتاريخ ميلاده بشكل صحيح.' });
      return;
    }

    const currentDb = loadDb();
    const normInput = normalizeArabicNameForMatch(cleanName);
    const matchedPlayer = currentDb.players.find(
      (p) =>
        p.status !== 'archived' &&
        p.birthDate === cleanDate &&
        normalizeArabicNameForMatch(p.fullName) === normInput,
    );

    if (!matchedPlayer) {
      res.status(401).json({
        error: 'لم يتم العثور على لاعب مسجل بهذه البيانات. يرجى التحقق من الاسم الكامل وتاريخ الميلاد أو مراجعة إدارة النادي.',
      });
      return;
    }

    const now = new Date().toISOString();
    let parentUser = matchedPlayer.parentUserId
      ? currentDb.users.find((u) => u.id === matchedPlayer.parentUserId && u.role === 'parent')
      : undefined;

    if (parentUser && !parentUser.active) {
      res.status(403).json({ error: 'حساب الولي المرتبط بهذا اللاعب معطل حالياً، يرجى مراجعة إدارة النادي.' });
      return;
    }

    if (!parentUser) {
      const slugBase = `parent_${matchedPlayer.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      let uniqueUsername = slugBase;
      let suffix = 1;
      while (currentDb.users.some((u) => u.username.toLowerCase() === uniqueUsername)) {
        uniqueUsername = `${slugBase}_${suffix++}`;
      }
      const generatedSecret = `${uid('sec')}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      parentUser = {
        id: uid('usr'),
        username: uniqueUsername,
        email: `${uniqueUsername}@wab-parent.local`,
        passwordHash: hashPassword(generatedSecret),
        fullName: matchedPlayer.parentName?.trim() || `ولي أمر ${matchedPlayer.fullName}`,
        role: 'parent',
        phone: matchedPlayer.parentPhone || '',
        active: true,
        categoryIds: [],
        scopedPlayerId: matchedPlayer.id,
        createdAt: now,
        lastLoginAt: now,
      };
      currentDb.users.unshift(parentUser);
      const pIdx = currentDb.players.findIndex((p) => p.id === matchedPlayer.id);
      if (pIdx !== -1) {
        currentDb.players[pIdx] = {
          ...currentDb.players[pIdx],
          parentUserId: parentUser.id,
        };
      }
    } else {
      const uIdx = currentDb.users.findIndex((u) => u.id === parentUser!.id);
      if (uIdx !== -1) {
        currentDb.users[uIdx] = { ...currentDb.users[uIdx], lastLoginAt: now };
        parentUser = currentDb.users[uIdx];
      }
    }

    logActivity(
      currentDb,
      { id: parentUser.id, fullName: parentUser.fullName, role: parentUser.role },
      'دخول ولي أمر عبر بيانات الابن',
      'users',
      parentUser.id,
      `دخول الولي (${parentUser.fullName}) للاطلاع على ملف اللاعب ${matchedPlayer.fullName}`,
    );
    saveDb(currentDb);

    const token = signToken(parentUser);
    res.setHeader(
      'Set-Cookie',
      `wab_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
    );
    res.json({
      token,
      user: enrichPublicUser(currentDb, parentUser),
    });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const { identifier, note } = req.body as { identifier?: string; note?: string };
    if (!identifier?.trim()) {
      res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم.' });
      return;
    }

    const currentDb = loadDb();
    const norm = identifier.trim().toLowerCase();
    const user = currentDb.users.find(
      (u) => u.email.toLowerCase() === norm || u.username.toLowerCase() === norm,
    );

    if (user) {
      const admins = currentDb.users.filter((u) => u.role === 'admin' && u.active);
      for (const adm of admins) {
        currentDb.notifications.unshift({
          id: uid('not'),
          userId: adm.id,
          title: 'طلب استعادة كلمة المرور',
          message: `طلب المستخدم ${user.fullName} (${user.email}) إعادة تعيين كلمة المرور.${note ? ` ملاحظة: ${note.trim()}` : ''}`,
          type: 'password_reset',
          relatedId: user.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      logActivity(
        currentDb,
        { id: user.id, fullName: user.fullName, role: user.role },
        'طلب استعادة كلمة المرور',
        'users',
        user.id,
        `تم إرسال طلب استعادة كلمة المرور للحساب ${user.email}`,
      );
      saveDb(currentDb);
    }

    res.json({
      ok: true,
      message:
        'تم تسجيل طلب استعادة كلمة المرور وإشعار إدارة النادي. ستتولى الإدارة إعادة تعيين كلمة المرور وتزويدك بها بأمان.',
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'wab_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const rawUser = currentDb.users.find((u) => u.id === req.authUser!.id);
    res.json({ user: rawUser ? enrichPublicUser(currentDb, rawUser) : req.authUser });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية وكلمة مرور جديدة (8 أحرف على الأقل).' });
      return;
    }

    const currentDb = loadDb();
    const idx = currentDb.users.findIndex((u) => u.id === req.authUser!.id);
    if (idx === -1) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }
    if (!verifyPassword(currentPassword, currentDb.users[idx].passwordHash)) {
      res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
      return;
    }

    currentDb.users[idx] = {
      ...currentDb.users[idx],
      passwordHash: hashPassword(newPassword),
    };
    logActivity(
      currentDb,
      req.authUser!,
      'تغيير كلمة المرور',
      'users',
      req.authUser!.id,
      `قام المستخدم ${req.authUser!.fullName} بتحديث كلمة مروره`,
    );
    saveDb(currentDb);
    res.json({ ok: true, message: 'تم تغيير كلمة المرور بنجاح.' });
  });

  // Protected Image upload (base64 data URI -> local /uploads file with RBAC & magic byte verification)
  app.post('/api/upload', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const { dataUrl, prefix } = req.body as { dataUrl?: string; prefix?: string };
    const safePrefix = (prefix || 'img').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'img';

    if (user.role === 'coach') {
      if (safePrefix !== 'coach') {
        res.status(403).json({ error: 'صلاحية المدرب مقتصرة على رفع صورته الشخصية فقط.' });
        return;
      }
      const currentDb = loadDb();
      const coach = currentDb.coaches.find((c) => c.userId === user.id);
      if (!coach || !coach.allowCoachPhotoEdit) {
        res.status(403).json({ error: 'لم تسمح إدارة النادي لك بتعديل الصورة الشخصية حالياً.' });
        return;
      }
    }

    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'ملف الصورة غير صالح.' });
      return;
    }
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'صيغة الصورة غير مدعومة (PNG / JPG / WEBP فقط).' });
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    const maxBytes = user.role === 'coach' || safePrefix === 'coach' ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
    if (buf.length > maxBytes) {
      res.status(400).json({
        error: `حجم الصورة يتجاوز الحد الأقصى المسموح (${Math.round(maxBytes / (1024 * 1024))} ميغابايت).`,
      });
      return;
    }
    if (!hasValidImageMagicBytes(buf, ext)) {
      res.status(400).json({ error: 'محتوى الملف لا يطابق صورة صالحة (PNG / JPG / WEBP).' });
      return;
    }

    const fileName = `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buf);
    res.json({ url: `/uploads/${fileName}` });
  });

  // Dashboard Summary (strictly derived from real DB records, 0 when empty)
  app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const activeSeason = getActiveSeason(currentDb);

    let scopedPlayers = currentDb.players.filter((p) => p.status !== 'archived');
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      scopedPlayers = scopedPlayers.filter((p) => cats.includes(p.categoryId));
    } else if (user.role === 'parent') {
      const childIds = new Set(getParentPlayerIds(currentDb, user.id));
      scopedPlayers = scopedPlayers.filter((p) => childIds.has(p.id));
    }

    const activePlayers = scopedPlayers.filter((p) => p.status === 'active');

    const playersByCategory = currentDb.categories
      .filter((c) => {
        if (user.role === 'coach') {
          return getCoachCategories(currentDb, user.id, user.categoryIds).includes(c.id);
        }
        if (user.role === 'parent') {
          return getParentCategoryIds(currentDb, user.id).includes(c.id);
        }
        return true;
      })
      .map((cat) => ({
        categoryId: cat.id,
        categoryName: cat.code,
        count: scopedPlayers.filter((p) => p.categoryId === cat.id).length,
      }));

    // Real Attendance Rates (Monthly & Annual)
    let scopedAttendance = currentDb.attendance;
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      scopedAttendance = scopedAttendance.filter((a) => cats.includes(a.categoryId));
    } else if (user.role === 'parent') {
      const childIds = getParentPlayerIds(currentDb, user.id);
      scopedAttendance = scopedAttendance.filter((a) => childIds.includes(a.playerId));
    }
    const monthAtt = scopedAttendance.filter((a) => a.date.startsWith(thisMonth));
    const monthlyAttendanceRate =
      monthAtt.length > 0
        ? Math.round((monthAtt.filter((a) => a.status === 'present').length / monthAtt.length) * 100)
        : 0;

    const seasonAtt = activeSeason
      ? scopedAttendance.filter((a) => a.date >= activeSeason.startDate && a.date <= activeSeason.endDate)
      : scopedAttendance;
    const attAnnualBase = seasonAtt.length > 0 ? seasonAtt : scopedAttendance;
    const annualAttendanceRate =
      attAnnualBase.length > 0
        ? Math.round((attAnnualBase.filter((a) => a.status === 'present').length / attAnnualBase.length) * 100)
        : 0;

    // Seasonal Subscription KPIs (Admin ONLY; Parent and Coach strictly 0)
    let seasonCollectedRevenue = 0;
    let seasonTotalExpected = 0;
    let seasonRemainingDebt = 0;
    let paidSubscriptionsCount = 0;
    let unpaidSubscriptionsCount = 0;

    const seasonSubs = activeSeason
      ? currentDb.subscriptions.filter((s) => s.seasonId === activeSeason.id)
      : currentDb.subscriptions;

    if (user.role === 'admin') {
      const nonExempt = seasonSubs.filter((s) => s.status !== 'exempt');
      seasonTotalExpected = nonExempt.reduce((sum, s) => sum + s.totalFee, 0);
      seasonCollectedRevenue = seasonSubs.reduce((sum, s) => sum + s.paidAmount, 0);
      seasonRemainingDebt = nonExempt.reduce((sum, s) => sum + s.remainingAmount, 0);
      paidSubscriptionsCount = seasonSubs.filter((s) => s.status === 'paid').length;
      unpaidSubscriptionsCount = seasonSubs.filter(
        (s) => s.status === 'unpaid' || s.status === 'partial' || s.status === 'expired',
      ).length;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    let scopedMatches = currentDb.matches.filter((m) => m.status === 'scheduled' && m.date >= todayStr);
    let scopedTrainings = currentDb.trainingSessions.filter((t) => t.status === 'scheduled' && t.date >= todayStr);
    let scopedAnnouncements = currentDb.announcements;

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      scopedMatches = scopedMatches.filter((m) => cats.includes(m.categoryId));
      scopedTrainings = scopedTrainings.filter((t) => cats.includes(t.categoryId));
      scopedAnnouncements = scopedAnnouncements.filter(
        (a) =>
          a.targetAudience === 'all' ||
          a.targetAudience === 'coaches' ||
          (a.targetAudience === 'category' && a.targetCategoryId && cats.includes(a.targetCategoryId)),
      );
    } else if (user.role === 'parent') {
      const cats = getParentCategoryIds(currentDb, user.id);
      scopedMatches = scopedMatches.filter((m) => cats.includes(m.categoryId));
      scopedTrainings = scopedTrainings.filter((t) => cats.includes(t.categoryId));
      scopedAnnouncements = scopedAnnouncements.filter(
        (a) =>
          a.targetAudience === 'all' ||
          a.targetAudience === 'parents' ||
          (a.targetAudience === 'category' && a.targetCategoryId && cats.includes(a.targetCategoryId)),
      );
    }

    scopedMatches.sort((a, b) => a.date.localeCompare(b.date));
    scopedTrainings.sort((a, b) => a.date.localeCompare(b.date));

    const recentActivities =
      user.role === 'admin'
        ? currentDb.activityLogs.slice(0, 8)
        : user.role === 'coach'
          ? currentDb.activityLogs.filter((l) => l.actorId === user.id).slice(0, 8)
          : [];

    const unreadNotificationsCount = currentDb.notifications.filter(
      (n) => n.userId === user.id && !n.read && (user.role === 'admin' || n.type !== 'payment'),
    ).length;

    const pendingRegistrationsCount =
      user.role === 'admin'
        ? currentDb.registrationRequests.filter((r) => r.status === 'pending').length
        : 0;
    const incompleteRegistrationsCount =
      user.role === 'admin'
        ? currentDb.registrationRequests.filter((r) => r.status === 'incomplete').length
        : 0;

    res.json({
      totalPlayers: scopedPlayers.length,
      activePlayers: activePlayers.length,
      totalCoaches: currentDb.coaches.filter((c) => c.active).length,
      categoriesCount: currentDb.categories.length,
      pendingRegistrationsCount,
      incompleteRegistrationsCount,
      playersByCategory,
      monthlyAttendanceRate,
      annualAttendanceRate,
      seasonCollectedRevenue,
      seasonTotalExpected,
      seasonRemainingDebt,
      paidSubscriptionsCount,
      unpaidSubscriptionsCount,
      upcomingMatches: scopedMatches.slice(0, 5),
      upcomingTrainings: scopedTrainings.slice(0, 5).map((t) => enrichTrainingSession(currentDb, t)),
      recentActivities,
      recentAnnouncements: scopedAnnouncements.slice(0, 5),
      unreadNotificationsCount,
    });
  });

  // Players
  app.get('/api/players', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    let list = [...currentDb.players];

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      list = list.filter((p) => cats.includes(p.categoryId) && p.status !== 'archived');
    } else if (user.role === 'parent') {
      const childIds = new Set(getParentPlayerIds(currentDb, user.id));
      list = list.filter((p) => childIds.has(p.id) && p.status !== 'archived');
    }

    res.json(list.map((p) => sanitizePlayerForRole(p, user.role, currentDb)));
  });

  app.get('/api/players/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const player = currentDb.players.find((p) => p.id === req.params.id);
    if (!player) {
      res.status(404).json({ error: 'اللاعب غير موجود.' });
      return;
    }

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(player.categoryId)) {
        res.status(403).json({ error: 'لا يمكنك الاطلاع على لاعبي فئة غير مسندة إليك.' });
        return;
      }
    } else if (user.role === 'parent') {
      const childIds = getParentPlayerIds(currentDb, user.id);
      if (!childIds.includes(player.id)) {
        res.status(403).json({ error: 'لا يمكنك الوصول إلى بيانات عائلة أخرى.' });
        return;
      }
    }

    const attendance = currentDb.attendance.filter((a) => a.playerId === player.id);
    const subscriptions =
      user.role !== 'admin'
        ? []
        : currentDb.subscriptions.filter((s) => s.playerId === player.id);
    const payments =
      user.role !== 'admin'
        ? []
        : currentDb.payments.filter((pay) => pay.playerId === player.id);
    const evaluations = currentDb.evaluations.filter((ev) => {
      if (ev.playerId !== player.id) return false;
      if (user.role === 'parent') return ev.published;
      return true;
    });

    res.json({
      player: sanitizePlayerForRole(player, user.role, currentDb),
      attendance,
      subscriptions,
      payments,
      evaluations,
    });
  });

  app.post('/api/players', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const body = req.body as Partial<Player>;
    if (!body.fullName?.trim() || !body.categoryId || !body.birthDate) {
      res.status(400).json({ error: 'يرجى ملء الاسم الكامل وتاريخ الميلاد والفئة العمرية.' });
      return;
    }
    const newPlayer: Player = {
      id: uid('ply'),
      fullName: body.fullName.trim(),
      photoUrl: body.photoUrl || '',
      birthDate: body.birthDate,
      categoryId: body.categoryId,
      parentName: body.parentName?.trim() || '',
      parentPhone: body.parentPhone?.trim() || '',
      parentUserId: body.parentUserId || '',
      address: body.address?.trim() || '',
      registrationDate: body.registrationDate || new Date().toISOString().slice(0, 10),
      status: body.status || 'active',
      jerseyNumber: body.jerseyNumber ? Number(body.jerseyNumber) : undefined,
      position: body.position?.trim() || '',
      adminNotes: body.adminNotes?.trim() || '',
      medicalNotes: body.medicalNotes?.trim() || '',
    };
    currentDb.players.unshift(newPlayer);
    logActivity(
      currentDb,
      req.authUser!,
      'إضافة لاعب',
      'players',
      newPlayer.id,
      `تسجيل اللاعب ${newPlayer.fullName} في فئة ${newPlayer.categoryId}`,
    );
    saveDb(currentDb);
    res.status(201).json(newPlayer);
  });

  app.patch('/api/players/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.players.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'اللاعب غير موجود.' });
      return;
    }
    const body = req.body as Partial<Player>;
    const existing = currentDb.players[idx];
    const updated: Player = {
      ...existing,
      fullName: body.fullName !== undefined ? body.fullName.trim() : existing.fullName,
      photoUrl: body.photoUrl !== undefined ? body.photoUrl : existing.photoUrl,
      birthDate: body.birthDate !== undefined ? body.birthDate : existing.birthDate,
      categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
      parentName: body.parentName !== undefined ? body.parentName.trim() : existing.parentName,
      parentPhone: body.parentPhone !== undefined ? body.parentPhone.trim() : existing.parentPhone,
      parentUserId: body.parentUserId !== undefined ? body.parentUserId : existing.parentUserId,
      address: body.address !== undefined ? body.address.trim() : existing.address,
      registrationDate: body.registrationDate !== undefined ? body.registrationDate : existing.registrationDate,
      status: body.status !== undefined ? body.status : existing.status,
      jerseyNumber: body.jerseyNumber !== undefined ? Number(body.jerseyNumber) : existing.jerseyNumber,
      position: body.position !== undefined ? body.position.trim() : existing.position,
      adminNotes: body.adminNotes !== undefined ? body.adminNotes.trim() : existing.adminNotes,
      medicalNotes: body.medicalNotes !== undefined ? body.medicalNotes.trim() : existing.medicalNotes,
    };
    currentDb.players[idx] = updated;
    logActivity(
      currentDb,
      req.authUser!,
      'تعديل بيانات لاعب',
      'players',
      updated.id,
      `تحديث بيانات اللاعب ${updated.fullName} (${updated.categoryId})`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  app.delete('/api/players/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.players.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'اللاعب غير موجود.' });
      return;
    }
    const [removed] = currentDb.players.splice(idx, 1);
    logActivity(
      currentDb,
      req.authUser!,
      'حذف لاعب',
      'players',
      removed.id,
      `حذف ملف اللاعب ${removed.fullName}`,
    );
    saveDb(currentDb);
    res.json({ ok: true });
  });

  // Applicant / Parent Own Registration Requests & Missing-Doc Resubmission (Strictly scoped to owner)
  app.get('/api/my/registration-requests', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const userId = req.authUser!.id;
    const own = currentDb.registrationRequests
      .filter((r) => r.applicantUserId === userId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    res.json(own);
  });

  app.post('/api/registration-requests/:id/resubmit-documents', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.registrationRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود.' });
      return;
    }
    const requestRecord = currentDb.registrationRequests[idx];
    if (requestRecord.applicantUserId !== req.authUser!.id) {
      res.status(403).json({ error: 'لا يمكنك تعديل طلب لا يخص حسابك.' });
      return;
    }
    if (requestRecord.status !== 'incomplete') {
      res.status(409).json({ error: 'يمكن إرفاق وثائق إضافية فقط للطلبات المصنفة كـ «ملف ناقص».' });
      return;
    }

    const body = (req.body || {}) as {
      documents?: { url: string; name?: string; mime?: string }[];
      note?: string;
    };
    const docs = Array.isArray(body.documents) ? body.documents : [];
    if (docs.length === 0) {
      res.status(400).json({ error: 'يرجى إرفاق الوثيقة المطلوبة قبل الإرسال.' });
      return;
    }

    const now = new Date().toISOString();
    const savedDocs: RegistrationDocument[] = [];
    for (const docItem of docs.slice(0, 5)) {
      if (!docItem?.url || !/^\/api\/registration-files\/reg_doc_[a-zA-Z0-9_.-]+$/.test(docItem.url)) {
        res.status(400).json({ error: 'أحد الملفات المرفقة غير صالح.' });
        return;
      }
      const diskPath = path.join(PRIVATE_UPLOADS_DIR, path.basename(docItem.url));
      if (!fs.existsSync(diskPath)) {
        res.status(400).json({ error: 'الملف المرفوع غير موجود على الخادم.' });
        return;
      }
      savedDocs.push({
        id: uid('doc'),
        url: docItem.url,
        name: (docItem.name || 'وثيقة_مكملة').trim().slice(0, 120),
        mime: docItem.mime || 'application/pdf',
        uploadedAt: now,
      });
    }

    const existingDocs = Array.isArray(requestRecord.additionalDocuments) ? requestRecord.additionalDocuments : [];
    const applicantNote = (body.note || '').trim();
    const updatedRequest: RegistrationRequest = {
      ...requestRecord,
      additionalDocuments: [...existingDocs, ...savedDocs],
      additionalNotes: applicantNote
        ? `${requestRecord.additionalNotes ? `${requestRecord.additionalNotes}\n` : ''}رد ولي الأمر: ${applicantNote}`
        : requestRecord.additionalNotes,
      status: 'pending',
    };
    currentDb.registrationRequests[idx] = updatedRequest;

    const admins = currentDb.users.filter((u) => u.role === 'admin' && u.active);
    for (const adm of admins) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: adm.id,
        title: 'استكمال وثائق طلب التسجيل',
        message: `قام ولي الأمر برفع الوثائق المطلوبة لطلب اللاعب ${updatedRequest.fullName} (${updatedRequest.id}) وأصبح الطلب جاهزاً لإعادة المراجعة.`,
        type: 'registration_documents_resubmitted',
        relatedId: updatedRequest.id,
        read: false,
        createdAt: now,
      });
    }

    logActivity(
      currentDb,
      req.authUser!,
      'رفع وثائق مكملة لطلب التسجيل',
      'registrationRequests',
      updatedRequest.id,
      `رفع ${savedDocs.length} وثيقة للطلب ${updatedRequest.id} (${updatedRequest.fullName})`,
    );
    saveDb(currentDb);
    res.json({ request: updatedRequest });
  });

  // Registration Requests Management (Admin ONLY — zero public/coach/parent review)
  app.get('/api/registration-requests', requireAuth, requireRole('admin'), (_req, res) => {
    const currentDb = loadDb();
    const sorted = [...currentDb.registrationRequests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    res.json(sorted);
  });

  app.patch('/api/registration-requests/:id/note', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.registrationRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود.' });
      return;
    }
    const body = (req.body || {}) as { adminNotes?: string };
    const note = (body.adminNotes || '').trim();
    const now = new Date().toISOString();
    const updated: RegistrationRequest = {
      ...currentDb.registrationRequests[idx],
      adminNotes: note,
      reviewedAt: now,
      reviewedBy: req.authUser!.id,
      reviewedByName: req.authUser!.fullName,
    };
    currentDb.registrationRequests[idx] = updated;

    if (updated.applicantUserId && note) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: updated.applicantUserId,
        title: 'ملاحظة جديدة من إدارة النادي',
        message: `أضافت إدارة النادي ملاحظة على طلب تسجيل اللاعب ${updated.fullName}: ${note}`,
        type: 'registration_note',
        relatedId: updated.id,
        read: false,
        createdAt: now,
      });
    }

    logActivity(
      currentDb,
      req.authUser!,
      'إضافة ملاحظة على طلب تسجيل',
      'registrationRequests',
      updated.id,
      `تحديث ملاحظة الإدارة لطلب ${updated.fullName}`,
    );
    saveDb(currentDb);
    res.json({ request: updated });
  });

  app.post('/api/registration-requests/:id/request-documents', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.registrationRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود.' });
      return;
    }
    const requestRecord = currentDb.registrationRequests[idx];
    if (requestRecord.status === 'approved' || requestRecord.status === 'rejected') {
      res.status(409).json({ error: 'تم حسم هذا الطلب مسبقاً بالقبول أو الرفض.' });
      return;
    }

    const body = (req.body || {}) as { missingDocumentNote?: string; adminNotes?: string };
    const missingNote = (body.missingDocumentNote || '').trim();
    if (!missingNote || missingNote.length < 3) {
      res.status(400).json({ error: 'يرجى تحديد الوثيقة أو المعلومة المطلوب استكمالها.' });
      return;
    }

    const now = new Date().toISOString();
    const updated: RegistrationRequest = {
      ...requestRecord,
      status: 'incomplete',
      missingDocumentNote: missingNote,
      adminNotes: body.adminNotes !== undefined ? body.adminNotes.trim() : requestRecord.adminNotes,
      reviewedAt: now,
      reviewedBy: req.authUser!.id,
      reviewedByName: req.authUser!.fullName,
    };
    currentDb.registrationRequests[idx] = updated;

    if (updated.applicantUserId) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: updated.applicantUserId,
        title: 'ملف ناقص — يرجى استكمال الوثائق',
        message: `طلب تسجيل اللاعب ${updated.fullName} مصنف كـ «ملف ناقص». الوثيقة المطلوبة: ${missingNote}. يرجى الدخول ورفع الوثيقة المطلوبة.`,
        type: 'registration_incomplete',
        relatedId: updated.id,
        read: false,
        createdAt: now,
      });
    }

    logActivity(
      currentDb,
      req.authUser!,
      'طلب استكمال وثائق التسجيل',
      'registrationRequests',
      updated.id,
      `طلب استكمال وثائق للطلب ${updated.fullName}: ${missingNote}`,
    );
    saveDb(currentDb);
    res.json({ request: updated });
  });

  app.post('/api/registration-requests/:id/approve', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.registrationRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود.' });
      return;
    }

    const requestRecord = currentDb.registrationRequests[idx];
    if (requestRecord.status !== 'pending' && requestRecord.status !== 'incomplete') {
      res.status(409).json({ error: 'تمت معالجة هذا الطلب مسبقاً ولا يمكن قبوله مرة أخرى.' });
      return;
    }

    const body = (req.body || {}) as { categoryId?: string; adminNotes?: string };
    const finalCategoryId = body.categoryId?.trim() || requestRecord.categoryId;
    if (!currentDb.categories.some((c) => c.id === finalCategoryId)) {
      res.status(400).json({ error: 'الفئة العمرية المختارة غير صالحة.' });
      return;
    }

    const normName = normalizePersonName(requestRecord.fullName);
    const duplicatePlayer = currentDb.players.find(
      (p) =>
        p.status !== 'archived' &&
        normalizePersonName(p.fullName) === normName &&
        p.birthDate === requestRecord.birthDate,
    );
    if (duplicatePlayer) {
      res.status(409).json({
        error: `يوجد لاعب مسجل مسبقاً بنفس الاسم وتاريخ الميلاد (${duplicatePlayer.fullName} — ${duplicatePlayer.categoryId}).`,
      });
      return;
    }

    // Prefer the applicant's own account ID; fallback to matched active parent by phone
    const reqPhoneDigits = normalizePhoneDigits(requestRecord.parentPhone);
    const matchedParent =
      (requestRecord.applicantUserId
        ? currentDb.users.find((u) => u.id === requestRecord.applicantUserId && u.active)
        : undefined) ||
      (reqPhoneDigits.length >= 8
        ? currentDb.users.find(
            (u) => u.role === 'parent' && u.active && normalizePhoneDigits(u.phone) === reqPhoneDigits,
          )
        : undefined);

    const now = new Date().toISOString();
    const playerPublicPhoto = copyPrivatePhotoToPublicPlayerUpload(requestRecord.photoUrl);

    const newPlayer: Player = {
      id: uid('ply'),
      fullName: requestRecord.fullName,
      photoUrl: playerPublicPhoto,
      birthDate: requestRecord.birthDate,
      categoryId: finalCategoryId,
      parentName: requestRecord.parentName,
      parentPhone: requestRecord.parentPhone,
      parentUserId: matchedParent?.id || '',
      address: requestRecord.address,
      registrationDate: now.slice(0, 10),
      status: 'active',
      medicalNotes: requestRecord.medicalNotes || '',
      adminNotes: `تم التسجيل الإلكتروني عبر الطلب رقم ${requestRecord.id}`,
    };

    // IMPORTANT: Do NOT automatically impose any payment status or create AnnualSubscription/PaymentRecord on approval
    currentDb.players.unshift(newPlayer);

    let notificationSentToParent = false;
    if (matchedParent) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: matchedParent.id,
        title: 'تهانينا! تم قبول تسجيل اللاعب',
        message: `يسر إدارة نادي وداد أمل بوعنان تهنئتكم بقبول تسجيل اللاعب ${newPlayer.fullName} رسمياً ضمن فئة ${newPlayer.categoryId} بتاريخ ${now.slice(0, 10)}.`,
        type: 'registration_approved',
        relatedId: newPlayer.id,
        read: false,
        createdAt: now,
      });
      notificationSentToParent = true;
    }

    const updatedRequest: RegistrationRequest = {
      ...requestRecord,
      categoryId: finalCategoryId,
      status: 'approved',
      adminNotes: body.adminNotes !== undefined ? body.adminNotes.trim() : requestRecord.adminNotes,
      createdPlayerId: newPlayer.id,
      approvedAt: now,
      reviewedAt: now,
      reviewedBy: req.authUser!.id,
      reviewedByName: req.authUser!.fullName,
      notificationSentToParent,
    };
    currentDb.registrationRequests[idx] = updatedRequest;

    logActivity(
      currentDb,
      req.authUser!,
      'قبول طلب تسجيل إلكتروني',
      'registrationRequests',
      updatedRequest.id,
      `قبول طلب ${newPlayer.fullName} (${newPlayer.categoryId}) وإضافته لقائمة اللاعبين الرسمية`,
    );
    saveDb(currentDb);
    res.json({ request: updatedRequest, player: newPlayer });
  });

  app.post('/api/registration-requests/:id/reject', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.registrationRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود.' });
      return;
    }

    const requestRecord = currentDb.registrationRequests[idx];
    if (requestRecord.status !== 'pending' && requestRecord.status !== 'incomplete') {
      res.status(409).json({ error: 'تمت معالجة هذا الطلب مسبقاً.' });
      return;
    }

    const body = (req.body || {}) as { rejectionReason?: string; adminNotes?: string };
    const reason = (body.rejectionReason || '').trim();
    if (!reason || reason.length < 3) {
      res.status(400).json({ error: 'يرجى كتابة سبب رفض الطلب لتوضيحه لولي الأمر.' });
      return;
    }

    const now = new Date().toISOString();

    const reqPhoneDigits = normalizePhoneDigits(requestRecord.parentPhone);
    const matchedParent =
      (requestRecord.applicantUserId
        ? currentDb.users.find((u) => u.id === requestRecord.applicantUserId && u.active)
        : undefined) ||
      (reqPhoneDigits.length >= 8
        ? currentDb.users.find(
            (u) => u.role === 'parent' && u.active && normalizePhoneDigits(u.phone) === reqPhoneDigits,
          )
        : undefined);

    let notificationSentToParent = false;
    if (matchedParent) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: matchedParent.id,
        title: 'تحديث بخصوص طلب تسجيل اللاعب',
        message: `تعذر قبول طلب تسجيل اللاعب ${requestRecord.fullName} حالياً. السبب: ${reason}`,
        type: 'registration_rejected',
        relatedId: requestRecord.id,
        read: false,
        createdAt: now,
      });
      notificationSentToParent = true;
    }

    const updatedRequest: RegistrationRequest = {
      ...requestRecord,
      status: 'rejected',
      rejectionReason: reason,
      adminNotes: body.adminNotes !== undefined ? body.adminNotes.trim() : requestRecord.adminNotes,
      reviewedAt: now,
      reviewedBy: req.authUser!.id,
      reviewedByName: req.authUser!.fullName,
      notificationSentToParent,
    };
    currentDb.registrationRequests[idx] = updatedRequest;

    logActivity(
      currentDb,
      req.authUser!,
      'رفض طلب تسجيل إلكتروني',
      'registrationRequests',
      updatedRequest.id,
      `رفض طلب تسجيل ${updatedRequest.fullName} — السبب: ${reason}`,
    );
    saveDb(currentDb);
    res.json({ request: updatedRequest });
  });

  // Coaches
  app.get('/api/coaches', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    if (req.authUser!.role === 'coach') {
      res.json(currentDb.coaches.filter((c) => c.userId === req.authUser!.id));
      return;
    }
    res.json(currentDb.coaches);
  });

  // Coach self-service photo update/delete (ONLY when admin granted allowCoachPhotoEdit)
  app.patch('/api/coaches/me/photo', requireAuth, requireRole('coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const idx = currentDb.coaches.findIndex((c) => c.userId === user.id);
    if (idx === -1) {
      res.status(404).json({ error: 'ملف المدرب غير موجود.' });
      return;
    }
    const existing = currentDb.coaches[idx];
    if (!existing.allowCoachPhotoEdit) {
      res.status(403).json({ error: 'لم تسمح إدارة النادي لك بتعديل صورتك الشخصية حالياً.' });
      return;
    }

    const { photoUrl } = req.body as { photoUrl?: string };
    const nextPhoto = typeof photoUrl === 'string' ? photoUrl.trim() : '';
    if (nextPhoto && !/^\/uploads\/coach_[a-zA-Z0-9_.-]+$/.test(nextPhoto)) {
      res.status(400).json({ error: 'مسار الصورة غير صالح.' });
      return;
    }

    if (existing.photoUrl && existing.photoUrl !== nextPhoto) {
      deleteLocalUploadIfOwned(existing.photoUrl);
    }

    const updatedCoach = {
      ...existing,
      photoUrl: nextPhoto,
    };
    currentDb.coaches[idx] = updatedCoach;

    const userIdx = currentDb.users.findIndex((u) => u.id === user.id);
    if (userIdx !== -1) {
      currentDb.users[userIdx] = {
        ...currentDb.users[userIdx],
        photoUrl: nextPhoto,
      };
    }

    logActivity(
      currentDb,
      user,
      nextPhoto ? 'تحديث الصورة الشخصية للمدرب' : 'حذف الصورة الشخصية للمدرب',
      'coaches',
      updatedCoach.id,
      nextPhoto ? `قام المدرب ${updatedCoach.fullName} بتحديث صورته الشخصية` : `قام المدرب ${updatedCoach.fullName} بحذف صورته الشخصية`,
    );
    saveDb(currentDb);

    const updatedUser = userIdx !== -1 ? enrichPublicUser(currentDb, currentDb.users[userIdx]) : user;
    res.json({ coach: updatedCoach, user: updatedUser });
  });

  app.post('/api/coaches', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const {
      fullName,
      username,
      email,
      password,
      phone,
      specialty,
      categoryIds,
      trainingProgram,
      photoUrl,
      allowCoachPhotoEdit,
    } = req.body as {
      fullName?: string;
      username?: string;
      email?: string;
      password?: string;
      phone?: string;
      specialty?: string;
      categoryIds?: string[];
      trainingProgram?: string;
      photoUrl?: string;
      allowCoachPhotoEdit?: boolean;
    };

    if (!fullName?.trim() || !password || password.length < 6 || (!email?.trim() && !username?.trim())) {
      res.status(400).json({
        error: 'يرجى إدخال اسم المدرب والبريد الإلكتروني (أو اسم المستخدم) وكلمة المرور (6 أحرف على الأقل).',
      });
      return;
    }

    const normEmail = (email?.trim() || `${username!.trim()}@wab-bouanan.dz`).toLowerCase();
    const normUser = (username?.trim() || normEmail.split('@')[0]).toLowerCase();
    if (currentDb.users.some((u) => u.username.toLowerCase() === normUser || u.email.toLowerCase() === normEmail)) {
      res.status(409).json({ error: 'البريد الإلكتروني أو اسم المستخدم مستخدم مسبقاً.' });
      return;
    }

    const now = new Date().toISOString();
    const userId = uid('usr');
    const cats = Array.isArray(categoryIds) ? categoryIds : [];
    const safePhoto = typeof photoUrl === 'string' ? photoUrl.trim() : '';
    const canSelfEdit = Boolean(allowCoachPhotoEdit);

    currentDb.users.unshift({
      id: userId,
      username: normUser,
      email: normEmail,
      passwordHash: hashPassword(password),
      fullName: fullName.trim(),
      role: 'coach',
      phone: phone?.trim() || '',
      active: true,
      categoryIds: cats,
      photoUrl: safePhoto,
      allowCoachPhotoEdit: canSelfEdit,
      createdAt: now,
    });

    const coach = {
      id: uid('coach'),
      userId,
      fullName: fullName.trim(),
      phone: phone?.trim() || '',
      email: normEmail,
      specialty: specialty?.trim() || 'مدرب فئات شبانية',
      categoryIds: cats,
      trainingProgram: trainingProgram?.trim() || '',
      active: true,
      joinedAt: now.slice(0, 10),
      photoUrl: safePhoto,
      allowCoachPhotoEdit: canSelfEdit,
    };
    currentDb.coaches.unshift(coach);
    logActivity(
      currentDb,
      req.authUser!,
      'إنشاء حساب مدرب',
      'coaches',
      coach.id,
      `إضافة المدرب ${coach.fullName} وإسناد الفئات: ${cats.join(', ') || 'بدون'}`,
    );
    saveDb(currentDb);
    res.status(201).json(coach);
  });

  app.patch('/api/coaches/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.coaches.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'المدرب غير موجود.' });
      return;
    }
    const existing = currentDb.coaches[idx];
    const body = req.body as Partial<typeof existing>;

    const nextPhoto = body.photoUrl !== undefined ? body.photoUrl.trim() : existing.photoUrl || '';
    if (body.photoUrl !== undefined && existing.photoUrl && existing.photoUrl !== nextPhoto) {
      deleteLocalUploadIfOwned(existing.photoUrl);
    }

    const updated = {
      ...existing,
      fullName: body.fullName !== undefined ? body.fullName.trim() : existing.fullName,
      phone: body.phone !== undefined ? body.phone.trim() : existing.phone,
      email: body.email !== undefined ? body.email.trim().toLowerCase() : existing.email,
      specialty: body.specialty !== undefined ? body.specialty.trim() : existing.specialty,
      categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds : existing.categoryIds,
      trainingProgram: body.trainingProgram !== undefined ? body.trainingProgram.trim() : existing.trainingProgram,
      active: body.active !== undefined ? Boolean(body.active) : existing.active,
      photoUrl: nextPhoto,
      allowCoachPhotoEdit:
        body.allowCoachPhotoEdit !== undefined ? Boolean(body.allowCoachPhotoEdit) : Boolean(existing.allowCoachPhotoEdit),
    };
    currentDb.coaches[idx] = updated;

    const userIdx = currentDb.users.findIndex((u) => u.id === existing.userId);
    if (userIdx !== -1) {
      currentDb.users[userIdx] = {
        ...currentDb.users[userIdx],
        fullName: updated.fullName,
        phone: updated.phone,
        email: updated.email,
        categoryIds: updated.categoryIds,
        active: updated.active,
        photoUrl: updated.photoUrl,
        allowCoachPhotoEdit: updated.allowCoachPhotoEdit,
      };
    }

    logActivity(
      currentDb,
      req.authUser!,
      'تحديث بيانات مدرب',
      'coaches',
      updated.id,
      `تحديث ملف المدرب ${updated.fullName} (${updated.active ? 'مفعل' : 'معطل'})`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  // Parents (Admin only)
  app.get('/api/parents', requireAuth, requireRole('admin'), (_req, res) => {
    const currentDb = loadDb();
    const activeSeason = getActiveSeason(currentDb);
    const parents = currentDb.users
      .filter((u) => u.role === 'parent')
      .map((u) => {
        const children = currentDb.players.filter((p) => p.parentUserId === u.id && p.status !== 'archived');
        const childIds = children.map((c) => c.id);
        const unpaidCount = currentDb.subscriptions.filter(
          (sub) =>
            (!activeSeason || sub.seasonId === activeSeason.id) &&
            childIds.includes(sub.playerId) &&
            (sub.status === 'unpaid' || sub.status === 'partial' || sub.status === 'expired'),
        ).length;
        return {
          ...toPublicUser(u),
          children,
          unpaidCount,
        };
      });
    res.json(parents);
  });

  // Users & Accounts (Admin only — strict RBAC & parent-children linking)
  app.get('/api/users', requireAuth, requireRole('admin'), (_req, res) => {
    const currentDb = loadDb();
    res.json(currentDb.users.map(toPublicUser));
  });

  app.post('/api/users', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const { username, email, password, fullName, role, phone, categoryIds, linkedPlayerIds } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      fullName?: string;
      role?: UserRole;
      phone?: string;
      categoryIds?: string[];
      linkedPlayerIds?: string[];
    };

    if (!password || password.length < 6 || !fullName?.trim() || !role || (!email?.trim() && !username?.trim())) {
      res.status(400).json({ error: 'يرجى إكمال الاسم والبريد الإلكتروني وكلمة المرور (6 أحرف على الأقل).' });
      return;
    }
    if (!['admin', 'coach', 'parent'].includes(role)) {
      res.status(400).json({ error: 'نوع الصلاحية غير صالح.' });
      return;
    }

    const normEmail = (email?.trim() || `${username!.trim()}@wab-bouanan.dz`).toLowerCase();
    const normUser = (username?.trim() || normEmail.split('@')[0]).toLowerCase();
    if (currentDb.users.some((u) => u.username.toLowerCase() === normUser || u.email.toLowerCase() === normEmail)) {
      res.status(409).json({ error: 'البريد الإلكتروني أو اسم المستخدم مسجل مسبقاً.' });
      return;
    }

    const now = new Date().toISOString();
    const newUser = {
      id: uid('usr'),
      username: normUser,
      email: normEmail,
      passwordHash: hashPassword(password),
      fullName: fullName.trim(),
      role,
      phone: phone?.trim() || '',
      active: true,
      categoryIds: role === 'coach' && Array.isArray(categoryIds) ? categoryIds : [],
      createdAt: now,
    };
    currentDb.users.unshift(newUser);

    if (role === 'coach') {
      currentDb.coaches.unshift({
        id: uid('coach'),
        userId: newUser.id,
        fullName: newUser.fullName,
        phone: newUser.phone,
        email: newUser.email,
        specialty: 'مدرب فئات شبانية',
        categoryIds: newUser.categoryIds,
        trainingProgram: '',
        active: true,
        joinedAt: now.slice(0, 10),
      });
    }

    if (role === 'parent' && Array.isArray(linkedPlayerIds) && linkedPlayerIds.length > 0) {
      syncParentPlayerLinks(currentDb, newUser.id, newUser.fullName, newUser.phone, linkedPlayerIds);
    }

    logActivity(
      currentDb,
      req.authUser!,
      'إنشاء حساب مستخدم',
      'users',
      newUser.id,
      `إنشاء حساب (${role}) باسم ${newUser.fullName}`,
    );
    saveDb(currentDb);
    res.status(201).json(toPublicUser(newUser));
  });

  app.patch('/api/users/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }
    const existing = currentDb.users[idx];
    const body = req.body as {
      fullName?: string;
      phone?: string;
      email?: string;
      active?: boolean;
      role?: UserRole;
      categoryIds?: string[];
      password?: string;
      linkedPlayerIds?: string[];
    };

    if (existing.id === req.authUser!.id && body.active === false) {
      res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الإداري الحالي.' });
      return;
    }
    if (existing.id === req.authUser!.id && body.role && body.role !== existing.role) {
      res.status(400).json({ error: 'لا يمكنك تغيير صلاحية حسابك الإداري الحالي.' });
      return;
    }

    const updated = {
      ...existing,
      fullName: body.fullName !== undefined ? body.fullName.trim() : existing.fullName,
      phone: body.phone !== undefined ? body.phone.trim() : existing.phone,
      email: body.email !== undefined ? body.email.trim().toLowerCase() : existing.email,
      active: body.active !== undefined ? Boolean(body.active) : existing.active,
      role: body.role && ['admin', 'coach', 'parent'].includes(body.role) ? body.role : existing.role,
      categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds : existing.categoryIds,
      passwordHash:
        body.password && body.password.trim().length >= 6
          ? hashPassword(body.password.trim())
          : existing.passwordHash,
    };
    currentDb.users[idx] = updated;

    const coachIdx = currentDb.coaches.findIndex((c) => c.userId === existing.id);
    if (updated.role === 'coach') {
      if (coachIdx !== -1) {
        currentDb.coaches[coachIdx] = {
          ...currentDb.coaches[coachIdx],
          fullName: updated.fullName,
          phone: updated.phone,
          email: updated.email,
          categoryIds: updated.categoryIds,
          active: updated.active,
        };
      } else {
        currentDb.coaches.unshift({
          id: uid('coach'),
          userId: updated.id,
          fullName: updated.fullName,
          phone: updated.phone,
          email: updated.email,
          specialty: 'مدرب فئات شبانية',
          categoryIds: updated.categoryIds,
          trainingProgram: '',
          active: updated.active,
          joinedAt: new Date().toISOString().slice(0, 10),
        });
      }
    }

    if (updated.role === 'parent' && Array.isArray(body.linkedPlayerIds)) {
      syncParentPlayerLinks(currentDb, updated.id, updated.fullName, updated.phone, body.linkedPlayerIds);
    }

    logActivity(
      currentDb,
      req.authUser!,
      'تعديل صلاحيات/حساب',
      'users',
      updated.id,
      `تعديل حساب ${updated.fullName} (${updated.role}) — ${updated.active ? 'مفعل' : 'معطل'}`,
    );
    saveDb(currentDb);
    res.json(toPublicUser(updated));
  });

  // Categories & Dedicated Category Overview Page API
  app.get('/api/categories', requireAuth, (_req, res) => {
    res.json(loadDb().categories);
  });

  app.get('/api/categories/:id/overview', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const category = currentDb.categories.find((c) => c.id === req.params.id);
    if (!category) {
      res.status(404).json({ error: 'الفئة العمرية غير موجودة.' });
      return;
    }

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(category.id)) {
        res.status(403).json({ error: 'لا تملك صلاحية عرض تفاصيل فئة غير مسندة إليك.' });
        return;
      }
    }

    const players = currentDb.players.filter((p) => p.categoryId === category.id && p.status !== 'archived');
    const coaches = currentDb.coaches.filter((c) => c.categoryIds.includes(category.id));
    const trainings = currentDb.trainingSessions
      .filter((t) => t.categoryId === category.id)
      .map((t) => enrichTrainingSession(currentDb, t))
      .sort((a, b) => b.date.localeCompare(a.date));
    const matches = currentDb.matches
      .filter((m) => m.categoryId === category.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const attendance = currentDb.attendance
      .filter((a) => a.categoryId === category.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const evaluations = currentDb.evaluations
      .filter((e) => e.categoryId === category.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    const presentCount = attendance.filter((a) => a.status === 'present').length;
    const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

    let collectedRevenue = 0;
    let remainingDebt = 0;
    if (user.role === 'admin') {
      const activeSeason = getActiveSeason(currentDb);
      const catSubs = currentDb.subscriptions.filter(
        (s) => s.categoryId === category.id && (!activeSeason || s.seasonId === activeSeason.id),
      );
      collectedRevenue = catSubs.reduce((sum, s) => sum + s.paidAmount, 0);
      remainingDebt = catSubs.filter((s) => s.status !== 'exempt').reduce((sum, s) => sum + s.remainingAmount, 0);
    }

    res.json({
      category,
      players,
      coaches,
      trainings,
      matches,
      attendance,
      evaluations,
      stats: {
        totalPlayers: players.length,
        activePlayers: players.filter((p) => p.status === 'active').length,
        attendanceRate,
        trainingsCount: trainings.length,
        matchesCount: matches.length,
        collectedRevenue,
        remainingDebt,
      },
    });
  });

  app.patch('/api/categories/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.categories.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الفئة غير موجودة.' });
      return;
    }
    const existing = currentDb.categories[idx];
    const { name, ageRange, annualFee, description } = req.body as Partial<typeof existing>;
    const updated = {
      ...existing,
      name: name !== undefined ? name.trim() : existing.name,
      ageRange: ageRange !== undefined ? ageRange.trim() : existing.ageRange,
      annualFee: annualFee !== undefined ? Math.max(0, Number(annualFee)) : existing.annualFee,
      description: description !== undefined ? description.trim() : existing.description,
    };
    currentDb.categories[idx] = updated;
    logActivity(
      currentDb,
      req.authUser!,
      'تحديث فئة عمرية',
      'categories',
      updated.id,
      `تحديث فئة ${updated.code} (الاشتراك السنوي: ${updated.annualFee} دج)`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  // Sports Seasons Management (Admin creates/archives; all authenticated users can read)
  app.get('/api/seasons', requireAuth, (_req, res) => {
    const currentDb = loadDb();
    const sorted = [...currentDb.seasons].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    res.json(sorted);
  });

  app.post('/api/seasons', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const body = req.body as Partial<SeasonRecord> & { archivePrevious?: boolean };
    if (!body.name?.trim() || !body.startDate || !body.endDate) {
      res.status(400).json({ error: 'يرجى تحديد اسم الموسم وتاريخ البداية والنهاية.' });
      return;
    }

    if (body.archivePrevious !== false) {
      currentDb.seasons = currentDb.seasons.map((s) =>
        s.status === 'active' ? { ...s, status: 'archived' as const } : s,
      );
    }

    const newSeason: SeasonRecord = {
      id: uid('season'),
      name: body.name.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      subscriptionStartDate: body.subscriptionStartDate || body.startDate,
      subscriptionEndDate: body.subscriptionEndDate || body.endDate,
      defaultAnnualFee: Number(body.defaultAnnualFee ?? currentDb.clubSettings.defaultAnnualFee ?? 16000),
      allowInstallments: body.allowInstallments !== undefined ? Boolean(body.allowInstallments) : true,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    currentDb.seasons.unshift(newSeason);

    currentDb.clubSettings = {
      ...currentDb.clubSettings,
      season: newSeason.name,
      seasonStartDate: newSeason.startDate,
      seasonEndDate: newSeason.endDate,
      subscriptionStartDate: newSeason.subscriptionStartDate,
      subscriptionEndDate: newSeason.subscriptionEndDate,
      defaultAnnualFee: newSeason.defaultAnnualFee,
      allowInstallments: newSeason.allowInstallments,
    };

    logActivity(
      currentDb,
      req.authUser!,
      'إطلاق موسم رياضي جديد',
      'seasons',
      newSeason.id,
      `بدء الموسم الرياضي ${newSeason.name} (${newSeason.startDate} إلى ${newSeason.endDate}) مع أرشفة المواسم السابقة`,
    );
    saveDb(currentDb);
    res.status(201).json(newSeason);
  });

  app.patch('/api/seasons/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.seasons.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الموسم غير موجود.' });
      return;
    }
    const existing = currentDb.seasons[idx];
    const body = req.body as Partial<SeasonRecord>;

    if (body.status === 'active') {
      currentDb.seasons = currentDb.seasons.map((s, i) =>
        i === idx ? s : s.status === 'active' ? { ...s, status: 'archived' as const } : s,
      );
    }

    const updated: SeasonRecord = {
      ...existing,
      name: body.name !== undefined ? body.name.trim() : existing.name,
      startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
      endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
      subscriptionStartDate:
        body.subscriptionStartDate !== undefined ? body.subscriptionStartDate : existing.subscriptionStartDate,
      subscriptionEndDate:
        body.subscriptionEndDate !== undefined ? body.subscriptionEndDate : existing.subscriptionEndDate,
      defaultAnnualFee:
        body.defaultAnnualFee !== undefined ? Math.max(0, Number(body.defaultAnnualFee)) : existing.defaultAnnualFee,
      allowInstallments:
        body.allowInstallments !== undefined ? Boolean(body.allowInstallments) : existing.allowInstallments,
      status: body.status === 'active' || body.status === 'archived' ? body.status : existing.status,
    };
    currentDb.seasons[idx] = updated;

    if (updated.status === 'active') {
      currentDb.clubSettings = {
        ...currentDb.clubSettings,
        season: updated.name,
        seasonStartDate: updated.startDate,
        seasonEndDate: updated.endDate,
        subscriptionStartDate: updated.subscriptionStartDate,
        subscriptionEndDate: updated.subscriptionEndDate,
        defaultAnnualFee: updated.defaultAnnualFee,
        allowInstallments: updated.allowInstallments,
      };
    }

    logActivity(
      currentDb,
      req.authUser!,
      'تحديث موسم رياضي',
      'seasons',
      updated.id,
      `تحديث الموسم ${updated.name} (${updated.status === 'active' ? 'نشط' : 'مؤرشف'})`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  // Annual Seasonal Subscriptions (Admin ONLY; Parent and Coach strictly 403 Forbidden)
  app.get('/api/subscriptions', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const { seasonId, status } = req.query as { seasonId?: string; status?: string };

    let list = [...currentDb.subscriptions];
    if (seasonId && seasonId !== 'all') {
      list = list.filter((s) => s.seasonId === seasonId);
    }
    if (status && status !== 'all') {
      list = list.filter((s) => s.status === status);
    }

    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json(list);
  });

  app.post('/api/subscriptions', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const body = req.body as {
      playerId?: string;
      seasonId?: string;
      totalFee?: number;
      paidAmount?: number;
      status?: SubscriptionStatus;
      startDate?: string;
      endDate?: string;
      method?: PaymentRecord['method'];
      paymentDate?: string;
      notes?: string;
    };

    const player = currentDb.players.find((p) => p.id === body.playerId);
    const season =
      currentDb.seasons.find((s) => s.id === body.seasonId) || getActiveSeason(currentDb);

    if (!player || !season) {
      res.status(400).json({ error: 'يرجى اختيار اللاعب والموسم الرياضي.' });
      return;
    }

    const existingDup = currentDb.subscriptions.find(
      (s) => s.playerId === player.id && s.seasonId === season.id,
    );
    if (existingDup) {
      res.status(409).json({ error: `اللاعب ${player.fullName} مسجل مسبقاً في اشتراك موسم ${season.name}.` });
      return;
    }

    const cat = currentDb.categories.find((c) => c.id === player.categoryId);
    const totalFee = Math.max(0, Number(body.totalFee ?? cat?.annualFee ?? season.defaultAnnualFee));
    let paidAmount = Math.max(0, Number(body.paidAmount ?? 0));

    if (!season.allowInstallments && paidAmount > 0 && paidAmount < totalFee && body.status !== 'exempt') {
      res.status(400).json({ error: `الدفع بالتقسيط غير مفعل لموسم ${season.name}، يرجى تسديد كامل المبلغ أو تفعيل التقسيط.` });
      return;
    }
    if (paidAmount > totalFee) paidAmount = totalFee;

    let status: SubscriptionStatus = body.status || 'unpaid';
    if (status === 'exempt') {
      paidAmount = 0;
    } else if (paidAmount >= totalFee && totalFee > 0) {
      status = 'paid';
    } else if (paidAmount > 0 && paidAmount < totalFee) {
      status = 'partial';
    }

    const remainingAmount = status === 'exempt' ? 0 : Math.max(0, totalFee - paidAmount);
    const now = new Date().toISOString();

    const sub: AnnualSubscription = {
      id: uid('sub'),
      seasonId: season.id,
      seasonName: season.name,
      playerId: player.id,
      playerName: player.fullName,
      categoryId: player.categoryId,
      totalFee,
      paidAmount,
      remainingAmount,
      status,
      startDate: body.startDate || season.subscriptionStartDate,
      endDate: body.endDate || season.subscriptionEndDate,
      notes: body.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };
    currentDb.subscriptions.unshift(sub);

    let createdPayment: PaymentRecord | null = null;
    if (paidAmount > 0) {
      const receiptNumber = nextReceiptNumber(currentDb);
      createdPayment = {
        id: uid('pay'),
        subscriptionId: sub.id,
        seasonId: season.id,
        seasonName: season.name,
        playerId: player.id,
        playerName: player.fullName,
        categoryId: player.categoryId,
        amount: paidAmount,
        paymentDate: body.paymentDate || now.slice(0, 10),
        method: body.method || 'cash',
        receiptNumber,
        status: remainingAmount === 0 ? 'paid' : 'partial',
        notes: body.notes?.trim() || `دفعة اشتراك موسم ${season.name}`,
        recordedBy: req.authUser!.id,
        recordedByName: req.authUser!.fullName,
        createdAt: now,
      };
      currentDb.payments.unshift(createdPayment);
    }

    logActivity(
      currentDb,
      req.authUser!,
      'تسجيل اشتراك سنوي',
      'subscriptions',
      sub.id,
      `اشتراك موسم ${season.name} للاعب ${player.fullName} — المبلغ: ${totalFee} دج (المدفوع: ${paidAmount} دج)`,
    );
    saveDb(currentDb);
    res.status(201).json({ subscription: sub, payment: createdPayment });
  });

  app.post('/api/subscriptions/generate', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const { seasonId } = req.body as { seasonId?: string };
    const season = currentDb.seasons.find((s) => s.id === seasonId) || getActiveSeason(currentDb);
    if (!season) {
      res.status(400).json({ error: 'لا يوجد موسم رياضي محدد.' });
      return;
    }

    const activePlayers = currentDb.players.filter((p) => p.status === 'active');
    const now = new Date().toISOString();
    let createdCount = 0;

    for (const pl of activePlayers) {
      const exists = currentDb.subscriptions.some((s) => s.playerId === pl.id && s.seasonId === season.id);
      if (exists) continue;
      const cat = currentDb.categories.find((c) => c.id === pl.categoryId);
      const totalFee = cat?.annualFee ?? season.defaultAnnualFee;
      currentDb.subscriptions.unshift({
        id: uid('sub'),
        seasonId: season.id,
        seasonName: season.name,
        playerId: pl.id,
        playerName: pl.fullName,
        categoryId: pl.categoryId,
        totalFee,
        paidAmount: 0,
        remainingAmount: totalFee,
        status: 'unpaid',
        startDate: season.subscriptionStartDate,
        endDate: season.subscriptionEndDate,
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
      createdCount++;
    }

    logActivity(
      currentDb,
      req.authUser!,
      'توليد اشتراكات الموسم',
      'subscriptions',
      season.id,
      `إنشاء ${createdCount} ملف اشتراك سنوي للاعبين النشطين في موسم ${season.name}`,
    );
    saveDb(currentDb);
    res.json({ createdCount });
  });

  app.patch('/api/subscriptions/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.subscriptions.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الاشتراك غير موجود.' });
      return;
    }
    const existing = currentDb.subscriptions[idx];
    const body = req.body as Partial<AnnualSubscription>;
    const totalFee = body.totalFee !== undefined ? Math.max(0, Number(body.totalFee)) : existing.totalFee;
    let status = body.status || existing.status;

    let remainingAmount = Math.max(0, totalFee - existing.paidAmount);
    if (status === 'exempt') {
      remainingAmount = 0;
    } else if (body.status === 'expired') {
      status = 'expired';
    } else if (existing.paidAmount >= totalFee && totalFee > 0) {
      status = 'paid';
      remainingAmount = 0;
    } else if (existing.paidAmount > 0 && remainingAmount > 0 && status !== 'expired') {
      status = 'partial';
    }

    const updated: AnnualSubscription = {
      ...existing,
      totalFee,
      remainingAmount,
      status,
      startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
      endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
      notes: body.notes !== undefined ? body.notes.trim() : existing.notes,
      updatedAt: new Date().toISOString(),
    };
    currentDb.subscriptions[idx] = updated;
    logActivity(
      currentDb,
      req.authUser!,
      'تعديل اشتراك سنوي',
      'subscriptions',
      updated.id,
      `تحديث اشتراك ${updated.playerName} (${updated.seasonName}) إلى ${updated.status}`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  app.post('/api/subscriptions/:id/pay', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.subscriptions.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'سجل الاشتراك السنوي غير موجود.' });
      return;
    }
    const sub = currentDb.subscriptions[idx];
    if (sub.status === 'exempt') {
      res.status(400).json({ error: 'هذا الاشتراك معفى من الرسوم.' });
      return;
    }

    const season = currentDb.seasons.find((s) => s.id === sub.seasonId);
    const body = req.body as {
      amount?: number;
      method?: PaymentRecord['method'];
      paymentDate?: string;
      notes?: string;
      receiptNumber?: string;
    };

    const payAmount = Math.max(0, Number(body.amount ?? sub.remainingAmount));
    if (payAmount <= 0) {
      res.status(400).json({ error: 'يجب أن يكون مبلغ الدفعة أكبر من صفر.' });
      return;
    }
    if (payAmount > sub.remainingAmount && sub.remainingAmount > 0) {
      res.status(400).json({ error: `المبلغ المدخل يتجاوز المبلغ المتبقي (${sub.remainingAmount} دج).` });
      return;
    }
    if (season && !season.allowInstallments && payAmount < sub.remainingAmount) {
      res.status(400).json({ error: `التقسيط غير مفعل لموسم ${season.name}، يجب تسديد المتبقي كاملاً (${sub.remainingAmount} دج).` });
      return;
    }

    const now = new Date().toISOString();
    const nextPaid = sub.paidAmount + payAmount;
    const nextRemaining = Math.max(0, sub.totalFee - nextPaid);
    const nextStatus: SubscriptionStatus = nextRemaining === 0 ? 'paid' : 'partial';

    const updatedSub: AnnualSubscription = {
      ...sub,
      paidAmount: nextPaid,
      remainingAmount: nextRemaining,
      status: nextStatus,
      updatedAt: now,
    };
    currentDb.subscriptions[idx] = updatedSub;

    const receiptNumber = body.receiptNumber?.trim() || nextReceiptNumber(currentDb);
    const payment: PaymentRecord = {
      id: uid('pay'),
      subscriptionId: sub.id,
      seasonId: sub.seasonId,
      seasonName: sub.seasonName,
      playerId: sub.playerId,
      playerName: sub.playerName,
      categoryId: sub.categoryId,
      amount: payAmount,
      paymentDate: body.paymentDate || now.slice(0, 10),
      method: body.method || 'cash',
      receiptNumber,
      status: nextRemaining === 0 ? 'paid' : 'partial',
      notes: body.notes?.trim() || `تسديد اشتراك موسم ${sub.seasonName}`,
      recordedBy: req.authUser!.id,
      recordedByName: req.authUser!.fullName,
      createdAt: now,
    };
    currentDb.payments.unshift(payment);

    logActivity(
      currentDb,
      req.authUser!,
      'تسجيل دفع اشتراك سنوي',
      'payments',
      payment.id,
      `${sub.playerName} — موسم ${sub.seasonName} — ${payAmount} دج (وصل ${receiptNumber})`,
    );
    saveDb(currentDb);
    res.status(201).json({ subscription: updatedSub, payment });
  });

  app.delete('/api/subscriptions/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.subscriptions.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الاشتراك غير موجود.' });
      return;
    }
    const [removed] = currentDb.subscriptions.splice(idx, 1);
    logActivity(
      currentDb,
      req.authUser!,
      'حذف سجل اشتراك',
      'subscriptions',
      removed.id,
      `حذف اشتراك ${removed.playerName} (${removed.seasonName})`,
    );
    saveDb(currentDb);
    res.json({ ok: true });
  });

  // Training Sessions
  app.get('/api/trainings', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    let list = [...currentDb.trainingSessions];

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      list = list.filter((t) => cats.includes(t.categoryId));
    } else if (user.role === 'parent') {
      const cats = getParentCategoryIds(currentDb, user.id);
      list = list.filter((t) => cats.includes(t.categoryId));
    }

    list.sort((a, b) => b.date.localeCompare(a.date));
    res.json(list.map((t) => enrichTrainingSession(currentDb, t)));
  });

  app.post('/api/trainings', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const body = req.body as Partial<TrainingSession>;

    if (!body.title?.trim() || !body.categoryId || !body.date || !body.startTime) {
      res.status(400).json({ error: 'يرجى تحديد عنوان الحصة والفئة والتاريخ والتوقيت.' });
      return;
    }
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(body.categoryId)) {
        res.status(403).json({ error: 'لا يمكنك جدولة حصة لفئة غير مسندة إليك.' });
        return;
      }
    }

    const coach = currentDb.coaches.find((c) => c.id === body.coachId || c.userId === user.id);
    const created: TrainingSession = {
      id: uid('trn'),
      title: body.title.trim(),
      categoryId: body.categoryId,
      coachId: coach?.id || body.coachId || user.id,
      coachName: body.coachName || coach?.fullName || user.fullName,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime || '18:00',
      venue: body.venue || currentDb.clubSettings.venues[0] || 'الملعب البلدي بوعنان',
      objectives: body.objectives?.trim() || '',
      notes: body.notes?.trim() || '',
      status: body.status || 'scheduled',
      createdAt: new Date().toISOString(),
    };
    currentDb.trainingSessions.unshift(created);
    logActivity(
      currentDb,
      user,
      'إنشاء حصة تدريبية',
      'trainingSessions',
      created.id,
      `جدولة حصة "${created.title}" لفئة ${created.categoryId} بتاريخ ${created.date}`,
    );
    saveDb(currentDb);
    res.status(201).json(enrichTrainingSession(currentDb, created));
  });

  app.patch('/api/trainings/:id', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const idx = currentDb.trainingSessions.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الحصة التدريبية غير موجودة.' });
      return;
    }
    const existing = currentDb.trainingSessions[idx];
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(existing.categoryId)) {
        res.status(403).json({ error: 'غير مصرح بتعديل حصص فئة أخرى.' });
        return;
      }
    }

    const body = req.body as Partial<TrainingSession>;
    const updated: TrainingSession = {
      ...existing,
      title: body.title !== undefined ? body.title.trim() : existing.title,
      categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
      date: body.date !== undefined ? body.date : existing.date,
      startTime: body.startTime !== undefined ? body.startTime : existing.startTime,
      endTime: body.endTime !== undefined ? body.endTime : existing.endTime,
      venue: body.venue !== undefined ? body.venue : existing.venue,
      objectives: body.objectives !== undefined ? body.objectives.trim() : existing.objectives,
      notes: body.notes !== undefined ? body.notes.trim() : existing.notes,
      status: body.status !== undefined ? body.status : existing.status,
    };
    currentDb.trainingSessions[idx] = updated;

    if (existing.status !== 'cancelled' && updated.status === 'cancelled') {
      pushNotificationsForTargets(currentDb, {
        title: `إلغاء حصة تدريبية — فئة ${updated.categoryId}`,
        message: `تم إلغاء حصة "${updated.title}" المبرمجة بتاريخ ${updated.date}.`,
        type: 'training_cancel',
        relatedId: updated.id,
        targetAudience: 'category',
        targetCategoryId: updated.categoryId,
        excludeUserId: user.id,
      });
    }

    logActivity(
      currentDb,
      user,
      'تحديث حصة تدريبية',
      'trainingSessions',
      updated.id,
      `تحديث حصة "${updated.title}" (${updated.status})`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  app.delete('/api/trainings/:id', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const idx = currentDb.trainingSessions.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الحصة غير موجودة.' });
      return;
    }
    const existing = currentDb.trainingSessions[idx];
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(existing.categoryId)) {
        res.status(403).json({ error: 'غير مصرح بحذف حصص فئة أخرى.' });
        return;
      }
    }
    currentDb.trainingSessions.splice(idx, 1);
    logActivity(currentDb, user, 'حذف حصة تدريبية', 'trainingSessions', existing.id, `حذف حصة ${existing.title}`);
    saveDb(currentDb);
    res.json({ ok: true });
  });

  // Attendance (Strict duplicate prevention on playerId + sessionId + date + category authorization)
  app.get('/api/attendance', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    let list = [...currentDb.attendance];

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      list = list.filter((a) => cats.includes(a.categoryId));
    } else if (user.role === 'parent') {
      const childIds = getParentPlayerIds(currentDb, user.id);
      list = list.filter((a) => childIds.includes(a.playerId));
    }

    const { categoryId, sessionId, date, playerId } = req.query as Record<string, string | undefined>;
    if (categoryId) list = list.filter((a) => a.categoryId === categoryId);
    if (sessionId) list = list.filter((a) => a.sessionId === sessionId);
    if (date) list = list.filter((a) => a.date === date);
    if (playerId) list = list.filter((a) => a.playerId === playerId);

    list.sort((a, b) => b.date.localeCompare(a.date));
    res.json(list);
  });

  app.post('/api/attendance/batch', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const { categoryId, sessionId, date, entries } = req.body as {
      categoryId?: string;
      sessionId?: string;
      date?: string;
      entries?: { playerId: string; status: 'present' | 'absent' | 'excused'; notes?: string }[];
    };

    if (!categoryId || !sessionId || !date || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'بيانات الحضور غير مكتملة.' });
      return;
    }

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(categoryId)) {
        res.status(403).json({ error: 'لا يمكنك تسجيل الحضور لفئة غير مسندة إليك.' });
        return;
      }
    }

    const session = currentDb.trainingSessions.find((s) => s.id === sessionId);
    const sessionTitle = session?.title || 'حصة تدريبية';
    const now = new Date().toISOString();
    const savedRecords: AttendanceRecord[] = [];

    for (const entry of entries) {
      const player = currentDb.players.find((p) => p.id === entry.playerId);
      if (!player || player.categoryId !== categoryId) continue;

      const existingIdx = currentDb.attendance.findIndex(
        (a) => a.playerId === entry.playerId && a.sessionId === sessionId && a.date === date,
      );
      if (existingIdx !== -1) {
        currentDb.attendance[existingIdx] = {
          ...currentDb.attendance[existingIdx],
          status: entry.status,
          notes: entry.notes?.trim() || '',
          recordedBy: user.id,
          recordedByName: user.fullName,
          updatedAt: now,
        };
        savedRecords.push(currentDb.attendance[existingIdx]);
      } else {
        const rec: AttendanceRecord = {
          id: uid('att'),
          playerId: player.id,
          playerName: player.fullName,
          categoryId,
          sessionId,
          sessionTitle,
          date,
          status: entry.status,
          notes: entry.notes?.trim() || '',
          recordedBy: user.id,
          recordedByName: user.fullName,
          updatedAt: now,
        };
        currentDb.attendance.unshift(rec);
        savedRecords.push(rec);
      }
    }

    logActivity(
      currentDb,
      user,
      'حفظ سجل الحضور',
      'attendance',
      sessionId,
      `تسجيل حضور ${savedRecords.length} لاعباً لفئة ${categoryId} بتاريخ ${date}`,
    );
    saveDb(currentDb);
    res.json({ saved: savedRecords.length, records: savedRecords });
  });

  app.patch('/api/attendance/:id', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const idx = currentDb.attendance.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'السجل غير موجود.' });
      return;
    }
    const existing = currentDb.attendance[idx];
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(existing.categoryId)) {
        res.status(403).json({ error: 'غير مصرح بتعديل حضور فئة أخرى.' });
        return;
      }
    }
    const { status, notes } = req.body as Partial<AttendanceRecord>;
    const updated: AttendanceRecord = {
      ...existing,
      status: status || existing.status,
      notes: notes !== undefined ? notes.trim() : existing.notes,
      recordedBy: user.id,
      recordedByName: user.fullName,
      updatedAt: new Date().toISOString(),
    };
    currentDb.attendance[idx] = updated;
    logActivity(
      currentDb,
      user,
      'تعديل سجل حضور',
      'attendance',
      updated.id,
      `تحديث حضور اللاعب ${updated.playerName} إلى (${updated.status})`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  // Matches
  app.get('/api/matches', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    let list = [...currentDb.matches];
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      list = list.filter((m) => cats.includes(m.categoryId));
    } else if (user.role === 'parent') {
      const cats = getParentCategoryIds(currentDb, user.id);
      list = list.filter((m) => cats.includes(m.categoryId));
    }
    list.sort((a, b) => b.date.localeCompare(a.date));
    res.json(list);
  });

  app.post('/api/matches', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const body = req.body as Partial<MatchRecord>;
    if (!body.opponent?.trim() || !body.categoryId || !body.date || !body.time) {
      res.status(400).json({ error: 'يرجى إدخال اسم المنافس والفئة وتاريخ وتوقيت المباراة.' });
      return;
    }
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(body.categoryId)) {
        res.status(403).json({ error: 'لا يمكنك إضافة مباراة لفئة غير مسندة إليك.' });
        return;
      }
    }
    const created: MatchRecord = {
      id: uid('mat'),
      opponent: body.opponent.trim(),
      categoryId: body.categoryId,
      date: body.date,
      time: body.time,
      venue: body.venue?.trim() || 'الملعب البلدي بوعنان',
      locationType: body.locationType === 'away' ? 'away' : 'home',
      status: body.status || 'scheduled',
      goalsFor: Number(body.goalsFor || 0),
      goalsAgainst: Number(body.goalsAgainst || 0),
      technicalNotes: body.technicalNotes?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    currentDb.matches.unshift(created);
    logActivity(
      currentDb,
      user,
      'إضافة مباراة',
      'matches',
      created.id,
      `مباراة ${created.categoryId} ضد ${created.opponent} بتاريخ ${created.date}`,
    );
    saveDb(currentDb);
    res.status(201).json(created);
  });

  app.patch('/api/matches/:id', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const idx = currentDb.matches.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'المباراة غير موجودة.' });
      return;
    }
    const existing = currentDb.matches[idx];
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(existing.categoryId)) {
        res.status(403).json({ error: 'غير مصرح بتعديل مباريات فئة أخرى.' });
        return;
      }
    }
    const body = req.body as Partial<MatchRecord>;
    const updated: MatchRecord = {
      ...existing,
      opponent: body.opponent !== undefined ? body.opponent.trim() : existing.opponent,
      categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
      date: body.date !== undefined ? body.date : existing.date,
      time: body.time !== undefined ? body.time : existing.time,
      venue: body.venue !== undefined ? body.venue.trim() : existing.venue,
      locationType: body.locationType !== undefined ? body.locationType : existing.locationType,
      status: body.status !== undefined ? body.status : existing.status,
      goalsFor: body.goalsFor !== undefined ? Number(body.goalsFor) : existing.goalsFor,
      goalsAgainst: body.goalsAgainst !== undefined ? Number(body.goalsAgainst) : existing.goalsAgainst,
      technicalNotes: body.technicalNotes !== undefined ? body.technicalNotes.trim() : existing.technicalNotes,
    };
    currentDb.matches[idx] = updated;
    logActivity(
      currentDb,
      user,
      'تحديث مباراة',
      'matches',
      updated.id,
      `تحديث مباراة ${updated.categoryId} ضد ${updated.opponent} (${updated.goalsFor}-${updated.goalsAgainst})`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  app.delete('/api/matches/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.matches.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'المباراة غير موجودة.' });
      return;
    }
    const [removed] = currentDb.matches.splice(idx, 1);
    logActivity(currentDb, req.authUser!, 'حذف مباراة', 'matches', removed.id, `حذف مباراة ضد ${removed.opponent}`);
    saveDb(currentDb);
    res.json({ ok: true });
  });

  // Payments History & Finance Entries (Admin ONLY; Parent and Coach strictly 403 Forbidden)
  app.get('/api/payments', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    let list = [...currentDb.payments];
    const { seasonId } = req.query as { seasonId?: string };
    if (seasonId && seasonId !== 'all') {
      list = list.filter((p) => p.seasonId === seasonId);
    }
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(list);
  });

  app.delete('/api/payments/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.payments.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'السجل المالي غير موجود.' });
      return;
    }
    const [removed] = currentDb.payments.splice(idx, 1);

    // Recompute parent subscription totals if linked
    const subIdx = currentDb.subscriptions.findIndex((s) => s.id === removed.subscriptionId);
    if (subIdx !== -1) {
      const sub = currentDb.subscriptions[subIdx];
      const nextPaid = Math.max(0, sub.paidAmount - removed.amount);
      const nextRem = Math.max(0, sub.totalFee - nextPaid);
      const nextStatus: SubscriptionStatus =
        sub.status === 'exempt' ? 'exempt' : nextRem === 0 && sub.totalFee > 0 ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';
      currentDb.subscriptions[subIdx] = {
        ...sub,
        paidAmount: nextPaid,
        remainingAmount: nextRem,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
    }

    logActivity(currentDb, req.authUser!, 'حذف وصل دفع', 'payments', removed.id, `حذف وصل ${removed.receiptNumber}`);
    saveDb(currentDb);
    res.json({ ok: true });
  });

  app.get('/api/finance/entries', requireAuth, requireRole('admin'), (req, res) => {
    const currentDb = loadDb();
    const { seasonId, kind } = req.query as { seasonId?: string; kind?: string };
    let list = [...currentDb.financeEntries];
    if (seasonId && seasonId !== 'all') {
      list = list.filter((e) => e.seasonId === seasonId);
    }
    if (kind && (kind === 'income' || kind === 'expense')) {
      list = list.filter((e) => e.kind === kind);
    }
    list.sort((a, b) => b.date.localeCompare(a.date));
    res.json(list);
  });

  app.post('/api/finance/entries', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const body = req.body as Partial<FinanceEntry>;
    if (!body.kind || !['income', 'expense'].includes(body.kind) || !body.title?.trim() || !body.amount || Number(body.amount) <= 0) {
      res.status(400).json({ error: 'يرجى تحديد نوع العملية والبيان والمبلغ الصحيح.' });
      return;
    }

    const season = currentDb.seasons.find((s) => s.id === body.seasonId) || getActiveSeason(currentDb);
    const now = new Date().toISOString();
    const entry: FinanceEntry = {
      id: uid('fin'),
      seasonId: season?.id || 'season_default',
      seasonName: season?.name || currentDb.clubSettings.season,
      kind: body.kind,
      category: body.category?.trim() || (body.kind === 'expense' ? 'مصاريف عامة' : 'مداخيل أخرى'),
      title: body.title.trim(),
      amount: Number(body.amount),
      date: body.date || now.slice(0, 10),
      method: body.method || 'cash',
      receiptNumber: body.receiptNumber?.trim() || nextReceiptNumber(currentDb),
      notes: body.notes?.trim() || '',
      recordedBy: req.authUser!.id,
      recordedByName: req.authUser!.fullName,
      createdAt: now,
    };

    currentDb.financeEntries.unshift(entry);
    logActivity(
      currentDb,
      req.authUser!,
      entry.kind === 'expense' ? 'تسجيل مصروف' : 'تسجيل مدخول إضافي',
      'financeEntries',
      entry.id,
      `${entry.title} — ${entry.amount} دج (${entry.category})`,
    );
    saveDb(currentDb);
    res.status(201).json(entry);
  });

  app.delete('/api/finance/entries/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.financeEntries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'العملية المالية غير موجودة.' });
      return;
    }
    const [removed] = currentDb.financeEntries.splice(idx, 1);
    logActivity(currentDb, req.authUser!, 'حذف عملية مالية', 'financeEntries', removed.id, `حذف ${removed.title}`);
    saveDb(currentDb);
    res.json({ ok: true });
  });

  app.get('/api/finance/summary', requireAuth, requireRole('admin'), (req, res) => {
    const currentDb = loadDb();
    const requestedSeasonId = req.query.seasonId as string | undefined;
    const activeSeason = getActiveSeason(currentDb);
    const targetSeasonId = requestedSeasonId && requestedSeasonId !== 'all' ? requestedSeasonId : activeSeason?.id;
    const targetSeason = currentDb.seasons.find((s) => s.id === targetSeasonId);

    const subs =
      requestedSeasonId === 'all'
        ? currentDb.subscriptions
        : currentDb.subscriptions.filter((s) => s.seasonId === targetSeasonId);
    const finEntries =
      requestedSeasonId === 'all'
        ? currentDb.financeEntries
        : currentDb.financeEntries.filter((f) => f.seasonId === targetSeasonId);
    const pays =
      requestedSeasonId === 'all'
        ? currentDb.payments
        : currentDb.payments.filter((p) => p.seasonId === targetSeasonId);

    const nonExempt = subs.filter((s) => s.status !== 'exempt');
    const subscriptionExpected = nonExempt.reduce((sum, s) => sum + s.totalFee, 0);
    const subscriptionCollected = subs.reduce((sum, s) => sum + s.paidAmount, 0);
    const subscriptionRemaining = nonExempt.reduce((sum, s) => sum + s.remainingAmount, 0);

    const paidCount = subs.filter((s) => s.status === 'paid').length;
    const partialCount = subs.filter((s) => s.status === 'partial').length;
    const unpaidCount = subs.filter((s) => s.status === 'unpaid').length;
    const expiredCount = subs.filter((s) => s.status === 'expired').length;
    const exemptCount = subs.filter((s) => s.status === 'exempt').length;

    const otherIncomeTotal = finEntries
      .filter((e) => e.kind === 'income')
      .reduce((sum, e) => sum + e.amount, 0);
    const expensesTotal = finEntries
      .filter((e) => e.kind === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = subscriptionCollected + otherIncomeTotal;
    const netBalance = totalIncome - expensesTotal;

    const byCategory = currentDb.categories.map((c) => {
      const catSubs = subs.filter((s) => s.categoryId === c.id);
      const expectedAmount = catSubs.filter((s) => s.status !== 'exempt').reduce((s, x) => s + x.totalFee, 0);
      const collectedAmount = catSubs.reduce((s, x) => s + x.paidAmount, 0);
      const remainingAmount = catSubs.filter((s) => s.status !== 'exempt').reduce((s, x) => s + x.remainingAmount, 0);
      return {
        categoryId: c.id,
        categoryName: c.code,
        expectedAmount,
        collectedAmount,
        remainingAmount,
      };
    });

    const now = new Date();
    const monthlySeries: { month: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = d.toISOString().slice(0, 7);
      const subInc = pays.filter((p) => p.paymentDate.startsWith(mStr)).reduce((s, p) => s + p.amount, 0);
      const othInc = finEntries
        .filter((e) => e.kind === 'income' && e.date.startsWith(mStr))
        .reduce((s, e) => s + e.amount, 0);
      const exp = finEntries
        .filter((e) => e.kind === 'expense' && e.date.startsWith(mStr))
        .reduce((s, e) => s + e.amount, 0);
      monthlySeries.push({ month: mStr, income: subInc + othInc, expense: exp });
    }

    res.json({
      seasonId: requestedSeasonId === 'all' ? 'all' : targetSeason?.id || '',
      seasonName: requestedSeasonId === 'all' ? 'جميع المواسم' : targetSeason?.name || currentDb.clubSettings.season,
      subscriptionExpected,
      subscriptionCollected,
      subscriptionRemaining,
      paidCount,
      partialCount,
      unpaidCount,
      expiredCount,
      exemptCount,
      otherIncomeTotal,
      totalIncome,
      expensesTotal,
      netBalance,
      byCategory,
      monthlySeries,
    });
  });

  // Technical Evaluations
  app.get('/api/evaluations', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    let list = [...currentDb.evaluations];

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      list = list.filter((e) => cats.includes(e.categoryId));
    } else if (user.role === 'parent') {
      const childIds = getParentPlayerIds(currentDb, user.id);
      list = list.filter((e) => childIds.includes(e.playerId) && e.published);
    }

    list.sort((a, b) => b.date.localeCompare(a.date));
    res.json(list);
  });

  app.post('/api/evaluations', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const body = req.body as {
      playerId?: string;
      period?: string;
      date?: string;
      scores?: EvaluationScores;
      notes?: string;
      published?: boolean;
    };

    const player = currentDb.players.find((p) => p.id === body.playerId);
    if (!player || !body.scores) {
      res.status(400).json({ error: 'يرجى تحديد اللاعب ومعايير التقييم.' });
      return;
    }

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(player.categoryId)) {
        res.status(403).json({ error: 'لا يمكنك تقييم لاعب في فئة غير مسندة إليك.' });
        return;
      }
    }

    const vals = Object.values(body.scores).map((n) => Math.max(1, Math.min(10, Number(n) || 5)));
    const overallAverage = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
    const isAdmin = user.role === 'admin';
    const published = Boolean(body.published);

    const evaluation = {
      id: uid('ev'),
      playerId: player.id,
      playerName: player.fullName,
      categoryId: player.categoryId,
      coachId: user.id,
      coachName: user.fullName,
      date: body.date || new Date().toISOString().slice(0, 10),
      period: body.period?.trim() || 'تقييم فني دوري',
      scores: body.scores,
      overallAverage,
      notes: body.notes?.trim() || '',
      published,
      approvedByAdmin: isAdmin || published,
      createdAt: new Date().toISOString(),
    };
    currentDb.evaluations.unshift(evaluation);

    if (published && player.parentUserId) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: player.parentUserId,
        title: 'تقييم فني جديد',
        message: `تم نشر التقييم الفني للاعب ${player.fullName} بمعدل ${overallAverage}/10.`,
        type: 'evaluation',
        relatedId: evaluation.id,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    logActivity(
      currentDb,
      user,
      'إضافة تقييم فني',
      'evaluations',
      evaluation.id,
      `تقييم ${player.fullName} (${overallAverage}/10) — ${published ? 'منشور للولي' : 'مسودة داخلية'}`,
    );
    saveDb(currentDb);
    res.status(201).json(evaluation);
  });

  app.patch('/api/evaluations/:id', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const idx = currentDb.evaluations.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'التقييم غير موجود.' });
      return;
    }
    const existing = currentDb.evaluations[idx];
    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(existing.categoryId)) {
        res.status(403).json({ error: 'غير مصرح بتعديل تقييم فئة أخرى.' });
        return;
      }
    }

    const body = req.body as Partial<typeof existing>;
    const scores = body.scores || existing.scores;
    const vals = Object.values(scores).map((n) => Math.max(1, Math.min(10, Number(n) || 5)));
    const overallAverage = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
    const published = body.published !== undefined ? Boolean(body.published) : existing.published;

    const updated = {
      ...existing,
      period: body.period !== undefined ? body.period.trim() : existing.period,
      scores,
      overallAverage,
      notes: body.notes !== undefined ? body.notes.trim() : existing.notes,
      published,
      approvedByAdmin: user.role === 'admin' ? (body.approvedByAdmin ?? published) : existing.approvedByAdmin,
    };
    currentDb.evaluations[idx] = updated;

    if (!existing.published && updated.published) {
      const player = currentDb.players.find((p) => p.id === updated.playerId);
      if (player?.parentUserId) {
        currentDb.notifications.unshift({
          id: uid('not'),
          userId: player.parentUserId,
          title: 'نشر تقييم فني',
          message: `تمت الموافقة على نشر التقييم الفني للاعب ${updated.playerName}.`,
          type: 'evaluation',
          relatedId: updated.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    logActivity(
      currentDb,
      user,
      'تعديل تقييم فني',
      'evaluations',
      updated.id,
      `تعديل تقييم ${updated.playerName} (${updated.overallAverage}/10)`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  // Announcements
  app.get('/api/announcements', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    let list = [...currentDb.announcements];

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      list = list.filter(
        (a) =>
          a.targetAudience === 'all' ||
          a.targetAudience === 'coaches' ||
          (a.targetAudience === 'category' && a.targetCategoryId && cats.includes(a.targetCategoryId)),
      );
    } else if (user.role === 'parent') {
      const cats = getParentCategoryIds(currentDb, user.id);
      list = list.filter(
        (a) =>
          a.targetAudience === 'all' ||
          a.targetAudience === 'parents' ||
          (a.targetAudience === 'category' && a.targetCategoryId && cats.includes(a.targetCategoryId)),
      );
    }

    list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    res.json(list);
  });

  app.post('/api/announcements', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const body = req.body as {
      title?: string;
      body?: string;
      type?: 'general' | 'category' | 'training_cancel' | 'match' | 'program_change' | 'admin_notice';
      targetAudience?: 'all' | 'coaches' | 'parents' | 'category';
      targetCategoryId?: string;
      pinned?: boolean;
    };
    if (!body.title?.trim() || !body.body?.trim()) {
      res.status(400).json({ error: 'يرجى إدخال عنوان ومحتوى الإعلان.' });
      return;
    }

    const ann = {
      id: uid('ann'),
      title: body.title.trim(),
      body: body.body.trim(),
      type: body.type || 'general',
      targetAudience: body.targetAudience || 'all',
      targetCategoryId: body.targetAudience === 'category' ? body.targetCategoryId : undefined,
      pinned: Boolean(body.pinned),
      authorId: req.authUser!.id,
      authorName: req.authUser!.fullName,
      createdAt: new Date().toISOString(),
    };
    currentDb.announcements.unshift(ann);

    pushNotificationsForTargets(currentDb, {
      title: ann.title,
      message: ann.body.slice(0, 140),
      type: ann.type,
      relatedId: ann.id,
      targetAudience: ann.targetAudience,
      targetCategoryId: ann.targetCategoryId,
      excludeUserId: req.authUser!.id,
    });

    logActivity(currentDb, req.authUser!, 'نشر إعلان', 'announcements', ann.id, `نشر إعلان: ${ann.title}`);
    saveDb(currentDb);
    res.status(201).json(ann);
  });

  app.delete('/api/announcements/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.announcements.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'الإعلان غير موجود.' });
      return;
    }
    const [removed] = currentDb.announcements.splice(idx, 1);
    logActivity(currentDb, req.authUser!, 'حذف إعلان', 'announcements', removed.id, `حذف إعلان: ${removed.title}`);
    saveDb(currentDb);
    res.json({ ok: true });
  });

  // Notifications (financial payment notifications are strictly hidden from non-admins)
  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const list = currentDb.notifications
      .filter((n) => n.userId === user.id && (user.role === 'admin' || n.type !== 'payment'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(list);
  });

  app.patch('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    for (const n of currentDb.notifications) {
      if (n.userId === user.id && (user.role === 'admin' || n.type !== 'payment')) {
        n.read = true;
      }
    }
    saveDb(currentDb);
    res.json({ ok: true });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const item = currentDb.notifications.find(
      (n) =>
        n.id === req.params.id &&
        n.userId === user.id &&
        (user.role === 'admin' || n.type !== 'payment'),
    );
    if (!item) {
      res.status(404).json({ error: 'الإشعار غير موجود.' });
      return;
    }
    item.read = true;
    saveDb(currentDb);
    res.json(item);
  });

  // Club Settings
  app.get('/api/settings', requireAuth, (_req, res) => {
    res.json(loadDb().clubSettings);
  });

  app.patch('/api/settings', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const body = req.body as Partial<ClubSettings>;
    currentDb.clubSettings = {
      ...currentDb.clubSettings,
      ...body,
      defaultAnnualFee:
        body.defaultAnnualFee !== undefined ? Math.max(0, Number(body.defaultAnnualFee)) : currentDb.clubSettings.defaultAnnualFee,
      allowInstallments:
        body.allowInstallments !== undefined ? Boolean(body.allowInstallments) : currentDb.clubSettings.allowInstallments,
      venues: Array.isArray(body.venues) ? body.venues.filter(Boolean) : currentDb.clubSettings.venues,
    };

    // Keep active season synchronized with settings if modified
    const activeIdx = currentDb.seasons.findIndex((s) => s.status === 'active');
    if (activeIdx !== -1) {
      currentDb.seasons[activeIdx] = {
        ...currentDb.seasons[activeIdx],
        name: currentDb.clubSettings.season,
        startDate: currentDb.clubSettings.seasonStartDate,
        endDate: currentDb.clubSettings.seasonEndDate,
        subscriptionStartDate: currentDb.clubSettings.subscriptionStartDate,
        subscriptionEndDate: currentDb.clubSettings.subscriptionEndDate,
        defaultAnnualFee: currentDb.clubSettings.defaultAnnualFee,
        allowInstallments: currentDb.clubSettings.allowInstallments,
      };
    }

    logActivity(
      currentDb,
      req.authUser!,
      'تحديث إعدادات النادي',
      'clubSettings',
      'settings',
      `تحديث هوية وإعدادات ${currentDb.clubSettings.clubName}`,
    );
    saveDb(currentDb);
    res.json(currentDb.clubSettings);
  });

  // Activity Logs
  app.get('/api/activity-logs', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const logs =
      user.role === 'admin'
        ? currentDb.activityLogs
        : currentDb.activityLogs.filter((l) => l.actorId === user.id);
    res.json(logs);
  });

  // Coach Reports to Administration (Coach creates for assigned categories, Admin reviews)
  app.get('/api/coach-reports', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const list =
      user.role === 'admin'
        ? [...currentDb.coachReports]
        : currentDb.coachReports.filter((r) => r.coachUserId === user.id);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(list);
  });

  app.post('/api/coach-reports', requireAuth, requireRole('admin', 'coach'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const user = req.authUser!;
    const body = req.body as {
      categoryId?: string;
      title?: string;
      summary?: string;
      recommendations?: string;
    };

    const categoryId = (body.categoryId || '').trim();
    const title = (body.title || '').trim();
    const summary = (body.summary || '').trim();
    const recommendations = (body.recommendations || '').trim();

    if (!categoryId || !currentDb.categories.some((c) => c.id === categoryId)) {
      res.status(400).json({ error: 'يرجى تحديد فئة عمرية صالحة للتقرير.' });
      return;
    }
    if (!title || title.length < 3 || !summary || summary.length < 5) {
      res.status(400).json({ error: 'يرجى إدخال عنوان التقرير ومحتوى الملخص الفني.' });
      return;
    }

    if (user.role === 'coach') {
      const cats = getCoachCategories(currentDb, user.id, user.categoryIds);
      if (!cats.includes(categoryId)) {
        res.status(403).json({ error: 'لا يمكنك إرسال تقرير عن فئة غير مسندة إليك.' });
        return;
      }
    }

    const coachRecord = currentDb.coaches.find((c) => c.userId === user.id);
    const now = new Date().toISOString();
    const report: CoachReport = {
      id: uid('crep'),
      coachId: coachRecord?.id || user.id,
      coachUserId: user.id,
      coachName: user.fullName,
      categoryId,
      title,
      summary,
      recommendations: recommendations || undefined,
      status: 'pending',
      createdAt: now,
    };

    currentDb.coachReports.unshift(report);

    const admins = currentDb.users.filter((u) => u.role === 'admin' && u.active);
    for (const adm of admins) {
      currentDb.notifications.unshift({
        id: uid('not'),
        userId: adm.id,
        title: `تقرير فني جديد من المدرب ${user.fullName}`,
        message: `${title} (${categoryId}) — ${summary.slice(0, 110)}`,
        type: 'coach_report',
        relatedId: report.id,
        read: false,
        createdAt: now,
      });
    }

    logActivity(
      currentDb,
      user,
      'إرسال تقرير مدرب للإدارة',
      'coachReports',
      report.id,
      `إرسال تقرير "${title}" لفئة ${categoryId}`,
    );
    saveDb(currentDb);
    res.status(201).json(report);
  });

  app.patch('/api/coach-reports/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
    const currentDb = loadDb();
    const idx = currentDb.coachReports.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'التقرير غير موجود.' });
      return;
    }
    const existing = currentDb.coachReports[idx];
    const body = req.body as { status?: 'pending' | 'reviewed'; adminNote?: string };
    const updated: CoachReport = {
      ...existing,
      status: body.status === 'reviewed' || body.status === 'pending' ? body.status : 'reviewed',
      adminNote: body.adminNote !== undefined ? body.adminNote.trim() : existing.adminNote,
    };
    currentDb.coachReports[idx] = updated;

    currentDb.notifications.unshift({
      id: uid('not'),
      userId: existing.coachUserId,
      title: 'تمت مراجعة تقريرك الفني',
      message: `اطلعت الإدارة على تقريرك "${existing.title}"${updated.adminNote ? `: ${updated.adminNote}` : '.'}`,
      type: 'coach_report_reviewed',
      relatedId: existing.id,
      read: false,
      createdAt: new Date().toISOString(),
    });

    logActivity(
      currentDb,
      req.authUser!,
      'مراجعة تقرير مدرب',
      'coachReports',
      updated.id,
      `مراجعة تقرير "${updated.title}" من ${updated.coachName}`,
    );
    saveDb(currentDb);
    res.json(updated);
  });

  // Vite integration / production static serving (handles /admin, /coach, /parent SPA routes cleanly)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`W.A.B Platform server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start W.A.B server:', err);
  process.exit(1);
});
