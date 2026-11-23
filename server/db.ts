import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityLog,
  Announcement,
  AnnualSubscription,
  AttendanceRecord,
  Category,
  ClubSettings,
  Coach,
  CoachReport,
  EvaluationRecord,
  FinanceEntry,
  MatchRecord,
  NotificationItem,
  PaymentRecord,
  Player,
  RegistrationRequest,
  SeasonRecord,
  TrainingSession,
  UserRecord,
  UserRole,
} from '../src/types/wab.ts';

export interface DatabaseSchema {
  users: UserRecord[];
  players: Player[];
  registrationRequests: RegistrationRequest[];
  coaches: Coach[];
  categories: Category[];
  seasons: SeasonRecord[];
  subscriptions: AnnualSubscription[];
  attendance: AttendanceRecord[];
  trainingSessions: TrainingSession[];
  matches: MatchRecord[];
  payments: PaymentRecord[];
  financeEntries: FinanceEntry[];
  announcements: Announcement[];
  notifications: NotificationItem[];
  evaluations: EvaluationRecord[];
  coachReports: CoachReport[];
  activityLogs: ActivityLog[];
  clubSettings: ClubSettings;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'wab-db.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const PRIVATE_UPLOADS_DIR = path.join(DATA_DIR, 'private_uploads');

export function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(PRIVATE_UPLOADS_DIR)) fs.mkdirSync(PRIVATE_UPLOADS_DIR, { recursive: true });
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function createEmptyInitialData(): DatabaseSchema {
  const now = new Date().toISOString();

  const categories: Category[] = [
    {
      id: 'U7',
      code: 'U7',
      name: 'فئة أقل من 7 سنوات (براعم)',
      ageRange: '5 – 7 سنوات',
      annualFee: 12000,
      description: 'التأسيس الحركي والتآلف مع الكرة عبر ألعاب تعليمية وتربوية.',
    },
    {
      id: 'U9',
      code: 'U9',
      name: 'فئة أقل من 9 سنوات',
      ageRange: '8 – 9 سنوات',
      annualFee: 14000,
      description: 'المهارات الفردية الأساسية، التمرير القصير، واللعب الجماعي الأولي.',
    },
    {
      id: 'U11',
      code: 'U11',
      name: 'فئة أقل من 11 سنة',
      ageRange: '10 – 11 سنة',
      annualFee: 15000,
      description: 'تطوير التحكم بالكرة، التمركز، وبداية الفهم التكتيكي 8 ضد 8.',
    },
    {
      id: 'U13',
      code: 'U13',
      name: 'فئة أقل من 13 سنة',
      ageRange: '12 – 13 سنة',
      annualFee: 16000,
      description: 'الانتقال إلى اللعب الكامل، الانسجام التكتيكي، واللياقة المتوازنة.',
    },
    {
      id: 'U15',
      code: 'U15',
      name: 'فئة أقل من 15 سنة (أصاغر)',
      ageRange: '14 – 15 سنة',
      annualFee: 18000,
      description: 'التكتيك الجماعي، القوة البدنية الموجهة، والمنافسات الرسمية.',
    },
    {
      id: 'U17',
      code: 'U17',
      name: 'فئة أقل من 17 سنة (أشبال)',
      ageRange: '16 – 17 سنة',
      annualFee: 20000,
      description: 'التحضير التنافسي العالي والانضباط التكتيكي قبل الفريق الأول.',
    },
  ];

  const seasons: SeasonRecord[] = [
    {
      id: 'season_2026_2027',
      name: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      subscriptionStartDate: '2026-09-01',
      subscriptionEndDate: '2027-06-30',
      defaultAnnualFee: 16000,
      allowInstallments: true,
      status: 'active',
      createdAt: now,
    },
  ];

  const clubSettings: ClubSettings = {
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

  return {
    users: [],
    players: [],
    registrationRequests: [],
    coaches: [],
    categories,
    seasons,
    subscriptions: [],
    attendance: [],
    trainingSessions: [],
    matches: [],
    payments: [],
    financeEntries: [],
    announcements: [],
    notifications: [],
    evaluations: [],
    coachReports: [],
    activityLogs: [],
    clubSettings,
  };
}

function normalizeDb(raw: Partial<DatabaseSchema>): DatabaseSchema {
  const base = createEmptyInitialData();
  const normalizedCategories = (Array.isArray(raw.categories) && raw.categories.length > 0
    ? raw.categories
    : base.categories
  ).map((cat) => ({
    ...cat,
    annualFee: typeof cat.annualFee === 'number' ? cat.annualFee : (cat.monthlyFee ? cat.monthlyFee * 8 : 16000),
  }));

  const rawSettings = raw.clubSettings || ({} as Partial<ClubSettings>);
  const upgradedColors =
    !rawSettings.primaryColor || rawSettings.primaryColor === '#D71935'
      ? {
          primaryColor: '#14532D',
          secondaryColor: '#16A34A',
          surfaceColor: '#F3F4F6',
        }
      : {};

  return {
    users: Array.isArray(raw.users) ? raw.users : [],
    players: Array.isArray(raw.players) ? raw.players : [],
    registrationRequests: Array.isArray(raw.registrationRequests) ? raw.registrationRequests : [],
    coaches: Array.isArray(raw.coaches) ? raw.coaches : [],
    categories: normalizedCategories,
    seasons: Array.isArray(raw.seasons) && raw.seasons.length > 0 ? raw.seasons : base.seasons,
    subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
    attendance: Array.isArray(raw.attendance) ? raw.attendance : [],
    trainingSessions: Array.isArray(raw.trainingSessions) ? raw.trainingSessions : [],
    matches: Array.isArray(raw.matches) ? raw.matches : [],
    payments: Array.isArray(raw.payments) ? raw.payments : [],
    financeEntries: Array.isArray(raw.financeEntries) ? raw.financeEntries : [],
    announcements: Array.isArray(raw.announcements) ? raw.announcements : [],
    notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
    evaluations: Array.isArray(raw.evaluations) ? raw.evaluations : [],
    coachReports: Array.isArray(raw.coachReports) ? raw.coachReports : [],
    activityLogs: Array.isArray(raw.activityLogs) ? raw.activityLogs : [],
    clubSettings: {
      ...base.clubSettings,
      ...rawSettings,
      ...upgradedColors,
    },
  };
}

let cachedDb: DatabaseSchema | null = null;

export function loadDb(): DatabaseSchema {
  ensureDirs();
  if (cachedDb) return cachedDb;
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      cachedDb = normalizeDb(JSON.parse(raw) as Partial<DatabaseSchema>);
      return cachedDb;
    } catch {
      // If file is corrupted, rebuild safely with clean empty data
    }
  }
  cachedDb = createEmptyInitialData();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(db: DatabaseSchema): void {
  ensureDirs();
  cachedDb = db;
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function resetDbToEmpty(): DatabaseSchema {
  const empty = createEmptyInitialData();
  saveDb(empty);
  return empty;
}

export function logActivity(
  db: DatabaseSchema,
  actor: { id: string; fullName: string; role: UserRole },
  action: string,
  entityType: string,
  entityId: string,
  details: string,
): void {
  db.activityLogs.unshift({
    id: uid('log'),
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  });
  if (db.activityLogs.length > 500) {
    db.activityLogs = db.activityLogs.slice(0, 500);
  }
}

export function pushNotificationsForTargets(
  db: DatabaseSchema,
  opts: {
    title: string;
    message: string;
    type: string;
    relatedId?: string;
    targetAudience: 'all' | 'coaches' | 'parents' | 'category';
    targetCategoryId?: string;
    excludeUserId?: string;
  },
): void {
  const now = new Date().toISOString();
  const targetUserIds = new Set<string>();

  for (const u of db.users) {
    if (!u.active || u.id === opts.excludeUserId) continue;
    if (opts.targetAudience === 'all') {
      targetUserIds.add(u.id);
    } else if (opts.targetAudience === 'coaches' && u.role === 'coach') {
      targetUserIds.add(u.id);
    } else if (opts.targetAudience === 'parents' && u.role === 'parent') {
      targetUserIds.add(u.id);
    } else if (opts.targetAudience === 'category' && opts.targetCategoryId) {
      if (u.role === 'admin') {
        targetUserIds.add(u.id);
      } else if (u.role === 'coach' && u.categoryIds.includes(opts.targetCategoryId)) {
        targetUserIds.add(u.id);
      } else if (u.role === 'parent') {
        const hasChildInCat = db.players.some(
          (p) => p.parentUserId === u.id && p.categoryId === opts.targetCategoryId && p.status !== 'archived',
        );
        if (hasChildInCat) targetUserIds.add(u.id);
      }
    }
  }

  for (const userId of targetUserIds) {
    db.notifications.unshift({
      id: uid('not'),
      userId,
      title: opts.title,
      message: opts.message,
      type: opts.type,
      relatedId: opts.relatedId,
      read: false,
      createdAt: now,
    });
  }
  if (db.notifications.length > 1000) {
    db.notifications = db.notifications.slice(0, 1000);
  }
}
