import { auth, SUPER_ADMIN_EMAIL } from './firebase.ts';
import { firebaseStore } from './firebaseStore.ts';
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
  RegistrationRequest,
  SeasonRecord,
  SubscriptionStatus,
  TrainingSession,
  UserRole,
} from '../types/wab.ts';

const TOKEN_KEY = 'wab_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getProtectedFileUrl(url?: string, download = false): string {
  if (!url) return '';
  if (!url.startsWith('/api/registration-files/')) return url;
  const token = getStoredToken();
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (download) params.set('download', '1');
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = 'حدث خطأ في الاتصال بالخادم.';
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // keep fallback
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

function useCloudFirestore(): boolean {
  return false;
}

export interface ParentWithChildren extends PublicUser {
  children: Player[];
  unpaidCount: number;
}

export interface FinanceSummary {
  seasonId: string;
  seasonName: string;
  subscriptionExpected: number;
  subscriptionCollected: number;
  subscriptionRemaining: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  expiredCount: number;
  exemptCount: number;
  otherIncomeTotal: number;
  totalIncome: number;
  expensesTotal: number;
  netBalance: number;
  byCategory: {
    categoryId: string;
    categoryName: string;
    expectedAmount: number;
    collectedAmount: number;
    remainingAmount: number;
  }[];
  monthlySeries: { month: string; income: number; expense: number }[];
}

export interface CategoryOverview {
  category: Category;
  players: Player[];
  coaches: Coach[];
  trainings: TrainingSession[];
  matches: MatchRecord[];
  attendance: AttendanceRecord[];
  evaluations: EvaluationRecord[];
  stats: {
    totalPlayers: number;
    activePlayers: number;
    attendanceRate: number;
    trainingsCount: number;
    matchesCount: number;
    collectedRevenue: number;
    remainingDebt: number;
  };
}

