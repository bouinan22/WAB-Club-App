import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import {
  auth,
  db,
  handleFirestoreError,
  isTransientNetworkError,
  OperationType,
  storage,
} from './firebase.ts';
import { genId } from './firebaseStore.ts';
import type {
  PublicUser,
  TalentCompetition,
  TalentCompetitionCategory,
  TalentModerationStatus,
  TalentPosition,
  TalentReport,
  TalentSettings,
  TalentTrialInvite,
  TalentVideo,
  TalentWatchlistItem,
} from '../types/wab.ts';

export const DEFAULT_TALENT_SETTINGS: TalentSettings = {
  id: 'main',
  firstSubmissionFree: true,
  extraSubmissionEnabled: true,
  extraSubmissionFeeDzd: 500,
  paymentInstructionsAr:
    'الفيديو الأول مجاني بالكامل. بالنسبة للمشاركات الإضافية يمكن تأكيد الدفع لدى أمانة النادي أو عبر الحساب البريدي (CCP) ثم إدخال رقم الوصل ليتم تفعيله من الإدارة.',
  paymentInstructionsFr:
    'La première vidéo est entièrement gratuite. Pour toute vidéo supplémentaire, réglez les frais auprès du secrétariat du club ou via CCP et indiquez la référence de paiement.',
  maxDurationSeconds: 60,
  maxFileSizeMb: 35,
  requireModerationBeforePublic: true,
  requireParentalConsent: true,
  isPublic: true,
};

export const TALENT_POSITIONS: Array<{
  id: TalentPosition;
  labelAr: string;
  labelFr: string;
}> = [
  { id: 'goalkeeper', labelAr: 'حارس مرمى', labelFr: 'Gardien de but' },
  { id: 'defender', labelAr: 'مدافع', labelFr: 'Défenseur' },
  { id: 'midfielder', labelAr: 'وسط ميدان', labelFr: 'Milieu de terrain' },
  { id: 'winger', labelAr: 'جناح', labelFr: 'Ailier' },
  { id: 'forward', labelAr: 'مهاجم', labelFr: 'Attaquant' },
];

export const TALENT_COMPETITION_META: Array<{
  key: Exclude<TalentCompetitionCategory, 'showcase'>;
  labelAr: string;
  labelFr: string;
  descAr: string;
  descFr: string;
}> = [
  {
    key: 'best_dribbler',
    labelAr: 'أفضل مراوغ',
    labelFr: 'Meilleur dribbleur',
    descAr: 'مهارة المراوغة وتجاوز المدافعين في المساحات الضيقة.',
    descFr: 'Dribble, élimination et maîtrise technique en un-contre-un.',
  },
  {
    key: 'best_goal',
    labelAr: 'أفضل هدف',
    labelFr: 'Meilleur but',
    descAr: 'أجمل أهداف الأسبوع في المباريات أو التدريبات الرسمية.',
    descFr: 'Les plus beaux buts inscrits en match ou à l’entraînement.',
  },
  {
    key: 'best_free_kick',
    labelAr: 'أفضل ضربة حرة',
    labelFr: 'Meilleur coup franc',
    descAr: 'دقة التسديد وتنفيذ الكرات الثابتة.',
    descFr: 'Précision de frappe et coups francs directs.',
  },
  {
    key: 'best_goalkeeper',
    labelAr: 'أفضل حارس مرمى',
    labelFr: 'Meilleur gardien',
    descAr: 'أفضل التصديات وردود الفعل داخل منطقة الجزاء.',
    descFr: 'Arrêts décisifs, réflexes et sorties aériennes.',
  },
  {
    key: 'best_skills',
    labelAr: 'أفضل مهارات فنية',
    labelFr: 'Meilleures compétences techniques',
    descAr: 'التحكم بالكرة، الترويض، والتمريرات الحاسمة.',
    descFr: 'Contrôle de balle, jonglage et gestes techniques.',
  },
];

