import {
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  linkWithPopup,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  auth,
  db,
  getSecondaryAuthApp,
  googleProvider,
  handleFirestoreError,
  isTransientNetworkError,
  OperationType,
  storage,
  SUPER_ADMIN_EMAIL,
} from './firebase.ts';
import type {
  ActivityLog,
  Announcement,
  AnnualSubscription,
  AttendanceRecord,
  Category,
  ClubSettings,
  Coach,
  CoachReport,
  DashboardSummary,
  EvaluationRecord,
  EvaluationScores,
  FinanceEntry,
  FinanceEntryKind,
  MatchRecord,
  NotificationItem,
  PaymentRecord,
  Player,
  PublicUser,
  RegistrationDocument,
  RegistrationRequest,
  SeasonRecord,
  SubscriptionStatus,
  TrainingSession,
  UserRole,
} from '../types/wab.ts';
import type { CategoryOverview, FinanceSummary, ParentWithChildren } from './api.ts';

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  clubName: 'وداد أمل بوعنان',
  clubShortName: 'W.A.B',
  clubEnglishName: 'WIDAD AMEL BOUINAN',
  foundedYear: '2021',
  logoUrl: '/assets/aistudio/FB_IMG_1792160849908_80558759.jpg',
  primaryColor: '#14532D',
  secondaryColor: '#16A34A',
  surfaceColor: '#F3F4F6',
  phone: '',
  email: '',
  address: 'بوعنان، الجزائر',
  season: '2026-2027',
  seasonStartDate: '2026-09-01',
  seasonEndDate: '2027-06-30',
  subscriptionStartDate: '2026-09-01',
  subscriptionEndDate: '2027-06-30',
  defaultAnnualFee: 16000,
  allowInstallments: true,
  venues: ['الملعب البلدي بوعنان — الرئيسي', 'ملعب التدريب الملحق بوعنان'],
  currency: 'دج',
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'U7', code: 'U7', name: 'أقل من 7 سنوات (البراعم)', ageRange: '5 - 7 سنوات', annualFee: 12000, description: 'تأسيس المهارات الحركية وحب الكرة' },
  { id: 'U9', code: 'U9', name: 'أقل من 9 سنوات', ageRange: '7 - 9 سنوات', annualFee: 14000, description: 'تطوير التحكم بالكرة والتمرير الأساسي' },
  { id: 'U11', code: 'U11', name: 'أقل من 11 سنة', ageRange: '9 - 11 سنة', annualFee: 15000, description: 'مبادئ اللعب الجماعي والتمركز' },
  { id: 'U13', code: 'U13', name: 'أقل من 13 سنة', ageRange: '11 - 13 سنة', annualFee: 16000, description: 'الانتقال إلى اللعب التكتيكي والمنافسات' },
  { id: 'U15', code: 'U15', name: 'أقل من 15 سنة', ageRange: '13 - 15 سنة', annualFee: 18000, description: 'الالتزام البدني والتكتيك المتقدم' },
  { id: 'U17', code: 'U17', name: 'أقل من 17 سنة (الأشبال)', ageRange: '15 - 17 سنة', annualFee: 20000, description: 'الإعداد التنافسي والجاهزية الكاملة' },
];

export function genId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'rec';
  const rand = Math.random().toString(36).slice(2, 8);
  return `${safePrefix}_${Date.now().toString(36)}_${rand}`;
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || genId(fallbackPrefix);
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
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function computeAverage(scores: EvaluationScores): number {
  const vals = Object.values(scores).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (vals.length === 0) return 0;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
}

function mapFirebaseAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed') {
    return new Error(
      'ميزة تسجيل الدخول بالبريد الإلكتروني وكلمة المرور غير مفعّلة بعد في مشروع Firebase الحالي. يرجى استخدام زر «تسجيل الدخول بحساب Google» أو تفعيل Email/Password من Firebase Console → Authentication → Sign-in method.',
    );
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }
  if (code === 'auth/email-already-in-use') {
    return new Error('هذا البريد الإلكتروني مسجل مسبقاً في Firebase Authentication.');
  }
  if (code === 'auth/weak-password') {
    return new Error('كلمة المرور ضعيفة جداً. يرجى استخدام 6 أحرف على الأقل (يفضل 8 أحرف).');
  }
  if (code === 'auth/popup-closed-by-user') {
    return new Error('تم إغلاق نافذة تسجيل الدخول بحساب Google قبل إتمام العملية.');
  }
  if (code === 'auth/popup-blocked') {
    return new Error('قام المتصفح بحظر النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.');
  }
  if (code === 'auth/network-request-failed' || isTransientNetworkError(err)) {
    return new Error('تعذر الاتصال بخدمات Firebase حالياً (تحقق من الاتصال بالإنترنت).');
  }
  return new Error(msg);
}

let cachedUserProfile: PublicUser | null = null;
export function getCachedFirebaseUserProfile(): PublicUser | null {
  return cachedUserProfile;
}
export function clearCachedFirebaseUserProfile() {
  cachedUserProfile = null;
}

async function getAuthorizedCoachUidsForCategory(categoryId: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'categories', categoryId));
    if (snap.exists()) {
      const data = snap.data() as { authorizedCoachUids?: string[] };
      if (Array.isArray(data.authorizedCoachUids)) {
        return data.authorizedCoachUids.filter((u) => typeof u === 'string' && u.length > 0).slice(0, 30);
      }
    }
  } catch {
    // ignore if offline or missing category doc
  }
  return [];
}

async function getCoachNamesForCategory(categoryId: string): Promise<string[]> {
  try {
    const snap = await getDocs(collection(db, 'coaches'));
    return snap.docs
      .map((d) => d.data() as Coach)
      .filter((c) => c.active && Array.isArray(c.categoryIds) && c.categoryIds.includes(categoryId))
      .map((c) => c.fullName)
      .slice(0, 30);
  } catch {
    return [];
  }
}

async function getCurrentRole(): Promise<UserRole> {
  const fbUser = auth.currentUser;
  if (!fbUser) throw new Error('يرجى تسجيل الدخول أولاً.');
  if (fbUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL && fbUser.emailVerified) {
    return 'admin';
  }
  if (cachedUserProfile && cachedUserProfile.id === fbUser.uid) {
    return cachedUserProfile.role;
  }
  const userSnap = await getDoc(doc(db, 'users', fbUser.uid));
  if (userSnap.exists()) {
    const data = userSnap.data() as PublicUser;
    cachedUserProfile = data;
    return data.role;
  }
  throw new Error('لم يتم العثور على ملف المستخدم المرتبط بهذا الحساب.');
}