export const api = {
  getPublicClub: async () => {
    try {
      const cloud = await firebaseStore.getPublicClub();
      return {
        clubSettings: cloud.clubSettings,
        categories: cloud.categories,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      };
    } catch {
      return request<{ clubSettings: ClubSettings; categories: Category[]; appUrl?: string }>('/api/public/club');
    }
  },

  getSetupStatus: async () => {
    // Super Admin uses Firebase Auth (boudiafrabeh8@gmail.com) — setup is handled via Firebase sign-in
    return { hasAdmin: true };
  },

  bootstrapAdmin: async (payload: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    username?: string;
  }) => {
    return firebaseStore.setupSuperAdminEmail(payload);
  },

  loginWithGoogle: async (expectedRole?: UserRole) => {
    return firebaseStore.loginWithGoogle(expectedRole);
  },

  resendVerificationEmail: async () => {
    return firebaseStore.resendAdminVerificationEmail();
  },

  reloadVerifiedSession: async () => {
    return firebaseStore.reloadAndVerifyCurrentUser();
  },

  login: async (identifier: string, password: string, expectedRole?: UserRole) => {
    const clean = identifier.trim();
    if (useCloudFirestore()) {
      try {
        return await firebaseStore.loginWithUsernameOrEmail(clean, password, expectedRole);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (
          clean.toLowerCase() === SUPER_ADMIN_EMAIL &&
          expectedRole === 'admin' &&
          msg.includes('البريد الإلكتروني أو كلمة المرور غير صحيحة')
        ) {
          try {
            return await firebaseStore.setupSuperAdminEmail({
              fullName: 'مدير نادي وداد أمل بوعنان',
              email: clean,
              password,
            });
          } catch (setupErr) {
            if (setupErr instanceof Error && !setupErr.message.includes('email-already-in-use')) {
              throw setupErr;
            }
          }
        }
        throw err;
      }
    }

    const data = await request<{ token: string; user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: clean, password, expectedRole }),
    });
    setStoredToken(data.token);
    return data.user;
  },

  parentChildLogin: async (childFullName: string, birthDate: string) => {
    const data = await request<{ token: string; user: PublicUser }>('/api/auth/parent-child-login', {
      method: 'POST',
      body: JSON.stringify({ childFullName, birthDate }),
    });
    setStoredToken(data.token);
    return data.user;
  },

  forgotPassword: (identifier: string, note?: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier, note }),
    }),

  logout: async () => {
    try {
      if (auth.currentUser) {
        await firebaseStore.logout();
      }
      await request('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    } finally {
      setStoredToken(null);
    }
  },

  me: async () => {
    if (auth.currentUser) {
      const user = await firebaseStore.restoreSession(auth.currentUser);
      return { user };
    }
    return request<{ user: PublicUser }>('/api/auth/me');
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    if (auth.currentUser) {
      return firebaseStore.changePassword(currentPassword, newPassword);
    }
    return request<{ ok: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  uploadImage: async (dataUrl: string, prefix = 'img') => {
    if (useCloudFirestore()) {
      try {
        return await firebaseStore.uploadDataUrl(dataUrl, `uploads/${prefix}`, prefix);
      } catch (err) {
        console.warn('Firebase Storage upload fallback to server endpoint:', err);
      }
    }
    return request<{ url: string }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, prefix }),
    });
  },

  getDashboard: () =>
    useCloudFirestore() ? firebaseStore.getDashboard() : request<DashboardSummary>('/api/dashboard'),

  // Players
  getPlayers: () =>
    useCloudFirestore() ? firebaseStore.getPlayers() : request<Player[]>('/api/players'),
  getPlayerProfile: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.getPlayerProfile(id)
      : request<{
          player: Player;
          attendance: AttendanceRecord[];
          subscriptions: AnnualSubscription[];
          payments: PaymentRecord[];
          evaluations: EvaluationRecord[];
        }>(`/api/players/${id}`),
  createPlayer: (payload: Partial<Player>) =>
    useCloudFirestore()
      ? firebaseStore.createPlayer(payload)
      : request<Player>('/api/players', { method: 'POST', body: JSON.stringify(payload) }),
  updatePlayer: (id: string, payload: Partial<Player>) =>
    useCloudFirestore()
      ? firebaseStore.updatePlayer(id, payload)
      : request<Player>(`/api/players/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePlayer: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deletePlayer(id)
      : request<{ ok: boolean }>(`/api/players/${id}`, { method: 'DELETE' }),

  // Coaches
  getCoaches: () =>
    useCloudFirestore() ? firebaseStore.getCoaches() : request<Coach[]>('/api/coaches'),
  createCoach: (payload: {
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
  }) =>
    useCloudFirestore()
      ? firebaseStore.createCoach(payload)
      : request<Coach>('/api/coaches', { method: 'POST', body: JSON.stringify(payload) }),
  updateCoach: (id: string, payload: Partial<Coach>) =>
    useCloudFirestore()
      ? firebaseStore.updateCoach(id, payload)
      : request<Coach>(`/api/coaches/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
   deleteCoach: (id: string) =>
     useCloudFirestore()
       ? firebaseStore.deleteCoach(id)
       : request<{ ok: boolean }>(`/api/coaches/${id}`, { method: "DELETE" }),
  updateMyCoachPhoto: (photoUrl: string) =>
    useCloudFirestore()
      ? firebaseStore.updateMyCoachPhoto(photoUrl)
      : request<{ coach: Coach; user: PublicUser }>('/api/coaches/me/photo', {
          method: 'PATCH',
          body: JSON.stringify({ photoUrl }),
        }),

  // Parents & Users
  getParents: () =>
    useCloudFirestore() ? firebaseStore.getParents() : request<ParentWithChildren[]>('/api/parents'),
  getUsers: () =>
    useCloudFirestore() ? firebaseStore.getUsers() : request<PublicUser[]>('/api/users'),
  createUser: (payload: {
    username?: string;
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    phone?: string;
    categoryIds?: string[];
    linkedPlayerIds?: string[];
  }) =>
    useCloudFirestore()
      ? firebaseStore.createUser(payload)
      : request<PublicUser>('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (
    id: string,
    payload: {
      fullName?: string;
      phone?: string;
      email?: string;
      active?: boolean;
      role?: UserRole;
      categoryIds?: string[];
      password?: string;
      linkedPlayerIds?: string[];
    },
  ) =>
    useCloudFirestore()
      ? firebaseStore.updateUser(id, payload)
      : request<PublicUser>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Categories
  getCategories: () =>
    useCloudFirestore() ? firebaseStore.getCategories() : request<Category[]>('/api/categories'),
  getCategoryOverview: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.getCategoryOverview(id)
      : request<CategoryOverview>(`/api/categories/${id}/overview`),
  updateCategory: (id: string, payload: Partial<Category>) =>
    useCloudFirestore()
      ? firebaseStore.updateCategory(id, payload)
      : request<Category>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Seasons
  getSeasons: () =>
    useCloudFirestore() ? firebaseStore.getSeasons() : request<SeasonRecord[]>('/api/seasons'),
  createSeason: (payload: Partial<SeasonRecord> & { archivePrevious?: boolean }) =>
    useCloudFirestore()
      ? firebaseStore.createSeason(payload)
      : request<SeasonRecord>('/api/seasons', { method: 'POST', body: JSON.stringify(payload) }),
  updateSeason: (id: string, payload: Partial<SeasonRecord>) =>
    useCloudFirestore()
      ? firebaseStore.updateSeason(id, payload)
      : request<SeasonRecord>(`/api/seasons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Annual Subscriptions
  getSubscriptions: (params?: { seasonId?: string; status?: string }) => {
    if (useCloudFirestore()) return firebaseStore.getSubscriptions(params);
    const q = new URLSearchParams();
    if (params?.seasonId) q.set('seasonId', params.seasonId);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request<AnnualSubscription[]>(`/api/subscriptions${qs ? `?${qs}` : ''}`);
  },
  createSubscription: (payload: {
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
  }) =>
    useCloudFirestore()
      ? firebaseStore.createSubscription(payload)
      : request<{ subscription: AnnualSubscription; payment: PaymentRecord | null }>('/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  generateSeasonSubscriptions: (seasonId: string) =>
    useCloudFirestore()
      ? firebaseStore.generateSeasonSubscriptions(seasonId)
      : request<{ createdCount: number }>('/api/subscriptions/generate', {
          method: 'POST',
          body: JSON.stringify({ seasonId }),
        }),
  updateSubscription: (id: string, payload: Partial<AnnualSubscription>) =>
    useCloudFirestore()
      ? firebaseStore.updateSubscription(id, payload)
      : request<AnnualSubscription>(`/api/subscriptions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),
  paySubscription: (
    id: string,
    payload: {
      amount: number;
      method: PaymentRecord['method'];
      paymentDate?: string;
      notes?: string;
      receiptNumber?: string;
    },
  ) =>
    useCloudFirestore()
      ? firebaseStore.paySubscription(id, payload)
      : request<{ subscription: AnnualSubscription; payment: PaymentRecord }>(`/api/subscriptions/${id}/pay`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  deleteSubscription: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deleteSubscription(id)
      : request<{ ok: boolean }>(`/api/subscriptions/${id}`, { method: 'DELETE' }),

  // Trainings
  getTrainings: () =>
    useCloudFirestore() ? firebaseStore.getTrainings() : request<TrainingSession[]>('/api/trainings'),
  createTraining: (payload: Partial<TrainingSession>) =>
    useCloudFirestore()
      ? firebaseStore.createTraining(payload)
      : request<TrainingSession>('/api/trainings', { method: 'POST', body: JSON.stringify(payload) }),
  updateTraining: (id: string, payload: Partial<TrainingSession>) =>
    useCloudFirestore()
      ? firebaseStore.updateTraining(id, payload)
      : request<TrainingSession>(`/api/trainings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTraining: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deleteTraining(id)
      : request<{ ok: boolean }>(`/api/trainings/${id}`, { method: 'DELETE' }),

  // Attendance
  getAttendance: (params?: { categoryId?: string; sessionId?: string; date?: string; playerId?: string }) => {
    if (useCloudFirestore()) return firebaseStore.getAttendance(params);
    const q = new URLSearchParams();
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    if (params?.sessionId) q.set('sessionId', params.sessionId);
    if (params?.date) q.set('date', params.date);
    if (params?.playerId) q.set('playerId', params.playerId);
    const qs = q.toString();
    return request<AttendanceRecord[]>(`/api/attendance${qs ? `?${qs}` : ''}`);
  },
  saveAttendanceBatch: (payload: {
    categoryId: string;
    sessionId: string;
    date: string;
    entries: { playerId: string; status: 'present' | 'absent' | 'excused'; notes?: string }[];
  }) =>
    useCloudFirestore()
      ? firebaseStore.saveAttendanceBatch(payload)
      : request<{ saved: number; records: AttendanceRecord[] }>('/api/attendance/batch', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  updateAttendanceRecord: (id: string, payload: Partial<AttendanceRecord>) =>
    useCloudFirestore()
      ? firebaseStore.updateAttendanceRecord(id, payload)
      : request<AttendanceRecord>(`/api/attendance/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Matches
  getMatches: () =>
    useCloudFirestore() ? firebaseStore.getMatches() : request<MatchRecord[]>('/api/matches'),
  createMatch: (payload: Partial<MatchRecord>) =>
    useCloudFirestore()
      ? firebaseStore.createMatch(payload)
      : request<MatchRecord>('/api/matches', { method: 'POST', body: JSON.stringify(payload) }),
  updateMatch: (id: string, payload: Partial<MatchRecord>) =>
    useCloudFirestore()
      ? firebaseStore.updateMatch(id, payload)
      : request<MatchRecord>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteMatch: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deleteMatch(id)
      : request<{ ok: boolean }>(`/api/matches/${id}`, { method: 'DELETE' }),

  // Payments & Finance
  getPayments: (seasonId?: string) =>
    useCloudFirestore()
      ? firebaseStore.getPayments(seasonId)
      : request<PaymentRecord[]>(`/api/payments${seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ''}`),
  deletePayment: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deletePayment(id)
      : request<{ ok: boolean }>(`/api/payments/${id}`, { method: 'DELETE' }),
  getFinanceEntries: (params?: { seasonId?: string; kind?: FinanceEntryKind }) => {
    if (useCloudFirestore()) return firebaseStore.getFinanceEntries(params);
    const q = new URLSearchParams();
    if (params?.seasonId) q.set('seasonId', params.seasonId);
    if (params?.kind) q.set('kind', params.kind);
    const qs = q.toString();
    return request<FinanceEntry[]>(`/api/finance/entries${qs ? `?${qs}` : ''}`);
  },
  createFinanceEntry: (payload: {
    seasonId?: string;
    kind: FinanceEntryKind;
    category: string;
    title: string;
    amount: number;
    date: string;
    method: FinanceEntry['method'];
    receiptNumber?: string;
    notes?: string;
  }) =>
    useCloudFirestore()
      ? firebaseStore.createFinanceEntry(payload)
      : request<FinanceEntry>('/api/finance/entries', { method: 'POST', body: JSON.stringify(payload) }),
  deleteFinanceEntry: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deleteFinanceEntry(id)
      : request<{ ok: boolean }>(`/api/finance/entries/${id}`, { method: 'DELETE' }),
  getFinanceSummary: (seasonId?: string) =>
    useCloudFirestore()
      ? firebaseStore.getFinanceSummary(seasonId)
      : request<FinanceSummary>(`/api/finance/summary${seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ''}`),

  // Evaluations
  getEvaluations: () =>
    useCloudFirestore() ? firebaseStore.getEvaluations() : request<EvaluationRecord[]>('/api/evaluations'),
  createEvaluation: (payload: {
    playerId: string;
    period: string;
    date?: string;
    scores: EvaluationScores;
    notes: string;
    published: boolean;
  }) =>
    useCloudFirestore()
      ? firebaseStore.createEvaluation(payload)
      : request<EvaluationRecord>('/api/evaluations', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvaluation: (id: string, payload: Partial<EvaluationRecord>) =>
    useCloudFirestore()
      ? firebaseStore.updateEvaluation(id, payload)
      : request<EvaluationRecord>(`/api/evaluations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Announcements
  getAnnouncements: () =>
    useCloudFirestore() ? firebaseStore.getAnnouncements() : request<Announcement[]>('/api/announcements'),
  createAnnouncement: (payload: {
    title: string;
    body: string;
    type: Announcement['type'];
    targetAudience: Announcement['targetAudience'];
    targetCategoryId?: string;
    pinned?: boolean;
  }) =>
    useCloudFirestore()
      ? firebaseStore.createAnnouncement(payload)
      : request<Announcement>('/api/announcements', { method: 'POST', body: JSON.stringify(payload) }),
  deleteAnnouncement: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.deleteAnnouncement(id)
      : request<{ ok: boolean }>(`/api/announcements/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: () =>
    useCloudFirestore() ? firebaseStore.getNotifications() : request<NotificationItem[]>('/api/notifications'),
  markNotificationRead: (id: string) =>
    useCloudFirestore()
      ? firebaseStore.markNotificationRead(id)
      : request<NotificationItem>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    useCloudFirestore()
      ? firebaseStore.markAllNotificationsRead()
      : request<{ ok: boolean }>('/api/notifications/read-all', { method: 'PATCH' }),

  // Public & Applicant Electronic Registration + Admin Review
  uploadPublicPlayerPhoto: (dataUrl: string) =>
    request<{ url: string }>('/api/public/upload-player-photo', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }),
  uploadPublicRegistrationDocument: (dataUrl: string, fileName: string) =>
    request<{ url: string; name: string; mime: string }>('/api/public/upload-registration-document', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, fileName }),
    }),
  uploadProtectedRegistrationDocument: async (dataUrl: string, fileName: string) => {
    if (useCloudFirestore()) {
      try {
        const res = await firebaseStore.uploadDataUrl(dataUrl, 'registration-documents', 'doc');
        return { url: res.url, name: fileName, mime: dataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg' };
      } catch {
        // fallback if storage not yet enabled in console
      }
    }
    return request<{ url: string; name: string; mime: string }>('/api/registration-requests/upload-document', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, fileName }),
    });
  },
  submitRegistrationRequest: (payload: {
    fullName: string;
    birthDate: string;
    categoryId: string;
    parentName: string;
    parentPhone: string;
    address: string;
    photoUrl?: string;
    signedFormUrl: string;
    signedFormName?: string;
    signedFormMime?: string;
    medicalNotes?: string;
    additionalNotes?: string;
    username?: string;
    password?: string;
    email?: string;
  }) =>
    request<{
      id: string;
      status: string;
      submittedAt: string;
      username: string;
      token: string;
      user: PublicUser;
      request: RegistrationRequest;
      message: string;
    }>('/api/public/registration-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getMyRegistrationRequests: () =>
    useCloudFirestore()
      ? firebaseStore.getRegistrationRequests()
      : request<RegistrationRequest[]>('/api/my/registration-requests'),
  resubmitRegistrationDocuments: (
    id: string,
    payload: { documents: { url: string; name: string; mime: string }[]; note?: string },
  ) =>
    useCloudFirestore()
      ? firebaseStore.resubmitRegistrationDocuments(id, payload)
      : request<{ request: RegistrationRequest }>(`/api/registration-requests/${id}/resubmit-documents`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  getRegistrationRequests: () =>
    useCloudFirestore()
      ? firebaseStore.getRegistrationRequests()
      : request<RegistrationRequest[]>('/api/registration-requests'),
  updateRegistrationRequestNote: (id: string, adminNotes: string) =>
    useCloudFirestore()
      ? firebaseStore.updateRegistrationRequestNote(id, adminNotes)
      : request<{ request: RegistrationRequest }>(`/api/registration-requests/${id}/note`, {
          method: 'PATCH',
          body: JSON.stringify({ adminNotes }),
        }),
  requestMissingDocuments: (id: string, payload: { missingDocumentNote: string; adminNotes?: string }) =>
    useCloudFirestore()
      ? firebaseStore.requestMissingDocuments(id, payload)
      : request<{ request: RegistrationRequest }>(`/api/registration-requests/${id}/request-documents`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
  approveRegistrationRequest: (id: string, payload?: { categoryId?: string; adminNotes?: string }) =>
    useCloudFirestore()
      ? firebaseStore.approveRegistrationRequest(id, payload)
      : request<{ request: RegistrationRequest; player: Player }>(
          `/api/registration-requests/${id}/approve`,
          {
            method: 'POST',
            body: JSON.stringify(payload || {}),
          },
        ),
  rejectRegistrationRequest: (id: string, payload: { rejectionReason: string; adminNotes?: string }) =>
    useCloudFirestore()
      ? firebaseStore.rejectRegistrationRequest(id, payload)
      : request<{ request: RegistrationRequest }>(`/api/registration-requests/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  // Coach Reports
  getCoachReports: () =>
    useCloudFirestore() ? firebaseStore.getCoachReports() : request<CoachReport[]>('/api/coach-reports'),
  createCoachReport: (payload: {
    categoryId: string;
    title: string;
    summary: string;
    recommendations?: string;
  }) =>
    useCloudFirestore()
      ? firebaseStore.createCoachReport(payload)
      : request<CoachReport>('/api/coach-reports', { method: 'POST', body: JSON.stringify(payload) }),
  reviewCoachReport: (id: string, payload: { status?: 'pending' | 'reviewed'; adminNote?: string }) =>
    useCloudFirestore()
      ? firebaseStore.reviewCoachReport(id, payload)
      : request<CoachReport>(`/api/coach-reports/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Settings & Logs
  getSettings: () =>
    useCloudFirestore() ? firebaseStore.getSettings() : request<ClubSettings>('/api/settings'),
  updateSettings: (payload: Partial<ClubSettings>) =>
    useCloudFirestore()
      ? firebaseStore.updateSettings(payload)
      : request<ClubSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  getActivityLogs: () =>
    useCloudFirestore() ? firebaseStore.getActivityLogs() : request<ActivityLog[]>('/api/activity-logs'),
};