export function buildDefaultCompetitions(): TalentCompetition[] {
  const now = new Date();
  const startDate = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().slice(0, 10);
  const weekLabel = `${startDate} / ${endDate}`;

  return TALENT_COMPETITION_META.map((item) => ({
    id: `comp_${item.key}_current`,
    weekLabel,
    categoryKey: item.key,
    titleAr: item.labelAr,
    titleFr: item.labelFr,
    descriptionAr: item.descAr,
    descriptionFr: item.descFr,
    startDate,
    endDate,
    status: 'active',
    isPublic: true,
    createdAt: now.toISOString(),
  }));
}

function clip(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function optClip(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanObj<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

const ALLOWED_VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v'];

export interface ValidatedVideoMeta {
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
}

export async function validateTalentVideoFile(
  file: File,
  maxDurationSeconds = 60,
  maxFileSizeMb = 35,
): Promise<ValidatedVideoMeta> {
  const fileNameLower = (file.name || '').toLowerCase();
  const hasAllowedExt = ALLOWED_VIDEO_EXTS.some((ext) => fileNameLower.endsWith(ext));
  const mime = (file.type || '').toLowerCase();
  const hasAllowedMime = ALLOWED_VIDEO_MIMES.has(mime);

  if (!hasAllowedMime && !hasAllowedExt) {
    throw new Error('صيغة الفيديو غير مدعومة. يرجى اختيار ملف MP4 أو WebM أو MOV.');
  }

  const maxBytes = maxFileSizeMb * 1024 * 1024;
  if (file.size <= 0) {
    throw new Error('ملف الفيديو فارغ أو غير صالح.');
  }
  if (file.size > maxBytes) {
    throw new Error(`حجم الفيديو يتجاوز الحد الأقصى المسموح (${maxFileSizeMb} ميغابايت).`);
  }

  const durationSeconds = await new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.muted = true;

    const cleanup = () => {
      videoEl.removeAttribute('src');
      videoEl.load();
      URL.revokeObjectURL(objectUrl);
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('تعذر قراءة مدة الفيديو. تأكد من صلاحية ملف MP4/WebM.'));
    }, 10000);

    videoEl.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const rawDuration = videoEl.duration;
      cleanup();
      if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
        reject(new Error('تعذر تحديد مدة الفيديو بدقة.'));
        return;
      }
      resolve(Math.ceil(rawDuration));
    };

    videoEl.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('تعذر فتح ملف الفيديو للمعاينة. يرجى اختيار ملف MP4 صالح.'));
    };

    videoEl.src = objectUrl;
  });

  if (durationSeconds > maxDurationSeconds) {
    throw new Error(
      `مدة الفيديو (${durationSeconds} ثانية) تتجاوز الحد الأقصى المسموح (${maxDurationSeconds} ثانية).`,
    );
  }

  return {
    durationSeconds,
    fileSizeBytes: file.size,
    mimeType: mime || 'video/mp4',
  };
}

export async function uploadTalentVideoFile(
  file: File,
  uploaderUid: string,
  videoId: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  const safeName = (file.name || 'talent.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storagePath = `talent-videos/${uploaderUid}/${videoId}_${safeName}`;
  const fileRef = ref(storage, storagePath);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type || 'video/mp4',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const pct = Math.min(100, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          onProgress(pct);
        }
      },
      (err) => {
        const code = (err as { code?: string })?.code || '';
        if (code === 'storage/unauthorized') {
          reject(
            new Error(
              'لا توجد صلاحية لرفع الفيديو إلى Firebase Storage. تأكد من تسجيل الدخول وتفعيل قواعد التخزين.',
            ),
          );
          return;
        }
        if (code === 'storage/unknown' || code === 'storage/bucket-not-found') {
          reject(
            new Error(
              'لم يتم تهيئة Firebase Storage لهذا المشروع بعد في وحدة تحكم Firebase Console.',
            ),
          );
          return;
        }
        reject(new Error('فشل رفع الفيديو إلى السحابة. تحقق من الاتصال بالإنترنت وحاول مجدداً.'));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          onProgress(100);
          resolve(url);
        } catch {
          reject(new Error('تم رفع الملف ولكن تعذر استرجاع رابط الفيديو.'));
        }
      },
    );
  });
}