async function ensureSuperAdminBootstrapped(fbUser: FirebaseUser): Promise<PublicUser> {
  const email = (fbUser.email || '').toLowerCase();
  if (email !== SUPER_ADMIN_EMAIL) {
    throw new Error('هذا البريد الإلكتروني ليس حساب الإدارة الرئيسي المعتمد.');
  }

  const nowIso = new Date().toISOString();
  const adminRef = doc(db, 'admins', fbUser.uid);
  const userRef = doc(db, 'users', fbUser.uid);

  try {
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(
        adminRef,
        cleanObj({
          uid: fbUser.uid,
          email: SUPER_ADMIN_EMAIL,
          role: 'super_admin',
          fullName: clip(fbUser.displayName || 'مدير النادي الرئيسي (W.A.B)', 120),
          createdAt: nowIso,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } else {
      await updateDoc(adminRef, {
        serverUpdatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${fbUser.uid}`);
    }
  }

  let profile: PublicUser = {
    id: fbUser.uid,
    username: 'boudiafrabeh8',
    email: SUPER_ADMIN_EMAIL,
    fullName: clip(fbUser.displayName || 'مدير نادي وداد أمل بوعنان', 120),
    role: 'admin',
    phone: '',
    active: true,
    categoryIds: DEFAULT_CATEGORIES.map((c) => c.id),
    photoUrl: fbUser.photoURL || undefined,
    createdAt: nowIso,
    lastLoginAt: nowIso,
  };

  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(
        userRef,
        cleanObj({
          id: fbUser.uid,
          uid: fbUser.uid,
          username: 'boudiafrabeh8',
          email: SUPER_ADMIN_EMAIL,
          fullName: profile.fullName,
          role: 'admin',
          phone: '',
          active: true,
          categoryIds: profile.categoryIds,
          photoUrl: optClip(fbUser.photoURL, 1000),
          createdAt: nowIso,
          lastLoginAt: nowIso,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    } else {
      const existingData = userSnap.data() as PublicUser;
      profile = {
        ...existingData,
        id: fbUser.uid,
        role: 'admin',
        active: true,
        lastLoginAt: nowIso,
      };
      await updateDoc(userRef, {
        lastLoginAt: nowIso,
        serverUpdatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`);
    }
  }

  cachedUserProfile = profile;

  // Trigger non-destructive, idempotent initialization & backup migration
  void ensureDefaultsAndBackupMigrated(fbUser).catch((err) => {
    console.warn('Background migration check skipped/deferred:', err);
  });

  return profile;
}

async function ensureDefaultClubAndCategories(isAdminUser: boolean) {
  if (!isAdminUser) return;
  try {
    const pubRef = doc(db, 'clubSettingsPublic', 'main');
    const pubSnap = await getDoc(pubRef);
    if (!pubSnap.exists()) {
      await setDoc(
        pubRef,
        cleanObj({
          id: 'main',
          clubName: DEFAULT_CLUB_SETTINGS.clubName,
          clubShortName: DEFAULT_CLUB_SETTINGS.clubShortName,
          clubEnglishName: DEFAULT_CLUB_SETTINGS.clubEnglishName,
          foundedYear: DEFAULT_CLUB_SETTINGS.foundedYear,
          logoUrl: DEFAULT_CLUB_SETTINGS.logoUrl,
          primaryColor: DEFAULT_CLUB_SETTINGS.primaryColor,
          secondaryColor: DEFAULT_CLUB_SETTINGS.secondaryColor,
          surfaceColor: DEFAULT_CLUB_SETTINGS.surfaceColor,
          address: DEFAULT_CLUB_SETTINGS.address,
          season: DEFAULT_CLUB_SETTINGS.season,
          seasonStartDate: DEFAULT_CLUB_SETTINGS.seasonStartDate,
          seasonEndDate: DEFAULT_CLUB_SETTINGS.seasonEndDate,
          venues: DEFAULT_CLUB_SETTINGS.venues,
          currency: DEFAULT_CLUB_SETTINGS.currency,
          isPublic: true,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    }

    const privRef = doc(db, 'clubSettingsPrivate', 'main');
    const privSnap = await getDoc(privRef);
    if (!privSnap.exists()) {
      await setDoc(
        privRef,
        cleanObj({
          id: 'main',
          phone: DEFAULT_CLUB_SETTINGS.phone,
          email: DEFAULT_CLUB_SETTINGS.email,
          subscriptionStartDate: DEFAULT_CLUB_SETTINGS.subscriptionStartDate,
          subscriptionEndDate: DEFAULT_CLUB_SETTINGS.subscriptionEndDate,
          defaultAnnualFee: DEFAULT_CLUB_SETTINGS.defaultAnnualFee,
          allowInstallments: DEFAULT_CLUB_SETTINGS.allowInstallments,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    }

    const catsSnap = await getDocs(query(collection(db, 'categories'), limit(1)));
    if (catsSnap.empty) {
      const batch = writeBatch(db);
      for (const cat of DEFAULT_CATEGORIES) {
        batch.set(
          doc(db, 'categories', cat.id),
          cleanObj({
            id: cat.id,
            code: cat.code,
            name: cat.name,
            ageRange: cat.ageRange,
            description: cat.description,
            isActive: true,
            authorizedCoachUids: [],
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          }),
        );
        batch.set(
          doc(db, 'categoryFees', cat.id),
          cleanObj({
            id: cat.id,
            categoryId: cat.id,
            annualFee: cat.annualFee,
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          }),
        );
      }
      await batch.commit();
    }

    const seasonsSnap = await getDocs(query(collection(db, 'seasons'), limit(1)));
    if (seasonsSnap.empty) {
      const seasonId = 'season_2026_2027';
      await setDoc(
        doc(db, 'seasons', seasonId),
        cleanObj({
          id: seasonId,
          name: DEFAULT_CLUB_SETTINGS.season,
          startDate: DEFAULT_CLUB_SETTINGS.seasonStartDate,
          endDate: DEFAULT_CLUB_SETTINGS.seasonEndDate,
          subscriptionStartDate: DEFAULT_CLUB_SETTINGS.subscriptionStartDate,
          subscriptionEndDate: DEFAULT_CLUB_SETTINGS.subscriptionEndDate,
          defaultAnnualFee: DEFAULT_CLUB_SETTINGS.defaultAnnualFee,
          allowInstallments: DEFAULT_CLUB_SETTINGS.allowInstallments,
          status: 'active',
          createdAt: new Date().toISOString(),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
    }
  } catch (err) {
    if (!isTransientNetworkError(err)) {
      console.warn('Could not initialize default club documents:', err);
    }
  }
}

let migrationPromise: Promise<void> | null = null;
export async function ensureDefaultsAndBackupMigrated(fbUser: FirebaseUser): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const email = (fbUser.email || '').toLowerCase();
    if (email !== SUPER_ADMIN_EMAIL || !fbUser.emailVerified) return;

    const markerRef = doc(db, 'migrations', 'wab_backup_v1');
    const markerSnap = await getDoc(markerRef);
    if (markerSnap.exists()) {
      await ensureDefaultClubAndCategories(true);
      return;
    }

    // Never overwrite if Firestore already has players
    const existingPlayers = await getDocs(query(collection(db, 'players'), limit(1)));
    if (!existingPlayers.empty) {
      await ensureDefaultClubAndCategories(true);
      return;
    }

    const idToken = await fbUser.getIdToken();
    const res = await fetch('/api/backup/snapshot', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) {
      await ensureDefaultClubAndCategories(true);
      return;
    }
    const snapshot = (await res.json()) as {
      exists: boolean;
      checksum: string;
      counts: Record<string, number>;
      data: {
        users?: Array<Omit<PublicUser, 'passwordHash'>>;
        categories?: Category[];
        seasons?: SeasonRecord[];
        coaches?: Coach[];
        players?: Player[];
        trainingSessions?: TrainingSession[];
        attendance?: AttendanceRecord[];
        matches?: MatchRecord[];
        subscriptions?: AnnualSubscription[];
        payments?: PaymentRecord[];
        financeEntries?: FinanceEntry[];
        announcements?: Announcement[];
        notifications?: NotificationItem[];
        evaluations?: EvaluationRecord[];
        coachReports?: CoachReport[];
        registrationRequests?: RegistrationRequest[];
        activityLogs?: ActivityLog[];
        clubSettings?: ClubSettings;
      } | null;
    };

    if (!snapshot.exists || !snapshot.data) {
      await ensureDefaultClubAndCategories(true);
      return;
    }

    const d = snapshot.data;
    const cs = { ...DEFAULT_CLUB_SETTINGS, ...(d.clubSettings || {}) };
    const ops: Array<{ path: string; id: string; payload: DocumentData }> = [];

    ops.push({
      path: 'clubSettingsPublic',
      id: 'main',
      payload: cleanObj({
        id: 'main',
        clubName: clip(cs.clubName, 120) || DEFAULT_CLUB_SETTINGS.clubName,
        clubShortName: clip(cs.clubShortName, 32) || 'W.A.B',
        clubEnglishName: optClip(cs.clubEnglishName, 120),
        foundedYear: optClip(cs.foundedYear, 10),
        logoUrl: clip(cs.logoUrl, 1000) || DEFAULT_CLUB_SETTINGS.logoUrl,
        primaryColor: clip(cs.primaryColor, 20) || '#14532D',
        secondaryColor: optClip(cs.secondaryColor, 20),
        surfaceColor: optClip(cs.surfaceColor, 20),
        address: optClip(cs.address, 200),
        season: clip(cs.season, 40) || '2026-2027',
        seasonStartDate: optClip(cs.seasonStartDate, 20),
        seasonEndDate: optClip(cs.seasonEndDate, 20),
        venues: Array.isArray(cs.venues) ? cs.venues.slice(0, 20).map((v) => clip(v, 160)) : [],
        currency: optClip(cs.currency, 16) || 'دج',
        isPublic: true,
        serverCreatedAt: serverTimestamp(),
        serverUpdatedAt: serverTimestamp(),
      }),
    });

    ops.push({
      path: 'clubSettingsPrivate',
      id: 'main',
      payload: cleanObj({
        id: 'main',
        phone: optClip(cs.phone, 40),
        email: optClip(cs.email, 160),
        subscriptionStartDate: optClip(cs.subscriptionStartDate, 20),
        subscriptionEndDate: optClip(cs.subscriptionEndDate, 20),
        defaultAnnualFee: Number(cs.defaultAnnualFee) || 16000,
        allowInstallments: Boolean(cs.allowInstallments),
        serverCreatedAt: serverTimestamp(),
        serverUpdatedAt: serverTimestamp(),
      }),
    });

    const cats = Array.isArray(d.categories) && d.categories.length > 0 ? d.categories : DEFAULT_CATEGORIES;
    for (const c of cats) {
      const catId = sanitizeId(c.id, 'cat');
      ops.push({
        path: 'categories',
        id: catId,
        payload: cleanObj({
          id: catId,
          code: clip(c.code, 20) || catId,
          name: clip(c.name, 120) || catId,
          ageRange: clip(c.ageRange, 64) || '-',
          description: clip(c.description, 500),
          isActive: true,
          authorizedCoachUids: [],
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
      ops.push({
        path: 'categoryFees',
        id: catId,
        payload: cleanObj({
          id: catId,
          categoryId: catId,
          annualFee: Number(c.annualFee) || 16000,
          monthlyFee: typeof c.monthlyFee === 'number' ? c.monthlyFee : undefined,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    const seasons =
      Array.isArray(d.seasons) && d.seasons.length > 0
        ? d.seasons
        : [
            {
              id: 'season_2026_2027',
              name: cs.season || '2026-2027',
              startDate: cs.seasonStartDate || '2026-09-01',
              endDate: cs.seasonEndDate || '2027-06-30',
              subscriptionStartDate: cs.subscriptionStartDate || '2026-09-01',
              subscriptionEndDate: cs.subscriptionEndDate || '2027-06-30',
              defaultAnnualFee: Number(cs.defaultAnnualFee) || 16000,
              allowInstallments: Boolean(cs.allowInstallments),
              status: 'active' as const,
              createdAt: new Date().toISOString(),
            },
          ];

    for (const s of seasons) {
      const sid = sanitizeId(s.id, 'season');
      ops.push({
        path: 'seasons',
        id: sid,
        payload: cleanObj({
          id: sid,
          name: clip(s.name, 64),
          startDate: clip(s.startDate, 20),
          endDate: clip(s.endDate, 20),
          subscriptionStartDate: optClip(s.subscriptionStartDate, 20),
          subscriptionEndDate: optClip(s.subscriptionEndDate, 20),
          defaultAnnualFee: typeof s.defaultAnnualFee === 'number' ? s.defaultAnnualFee : 16000,
          allowInstallments: typeof s.allowInstallments === 'boolean' ? s.allowInstallments : true,
          status: s.status === 'archived' ? 'archived' : 'active',
          createdAt: optClip(s.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const u of d.users || []) {
      const uid = sanitizeId(u.id, 'usr');
      ops.push({
        path: 'users',
        id: uid,
        payload: cleanObj({
          id: uid,
          uid,
          username: clip(u.username || uid, 64),
          email: clip(u.email || `${uid}@wab-club.local`, 160),
          fullName: clip(u.fullName || uid, 120),
          role: u.role === 'admin' || u.role === 'coach' || u.role === 'parent' ? u.role : 'parent',
          phone: optClip(u.phone, 32),
          active: u.active !== false,
          categoryIds: Array.isArray(u.categoryIds) ? u.categoryIds.slice(0, 20) : [],
          photoUrl: optClip(u.photoUrl, 1000),
          allowCoachPhotoEdit: typeof u.allowCoachPhotoEdit === 'boolean' ? u.allowCoachPhotoEdit : undefined,
          scopedPlayerId: optClip(u.scopedPlayerId, 128),
          createdAt: optClip(u.createdAt, 40),
          lastLoginAt: optClip(u.lastLoginAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const ch of d.coaches || []) {
      const cid = sanitizeId(ch.id, 'coach');
      ops.push({
        path: 'coaches',
        id: cid,
        payload: cleanObj({
          id: cid,
          userId: clip(ch.userId || cid, 128),
          fullName: clip(ch.fullName, 120),
          phone: optClip(ch.phone, 32),
          email: clip(ch.email || `${cid}@wab-club.local`, 160),
          specialty: optClip(ch.specialty, 160),
          categoryIds: Array.isArray(ch.categoryIds) ? ch.categoryIds.slice(0, 20) : [],
          trainingProgram: optClip(ch.trainingProgram, 1000),
          active: ch.active !== false,
          joinedAt: clip(ch.joinedAt || new Date().toISOString().slice(0, 10), 40),
          photoUrl: optClip(ch.photoUrl, 1000),
          allowCoachPhotoEdit: typeof ch.allowCoachPhotoEdit === 'boolean' ? ch.allowCoachPhotoEdit : undefined,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    const playerMap = new Map<string, Player>();
    for (const p of d.players || []) {
      const pid = sanitizeId(p.id, 'ply');
      playerMap.set(pid, p);
      ops.push({
        path: 'players',
        id: pid,
        payload: cleanObj({
          id: pid,
          fullName: clip(p.fullName, 120),
          photoUrl: optClip(p.photoUrl, 1000),
          birthDate: clip(p.birthDate, 20),
          categoryId: clip(p.categoryId, 64),
          parentName: clip(p.parentName || '-', 120),
          parentPhone: clip(p.parentPhone || '-', 32),
          parentUserId: clip(p.parentUserId || '', 128),
          authorizedCoachUids: [],
          coachNames: Array.isArray(p.coachNames) ? p.coachNames.slice(0, 30) : undefined,
          address: optClip(p.address, 240),
          registrationDate: clip(p.registrationDate || new Date().toISOString().slice(0, 10), 40),
          status: p.status === 'inactive' || p.status === 'archived' ? p.status : 'active',
          jerseyNumber: typeof p.jerseyNumber === 'number' ? p.jerseyNumber : undefined,
          position: optClip(p.position, 80),
          adminNotes: optClip(p.adminNotes, 1000),
          medicalNotes: optClip(p.medicalNotes, 1000),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const t of d.trainingSessions || []) {
      const tid = sanitizeId(t.id, 'trn');
      ops.push({
        path: 'trainingSessions',
        id: tid,
        payload: cleanObj({
          id: tid,
          title: clip(t.title, 160),
          categoryId: clip(t.categoryId, 64),
          coachId: optClip(t.coachId, 128),
          coachName: optClip(t.coachName, 120),
          coachPhotoUrl: optClip(t.coachPhotoUrl, 1000),
          authorizedCoachUids: [],
          date: clip(t.date, 20),
          startTime: optClip(t.startTime, 16),
          endTime: optClip(t.endTime, 16),
          venue: optClip(t.venue, 160),
          objectives: optClip(t.objectives, 1000),
          notes: optClip(t.notes, 1000),
          status: t.status === 'completed' || t.status === 'cancelled' ? t.status : 'scheduled',
          createdAt: optClip(t.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const a of d.attendance || []) {
      const aid = sanitizeId(a.id, 'att');
      ops.push({
        path: 'attendance',
        id: aid,
        payload: cleanObj({
          id: aid,
          playerId: sanitizeId(a.playerId, 'ply'),
          playerName: clip(a.playerName || 'لاعب', 120),
          categoryId: clip(a.categoryId, 64),
          authorizedCoachUids: [],
          sessionId: sanitizeId(a.sessionId || 'trn_1', 'trn'),
          sessionTitle: optClip(a.sessionTitle, 160),
          date: clip(a.date, 20),
          status: a.status === 'absent' || a.status === 'excused' ? a.status : 'present',
          notes: optClip(a.notes, 500),
          recordedBy: optClip(a.recordedBy, 128),
          recordedByName: optClip(a.recordedByName, 120),
          updatedAt: optClip(a.updatedAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const m of d.matches || []) {
      const mid = sanitizeId(m.id, 'mat');
      ops.push({
        path: 'matches',
        id: mid,
        payload: cleanObj({
          id: mid,
          opponent: clip(m.opponent, 160),
          categoryId: clip(m.categoryId, 64),
          authorizedCoachUids: [],
          date: clip(m.date, 20),
          time: optClip(m.time, 16),
          venue: optClip(m.venue, 160),
          locationType: m.locationType === 'away' ? 'away' : 'home',
          status:
            m.status === 'completed' || m.status === 'cancelled' || m.status === 'postponed'
              ? m.status
              : 'scheduled',
          goalsFor: typeof m.goalsFor === 'number' ? m.goalsFor : 0,
          goalsAgainst: typeof m.goalsAgainst === 'number' ? m.goalsAgainst : 0,
          technicalNotes: optClip(m.technicalNotes, 1000),
          createdAt: optClip(m.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const pay of d.payments || []) {
      const pid = sanitizeId(pay.id, 'pay');
      ops.push({
        path: 'payments',
        id: pid,
        payload: cleanObj({
          id: pid,
          subscriptionId: optClip(pay.subscriptionId, 128),
          seasonId: optClip(pay.seasonId || seasons[0].id, 128),
          seasonName: optClip(pay.seasonName || seasons[0].name, 64),
          playerId: sanitizeId(pay.playerId, 'ply'),
          playerName: optClip(pay.playerName, 120),
          categoryId: optClip(pay.categoryId, 64),
          amount: Number(pay.amount) || 0,
          month: optClip(pay.month, 20),
          paymentDate: clip(pay.paymentDate || new Date().toISOString().slice(0, 10), 20),
          method:
            pay.method === 'bank_transfer' || pay.method === 'check' || pay.method === 'ccp'
              ? pay.method
              : 'cash',
          receiptNumber: clip(pay.receiptNumber || `WAB-${pid}`, 64),
          status: pay.status === 'partial' || pay.status === 'unpaid' ? pay.status : 'paid',
          notes: optClip(pay.notes, 500),
          recordedBy: optClip(pay.recordedBy, 128),
          recordedByName: optClip(pay.recordedByName, 120),
          createdAt: optClip(pay.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const sub of d.subscriptions || []) {
      const sid = sanitizeId(sub.id, 'sub');
      ops.push({
        path: 'subscriptions',
        id: sid,
        payload: cleanObj({
          id: sid,
          seasonId: clip(sub.seasonId || seasons[0].id, 128),
          seasonName: optClip(sub.seasonName || seasons[0].name, 64),
          playerId: sanitizeId(sub.playerId, 'ply'),
          playerName: optClip(sub.playerName, 120),
          categoryId: optClip(sub.categoryId, 64),
          totalFee: Number(sub.totalFee) || 0,
          paidAmount: Number(sub.paidAmount) || 0,
          remainingAmount: Number(sub.remainingAmount) || 0,
          status: sub.status || 'unpaid',
          startDate: optClip(sub.startDate, 20),
          endDate: optClip(sub.endDate, 20),
          notes: optClip(sub.notes, 500),
          createdAt: optClip(sub.createdAt, 40),
          updatedAt: optClip(sub.updatedAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const ann of d.announcements || []) {
      const aid = sanitizeId(ann.id, 'ann');
      ops.push({
        path: 'announcements',
        id: aid,
        payload: cleanObj({
          id: aid,
          title: clip(ann.title, 160),
          body: clip(ann.body, 3000),
          type: ann.type || 'general',
          targetAudience: ann.targetAudience || 'all',
          targetCategoryId: optClip(ann.targetCategoryId, 64),
          pinned: Boolean(ann.pinned),
          authorId: clip(ann.authorId || fbUser.uid, 128),
          authorName: clip(ann.authorName || 'إدارة النادي', 120),
          createdAt: optClip(ann.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const n of d.notifications || []) {
      const nid = sanitizeId(n.id, 'not');
      ops.push({
        path: 'notifications',
        id: nid,
        payload: cleanObj({
          id: nid,
          userId: clip(n.userId || fbUser.uid, 128),
          title: clip(n.title, 160),
          message: clip(n.message, 1000),
          type: optClip(n.type, 64),
          relatedId: optClip(n.relatedId, 128),
          read: Boolean(n.read),
          createdAt: optClip(n.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const ev of d.evaluations || []) {
      const eid = sanitizeId(ev.id, 'evl');
      ops.push({
        path: 'evaluations',
        id: eid,
        payload: cleanObj({
          id: eid,
          playerId: sanitizeId(ev.playerId, 'ply'),
          playerName: optClip(ev.playerName, 120),
          categoryId: clip(ev.categoryId, 64),
          authorizedCoachUids: [],
          coachId: optClip(ev.coachId, 128),
          coachName: optClip(ev.coachName, 120),
          date: clip(ev.date, 20),
          period: optClip(ev.period, 64),
          scores: ev.scores || {},
          overallAverage: Number(ev.overallAverage) || 0,
          notes: optClip(ev.notes, 1000),
          published: Boolean(ev.published),
          approvedByAdmin: typeof ev.approvedByAdmin === 'boolean' ? ev.approvedByAdmin : undefined,
          createdAt: optClip(ev.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    for (const lg of d.activityLogs || []) {
      const lid = sanitizeId(lg.id, 'log');
      ops.push({
        path: 'activityLogs',
        id: lid,
        payload: cleanObj({
          id: lid,
          actorId: clip(lg.actorId || fbUser.uid, 128),
          actorName: clip(lg.actorName || 'إدارة النادي', 120),
          actorRole: lg.actorRole === 'coach' || lg.actorRole === 'parent' ? lg.actorRole : 'admin',
          action: clip(lg.action, 160),
          entityType: clip(lg.entityType || 'system', 64),
          entityId: clip(lg.entityId || lid, 128),
          details: optClip(lg.details, 1000),
          createdAt: optClip(lg.createdAt, 40),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      });
    }

    // Write in safe chunks (< 400 per batch)
    const CHUNK = 350;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const item of ops.slice(i, i + CHUNK)) {
        batch.set(doc(db, item.path, item.id), item.payload);
      }
      await batch.commit();
    }

    await setDoc(markerRef, {
      id: 'wab_backup_v1',
      completedAt: new Date().toISOString(),
      sourceChecksum: snapshot.checksum,
      importedCounts: snapshot.counts,
      serverCreatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });
  })();

  try {
    await migrationPromise;
  } finally {
    migrationPromise = null;
  }
}

async function resolveFirebaseProfileForNonSuperAdmin(
  fbUser: FirebaseUser,
  expectedRole?: UserRole,
): Promise<PublicUser> {
  const uid = fbUser.uid;
  const email = (fbUser.email || '').toLowerCase();

  try {
    const directSnap = await getDoc(doc(db, 'users', uid));
    if (directSnap.exists()) {
      const user = { ...(directSnap.data() as PublicUser), id: uid };
      if (!user.active) {
        throw new Error('هذا الحساب معطل حالياً، يرجى مراجعة إدارة النادي.');
      }
      if (expectedRole && user.role !== expectedRole) {
        throw new Error(`تم رفض الوصول: حسابك مسجل بدور «${user.role}» وليس لديه صلاحية دخول فضاء «${expectedRole}».`);
      }
      cachedUserProfile = user;
      try {
        await updateDoc(doc(db, 'users', uid), {
          lastLoginAt: new Date().toISOString(),
          serverUpdatedAt: serverTimestamp(),
        });
      } catch {
        // offline update ok
      }
      return user;
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes('تم رفض الوصول') || err.message.includes('معطل'))) {
      throw err;
    }
    if (isTransientNetworkError(err) && cachedUserProfile && cachedUserProfile.id === uid) {
      return cachedUserProfile;
    }
  }

  // Fallback check if Super Admin signed in
  if (email === SUPER_ADMIN_EMAIL) {
    if (expectedRole && expectedRole !== 'admin') {
      throw new Error('حساب الإدارة الرئيسي مخصص لبوابة الإدارة (/admin) فقط.');
    }
    return ensureSuperAdminBootstrapped(fbUser);
  }

  throw new Error(
    'لم يتم العثور على ملف صلاحيات لهذا الحساب في النادي. يرجى التواصل مع إدارة النادي لتفعيل حسابك وربطه بدورك.',
  );
}

async function recordActivity(action: string, entityType: string, entityId: string, details?: string) {
  const fbUser = auth.currentUser;
  if (!fbUser) return;
  const role = await getCurrentRole().catch(() => 'admin' as UserRole);
  if (role !== 'admin') return;
  const id = genId('log');
  const nowIso = new Date().toISOString();
  try {
    await setDoc(
      doc(db, 'activityLogs', id),
      cleanObj({
        id,
        actorId: fbUser.uid,
        actorName: clip(cachedUserProfile?.fullName || fbUser.displayName || 'الإدارة', 120),
        actorRole: role,
        action: clip(action, 160),
        entityType: clip(entityType, 64),
        entityId: clip(entityId, 128),
        details: optClip(details, 1000),
        createdAt: nowIso,
        serverCreatedAt: serverTimestamp(),
        serverUpdatedAt: serverTimestamp(),
      }),
    );
  } catch {
    // non-fatal log error
  }
}

async function syncCategoryCoachUids(categoryId: string, coachAuthUids: string[]) {
  const uniqueUids = Array.from(new Set(coachAuthUids.filter(Boolean))).slice(0, 30);
  const coachNames = await getCoachNamesForCategory(categoryId);

  try {
    const catRef = doc(db, 'categories', categoryId);
    const catSnap = await getDoc(catRef);
    if (catSnap.exists()) {
      await updateDoc(catRef, {
        authorizedCoachUids: uniqueUids,
        serverUpdatedAt: serverTimestamp(),
      });
    }
  } catch {
    // ignore
  }

  const colNames = ['players', 'trainingSessions', 'attendance', 'matches', 'evaluations'] as const;
  for (const colName of colNames) {
    try {
      const snap = await getDocs(query(collection(db, colName), where('categoryId', '==', categoryId)));
      if (snap.empty) continue;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        const patch: Record<string, unknown> = {
          authorizedCoachUids: uniqueUids,
          serverUpdatedAt: serverTimestamp(),
        };
        if (colName === 'players') {
          patch.coachNames = coachNames;
        }
        batch.update(d.ref, patch);
      });
      await batch.commit();
    } catch {
      // ignore if offline or empty
    }
  }
}

export const firebaseStore = {
  // ---- AUTH ----
  loginWithGoogle: async (expectedRole?: UserRole): Promise<PublicUser> => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const email = (cred.user.email || '').toLowerCase();
      if (email === SUPER_ADMIN_EMAIL) {
        if (expectedRole && expectedRole !== 'admin') {
          await signOut(auth);
          throw new Error('حساب الإدارة الرئيسي مخصص لفضاء الإدارة (/admin) فقط.');
        }
        return await ensureSuperAdminBootstrapped(cred.user);
      }
      return await resolveFirebaseProfileForNonSuperAdmin(cred.user, expectedRole);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider);
          throw new Error('جارٍ تحويلك إلى صفحة مصادقة Google...');
        } catch (redirErr) {
          throw mapFirebaseAuthError(redirErr);
        }
      }
      throw mapFirebaseAuthError(err);
    }
  },

  linkWithGoogle: async (): Promise<PublicUser> => {
    if (!auth.currentUser) throw new Error('يرجى تسجيل الدخول أولاً.');
    try {
      await linkWithPopup(auth.currentUser, googleProvider);
      const email = (auth.currentUser.email || '').toLowerCase();
      if (email === SUPER_ADMIN_EMAIL) {
        return await ensureSuperAdminBootstrapped(auth.currentUser);
      }
      return cachedUserProfile || (await resolveFirebaseProfileForNonSuperAdmin(auth.currentUser));
    } catch (err) {
      throw mapFirebaseAuthError(err);
    }
  },

  loginWithUsernameOrEmail: async (identifier: string, password: string, expectedRole?: UserRole): Promise<PublicUser> => {
    let email = identifier.trim().toLowerCase();
    if (!email.includes('@')) {
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('username', '==', email)));
        if (!usersSnap.empty) {
          const uData = usersSnap.docs[0].data() as PublicUser;
          if (uData.email) {
            email = uData.email.toLowerCase();
          }
        } else {
          email = `wab_u_${email}@wab-club.local`;
        }
      } catch {
        email = `wab_u_${email}@wab-club.local`;
      }
    }
    return firebaseStore.loginWithEmail(email, password, expectedRole);
  },

  loginWithEmail: async (email: string, password: string, expectedRole?: UserRole): Promise<PublicUser> => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (cleanEmail === SUPER_ADMIN_EMAIL) {
        if (expectedRole && expectedRole !== 'admin') {
          await signOut(auth);
          throw new Error('حساب الإدارة الرئيسي مخصص لفضاء الإدارة (/admin) فقط.');
        }
        return await ensureSuperAdminBootstrapped(cred.user);
      }
      return await resolveFirebaseProfileForNonSuperAdmin(cred.user, expectedRole);
    } catch (err) {
      if (cleanEmail === SUPER_ADMIN_EMAIL) {
        try {
          let cred;
          try {
            cred = await createUserWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, password);
          } catch (createErr) {
            const code = (createErr as { code?: string })?.code || '';
            if (code === 'auth/email-already-in-use') {
              cred = await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, password);
            } else {
              throw createErr;
            }
          }
          if (expectedRole && expectedRole !== 'admin') {
            await signOut(auth);
            throw new Error('حساب الإدارة الرئيسي مخصص لفضاء الإدارة (/admin) فقط.');
          }
          return await ensureSuperAdminBootstrapped(cred.user);
        } catch (bootstrapErr) {
          throw mapFirebaseAuthError(bootstrapErr);
        }
      }
      throw mapFirebaseAuthError(err);
    }
  },

  setupSuperAdminEmail: async (payload: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
  }): Promise<PublicUser> => {
    const cleanEmail = payload.email.trim().toLowerCase();
    if (cleanEmail !== SUPER_ADMIN_EMAIL) {
      throw new Error(`بريد الإدارة الرئيسي المعتمد هو ${SUPER_ADMIN_EMAIL} فقط.`);
    }
    try {
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, cleanEmail, payload.password);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'auth/email-already-in-use') {
          cred = await signInWithEmailAndPassword(auth, cleanEmail, payload.password);
        } else {
          throw err;
        }
      }
      return await ensureSuperAdminBootstrapped(cred.user);
    } catch (err) {
      throw mapFirebaseAuthError(err);
    }
  },

  resendAdminVerificationEmail: async (): Promise<void> => {
    if (!auth.currentUser) throw new Error('لا توجد جلسة نشطة حالياً.');
    await sendEmailVerification(auth.currentUser);
  },

  reloadAndVerifyCurrentUser: async (): Promise<PublicUser> => {
    if (!auth.currentUser) throw new Error('لا توجد جلسة نشطة حالياً.');
    await auth.currentUser.reload();
    return firebaseStore.restoreSession(auth.currentUser);
  },

  restoreSession: async (fbUser: FirebaseUser): Promise<PublicUser> => {
    const email = (fbUser.email || '').toLowerCase();
    if (email === SUPER_ADMIN_EMAIL) {
      return ensureSuperAdminBootstrapped(fbUser);
    }
    return resolveFirebaseProfileForNonSuperAdmin(fbUser);
  },

  logout: async () => {
    clearCachedFirebaseUserProfile();
    await signOut(auth);
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.email) throw new Error('لا يمكن تغيير كلمة المرور لهذا الحساب.');
    try {
      const cred = EmailAuthProvider.credential(fbUser.email, currentPassword);
      await reauthenticateWithCredential(fbUser, cred);
      await updatePassword(fbUser, newPassword);
      return { ok: true, message: 'تم تحديث كلمة المرور بنجاح في Firebase Authentication.' };
    } catch (err) {
      throw mapFirebaseAuthError(err);
    }
  },

  // ---- STORAGE UPLOAD ----
  uploadDataUrl: async (dataUrl: string, folder: string, prefix = 'img'): Promise<{ url: string }> => {
    const match = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      throw new Error('صيغة الملف غير مدعومة (PNG / JPG / WEBP / PDF).');
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
    const binaryString = atob(match[2]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storageRef = ref(storage, `${folder}/${fileName}`);
    await uploadBytes(storageRef, bytes, { contentType: mime });
    const downloadUrl = await getDownloadURL(storageRef);
    return { url: downloadUrl };
  },

  // ---- CLUB SETTINGS & CATEGORIES ----
  getPublicClub: async (): Promise<{ clubSettings: ClubSettings; categories: Category[] }> => {
    let clubSettings = { ...DEFAULT_CLUB_SETTINGS };
    try {
      const pubSnap = await getDoc(doc(db, 'clubSettingsPublic', 'main'));
      if (pubSnap.exists()) {
        clubSettings = { ...clubSettings, ...(pubSnap.data() as Partial<ClubSettings>) };
      }
    } catch {
      // use fallback if offline & uncached
    }
    let categories = DEFAULT_CATEGORIES;
    if (auth.currentUser) {
      try {
        categories = await firebaseStore.getCategories();
      } catch {
        // fallback defaults
      }
    }
    return { clubSettings, categories };
  },

  getSettings: async (): Promise<ClubSettings> => {
    const role = await getCurrentRole();
    let settings = { ...DEFAULT_CLUB_SETTINGS };
    try {
      const pubSnap = await getDoc(doc(db, 'clubSettingsPublic', 'main'));
      if (pubSnap.exists()) {
        settings = { ...settings, ...(pubSnap.data() as Partial<ClubSettings>) };
      }
    } catch (err) {
      if (!isTransientNetworkError(err)) {
        handleFirestoreError(err, OperationType.GET, 'clubSettingsPublic/main');
      }
    }
    if (role === 'admin') {
      try {
        const privSnap = await getDoc(doc(db, 'clubSettingsPrivate', 'main'));
        if (privSnap.exists()) {
          settings = { ...settings, ...(privSnap.data() as Partial<ClubSettings>) };
        }
      } catch (err) {
        if (!isTransientNetworkError(err)) {
          handleFirestoreError(err, OperationType.GET, 'clubSettingsPrivate/main');
        }
      }
    }
    return settings;
  },

  updateSettings: async (payload: Partial<ClubSettings>): Promise<ClubSettings> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إعدادات النادي مخصصة للإدارة فقط.');
    const current = await firebaseStore.getSettings();
    const merged: ClubSettings = { ...current, ...payload };

    try {
      const pubRef = doc(db, 'clubSettingsPublic', 'main');
      const pubExists = (await getDoc(pubRef)).exists();
      const pubData = cleanObj({
        id: 'main',
        clubName: clip(merged.clubName, 120) || DEFAULT_CLUB_SETTINGS.clubName,
        clubShortName: clip(merged.clubShortName, 32) || 'W.A.B',
        clubEnglishName: optClip(merged.clubEnglishName, 120),
        foundedYear: optClip(merged.foundedYear, 10),
        logoUrl: clip(merged.logoUrl, 1000) || DEFAULT_CLUB_SETTINGS.logoUrl,
        primaryColor: clip(merged.primaryColor, 20) || '#14532D',
        secondaryColor: optClip(merged.secondaryColor, 20),
        surfaceColor: optClip(merged.surfaceColor, 20),
        address: optClip(merged.address, 200),
        season: clip(merged.season, 40) || '2026-2027',
        seasonStartDate: optClip(merged.seasonStartDate, 20),
        seasonEndDate: optClip(merged.seasonEndDate, 20),
        venues: Array.isArray(merged.venues) ? merged.venues.slice(0, 20).map((v) => clip(v, 160)) : [],
        currency: optClip(merged.currency, 16) || 'دج',
        isPublic: true,
        serverUpdatedAt: serverTimestamp(),
      });
      if (pubExists) {
        await updateDoc(pubRef, pubData);
      } else {
        await setDoc(pubRef, { ...pubData, serverCreatedAt: serverTimestamp() });
      }

      const privRef = doc(db, 'clubSettingsPrivate', 'main');
      const privExists = (await getDoc(privRef)).exists();
      const privData = cleanObj({
        id: 'main',
        phone: optClip(merged.phone, 40),
        email: optClip(merged.email, 160),
        subscriptionStartDate: optClip(merged.subscriptionStartDate, 20),
        subscriptionEndDate: optClip(merged.subscriptionEndDate, 20),
        defaultAnnualFee: Number(merged.defaultAnnualFee) || 16000,
        allowInstallments: Boolean(merged.allowInstallments),
        serverUpdatedAt: serverTimestamp(),
      });
      if (privExists) {
        await updateDoc(privRef, privData);
      } else {
        await setDoc(privRef, { ...privData, serverCreatedAt: serverTimestamp() });
      }
      await recordActivity('تحديث إعدادات النادي', 'clubSettings', 'main', `تحديث إعدادات ${merged.clubName}`);
      return merged;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'clubSettingsPublic/main');
    }
  },

  getCategories: async (): Promise<Category[]> => {
    const role = await getCurrentRole();
    try {
      const catQuery =
        role === 'admin'
          ? collection(db, 'categories')
          : query(collection(db, 'categories'), where('isActive', '==', true));
      const snap = await getDocs(catQuery);
      if (snap.empty) return DEFAULT_CATEGORIES.map((c) => (role === 'admin' ? c : { ...c, annualFee: 0 }));

      const feeMap = new Map<string, { annualFee: number; monthlyFee?: number }>();
      if (role === 'admin') {
        try {
          const feeSnap = await getDocs(collection(db, 'categoryFees'));
          feeSnap.docs.forEach((d) => {
            const fd = d.data() as { categoryId: string; annualFee: number; monthlyFee?: number };
            feeMap.set(fd.categoryId || d.id, { annualFee: Number(fd.annualFee) || 0, monthlyFee: fd.monthlyFee });
          });
        } catch {
          // ignore
        }
      }

      const list: Category[] = snap.docs.map((d) => {
        const c = d.data() as Category & { isActive?: boolean };
        const fee = feeMap.get(d.id);
        return {
          id: d.id,
          code: c.code || d.id,
          name: c.name || d.id,
          ageRange: c.ageRange || '',
          description: c.description || '',
          annualFee: role === 'admin' ? (fee?.annualFee ?? 16000) : 0,
          monthlyFee: role === 'admin' ? fee?.monthlyFee : undefined,
        };
      });
      const order = ['U7', 'U9', 'U11', 'U13', 'U15', 'U17'];
      return list.sort((a, b) => {
        const ia = order.indexOf(a.code);
        const ib = order.indexOf(b.code);
        if (ia !== -1 && ib !== -1) return ia - ib;
        return a.code.localeCompare(b.code);
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'categories');
    }
  },

  updateCategory: async (id: string, payload: Partial<Category>): Promise<Category> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تعديل الفئات متاح للإدارة فقط.');
    const catRef = doc(db, 'categories', id);
    const feeRef = doc(db, 'categoryFees', id);
    try {
      const catSnap = await getDoc(catRef);
      if (!catSnap.exists()) throw new Error('الفئة غير موجودة.');
      const existing = catSnap.data() as Category;
      const updatePayload: Record<string, unknown> = {
        serverUpdatedAt: serverTimestamp(),
      };
      if (payload.name !== undefined) updatePayload.name = clip(payload.name, 120);
      if (payload.code !== undefined) updatePayload.code = clip(payload.code, 20);
      if (payload.ageRange !== undefined) updatePayload.ageRange = clip(payload.ageRange, 64);
      if (payload.description !== undefined) updatePayload.description = clip(payload.description, 500);
      await updateDoc(catRef, updatePayload);

      let annualFee = existing.annualFee || 16000;
      const feeSnap = await getDoc(feeRef);
      if (feeSnap.exists()) {
        annualFee = Number((feeSnap.data() as { annualFee?: number }).annualFee) || annualFee;
      }
      if (typeof payload.annualFee === 'number' || typeof payload.monthlyFee === 'number') {
        annualFee = typeof payload.annualFee === 'number' ? payload.annualFee : annualFee;
        const feePayload = cleanObj({
          id,
          categoryId: id,
          annualFee,
          monthlyFee: typeof payload.monthlyFee === 'number' ? payload.monthlyFee : undefined,
          serverUpdatedAt: serverTimestamp(),
        });
        if (feeSnap.exists()) {
          await updateDoc(feeRef, feePayload);
        } else {
          await setDoc(feeRef, { ...feePayload, serverCreatedAt: serverTimestamp() });
        }
      }
      await recordActivity('تحديث فئة عمرية', 'categories', id, `تحديث بيانات الفئة ${payload.name || existing.name}`);
      return {
        ...existing,
        ...payload,
        id,
        annualFee,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `categories/${id}`);
    }
  },

  // ---- SEASONS ----
  getSeasons: async (): Promise<SeasonRecord[]> => {
    const role = await getCurrentRole();
    try {
      const q =
        role === 'admin'
          ? collection(db, 'seasons')
          : query(collection(db, 'seasons'), where('status', 'in', ['active', 'archived']));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as SeasonRecord), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'seasons');
    }
  },

  createSeason: async (payload: Partial<SeasonRecord> & { archivePrevious?: boolean }): Promise<SeasonRecord> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إنشاء المواسم متاح للإدارة فقط.');
    const id = genId('season');
    const nowIso = new Date().toISOString();
    try {
      if (payload.archivePrevious) {
        const existingSnap = await getDocs(collection(db, 'seasons'));
        const batch = writeBatch(db);
        existingSnap.docs.forEach((d) => {
          if (d.data().status === 'active') {
            batch.update(d.ref, { status: 'archived', serverUpdatedAt: serverTimestamp() });
          }
        });
        await batch.commit();
      }
      const record: SeasonRecord = {
        id,
        name: clip(payload.name || 'موسم جديد', 64),
        startDate: clip(payload.startDate || `${new Date().getFullYear()}-09-01`, 20),
        endDate: clip(payload.endDate || `${new Date().getFullYear() + 1}-06-30`, 20),
        subscriptionStartDate: clip(payload.subscriptionStartDate || payload.startDate || `${new Date().getFullYear()}-09-01`, 20),
        subscriptionEndDate: clip(payload.subscriptionEndDate || payload.endDate || `${new Date().getFullYear() + 1}-06-30`, 20),
        defaultAnnualFee: Number(payload.defaultAnnualFee) || 16000,
        allowInstallments: payload.allowInstallments !== false,
        status: payload.status === 'archived' ? 'archived' : 'active',
        createdAt: nowIso,
      };
      await setDoc(
        doc(db, 'seasons', id),
        cleanObj({
          ...record,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      await recordActivity('إضافة موسم رياضي', 'seasons', id, `إنشاء موسم ${record.name}`);
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `seasons/${id}`);
    }
  },

  updateSeason: async (id: string, payload: Partial<SeasonRecord>): Promise<SeasonRecord> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تعديل المواسم متاح للإدارة فقط.');
    try {
      const sRef = doc(db, 'seasons', id);
      const snap = await getDoc(sRef);
      if (!snap.exists()) throw new Error('الموسم غير موجود.');
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.name !== undefined) patch.name = clip(payload.name, 64);
      if (payload.startDate !== undefined) patch.startDate = clip(payload.startDate, 20);
      if (payload.endDate !== undefined) patch.endDate = clip(payload.endDate, 20);
      if (payload.subscriptionStartDate !== undefined) patch.subscriptionStartDate = clip(payload.subscriptionStartDate, 20);
      if (payload.subscriptionEndDate !== undefined) patch.subscriptionEndDate = clip(payload.subscriptionEndDate, 20);
      if (typeof payload.defaultAnnualFee === 'number') patch.defaultAnnualFee = payload.defaultAnnualFee;
      if (typeof payload.allowInstallments === 'boolean') patch.allowInstallments = payload.allowInstallments;
      if (payload.status !== undefined) patch.status = payload.status;
      await updateDoc(sRef, patch);
      return { ...(snap.data() as SeasonRecord), ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `seasons/${id}`);
    }
  },

  // ---- PLAYERS ----
  getPlayers: async (): Promise<Player[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'players')
          : role === 'coach'
            ? query(collection(db, 'players'), where('authorizedCoachUids', 'array-contains', uid))
            : query(collection(db, 'players'), where('parentAuthUid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const p = { ...(d.data() as Player), id: d.id };
        if (role === 'parent') {
          const { adminNotes: _a, ...rest } = p;
          return rest;
        }
        return p;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'players');
    }
  },

  getPlayerProfile: async (id: string) => {
    const role = await getCurrentRole();
    try {
      const pSnap = await getDoc(doc(db, 'players', id));
      if (!pSnap.exists()) throw new Error('اللاعب غير موجود.');
      const player = { ...(pSnap.data() as Player), id: pSnap.id };
      if (role === 'parent') delete player.adminNotes;

      const [att, evs] = await Promise.all([
        firebaseStore.getAttendance({ playerId: id }),
        firebaseStore.getEvaluations().then((all) => all.filter((e) => e.playerId === id)),
      ]);
      let subscriptions: AnnualSubscription[] = [];
      let payments: PaymentRecord[] = [];
      if (role === 'admin') {
        const [subs, pays] = await Promise.all([
          firebaseStore.getSubscriptions(),
          firebaseStore.getPayments(),
        ]);
        subscriptions = subs.filter((s) => s.playerId === id);
        payments = pays.filter((p) => p.playerId === id);
      }
      return { player, attendance: att, subscriptions, payments, evaluations: evs };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `players/${id}`);
    }
  },

  createPlayer: async (payload: Partial<Player>): Promise<Player> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إضافة اللاعبين متاحة للإدارة فقط.');
    const id = genId('ply');
    const categoryId = clip(payload.categoryId || 'U11', 64);
    const [coachUids, coachNames] = await Promise.all([
      getAuthorizedCoachUidsForCategory(categoryId),
      getCoachNamesForCategory(categoryId),
    ]);

    let parentAuthUid: string | undefined;
    if (payload.parentUserId) {
      try {
        const uSnap = await getDoc(doc(db, 'users', payload.parentUserId));
        if (uSnap.exists()) {
          parentAuthUid = (uSnap.data() as { uid?: string }).uid || payload.parentUserId;
        }
      } catch {
        // ignore
      }
    }

    const record: Player = {
      id,
      fullName: clip(payload.fullName || '', 120),
      photoUrl: clip(payload.photoUrl || '', 1000),
      birthDate: clip(payload.birthDate || '', 20),
      categoryId,
      parentName: clip(payload.parentName || '', 120),
      parentPhone: clip(payload.parentPhone || '', 32),
      parentUserId: clip(payload.parentUserId || '', 128),
      address: optClip(payload.address, 240),
      registrationDate: clip(payload.registrationDate || new Date().toISOString().slice(0, 10), 40),
      status: payload.status === 'inactive' || payload.status === 'archived' ? payload.status : 'active',
      jerseyNumber: typeof payload.jerseyNumber === 'number' ? payload.jerseyNumber : undefined,
      position: optClip(payload.position, 80),
      adminNotes: optClip(payload.adminNotes, 1000),
      medicalNotes: optClip(payload.medicalNotes, 1000),
      coachNames,
    };

    try {
      await setDoc(
        doc(db, 'players', id),
        cleanObj({
          ...record,
          photoUrl: optClip(record.photoUrl, 1000),
          parentAuthUid: optClip(parentAuthUid, 128),
          authorizedCoachUids: coachUids,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      await recordActivity('تسجيل لاعب جديد', 'players', id, `إضافة اللاعب ${record.fullName} (${categoryId})`);
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `players/${id}`);
    }
  },

  updatePlayer: async (id: string, payload: Partial<Player>): Promise<Player> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تعديل بيانات اللاعبين متاح للإدارة فقط.');
    try {
      const pRef = doc(db, 'players', id);
      const snap = await getDoc(pRef);
      if (!snap.exists()) throw new Error('اللاعب غير موجود.');
      const existing = snap.data() as Player;
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.fullName !== undefined) patch.fullName = clip(payload.fullName, 120);
      if (payload.photoUrl !== undefined) patch.photoUrl = clip(payload.photoUrl, 1000);
      if (payload.birthDate !== undefined) patch.birthDate = clip(payload.birthDate, 20);
      if (payload.categoryId !== undefined) {
        patch.categoryId = clip(payload.categoryId, 64);
        patch.authorizedCoachUids = await getAuthorizedCoachUidsForCategory(payload.categoryId);
        patch.coachNames = await getCoachNamesForCategory(payload.categoryId);
      }
      if (payload.parentName !== undefined) patch.parentName = clip(payload.parentName, 120);
      if (payload.parentPhone !== undefined) patch.parentPhone = clip(payload.parentPhone, 32);
      if (payload.parentUserId !== undefined) {
        patch.parentUserId = clip(payload.parentUserId, 128);
        if (payload.parentUserId) {
          const uSnap = await getDoc(doc(db, 'users', payload.parentUserId));
          if (uSnap.exists()) {
            patch.parentAuthUid = (uSnap.data() as { uid?: string }).uid || payload.parentUserId;
          }
        }
      }
      if (payload.address !== undefined) patch.address = clip(payload.address, 240);
      if (payload.status !== undefined) patch.status = payload.status;
      if (typeof payload.jerseyNumber === 'number') patch.jerseyNumber = payload.jerseyNumber;
      if (payload.position !== undefined) patch.position = clip(payload.position, 80);
      if (payload.adminNotes !== undefined) patch.adminNotes = clip(payload.adminNotes, 1000);
      if (payload.medicalNotes !== undefined) patch.medicalNotes = clip(payload.medicalNotes, 1000);

      await updateDoc(pRef, patch);
      await recordActivity('تحديث ملف لاعب', 'players', id, `تحديث بيانات اللاعب ${payload.fullName || existing.fullName}`);
      return { ...existing, ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `players/${id}`);
    }
  },

  deletePlayer: async (id: string): Promise<{ ok: boolean }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('حذف اللاعبين متاح للإدارة فقط.');
    try {
      await deleteDoc(doc(db, 'players', id));
      await recordActivity('حذف لاعب', 'players', id, `حذف سجل اللاعب ${id}`);
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `players/${id}`);
    }
  },

  // ---- COACHES & USERS ----
  getCoaches: async (): Promise<Coach[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'coaches')
          : query(collection(db, 'coaches'), where('authUid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as Coach), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'coaches');
    }
  },

  createCoach: async (payload: {
    fullName: string;
    username?: string;
    email: string;
    password: string;
    phone?: string;
    specialty?: string;
    categoryIds: string[];
    trainingProgram?: string;
    photoUrl?: string;
    allowCoachPhotoEdit?: boolean;
  }): Promise<Coach> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إنشاء حسابات المدربين متاح للإدارة فقط.');

    const cleanEmail = payload.email.trim().toLowerCase();
    let coachAuthUid = genId('usr');
    let authCreated = false;

    try {
      const secAuth = getSecondaryAuthApp() ? getAuth(getSecondaryAuthApp()) : null;
      if (secAuth) {
        const cred = await createUserWithEmailAndPassword(secAuth, cleanEmail, payload.password);
        coachAuthUid = cred.user.uid;
        authCreated = true;
        await signOut(secAuth);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use' || code === 'auth/operation-not-allowed') {
        throw mapFirebaseAuthError(err);
      }
      throw mapFirebaseAuthError(err);
    }

    const nowIso = new Date().toISOString();
    const coachId = genId('coach');
    const cleanCats = Array.isArray(payload.categoryIds) ? payload.categoryIds.slice(0, 20) : [];

    try {
      await setDoc(
        doc(db, 'users', coachAuthUid),
        cleanObj({
          id: coachAuthUid,
          uid: coachAuthUid,
          username: clip(payload.username || cleanEmail.split('@')[0], 64),
          email: cleanEmail,
          fullName: clip(payload.fullName, 120),
          role: 'coach',
          phone: optClip(payload.phone, 32),
          active: true,
          categoryIds: cleanCats,
          photoUrl: optClip(payload.photoUrl, 1000),
          allowCoachPhotoEdit: Boolean(payload.allowCoachPhotoEdit),
          createdAt: nowIso,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );

      const coach: Coach = {
        id: coachId,
        userId: coachAuthUid,
        fullName: clip(payload.fullName, 120),
        phone: clip(payload.phone || '', 32),
        email: cleanEmail,
        specialty: clip(payload.specialty || '', 160),
        categoryIds: cleanCats,
        trainingProgram: clip(payload.trainingProgram || '', 1000),
        active: true,
        joinedAt: nowIso.slice(0, 10),
        photoUrl: optClip(payload.photoUrl, 1000),
        allowCoachPhotoEdit: Boolean(payload.allowCoachPhotoEdit),
      };

      await setDoc(
        doc(db, 'coaches', coachId),
        cleanObj({
          ...coach,
          authUid: authCreated ? coachAuthUid : undefined,
          phone: optClip(coach.phone, 32),
          specialty: optClip(coach.specialty, 160),
          trainingProgram: optClip(coach.trainingProgram, 1000),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );

      for (const catId of cleanCats) {
        const existingUids = await getAuthorizedCoachUidsForCategory(catId);
        await syncCategoryCoachUids(catId, [...existingUids, coachAuthUid]);
      }

      await recordActivity('إنشاء حساب مدرب', 'coaches', coachId, `إضافة المدرب ${coach.fullName}`);
      return coach;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `coaches/${coachId}`);
    }
  },

  updateCoach: async (id: string, payload: Partial<Coach>): Promise<Coach> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تعديل حسابات المدربين متاح للإدارة فقط.');
    try {
      const cRef = doc(db, 'coaches', id);
      const snap = await getDoc(cRef);
      if (!snap.exists()) throw new Error('المدرب غير موجود.');
      const existing = snap.data() as Coach & { authUid?: string };

      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.fullName !== undefined) patch.fullName = clip(payload.fullName, 120);
      if (payload.phone !== undefined) patch.phone = clip(payload.phone, 32);
      if (payload.email !== undefined) patch.email = clip(payload.email, 160);
      if (payload.specialty !== undefined) patch.specialty = clip(payload.specialty, 160);
      if (payload.trainingProgram !== undefined) patch.trainingProgram = clip(payload.trainingProgram, 1000);
      if (payload.photoUrl !== undefined) patch.photoUrl = clip(payload.photoUrl, 1000);
      if (typeof payload.active === 'boolean') patch.active = payload.active;
      if (typeof payload.allowCoachPhotoEdit === 'boolean') patch.allowCoachPhotoEdit = payload.allowCoachPhotoEdit;
      if (Array.isArray(payload.categoryIds)) patch.categoryIds = payload.categoryIds.slice(0, 20);

      await updateDoc(cRef, patch);

      const coachUid = existing.authUid || existing.userId;
      if (coachUid) {
        const userRef = doc(db, 'users', coachUid);
        const uSnap = await getDoc(userRef);
        if (uSnap.exists()) {
          const uPatch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
          if (payload.fullName !== undefined) uPatch.fullName = clip(payload.fullName, 120);
          if (payload.phone !== undefined) uPatch.phone = clip(payload.phone, 32);
          if (typeof payload.active === 'boolean') uPatch.active = payload.active;
          if (Array.isArray(payload.categoryIds)) uPatch.categoryIds = payload.categoryIds.slice(0, 20);
          await updateDoc(userRef, uPatch);
        }
      }

      if (Array.isArray(payload.categoryIds) || typeof payload.active === 'boolean') {
        const allCats = new Set([...(existing.categoryIds || []), ...(payload.categoryIds || [])]);
        const allCoachesSnap = await getDocs(collection(db, 'coaches'));
        const allCoaches = allCoachesSnap.docs.map((d) => d.data() as Coach & { authUid?: string });
        for (const catId of allCats) {
          const uids = allCoaches
            .filter((ch) => (ch.id === id ? payload.active ?? ch.active : ch.active))
            .filter((ch) => {
              const cats = ch.id === id && Array.isArray(payload.categoryIds) ? payload.categoryIds : ch.categoryIds;
              return Array.isArray(cats) && cats.includes(catId);
            })
            .map((ch) => ch.authUid || ch.userId)
            .filter(Boolean);
          await syncCategoryCoachUids(catId, uids);
        }
      }

      return { ...existing, ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `coaches/${id}`);
    }
  },

  deleteCoach: async (id: string): Promise<{ ok: boolean }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('حذف المدربين متاح للإدارة فقط.');
    try {
      const cRef = doc(db, 'coaches', id);
      const snap = await getDoc(cRef);
      if (snap.exists()) {
        const coach = snap.data() as Coach & { authUid?: string; userId?: string };
        const coachUid = coach.authUid || coach.userId;
        if (coachUid) {
          try {
            await updateDoc(doc(db, 'users', coachUid), { active: false, serverUpdatedAt: serverTimestamp() });
          } catch {}
        }
      }
      await deleteDoc(cRef);
      await recordActivity('حذف مدرب', 'coaches', id, `حذف سجل المدرب ${id}`);
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `coaches/${id}`);
    }
  },

  updateMyCoachPhoto: async (photoUrl: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('يرجى تسجيل الدخول.');
    try {
      const coachesSnap = await getDocs(query(collection(db, 'coaches'), where('authUid', '==', uid)));
      if (coachesSnap.empty) throw new Error('ملف المدرب غير مرتبط بحسابك بعد.');
      const coachDoc = coachesSnap.docs[0];
      const coach = coachDoc.data() as Coach;
      await updateDoc(coachDoc.ref, { photoUrl: clip(photoUrl, 1000), serverUpdatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'users', uid), { photoUrl: clip(photoUrl, 1000), serverUpdatedAt: serverTimestamp() });
      const uSnap = await getDoc(doc(db, 'users', uid));
      const user = (uSnap.data() as PublicUser) || cachedUserProfile!;
      cachedUserProfile = user;
      return { coach: { ...coach, photoUrl }, user };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  },

  getUsers: async (): Promise<PublicUser[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q = role === 'admin' ? collection(db, 'users') : query(collection(db, 'users'), where('uid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as PublicUser), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  },

  getParents: async (): Promise<ParentWithChildren[]> => {
    const [users, players] = await Promise.all([firebaseStore.getUsers(), firebaseStore.getPlayers()]);
    return users
      .filter((u) => u.role === 'parent')
      .map((u) => ({
        ...u,
        children: players.filter((p) => p.parentUserId === u.id || p.id === u.scopedPlayerId),
        unpaidCount: 0,
      }));
  },

  createUser: async (payload: {
    username?: string;
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    phone?: string;
    categoryIds?: string[];
    linkedPlayerIds?: string[];
  }): Promise<PublicUser> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إنشاء الحسابات متاح للإدارة فقط.');
    const rawUsername = payload.username ? payload.username.trim() : (payload.fullName || 'user').trim().toLowerCase().replace(/\s+/g, '_');
    const cleanUsername = rawUsername || 'user_' + Math.random().toString(36).slice(2, 7);
    const cleanEmail = payload.email && payload.email.trim() ? payload.email.trim().toLowerCase() : `wab_u_${cleanUsername.toLowerCase()}@wab-club.local`;
    let newUid: string;
    try {
      const secAuth = getAuth(getSecondaryAuthApp());
      const cred = await createUserWithEmailAndPassword(secAuth, cleanEmail, payload.password);
      newUid = cred.user.uid;
      await signOut(secAuth);
    } catch (err) {
      throw mapFirebaseAuthError(err);
    }

    const nowIso = new Date().toISOString();
    const userDoc: PublicUser = {
      id: newUid,
      username: clip(payload.username || cleanEmail.split('@')[0], 64),
      email: cleanEmail,
      fullName: clip(payload.fullName, 120),
      role: payload.role,
      phone: clip(payload.phone || '', 32),
      active: true,
      categoryIds: Array.isArray(payload.categoryIds) ? payload.categoryIds.slice(0, 20) : [],
      createdAt: nowIso,
    };

    try {
      await setDoc(
        doc(db, 'users', newUid),
        cleanObj({
          ...userDoc,
          uid: newUid,
          phone: optClip(userDoc.phone, 32),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );

      if (Array.isArray(payload.linkedPlayerIds) && payload.linkedPlayerIds.length > 0) {
        const batch = writeBatch(db);
        for (const pid of payload.linkedPlayerIds) {
          batch.update(doc(db, 'players', pid), {
            parentUserId: newUid,
            parentAuthUid: newUid,
            serverUpdatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      await recordActivity('إنشاء مستخدم', 'users', newUid, `إنشاء حساب ${userDoc.fullName} (${userDoc.role})`);
      return userDoc;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`);
    }
  },

  updateUser: async (
    id: string,
    payload: {
      fullName?: string;
      phone?: string;
      email?: string;
      active?: boolean;
      role?: UserRole;
      categoryIds?: string[];
      linkedPlayerIds?: string[];
    },
  ): Promise<PublicUser> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تعديل الحسابات متاح للإدارة فقط.');
    try {
      const uRef = doc(db, 'users', id);
      const snap = await getDoc(uRef);
      if (!snap.exists()) throw new Error('المستخدم غير موجود.');
      const existing = snap.data() as PublicUser;
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.fullName !== undefined) patch.fullName = clip(payload.fullName, 120);
      if (payload.phone !== undefined) patch.phone = clip(payload.phone, 32);
      if (payload.email !== undefined) patch.email = clip(payload.email, 160);
      if (typeof payload.active === 'boolean') patch.active = payload.active;
      if (payload.role !== undefined) patch.role = payload.role;
      if (Array.isArray(payload.categoryIds)) patch.categoryIds = payload.categoryIds.slice(0, 20);
      await updateDoc(uRef, patch);

      if (Array.isArray(payload.linkedPlayerIds)) {
        const targetIds = new Set(payload.linkedPlayerIds);
        const playersSnap = await getDocs(collection(db, 'players'));
        const batch = writeBatch(db);
        playersSnap.docs.forEach((pDoc) => {
          const pd = pDoc.data() as Player & { parentAuthUid?: string };
          if (targetIds.has(pDoc.id)) {
            batch.update(pDoc.ref, {
              parentUserId: id,
              parentAuthUid: id,
              serverUpdatedAt: serverTimestamp(),
            });
          } else if (pd.parentUserId === id || pd.parentAuthUid === id) {
            batch.update(pDoc.ref, {
              parentUserId: '',
              parentAuthUid: '',
              serverUpdatedAt: serverTimestamp(),
            });
          }
        });
        await batch.commit();
      }

      return { ...existing, ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  },

  // ---- TRAININGS, ATTENDANCE, MATCHES, EVALUATIONS ----
  getTrainings: async (): Promise<TrainingSession[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'trainingSessions')
          : role === 'coach'
            ? query(collection(db, 'trainingSessions'), where('authorizedCoachUids', 'array-contains', uid))
            : query(collection(db, 'trainingSessions'), where('status', 'in', ['scheduled', 'completed', 'cancelled']));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as TrainingSession), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'trainingSessions');
    }
  },

  createTraining: async (payload: Partial<TrainingSession>): Promise<TrainingSession> => {
    const id = genId('trn');
    const categoryId = clip(payload.categoryId || 'U11', 64);
    const uid = auth.currentUser!.uid;
    const coachUids = await getAuthorizedCoachUidsForCategory(categoryId);
    if (!coachUids.includes(uid)) coachUids.push(uid);

    const record: TrainingSession = {
      id,
      title: clip(payload.title || 'حصة تدريبية', 160),
      categoryId,
      coachId: clip(payload.coachId || uid, 128),
      coachName: clip(payload.coachName || cachedUserProfile?.fullName || 'الطاقم الفني', 120),
      coachPhotoUrl: optClip(payload.coachPhotoUrl, 1000),
      date: clip(payload.date || new Date().toISOString().slice(0, 10), 20),
      startTime: clip(payload.startTime || '17:00', 16),
      endTime: clip(payload.endTime || '18:30', 16),
      venue: clip(payload.venue || '', 160),
      objectives: clip(payload.objectives || '', 1000),
      notes: optClip(payload.notes, 1000),
      status: payload.status === 'completed' || payload.status === 'cancelled' ? payload.status : 'scheduled',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(
        doc(db, 'trainingSessions', id),
        cleanObj({
          ...record,
          authorizedCoachUids: coachUids.slice(0, 30),
          venue: optClip(record.venue, 160),
          objectives: optClip(record.objectives, 1000),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      await recordActivity('برمجة حصة تدريبية', 'trainingSessions', id, `${record.title} (${categoryId})`);
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `trainingSessions/${id}`);
    }
  },

  updateTraining: async (id: string, payload: Partial<TrainingSession>): Promise<TrainingSession> => {
    try {
      const tRef = doc(db, 'trainingSessions', id);
      const snap = await getDoc(tRef);
      if (!snap.exists()) throw new Error('الحصة التدريبية غير موجودة.');
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.title !== undefined) patch.title = clip(payload.title, 160);
      if (payload.date !== undefined) patch.date = clip(payload.date, 20);
      if (payload.startTime !== undefined) patch.startTime = clip(payload.startTime, 16);
      if (payload.endTime !== undefined) patch.endTime = clip(payload.endTime, 16);
      if (payload.venue !== undefined) patch.venue = clip(payload.venue, 160);
      if (payload.objectives !== undefined) patch.objectives = clip(payload.objectives, 1000);
      if (payload.notes !== undefined) patch.notes = clip(payload.notes, 1000);
      if (payload.status !== undefined) patch.status = payload.status;
      await updateDoc(tRef, patch);
      return { ...(snap.data() as TrainingSession), ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainingSessions/${id}`);
    }
  },

  deleteTraining: async (id: string): Promise<{ ok: boolean }> => {
    try {
      await deleteDoc(doc(db, 'trainingSessions', id));
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `trainingSessions/${id}`);
    }
  },

  getAttendance: async (params?: { categoryId?: string; sessionId?: string; date?: string; playerId?: string }): Promise<AttendanceRecord[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'attendance')
          : role === 'coach'
            ? query(collection(db, 'attendance'), where('authorizedCoachUids', 'array-contains', uid))
            : query(collection(db, 'attendance'), where('parentAuthUid', '==', uid));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ ...(d.data() as AttendanceRecord), id: d.id }));
      if (params?.categoryId) list = list.filter((a) => a.categoryId === params.categoryId);
      if (params?.sessionId) list = list.filter((a) => a.sessionId === params.sessionId);
      if (params?.date) list = list.filter((a) => a.date === params.date);
      if (params?.playerId) list = list.filter((a) => a.playerId === params.playerId);
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'attendance');
    }
  },

  saveAttendanceBatch: async (payload: {
    categoryId: string;
    sessionId: string;
    date: string;
    entries: { playerId: string; status: 'present' | 'absent' | 'excused'; notes?: string }[];
  }): Promise<{ saved: number; records: AttendanceRecord[] }> => {
    const uid = auth.currentUser!.uid;
    const actorName = cachedUserProfile?.fullName || 'الإدارة';
    const nowIso = new Date().toISOString();
    try {
      const [players, existingAtt, coachUids] = await Promise.all([
        firebaseStore.getPlayers(),
        firebaseStore.getAttendance({ sessionId: payload.sessionId, date: payload.date }),
        getAuthorizedCoachUidsForCategory(payload.categoryId),
      ]);
      if (!coachUids.includes(uid)) coachUids.push(uid);

      let sessionTitle = 'حصة تدريبية';
      try {
        const trnSnap = await getDoc(doc(db, 'trainingSessions', payload.sessionId));
        if (trnSnap.exists()) sessionTitle = (trnSnap.data() as TrainingSession).title || sessionTitle;
      } catch {
        // ignore
      }

      const batch = writeBatch(db);
      const savedRecords: AttendanceRecord[] = [];
      for (const entry of payload.entries) {
        const player = players.find((p) => p.id === entry.playerId) as (Player & { parentAuthUid?: string }) | undefined;
        const existing = existingAtt.find((a) => a.playerId === entry.playerId);
        const recId = existing?.id || sanitizeId(`att_${payload.sessionId}_${entry.playerId}`, 'att');
        const rec: AttendanceRecord = {
          id: recId,
          playerId: entry.playerId,
          playerName: clip(player?.fullName || 'لاعب', 120),
          categoryId: clip(payload.categoryId, 64),
          sessionId: sanitizeId(payload.sessionId, 'trn'),
          sessionTitle: clip(sessionTitle, 160),
          date: clip(payload.date, 20),
          status: entry.status,
          notes: optClip(entry.notes, 500),
          recordedBy: uid,
          recordedByName: clip(actorName, 120),
          updatedAt: nowIso,
        };
        const refDoc = doc(db, 'attendance', recId);
        if (existing) {
          batch.update(
            refDoc,
            cleanObj({
              status: rec.status,
              notes: rec.notes,
              recordedBy: rec.recordedBy,
              recordedByName: rec.recordedByName,
              updatedAt: nowIso,
              serverUpdatedAt: serverTimestamp(),
            }),
          );
        } else {
          batch.set(
            refDoc,
            cleanObj({
              ...rec,
              parentAuthUid: optClip(player?.parentAuthUid, 128),
              authorizedCoachUids: coachUids.slice(0, 30),
              serverCreatedAt: serverTimestamp(),
              serverUpdatedAt: serverTimestamp(),
            }),
          );
        }
        savedRecords.push(rec);
      }
      await batch.commit();
      await recordActivity('تسجيل الحضور والغياب', 'attendance', payload.sessionId, `حفظ ${savedRecords.length} سجل حضور`);
      return { saved: savedRecords.length, records: savedRecords };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendance');
    }
  },

  updateAttendanceRecord: async (id: string, payload: Partial<AttendanceRecord>): Promise<AttendanceRecord> => {
    try {
      const aRef = doc(db, 'attendance', id);
      const snap = await getDoc(aRef);
      if (!snap.exists()) throw new Error('سجل الحضور غير موجود.');
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = {
        updatedAt: nowIso,
        serverUpdatedAt: serverTimestamp(),
      };
      if (payload.status !== undefined) patch.status = payload.status;
      if (payload.notes !== undefined) patch.notes = clip(payload.notes, 500);
      await updateDoc(aRef, patch);
      return { ...(snap.data() as AttendanceRecord), ...payload, id, updatedAt: nowIso };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `attendance/${id}`);
    }
  },

  getMatches: async (): Promise<MatchRecord[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'matches')
          : role === 'coach'
            ? query(collection(db, 'matches'), where('authorizedCoachUids', 'array-contains', uid))
            : query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'completed', 'cancelled', 'postponed']));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as MatchRecord), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'matches');
    }
  },

  createMatch: async (payload: Partial<MatchRecord>): Promise<MatchRecord> => {
    const id = genId('mat');
    const categoryId = clip(payload.categoryId || 'U11', 64);
    const uid = auth.currentUser!.uid;
    const coachUids = await getAuthorizedCoachUidsForCategory(categoryId);
    if (!coachUids.includes(uid)) coachUids.push(uid);

    const record: MatchRecord = {
      id,
      opponent: clip(payload.opponent || 'فريق منافس', 160),
      categoryId,
      date: clip(payload.date || new Date().toISOString().slice(0, 10), 20),
      time: clip(payload.time || '15:00', 16),
      venue: clip(payload.venue || '', 160),
      locationType: payload.locationType === 'away' ? 'away' : 'home',
      status: payload.status || 'scheduled',
      goalsFor: Number(payload.goalsFor) || 0,
      goalsAgainst: Number(payload.goalsAgainst) || 0,
      technicalNotes: optClip(payload.technicalNotes, 1000),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(
        doc(db, 'matches', id),
        cleanObj({
          ...record,
          authorizedCoachUids: coachUids.slice(0, 30),
          venue: optClip(record.venue, 160),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      await recordActivity('إضافة مباراة', 'matches', id, `مباراة ضد ${record.opponent} (${categoryId})`);
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `matches/${id}`);
    }
  },

  updateMatch: async (id: string, payload: Partial<MatchRecord>): Promise<MatchRecord> => {
    try {
      const mRef = doc(db, 'matches', id);
      const snap = await getDoc(mRef);
      if (!snap.exists()) throw new Error('المباراة غير موجودة.');
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.opponent !== undefined) patch.opponent = clip(payload.opponent, 160);
      if (payload.date !== undefined) patch.date = clip(payload.date, 20);
      if (payload.time !== undefined) patch.time = clip(payload.time, 16);
      if (payload.venue !== undefined) patch.venue = clip(payload.venue, 160);
      if (payload.locationType !== undefined) patch.locationType = payload.locationType;
      if (payload.status !== undefined) patch.status = payload.status;
      if (typeof payload.goalsFor === 'number') patch.goalsFor = payload.goalsFor;
      if (typeof payload.goalsAgainst === 'number') patch.goalsAgainst = payload.goalsAgainst;
      if (payload.technicalNotes !== undefined) patch.technicalNotes = clip(payload.technicalNotes, 1000);
      await updateDoc(mRef, patch);
      return { ...(snap.data() as MatchRecord), ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `matches/${id}`);
    }
  },

  deleteMatch: async (id: string): Promise<{ ok: boolean }> => {
    try {
      await deleteDoc(doc(db, 'matches', id));
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `matches/${id}`);
    }
  },

  getEvaluations: async (): Promise<EvaluationRecord[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'evaluations')
          : role === 'coach'
            ? query(collection(db, 'evaluations'), where('authorizedCoachUids', 'array-contains', uid))
            : query(
                collection(db, 'evaluations'),
                where('parentAuthUid', '==', uid),
                where('published', '==', true),
              );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as EvaluationRecord), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'evaluations');
    }
  },

  createEvaluation: async (payload: {
    playerId: string;
    period: string;
    date?: string;
    scores: EvaluationScores;
    notes: string;
    published: boolean;
  }): Promise<EvaluationRecord> => {
    const id = genId('evl');
    const uid = auth.currentUser!.uid;
    try {
      const pSnap = await getDoc(doc(db, 'players', payload.playerId));
      if (!pSnap.exists()) throw new Error('اللاعب غير موجود.');
      const player = pSnap.data() as Player & { parentAuthUid?: string; authorizedCoachUids?: string[] };
      const coachUids = Array.isArray(player.authorizedCoachUids) ? [...player.authorizedCoachUids] : [];
      if (!coachUids.includes(uid)) coachUids.push(uid);

      const record: EvaluationRecord = {
        id,
        playerId: payload.playerId,
        playerName: clip(player.fullName, 120),
        categoryId: clip(player.categoryId, 64),
        coachId: uid,
        coachName: clip(cachedUserProfile?.fullName || 'الطاقم الفني', 120),
        date: clip(payload.date || new Date().toISOString().slice(0, 10), 20),
        period: clip(payload.period, 64),
        scores: payload.scores,
        overallAverage: computeAverage(payload.scores),
        notes: clip(payload.notes || '', 1000),
        published: Boolean(payload.published),
        approvedByAdmin: true,
        createdAt: new Date().toISOString(),
      };
      await setDoc(
        doc(db, 'evaluations', id),
        cleanObj({
          ...record,
          parentAuthUid: optClip(player.parentAuthUid, 128),
          authorizedCoachUids: coachUids.slice(0, 30),
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `evaluations/${id}`);
    }
  },

  updateEvaluation: async (id: string, payload: Partial<EvaluationRecord>): Promise<EvaluationRecord> => {
    try {
      const eRef = doc(db, 'evaluations', id);
      const snap = await getDoc(eRef);
      if (!snap.exists()) throw new Error('التقييم غير موجود.');
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.scores) {
        patch.scores = payload.scores;
        patch.overallAverage = computeAverage(payload.scores);
      }
      if (payload.notes !== undefined) patch.notes = clip(payload.notes, 1000);
      if (typeof payload.published === 'boolean') patch.published = payload.published;
      if (payload.period !== undefined) patch.period = clip(payload.period, 64);
      if (payload.date !== undefined) patch.date = clip(payload.date, 20);
      await updateDoc(eRef, patch);
      return { ...(snap.data() as EvaluationRecord), ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `evaluations/${id}`);
    }
  },

  // ---- FINANCIAL (ADMIN ONLY) ----
  getSubscriptions: async (params?: { seasonId?: string; status?: string }): Promise<AnnualSubscription[]> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('البيانات المالية والاشتراكات مخصصة للإدارة فقط.');
    try {
      const snap = await getDocs(collection(db, 'subscriptions'));
      let list = snap.docs.map((d) => ({ ...(d.data() as AnnualSubscription), id: d.id }));
      if (params?.seasonId && params.seasonId !== 'all') {
        list = list.filter((s) => s.seasonId === params.seasonId);
      }
      if (params?.status && params.status !== 'all') {
        list = list.filter((s) => s.status === params.status);
      }
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'subscriptions');
    }
  },

  createSubscription: async (payload: {
    playerId: string;
    seasonId: string;
    totalFee?: number;
    paidAmount?: number;
    status?: SubscriptionStatus;
    startDate?: string;
    endDate?: string;
    method?: PaymentRecord['method'];
    paymentDate?: string;
    notes?: string;
  }): Promise<{ subscription: AnnualSubscription; payment: PaymentRecord | null }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إدارة الاشتراكات مخصصة للإدارة فقط.');
    const subId = genId('sub');
    const nowIso = new Date().toISOString();
    try {
      const [pSnap, sSnap, cats] = await Promise.all([
        getDoc(doc(db, 'players', payload.playerId)),
        getDoc(doc(db, 'seasons', payload.seasonId)),
        firebaseStore.getCategories(),
      ]);
      if (!pSnap.exists()) throw new Error('اللاعب غير موجود.');
      const player = pSnap.data() as Player;
      const season = sSnap.exists() ? (sSnap.data() as SeasonRecord) : null;
      const cat = cats.find((c) => c.id === player.categoryId);
      const totalFee = typeof payload.totalFee === 'number' ? payload.totalFee : cat?.annualFee || season?.defaultAnnualFee || 16000;
      const paidAmount = Math.max(0, Number(payload.paidAmount) || 0);
      const status: SubscriptionStatus =
        payload.status || (paidAmount >= totalFee ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid');
      const remainingAmount = status === 'exempt' ? 0 : Math.max(0, totalFee - paidAmount);

      const sub: AnnualSubscription = {
        id: subId,
        seasonId: payload.seasonId,
        seasonName: season?.name || '2026-2027',
        playerId: payload.playerId,
        playerName: player.fullName,
        categoryId: player.categoryId,
        totalFee,
        paidAmount,
        remainingAmount,
        status,
        startDate: payload.startDate || season?.subscriptionStartDate || nowIso.slice(0, 10),
        endDate: payload.endDate || season?.subscriptionEndDate || nowIso.slice(0, 10),
        notes: optClip(payload.notes, 500),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(
        doc(db, 'subscriptions', subId),
        cleanObj({
          ...sub,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );

      let payment: PaymentRecord | null = null;
      if (paidAmount > 0) {
        const payId = genId('pay');
        payment = {
          id: payId,
          subscriptionId: subId,
          seasonId: sub.seasonId,
          seasonName: sub.seasonName,
          playerId: sub.playerId,
          playerName: sub.playerName,
          categoryId: sub.categoryId,
          amount: paidAmount,
          paymentDate: payload.paymentDate || nowIso.slice(0, 10),
          method: payload.method || 'cash',
          receiptNumber: `WAB-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
          status: remainingAmount === 0 ? 'paid' : 'partial',
          notes: optClip(payload.notes, 500),
          recordedBy: auth.currentUser!.uid,
          recordedByName: cachedUserProfile?.fullName || 'الإدارة',
          createdAt: nowIso,
        };
        await setDoc(
          doc(db, 'payments', payId),
          cleanObj({
            ...payment,
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          }),
        );
      }

      return { subscription: sub, payment };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `subscriptions/${subId}`);
    }
  },

  generateSeasonSubscriptions: async (seasonId: string): Promise<{ createdCount: number }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('توليد الاشتراكات متاح للإدارة فقط.');
    try {
      const [players, existingSubs, seasons, cats] = await Promise.all([
        firebaseStore.getPlayers(),
        firebaseStore.getSubscriptions({ seasonId }),
        firebaseStore.getSeasons(),
        firebaseStore.getCategories(),
      ]);
      const season = seasons.find((s) => s.id === seasonId) || seasons[0];
      if (!season) throw new Error('الموسم غير موجود.');
      const existingPlayerIds = new Set(existingSubs.map((s) => s.playerId));
      const targets = players.filter((p) => p.status !== 'archived' && !existingPlayerIds.has(p.id));
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      for (const p of targets) {
        const fee = cats.find((c) => c.id === p.categoryId)?.annualFee || season.defaultAnnualFee || 16000;
        const subId = genId('sub');
        batch.set(
          doc(db, 'subscriptions', subId),
          cleanObj({
            id: subId,
            seasonId: season.id,
            seasonName: season.name,
            playerId: p.id,
            playerName: p.fullName,
            categoryId: p.categoryId,
            totalFee: fee,
            paidAmount: 0,
            remainingAmount: fee,
            status: 'unpaid',
            startDate: season.subscriptionStartDate,
            endDate: season.subscriptionEndDate,
            createdAt: nowIso,
            updatedAt: nowIso,
            serverCreatedAt: serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          }),
        );
      }
      if (targets.length > 0) await batch.commit();
      return { createdCount: targets.length };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'subscriptions');
    }
  },

  updateSubscription: async (id: string, payload: Partial<AnnualSubscription>): Promise<AnnualSubscription> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تعديل الاشتراكات متاح للإدارة فقط.');
    try {
      const refDoc = doc(db, 'subscriptions', id);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) throw new Error('الاشتراك غير موجود.');
      const existing = snap.data() as AnnualSubscription;
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: serverTimestamp(),
      };
      if (typeof payload.totalFee === 'number') patch.totalFee = payload.totalFee;
      if (typeof payload.paidAmount === 'number') patch.paidAmount = payload.paidAmount;
      if (typeof payload.remainingAmount === 'number') patch.remainingAmount = payload.remainingAmount;
      if (payload.status !== undefined) patch.status = payload.status;
      if (payload.notes !== undefined) patch.notes = clip(payload.notes, 500);
      await updateDoc(refDoc, patch);
      return { ...existing, ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${id}`);
    }
  },

  paySubscription: async (
    id: string,
    payload: {
      amount: number;
      method: PaymentRecord['method'];
      paymentDate?: string;
      notes?: string;
      receiptNumber?: string;
    },
  ): Promise<{ subscription: AnnualSubscription; payment: PaymentRecord }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('تحصيل الاشتراكات متاح للإدارة فقط.');
    try {
      const refDoc = doc(db, 'subscriptions', id);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) throw new Error('الاشتراك غير موجود.');
      const existing = snap.data() as AnnualSubscription;
      const newPaid = (Number(existing.paidAmount) || 0) + Number(payload.amount);
      const remaining = Math.max(0, (Number(existing.totalFee) || 0) - newPaid);
      const status: SubscriptionStatus = remaining === 0 ? 'paid' : 'partial';
      const nowIso = new Date().toISOString();

      await updateDoc(refDoc, {
        paidAmount: newPaid,
        remainingAmount: remaining,
        status,
        updatedAt: nowIso,
        serverUpdatedAt: serverTimestamp(),
      });

      const payId = genId('pay');
      const payment: PaymentRecord = {
        id: payId,
        subscriptionId: id,
        seasonId: existing.seasonId,
        seasonName: existing.seasonName,
        playerId: existing.playerId,
        playerName: existing.playerName,
        categoryId: existing.categoryId,
        amount: Number(payload.amount),
        paymentDate: payload.paymentDate || nowIso.slice(0, 10),
        method: payload.method,
        receiptNumber: clip(payload.receiptNumber || `WAB-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`, 64),
        status: remaining === 0 ? 'paid' : 'partial',
        notes: optClip(payload.notes, 500),
        recordedBy: auth.currentUser!.uid,
        recordedByName: cachedUserProfile?.fullName || 'الإدارة',
        createdAt: nowIso,
      };
      await setDoc(
        doc(db, 'payments', payId),
        cleanObj({
          ...payment,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return {
        subscription: { ...existing, paidAmount: newPaid, remainingAmount: remaining, status, updatedAt: nowIso },
        payment,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `subscriptions/${id}`);
    }
  },

  deleteSubscription: async (id: string): Promise<{ ok: boolean }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('حذف الاشتراكات متاح للإدارة فقط.');
    try {
      await deleteDoc(doc(db, 'subscriptions', id));
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `subscriptions/${id}`);
    }
  },

  getPayments: async (seasonId?: string): Promise<PaymentRecord[]> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('المدفوعات مخصصة للإدارة فقط.');
    try {
      const snap = await getDocs(collection(db, 'payments'));
      let list = snap.docs.map((d) => ({ ...(d.data() as PaymentRecord), id: d.id }));
      if (seasonId && seasonId !== 'all') list = list.filter((p) => p.seasonId === seasonId);
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'payments');
    }
  },

  deletePayment: async (id: string): Promise<{ ok: boolean }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('حذف المدفوعات متاح للإدارة فقط.');
    try {
      await deleteDoc(doc(db, 'payments', id));
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `payments/${id}`);
    }
  },

  getFinanceEntries: async (params?: { seasonId?: string; kind?: FinanceEntryKind }): Promise<FinanceEntry[]> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('الخزينة مخصصة للإدارة فقط.');
    try {
      const snap = await getDocs(collection(db, 'financeEntries'));
      let list = snap.docs.map((d) => ({ ...(d.data() as FinanceEntry), id: d.id }));
      if (params?.seasonId && params.seasonId !== 'all') list = list.filter((e) => e.seasonId === params.seasonId);
      if (params?.kind) list = list.filter((e) => e.kind === params.kind);
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'financeEntries');
    }
  },

  createFinanceEntry: async (payload: {
    seasonId?: string;
    kind: FinanceEntryKind;
    category: string;
    title: string;
    amount: number;
    date: string;
    method: FinanceEntry['method'];
    receiptNumber?: string;
    notes?: string;
  }): Promise<FinanceEntry> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('إضافة القيود المالية متاحة للإدارة فقط.');
    const id = genId('fin');
    const nowIso = new Date().toISOString();
    const record: FinanceEntry = {
      id,
      seasonId: clip(payload.seasonId || 'season_2026_2027', 128),
      seasonName: '2026-2027',
      kind: payload.kind,
      category: clip(payload.category || 'عام', 120),
      title: clip(payload.title, 160),
      amount: Number(payload.amount) || 0,
      date: clip(payload.date || nowIso.slice(0, 10), 20),
      method: payload.method || 'cash',
      receiptNumber: optClip(payload.receiptNumber, 64),
      notes: optClip(payload.notes, 500),
      recordedBy: auth.currentUser!.uid,
      recordedByName: cachedUserProfile?.fullName || 'الإدارة',
      createdAt: nowIso,
    };
    try {
      await setDoc(
        doc(db, 'financeEntries', id),
        cleanObj({
          ...record,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `financeEntries/${id}`);
    }
  },

  deleteFinanceEntry: async (id: string): Promise<{ ok: boolean }> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('حذف القيود المالية متاح للإدارة فقط.');
    try {
      await deleteDoc(doc(db, 'financeEntries', id));
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `financeEntries/${id}`);
    }
  },

  getFinanceSummary: async (seasonId?: string): Promise<FinanceSummary> => {
    const [subs, entries, cats, seasons, pays] = await Promise.all([
      firebaseStore.getSubscriptions({ seasonId }),
      firebaseStore.getFinanceEntries({ seasonId }),
      firebaseStore.getCategories(),
      firebaseStore.getSeasons(),
      firebaseStore.getPayments(seasonId),
    ]);
    const activeSeason = seasons.find((s) => s.id === seasonId) || seasons.find((s) => s.status === 'active') || seasons[0];
    const nonExempt = subs.filter((s) => s.status !== 'exempt');
    const subscriptionExpected = nonExempt.reduce((sum, s) => sum + s.totalFee, 0);
    const subscriptionCollected =
      subs.length > 0
        ? subs.reduce((sum, s) => sum + s.paidAmount, 0)
        : pays.filter((p) => p.status !== 'unpaid').reduce((sum, p) => sum + p.amount, 0);
    const subscriptionRemaining = nonExempt.reduce((sum, s) => sum + s.remainingAmount, 0);
    const otherIncomeTotal = entries.filter((e) => e.kind === 'income').reduce((sum, e) => sum + e.amount, 0);
    const expensesTotal = entries.filter((e) => e.kind === 'expense').reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = subscriptionCollected + otherIncomeTotal;

    const byCategory = cats.map((c) => {
      const catSubs = subs.filter((s) => s.categoryId === c.id && s.status !== 'exempt');
      return {
        categoryId: c.id,
        categoryName: c.code,
        expectedAmount: catSubs.reduce((s, x) => s + x.totalFee, 0),
        collectedAmount: catSubs.reduce((s, x) => s + x.paidAmount, 0),
        remainingAmount: catSubs.reduce((s, x) => s + x.remainingAmount, 0),
      };
    });

    return {
      seasonId: activeSeason?.id || 'season_2026_2027',
      seasonName: activeSeason?.name || '2026-2027',
      subscriptionExpected,
      subscriptionCollected,
      subscriptionRemaining,
      paidCount: subs.filter((s) => s.status === 'paid').length,
      partialCount: subs.filter((s) => s.status === 'partial').length,
      unpaidCount: subs.filter((s) => s.status === 'unpaid').length,
      expiredCount: subs.filter((s) => s.status === 'expired').length,
      exemptCount: subs.filter((s) => s.status === 'exempt').length,
      otherIncomeTotal,
      totalIncome,
      expensesTotal,
      netBalance: totalIncome - expensesTotal,
      byCategory,
      monthlySeries: [],
    };
  },

  // ---- ANNOUNCEMENTS, NOTIFICATIONS, REPORTS, REQUESTS, LOGS ----
  getAnnouncements: async (): Promise<Announcement[]> => {
    const role = await getCurrentRole();
    try {
      const q =
        role === 'admin'
          ? collection(db, 'announcements')
          : query(collection(db, 'announcements'), where('targetAudience', 'in', ['all', 'coaches', 'parents', 'category']));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as Announcement), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'announcements');
    }
  },

  createAnnouncement: async (payload: {
    title: string;
    body: string;
    type: Announcement['type'];
    targetAudience: Announcement['targetAudience'];
    targetCategoryId?: string;
    pinned?: boolean;
  }): Promise<Announcement> => {
    const role = await getCurrentRole();
    if (role !== 'admin') throw new Error('نشر الإعلانات متاح للإدارة فقط.');
    const id = genId('ann');
    const record: Announcement = {
      id,
      title: clip(payload.title, 160),
      body: clip(payload.body, 3000),
      type: payload.type,
      targetAudience: payload.targetAudience,
      targetCategoryId: optClip(payload.targetCategoryId, 64),
      pinned: Boolean(payload.pinned),
      authorId: auth.currentUser!.uid,
      authorName: clip(cachedUserProfile?.fullName || 'إدارة النادي', 120),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(
        doc(db, 'announcements', id),
        cleanObj({
          ...record,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
    }
  },

  deleteAnnouncement: async (id: string): Promise<{ ok: boolean }> => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
    }
  },

  getNotifications: async (): Promise<NotificationItem[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'notifications')
          : query(collection(db, 'notifications'), where('authUid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as NotificationItem), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    }
  },

  markNotificationRead: async (id: string): Promise<NotificationItem> => {
    try {
      const refDoc = doc(db, 'notifications', id);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) throw new Error('الإشعار غير موجود.');
      await updateDoc(refDoc, { read: true, serverUpdatedAt: serverTimestamp() });
      return { ...(snap.data() as NotificationItem), id, read: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  },

  markAllNotificationsRead: async (): Promise<{ ok: boolean }> => {
    try {
      const list = await firebaseStore.getNotifications();
      const batch = writeBatch(db);
      for (const n of list.filter((x) => !x.read)) {
        batch.update(doc(db, 'notifications', n.id), { read: true, serverUpdatedAt: serverTimestamp() });
      }
      await batch.commit();
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  },

  getCoachReports: async (): Promise<CoachReport[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'coachReports')
          : query(collection(db, 'coachReports'), where('coachAuthUid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as CoachReport), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'coachReports');
    }
  },

  createCoachReport: async (payload: {
    categoryId: string;
    title: string;
    summary: string;
    recommendations?: string;
  }): Promise<CoachReport> => {
    const uid = auth.currentUser!.uid;
    const id = genId('rep');
    const record: CoachReport = {
      id,
      coachId: uid,
      coachUserId: uid,
      coachName: clip(cachedUserProfile?.fullName || 'مدرب', 120),
      categoryId: clip(payload.categoryId, 64),
      title: clip(payload.title, 160),
      summary: clip(payload.summary, 3000),
      recommendations: optClip(payload.recommendations, 1500),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(
        doc(db, 'coachReports', id),
        cleanObj({
          ...record,
          coachAuthUid: uid,
          serverCreatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        }),
      );
      return record;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `coachReports/${id}`);
    }
  },

  reviewCoachReport: async (id: string, payload: { status?: 'pending' | 'reviewed'; adminNote?: string }): Promise<CoachReport> => {
    try {
      const rRef = doc(db, 'coachReports', id);
      const snap = await getDoc(rRef);
      if (!snap.exists()) throw new Error('التقرير غير موجود.');
      const patch: Record<string, unknown> = { serverUpdatedAt: serverTimestamp() };
      if (payload.status !== undefined) patch.status = payload.status;
      if (payload.adminNote !== undefined) patch.adminNote = clip(payload.adminNote, 1000);
      await updateDoc(rRef, patch);
      return { ...(snap.data() as CoachReport), ...payload, id };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `coachReports/${id}`);
    }
  },

  getRegistrationRequests: async (): Promise<RegistrationRequest[]> => {
    const role = await getCurrentRole();
    const uid = auth.currentUser!.uid;
    try {
      const q =
        role === 'admin'
          ? collection(db, 'registrationRequests')
          : query(collection(db, 'registrationRequests'), where('applicantAuthUid', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as RegistrationRequest), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'registrationRequests');
    }
  },

  updateRegistrationRequestNote: async (id: string, adminNotes: string): Promise<{ request: RegistrationRequest }> => {
    const refDoc = doc(db, 'registrationRequests', id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) throw new Error('طلب التسجيل غير موجود.');
    await updateDoc(refDoc, { adminNotes: clip(adminNotes, 1000), serverUpdatedAt: serverTimestamp() });
    return { request: { ...(snap.data() as RegistrationRequest), id, adminNotes } };
  },

  requestMissingDocuments: async (id: string, payload: { missingDocumentNote: string; adminNotes?: string }) => {
    const refDoc = doc(db, 'registrationRequests', id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) throw new Error('طلب التسجيل غير موجود.');
    const nowIso = new Date().toISOString();
    await updateDoc(
      refDoc,
      cleanObj({
        status: 'incomplete',
        missingDocumentNote: clip(payload.missingDocumentNote, 1000),
        adminNotes: optClip(payload.adminNotes, 1000),
        reviewedAt: nowIso,
        reviewedBy: auth.currentUser!.uid,
        reviewedByName: cachedUserProfile?.fullName || 'الإدارة',
        serverUpdatedAt: serverTimestamp(),
      }),
    );
    return { request: { ...(snap.data() as RegistrationRequest), id, status: 'incomplete' as const, missingDocumentNote: payload.missingDocumentNote } };
  },

  approveRegistrationRequest: async (id: string, payload?: { categoryId?: string; adminNotes?: string }) => {
    const refDoc = doc(db, 'registrationRequests', id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) throw new Error('طلب التسجيل غير موجود.');
    const reqItem = snap.data() as RegistrationRequest & { applicantAuthUid?: string };
    const catId = payload?.categoryId || reqItem.categoryId;
    const player = await firebaseStore.createPlayer({
      fullName: reqItem.fullName,
      birthDate: reqItem.birthDate,
      categoryId: catId,
      parentName: reqItem.parentName,
      parentPhone: reqItem.parentPhone,
      parentUserId: reqItem.applicantUserId || reqItem.applicantAuthUid || '',
      address: reqItem.address,
      photoUrl: reqItem.photoUrl || '',
      medicalNotes: reqItem.medicalNotes,
      status: 'active',
    });
    const nowIso = new Date().toISOString();
    await updateDoc(
      refDoc,
      cleanObj({
        status: 'approved',
        categoryId: catId,
        createdPlayerId: player.id,
        adminNotes: optClip(payload?.adminNotes, 1000),
        approvedAt: nowIso,
        reviewedAt: nowIso,
        reviewedBy: auth.currentUser!.uid,
        reviewedByName: cachedUserProfile?.fullName || 'الإدارة',
        serverUpdatedAt: serverTimestamp(),
      }),
    );
    return { request: { ...reqItem, id, status: 'approved' as const, createdPlayerId: player.id }, player };
  },

  rejectRegistrationRequest: async (id: string, payload: { rejectionReason: string; adminNotes?: string }) => {
    const refDoc = doc(db, 'registrationRequests', id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) throw new Error('طلب التسجيل غير موجود.');
    const nowIso = new Date().toISOString();
    await updateDoc(
      refDoc,
      cleanObj({
        status: 'rejected',
        rejectionReason: clip(payload.rejectionReason, 1000),
        adminNotes: optClip(payload.adminNotes, 1000),
        reviewedAt: nowIso,
        reviewedBy: auth.currentUser!.uid,
        reviewedByName: cachedUserProfile?.fullName || 'الإدارة',
        serverUpdatedAt: serverTimestamp(),
      }),
    );
    return { request: { ...(snap.data() as RegistrationRequest), id, status: 'rejected' as const, rejectionReason: payload.rejectionReason } };
  },

  resubmitRegistrationDocuments: async (id: string, payload: { documents: { url: string; name: string; mime: string }[]; note?: string }) => {
    const refDoc = doc(db, 'registrationRequests', id);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) throw new Error('طلب التسجيل غير موجود.');
    const existing = snap.data() as RegistrationRequest;
    const nowIso = new Date().toISOString();
    const added: RegistrationDocument[] = payload.documents.map((d) => ({
      id: genId('doc'),
      url: d.url,
      name: d.name,
      mime: d.mime,
      uploadedAt: nowIso,
    }));
    const additionalDocuments = [...(existing.additionalDocuments || []), ...added].slice(0, 20);
    await updateDoc(refDoc, {
      additionalDocuments,
      status: 'pending',
      serverUpdatedAt: serverTimestamp(),
    });
    return { request: { ...existing, id, additionalDocuments, status: 'pending' as const } };
  },

  getActivityLogs: async (): Promise<ActivityLog[]> => {
    const role = await getCurrentRole();
    if (role !== 'admin') return [];
    try {
      const snap = await getDocs(collection(db, 'activityLogs'));
      return snap.docs.map((d) => ({ ...(d.data() as ActivityLog), id: d.id }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'activityLogs');
    }
  },

  getCategoryOverview: async (id: string): Promise<CategoryOverview> => {
    const [cats, players, coaches, trainings, matches, attendance, evaluations] = await Promise.all([
      firebaseStore.getCategories(),
      firebaseStore.getPlayers(),
      firebaseStore.getCoaches(),
      firebaseStore.getTrainings(),
      firebaseStore.getMatches(),
      firebaseStore.getAttendance({ categoryId: id }),
      firebaseStore.getEvaluations(),
    ]);
    const cat = cats.find((c) => c.id === id) || DEFAULT_CATEGORIES[0];
    const catPlayers = players.filter((p) => p.categoryId === id);
    const catTrainings = trainings.filter((t) => t.categoryId === id);
    const catMatches = matches.filter((m) => m.categoryId === id);
    const catCoaches = coaches.filter((c) => c.categoryIds.includes(id));
    const catEvaluations = evaluations.filter((e) => e.categoryId === id);
    const presentCount = attendance.filter((a) => a.status === 'present').length;
    const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

    return {
      category: cat,
      players: catPlayers,
      coaches: catCoaches,
      trainings: catTrainings,
      matches: catMatches,
      attendance,
      evaluations: catEvaluations,
      stats: {
        totalPlayers: catPlayers.length,
        activePlayers: catPlayers.filter((p) => p.status === 'active').length,
        attendanceRate,
        trainingsCount: catTrainings.length,
        matchesCount: catMatches.length,
        collectedRevenue: 0,
        remainingDebt: 0,
      },
    };
  },

  getDashboard: async (): Promise<DashboardSummary> => {
    const role = await getCurrentRole();
    const [players, cats, attendance, trainings, matches, announcements, notifications] = await Promise.all([
      firebaseStore.getPlayers(),
      firebaseStore.getCategories(),
      firebaseStore.getAttendance(),
      firebaseStore.getTrainings(),
      firebaseStore.getMatches(),
      firebaseStore.getAnnouncements(),
      firebaseStore.getNotifications(),
    ]);

    const nonArchived = players.filter((p) => p.status !== 'archived');
    const activePlayers = nonArchived.filter((p) => p.status === 'active');
    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonth = todayStr.slice(0, 7);
    const monthAtt = attendance.filter((a) => a.date.startsWith(thisMonth));
    const monthlyAttendanceRate =
      monthAtt.length > 0 ? Math.round((monthAtt.filter((a) => a.status === 'present').length / monthAtt.length) * 100) : 0;
    const annualAttendanceRate =
      attendance.length > 0 ? Math.round((attendance.filter((a) => a.status === 'present').length / attendance.length) * 100) : 0;

    let totalCoaches = 0;
    let pendingRegistrationsCount = 0;
    let incompleteRegistrationsCount = 0;
    let seasonCollectedRevenue = 0;
    let seasonTotalExpected = 0;
    let seasonRemainingDebt = 0;
    let paidSubscriptionsCount = 0;
    let unpaidSubscriptionsCount = 0;
    let recentActivities: ActivityLog[] = [];

    if (role === 'admin') {
      const [coaches, subs, pays, reqs, logs] = await Promise.all([
        firebaseStore.getCoaches(),
        firebaseStore.getSubscriptions(),
        firebaseStore.getPayments(),
        firebaseStore.getRegistrationRequests(),
        firebaseStore.getActivityLogs(),
      ]);
      totalCoaches = coaches.filter((c) => c.active).length;
      pendingRegistrationsCount = reqs.filter((r) => r.status === 'pending').length;
      incompleteRegistrationsCount = reqs.filter((r) => r.status === 'incomplete').length;
      const nonExempt = subs.filter((s) => s.status !== 'exempt');
      seasonTotalExpected = nonExempt.reduce((s, x) => s + x.totalFee, 0);
      seasonCollectedRevenue =
        subs.length > 0
          ? subs.reduce((s, x) => s + x.paidAmount, 0)
          : pays.filter((p) => p.status !== 'unpaid').reduce((s, x) => s + x.amount, 0);
      seasonRemainingDebt = nonExempt.reduce((s, x) => s + x.remainingAmount, 0);
      paidSubscriptionsCount = subs.filter((s) => s.status === 'paid').length;
      unpaidSubscriptionsCount = subs.filter((s) => ['unpaid', 'partial', 'expired'].includes(s.status)).length;
      recentActivities = logs.slice(0, 10);
    }

    return {
      totalPlayers: nonArchived.length,
      activePlayers: activePlayers.length,
      totalCoaches,
      categoriesCount: cats.length,
      pendingRegistrationsCount,
      incompleteRegistrationsCount,
      playersByCategory: cats.map((c) => ({
        categoryId: c.id,
        categoryName: c.code,
        count: nonArchived.filter((p) => p.categoryId === c.id).length,
      })),
      monthlyAttendanceRate,
      annualAttendanceRate,
      seasonCollectedRevenue,
      seasonTotalExpected,
      seasonRemainingDebt,
      paidSubscriptionsCount,
      unpaidSubscriptionsCount,
      upcomingMatches: matches.filter((m) => m.status === 'scheduled' && m.date >= todayStr).slice(0, 6),
      upcomingTrainings: trainings.filter((t) => t.status === 'scheduled' && t.date >= todayStr).slice(0, 6),
      recentActivities,
      recentAnnouncements: announcements.slice(0, 6),
      unreadNotificationsCount: notifications.filter((n) => !n.read).length,
    };
  },
};