export const talentStore = {
  // ---- SETTINGS ----
  getTalentSettings: async (): Promise<TalentSettings> => {
    try {
      const snap = await getDoc(doc(db, 'talentSettings', 'main'));
      if (snap.exists()) {
        return { ...DEFAULT_TALENT_SETTINGS, ...(snap.data() as TalentSettings), id: 'main' };
      }
      return DEFAULT_TALENT_SETTINGS;
    } catch {
      return DEFAULT_TALENT_SETTINGS;
    }
  },

  updateTalentSettings: async (patch: Partial<TalentSettings>): Promise<TalentSettings> => {
    const current = await talentStore.getTalentSettings();
    const next: TalentSettings = {
      ...current,
      ...patch,
      id: 'main',
      maxDurationSeconds: Math.min(60, Math.max(10, Number(patch.maxDurationSeconds ?? current.maxDurationSeconds) || 60)),
      maxFileSizeMb: Math.min(100, Math.max(5, Number(patch.maxFileSizeMb ?? current.maxFileSizeMb) || 35)),
      extraSubmissionFeeDzd: Math.max(0, Number(patch.extraSubmissionFeeDzd ?? current.extraSubmissionFeeDzd) || 0),
      isPublic: true,
    };
    try {
      await setDoc(
        doc(db, 'talentSettings', 'main'),
        cleanObj({
          id: 'main',
          firstSubmissionFree: Boolean(next.firstSubmissionFree),
          extraSubmissionEnabled: Boolean(next.extraSubmissionEnabled),
          extraSubmissionFeeDzd: next.extraSubmissionFeeDzd,
          paymentInstructionsAr: optClip(next.paymentInstructionsAr, 500),
          paymentInstructionsFr: optClip(next.paymentInstructionsFr, 500),
          maxDurationSeconds: next.maxDurationSeconds,
          maxFileSizeMb: next.maxFileSizeMb,
          requireModerationBeforePublic: Boolean(next.requireModerationBeforePublic),
          requireParentalConsent: Boolean(next.requireParentalConsent),
          isPublic: true,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return next;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'talentSettings/main');
    }
  },

  // ---- SUBMISSIONS & FEED ----
  listApprovedVideos: async (): Promise<TalentVideo[]> => {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'talentVideos'),
          where('moderationStatus', '==', 'approved'),
          where('parentVerifiedConsent', '==', true),
        ),
      );
      return snap.docs
        .map((d) => ({ ...(d.data() as TalentVideo), id: d.id }))
        .sort((a, b) => {
          if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
    } catch (err) {
      if (isTransientNetworkError(err)) return [];
      handleFirestoreError(err, OperationType.LIST, 'talentVideos');
    }
  },

  listMyVideos: async (uid: string): Promise<TalentVideo[]> => {
    if (!uid) return [];
    try {
      const snap = await getDocs(
        query(collection(db, 'talentVideos'), where('uploaderAuthUid', '==', uid)),
      );
      return snap.docs
        .map((d) => ({ ...(d.data() as TalentVideo), id: d.id }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      if (isTransientNetworkError(err)) return [];
      handleFirestoreError(err, OperationType.LIST, 'talentVideos');
    }
  },

  listAllVideosForAdmin: async (): Promise<TalentVideo[]> => {
    try {
      const snap = await getDocs(collection(db, 'talentVideos'));
      return snap.docs
        .map((d) => ({ ...(d.data() as TalentVideo), id: d.id }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'talentVideos');
    }
  },

  getMySubmissionStats: async (
    uid: string,
    settings?: TalentSettings,
  ): Promise<{
    existingCount: number;
    nextIsFree: boolean;
    extraAllowed: boolean;
    feeDzd: number;
  }> => {
    const cfg = settings || (await talentStore.getTalentSettings());
    const myVideos = await talentStore.listMyVideos(uid);
    const activeCount = myVideos.filter((v) => v.moderationStatus !== 'removed').length;
    const nextIsFree = cfg.firstSubmissionFree && activeCount === 0;
    return {
      existingCount: activeCount,
      nextIsFree,
      extraAllowed: nextIsFree || cfg.extraSubmissionEnabled,
      feeDzd: nextIsFree ? 0 : cfg.extraSubmissionFeeDzd,
    };
  },

  submitTalentVideo: async (payload: {
    user: PublicUser;
    file: File;
    playerDisplayName: string;
    linkedPlayerId?: string;
    title: string;
    description?: string;
    position: TalentPosition;
    ageCategory: string;
    city: string;
    province: string;
    competitionCategory: TalentCompetitionCategory;
    parentVerifiedConsent: boolean;
    parentConsentSignerName: string;
    paymentReference?: string;
    onProgress: (percent: number) => void;
  }): Promise<TalentVideo> => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('يرجى تسجيل الدخول بحساب ولي أمر أو عضو معتمد لنشر فيديو موهبة.');
    }
    const settings = await talentStore.getTalentSettings();
    if (!payload.parentVerifiedConsent || !payload.parentConsentSignerName.trim()) {
      throw new Error('موافقة الولي أو الوصي القانوني إلزامية لحماية القاصرين قبل النشر.');
    }

    const meta = await validateTalentVideoFile(
      payload.file,
      settings.maxDurationSeconds || 60,
      settings.maxFileSizeMb || 35,
    );

    const stats = await talentStore.getMySubmissionStats(fbUser.uid, settings);
    if (!stats.nextIsFree && !settings.extraSubmissionEnabled && payload.user.role !== 'admin') {
      throw new Error('الفيديو الأول مجاني فقط حالياً، والمشاركات الإضافية متوقفة مؤقتاً من الإدارة.');
    }

    const videoId = genId('tvid');
    const videoUrl = await uploadTalentVideoFile(payload.file, fbUser.uid, videoId, payload.onProgress);

    const nowIso = new Date().toISOString();
    const isAdminUploader = payload.user.role === 'admin';
    const submissionTier: TalentVideo['submissionTier'] = stats.nextIsFree ? 'free_first' : 'paid_extra';
    const paymentStatus: TalentVideo['paymentStatus'] = stats.nextIsFree
      ? 'free'
      : isAdminUploader
        ? 'waived'
        : 'pending_payment';

    const moderationStatus: TalentModerationStatus =
      isAdminUploader && !settings.requireModerationBeforePublic ? 'approved' : 'pending';

    const record: TalentVideo = {
      id: videoId,
      playerDisplayName: clip(payload.playerDisplayName, 120),
      linkedPlayerId: optClip(payload.linkedPlayerId, 128),
      uploaderAuthUid: fbUser.uid,
      uploaderRole: payload.user.role,
      isMinor: true,
      parentVerifiedConsent: true,
      parentConsentSignerName: clip(payload.parentConsentSignerName, 120),
      parentConsentAt: nowIso,
      title: clip(payload.title, 160),
      description: optClip(payload.description, 1000),
      videoUrl,
      durationSeconds: meta.durationSeconds,
      fileSizeBytes: meta.fileSizeBytes,
      mimeType: clip(meta.mimeType, 80) || 'video/mp4',
      position: payload.position,
      ageCategory: clip(payload.ageCategory, 32),
      city: clip(payload.city, 100),
      province: clip(payload.province, 100),
      competitionCategory: payload.competitionCategory,
      submissionTier,
      paymentStatus,
      paymentReference: optClip(payload.paymentReference, 120),
      moderationStatus,
      isFeatured: false,
      likesCount: 0,
      viewsCount: 0,
      sharesCount: 0,
      reportsCount: 0,
      createdAt: nowIso,
    };

    try {
      await setDoc(
        doc(db, 'talentVideos', videoId),
        cleanObj({
          ...record,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `talentVideos/${videoId}`);
    }
  },

  // ---- INTERACTIONS (LIKES / VIEWS / SHARES) ----
  listMyLikedVideoIds: async (uid?: string): Promise<Set<string>> => {
    const activeUid = uid || auth.currentUser?.uid;
    if (!activeUid) return new Set();
    try {
      const snap = await getDocs(
        query(collection(db, 'talentLikes'), where('userUid', '==', activeUid)),
      );
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data() as { videoId?: string };
        if (data.videoId) ids.add(data.videoId);
      });
      return ids;
    } catch {
      return new Set();
    }
  },

  toggleLike: async (video: TalentVideo): Promise<{ liked: boolean; likesCount: number }> => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('يرجى تسجيل الدخول للإعجاب بالفيديوهات.');
    }
    const likeId = `${video.id}_${fbUser.uid}`;
    const likeRef = doc(db, 'talentLikes', likeId);
    const videoRef = doc(db, 'talentVideos', video.id);

    try {
      const existing = await getDoc(likeRef);
      const batch = writeBatch(db);
      if (existing.exists()) {
        batch.delete(likeRef);
        if (video.likesCount > 0) {
          batch.update(videoRef, {
            likesCount: increment(-1),
            serverUpdatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        return { liked: false, likesCount: Math.max(0, video.likesCount - 1) };
      } else {
        batch.set(likeRef, {
          id: likeId,
          videoId: video.id,
          userUid: fbUser.uid,
          createdAt: new Date().toISOString(),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        });
        batch.update(videoRef, {
          likesCount: increment(1),
          serverUpdatedAt: serverTimestamp(),
        });
        await batch.commit();
        return { liked: true, likesCount: video.likesCount + 1 };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `talentLikes/${likeId}`);
    }
  },

  recordView: async (videoId: string): Promise<void> => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'talentVideos', videoId), {
        viewsCount: increment(1),
        serverUpdatedAt: serverTimestamp(),
      });
    } catch {
      // non-fatal view counter failure
    }
  },

  recordShare: async (videoId: string): Promise<void> => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'talentVideos', videoId), {
        sharesCount: increment(1),
        serverUpdatedAt: serverTimestamp(),
      });
    } catch {
      // non-fatal share counter failure
    }
  },

  // ---- ADMIN MODERATION & FEATURED ----
  moderateVideo: async (
    videoId: string,
    moderationStatus: TalentModerationStatus,
    moderationNote?: string,
    paymentStatus?: TalentVideo['paymentStatus'],
  ): Promise<void> => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('يرجى تسجيل الدخول.');
    try {
      const patch: Record<string, unknown> = {
        moderationStatus,
        moderatedByUid: fbUser.uid,
        moderatedAt: new Date().toISOString(),
        serverUpdatedAt: serverTimestamp(),
      };
      const cleanNote = optClip(moderationNote, 500);
      if (cleanNote !== undefined) patch.moderationNote = cleanNote;
      if (paymentStatus) patch.paymentStatus = paymentStatus;
      if (moderationStatus === 'removed' || moderationStatus === 'rejected') {
        patch.isFeatured = false;
      }
      await updateDoc(doc(db, 'talentVideos', videoId), patch);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `talentVideos/${videoId}`);
    }
  },

  toggleFeaturedVideo: async (
    videoId: string,
    isFeatured: boolean,
    featuredWeekLabel?: string,
  ): Promise<void> => {
    try {
      await updateDoc(
        doc(db, 'talentVideos', videoId),
        cleanObj({
          isFeatured,
          featuredWeekLabel: optClip(
            featuredWeekLabel || (isFeatured ? new Date().toISOString().slice(0, 10) : undefined),
            64,
          ),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `talentVideos/${videoId}`);
    }
  },

  deleteTalentVideo: async (videoId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'talentVideos', videoId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `talentVideos/${videoId}`);
    }
  },

  // ---- SCOUTING WATCHLIST & OFFICIAL TRIAL INVITATIONS ----
  listWatchlist: async (scoutUid?: string): Promise<TalentWatchlistItem[]> => {
    const uid = scoutUid || auth.currentUser?.uid;
    if (!uid) return [];
    try {
      const snap = await getDocs(
        query(collection(db, 'talentWatchlist'), where('scoutUid', '==', uid)),
      );
      return snap.docs
        .map((d) => ({ ...(d.data() as TalentWatchlistItem), id: d.id }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      if (isTransientNetworkError(err)) return [];
      handleFirestoreError(err, OperationType.LIST, 'talentWatchlist');
    }
  },

  addToWatchlist: async (
    user: PublicUser,
    video: TalentVideo,
    notes?: string,
  ): Promise<TalentWatchlistItem> => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('يرجى تسجيل الدخول.');
    const id = `${fbUser.uid}_${video.id}`.slice(0, 128);
    const item: TalentWatchlistItem = {
      id,
      scoutUid: fbUser.uid,
      scoutName: clip(user.fullName, 120) || 'كشاف النادي',
      scoutRole: user.role === 'admin' ? 'admin' : 'coach',
      videoId: video.id,
      playerDisplayName: clip(video.playerDisplayName, 120),
      ageCategory: clip(video.ageCategory, 32),
      position: video.position,
      city: clip(video.city, 100),
      province: clip(video.province, 100),
      notes: optClip(notes, 500),
      trialInviteSent: false,
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(
        doc(db, 'talentWatchlist', id),
        cleanObj({
          ...item,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return item;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `talentWatchlist/${id}`);
    }
  },

  removeFromWatchlist: async (itemId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'talentWatchlist', itemId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `talentWatchlist/${itemId}`);
    }
  },

  sendTrialInvite: async (payload: {
    user: PublicUser;
    video: TalentVideo;
    trialDate: string;
    trialTime: string;
    trialVenue: string;
    officialMessage: string;
  }): Promise<TalentTrialInvite> => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('يرجى تسجيل الدخول.');
    const inviteId = genId('tinv');
    const invite: TalentTrialInvite = {
      id: inviteId,
      videoId: payload.video.id,
      playerDisplayName: clip(payload.video.playerDisplayName, 120),
      targetParentAuthUid: payload.video.uploaderAuthUid,
      invitedByUid: fbUser.uid,
      invitedByName: clip(payload.user.fullName, 120),
      invitedByRole: payload.user.role === 'admin' ? 'admin' : 'coach',
      categoryId: clip(payload.video.ageCategory, 32),
      trialDate: clip(payload.trialDate, 20),
      trialTime: clip(payload.trialTime, 16),
      trialVenue: clip(payload.trialVenue, 160),
      officialMessage: clip(payload.officialMessage, 1000),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(
        doc(db, 'talentTrialInvites', inviteId),
        cleanObj({
          ...invite,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      // Mark watchlist item if exists
      const watchId = `${fbUser.uid}_${payload.video.id}`.slice(0, 128);
      const watchRef = doc(db, 'talentWatchlist', watchId);
      const watchSnap = await getDoc(watchRef).catch(() => null);
      if (watchSnap && watchSnap.exists()) {
        await updateDoc(watchRef, {
          trialInviteSent: true,
          serverUpdatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      return invite;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `talentTrialInvites/${inviteId}`);
    }
  },

  listMyTrialInvites: async (role: PublicUser['role']): Promise<TalentTrialInvite[]> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return [];
    try {
      if (role === 'admin') {
        const snap = await getDocs(collection(db, 'talentTrialInvites'));
        return snap.docs
          .map((d) => ({ ...(d.data() as TalentTrialInvite), id: d.id }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }
      const field = role === 'coach' ? 'invitedByUid' : 'targetParentAuthUid';
      const snap = await getDocs(
        query(collection(db, 'talentTrialInvites'), where(field, '==', fbUser.uid)),
      );
      return snap.docs
        .map((d) => ({ ...(d.data() as TalentTrialInvite), id: d.id }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      if (isTransientNetworkError(err)) return [];
      handleFirestoreError(err, OperationType.LIST, 'talentTrialInvites');
    }
  },

  respondToTrialInvite: async (
    inviteId: string,
    status: 'accepted' | 'declined',
    parentResponseNote?: string,
  ): Promise<void> => {
    try {
      await updateDoc(
        doc(db, 'talentTrialInvites', inviteId),
        cleanObj({
          status,
          parentResponseNote: optClip(parentResponseNote, 500),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `talentTrialInvites/${inviteId}`);
    }
  },

  // ---- WEEKLY COMPETITIONS ----
  listCompetitions: async (seedIfAdmin = false): Promise<TalentCompetition[]> => {
    try {
      const snap = await getDocs(
        query(collection(db, 'talentCompetitions'), where('isPublic', '==', true)),
      );
      if (snap.empty) {
        const defaults = buildDefaultCompetitions();
        if (seedIfAdmin && auth.currentUser) {
          const batch = writeBatch(db);
          for (const comp of defaults) {
            batch.set(
              doc(db, 'talentCompetitions', comp.id),
              cleanObj({
                ...comp,
                serverCreatedAt: serverTimestamp(),
                serverUpdatedAt: serverTimestamp(),
              }),
            );
          }
          await batch.commit().catch(() => {});
        }
        return defaults;
      }
      return snap.docs.map((d) => ({ ...(d.data() as TalentCompetition), id: d.id }));
    } catch {
      return buildDefaultCompetitions();
    }
  },

  upsertCompetition: async (comp: TalentCompetition): Promise<void> => {
    try {
      await setDoc(
        doc(db, 'talentCompetitions', comp.id),
        cleanObj({
          ...comp,
          isPublic: true,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `talentCompetitions/${comp.id}`);
    }
  },

  setCompetitionWinner: async (
    comp: TalentCompetition,
    video: TalentVideo,
  ): Promise<void> => {
    try {
      await setDoc(
        doc(db, 'talentCompetitions', comp.id),
        cleanObj({
          ...comp,
          status: 'closed',
          winnerVideoId: video.id,
          winnerPlayerName: clip(video.playerDisplayName, 120),
          isPublic: true,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `talentCompetitions/${comp.id}`);
    }
  },

  // ---- CHILD PROTECTION REPORTS ----
  submitReport: async (
    video: TalentVideo,
    reason: TalentReport['reason'],
    details?: string,
  ): Promise<TalentReport> => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('يرجى تسجيل الدخول لإرسال بلاغ حماية أو مراجعة محتوى.');
    }
    const id = genId('trep');
    const report: TalentReport = {
      id,
      videoId: video.id,
      videoTitle: clip(video.title, 160),
      reporterUid: fbUser.uid,
      reason,
      details: optClip(details, 1000),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'talentReports', id),
        cleanObj({
          ...report,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      batch.update(doc(db, 'talentVideos', video.id), {
        reportsCount: increment(1),
        serverUpdatedAt: serverTimestamp(),
      });
      await batch.commit();
      return report;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `talentReports/${id}`);
    }
  },

  listReportsForAdmin: async (): Promise<TalentReport[]> => {
    try {
      const snap = await getDocs(collection(db, 'talentReports'));
      return snap.docs
        .map((d) => ({ ...(d.data() as TalentReport), id: d.id }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'talentReports');
    }
  },

  resolveReport: async (
    reportId: string,
    status: TalentReport['status'],
    adminActionNote?: string,
  ): Promise<void> => {
    try {
      await updateDoc(
        doc(db, 'talentReports', reportId),
        cleanObj({
          status,
          adminActionNote: optClip(adminActionNote, 500),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `talentReports/${reportId}`);
    }
  },
};
