export type UserRole = 'admin' | 'coach' | 'parent';

export type CategoryCode = 'U7' | 'U9' | 'U11' | 'U13' | 'U15' | 'U17';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  phone: string;
  active: boolean;
  categoryIds: string[];
  photoUrl?: string;
  allowCoachPhotoEdit?: boolean;
  scopedPlayerId?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export type PublicUser = Omit<UserRecord, 'passwordHash'>;

export interface Category {
  id: string;
  code: CategoryCode | string;
  name: string;
  ageRange: string;
  annualFee: number;
  monthlyFee?: number;
  description: string;
}

export interface Player {
  id: string;
  fullName: string;
  photoUrl: string;
  birthDate: string;
  categoryId: string;
  parentName: string;
  parentPhone: string;
  parentUserId: string;
  address?: string;
  registrationDate: string;
  status: 'active' | 'inactive' | 'archived';
  jerseyNumber?: number;
  position?: string;
  adminNotes?: string;
  medicalNotes?: string;
  coachNames?: string[];
}

export type RegistrationRequestStatus = 'pending' | 'incomplete' | 'approved' | 'rejected';

export interface RegistrationDocument {
  id: string;
  url: string;
  name: string;
  mime: string;
  uploadedAt: string;
}

export interface RegistrationRequest {
  id: string;
  fullName: string;
  birthDate: string;
  categoryId: string;
  parentName: string;
  parentPhone: string;
  address: string;
  photoUrl?: string;
  signedFormUrl?: string;
  signedFormName?: string;
  signedFormMime?: string;
  medicalNotes?: string;
  additionalNotes?: string;
  applicantUserId?: string;
  applicantUsername?: string;
  status: RegistrationRequestStatus;
  adminNotes?: string;
  missingDocumentNote?: string;
  rejectionReason?: string;
  additionalDocuments?: RegistrationDocument[];
  createdPlayerId?: string;
  submittedAt: string;
  approvedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  notificationSentToParent?: boolean;
}

export interface Coach {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email: string;
  specialty: string;
  categoryIds: string[];
  trainingProgram: string;
  active: boolean;
  joinedAt: string;
  photoUrl?: string;
  allowCoachPhotoEdit?: boolean;
}

export interface TrainingSession {
  id: string;
  title: string;
  categoryId: string;
  coachId: string;
  coachName: string;
  coachPhotoUrl?: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  objectives: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  playerId: string;
  playerName: string;
  categoryId: string;
  sessionId: string;
  sessionTitle: string;
  date: string;
  status: 'present' | 'absent' | 'excused';
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  updatedAt: string;
}

export interface MatchRecord {
  id: string;
  opponent: string;
  categoryId: string;
  date: string;
  time: string;
  venue: string;
  locationType: 'home' | 'away';
  status: 'scheduled' | 'completed' | 'cancelled' | 'postponed';
  goalsFor: number;
  goalsAgainst: number;
  technicalNotes?: string;
  createdAt: string;
}

export interface SeasonRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  defaultAnnualFee: number;
  allowInstallments: boolean;
  status: 'active' | 'archived';
  createdAt: string;
}

export type SubscriptionStatus = 'paid' | 'unpaid' | 'expired' | 'exempt' | 'partial';

export interface AnnualSubscription {
  id: string;
  seasonId: string;
  seasonName: string;
  playerId: string;
  playerName: string;
  categoryId: string;
  totalFee: number;
  paidAmount: number;
  remainingAmount: number;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  subscriptionId: string;
  seasonId: string;
  seasonName: string;
  playerId: string;
  playerName: string;
  categoryId: string;
  amount: number;
  month?: string;
  paymentDate: string;
  method: 'cash' | 'bank_transfer' | 'check' | 'ccp';
  receiptNumber: string;
  status: 'paid' | 'partial' | 'unpaid';
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export type FinanceEntryKind = 'income' | 'expense';

export interface FinanceEntry {
  id: string;
  seasonId: string;
  seasonName: string;
  kind: FinanceEntryKind;
  category: string;
  title: string;
  amount: number;
  date: string;
  method: 'cash' | 'bank_transfer' | 'check' | 'ccp';
  receiptNumber?: string;
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'general' | 'category' | 'training_cancel' | 'match' | 'program_change' | 'admin_notice';
  targetAudience: 'all' | 'coaches' | 'parents' | 'category';
  targetCategoryId?: string;
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface EvaluationScores {
  technical: number;
  passing: number;
  ballControl: number;
  shooting: number;
  tactical: number;
  fitness: number;
  discipline: number;
  teamwork: number;
  development: number;
}

export interface EvaluationRecord {
  id: string;
  playerId: string;
  playerName: string;
  categoryId: string;
  coachId: string;
  coachName: string;
  date: string;
  period: string;
  scores: EvaluationScores;
  overallAverage: number;
  notes: string;
  published: boolean;
  approvedByAdmin: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface CoachReport {
  id: string;
  coachId: string;
  coachUserId: string;
  coachName: string;
  categoryId: string;
  title: string;
  summary: string;
  recommendations?: string;
  status: 'pending' | 'reviewed';
  adminNote?: string;
  createdAt: string;
}

export interface ClubSettings {
  clubName: string;
  clubShortName: string;
  clubEnglishName: string;
  foundedYear: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  surfaceColor: string;
  phone: string;
  email: string;
  address: string;
  season: string;
  seasonStartDate: string;
  seasonEndDate: string;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  defaultAnnualFee: number;
  allowInstallments: boolean;
  venues: string[];
  currency: string;
}

export interface DashboardSummary {
  totalPlayers: number;
  activePlayers: number;
  totalCoaches: number;
  categoriesCount: number;
  pendingRegistrationsCount: number;
  incompleteRegistrationsCount?: number;
  playersByCategory: { categoryId: string; categoryName: string; count: number }[];
  monthlyAttendanceRate: number;
  annualAttendanceRate: number;
  seasonCollectedRevenue: number;
  seasonTotalExpected: number;
  seasonRemainingDebt: number;
  paidSubscriptionsCount: number;
  unpaidSubscriptionsCount: number;
  upcomingMatches: MatchRecord[];
  upcomingTrainings: TrainingSession[];
  recentActivities: ActivityLog[];
  recentAnnouncements: Announcement[];
  unreadNotificationsCount: number;
}

// =========================================================
// W.A.B TALENTS MODULE TYPES
// =========================================================
export type TalentPosition = 'goalkeeper' | 'defender' | 'midfielder' | 'forward' | 'winger';

export type TalentCompetitionCategory =
  | 'showcase'
  | 'best_dribbler'
  | 'best_goal'
  | 'best_free_kick'
  | 'best_goalkeeper'
  | 'best_skills';

export type TalentModerationStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export interface TalentVideo {
  id: string;
  playerDisplayName: string;
  linkedPlayerId?: string;
  uploaderAuthUid: string;
  uploaderRole: UserRole;
  isMinor: boolean;
  parentVerifiedConsent: boolean;
  parentConsentSignerName: string;
  parentConsentAt: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  position: TalentPosition;
  ageCategory: string;
  city: string;
  province: string;
  competitionCategory: TalentCompetitionCategory;
  submissionTier: 'free_first' | 'paid_extra';
  paymentStatus: 'free' | 'pending_payment' | 'confirmed' | 'waived';
  paymentReference?: string;
  moderationStatus: TalentModerationStatus;
  moderationNote?: string;
  moderatedByUid?: string;
  moderatedAt?: string;
  isFeatured: boolean;
  featuredWeekLabel?: string;
  likesCount: number;
  viewsCount: number;
  sharesCount: number;
  reportsCount: number;
  createdAt: string;
}

export interface TalentCompetition {
  id: string;
  weekLabel: string;
  categoryKey: Exclude<TalentCompetitionCategory, 'showcase'>;
  titleAr: string;
  titleFr: string;
  descriptionAr?: string;
  descriptionFr?: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'closed';
  winnerVideoId?: string;
  winnerPlayerName?: string;
  isPublic: boolean;
  createdAt?: string;
}

export interface TalentWatchlistItem {
  id: string;
  scoutUid: string;
  scoutName: string;
  scoutRole: UserRole;
  videoId: string;
  playerDisplayName: string;
  ageCategory: string;
  position: TalentPosition;
  city: string;
  province: string;
  notes?: string;
  trialInviteSent?: boolean;
  createdAt: string;
}

export interface TalentTrialInvite {
  id: string;
  videoId: string;
  playerDisplayName: string;
  targetParentAuthUid: string;
  invitedByUid: string;
  invitedByName: string;
  invitedByRole: UserRole;
  categoryId: string;
  trialDate: string;
  trialTime: string;
  trialVenue: string;
  officialMessage: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  parentResponseNote?: string;
  createdAt: string;
}

export interface TalentReport {
  id: string;
  videoId: string;
  videoTitle: string;
  reporterUid: string;
  reason: 'inappropriate' | 'minor_safety' | 'non_football' | 'spam' | 'other';
  details?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  adminActionNote?: string;
  createdAt: string;
}

export interface TalentSettings {
  id: string;
  firstSubmissionFree: boolean;
  extraSubmissionEnabled: boolean;
  extraSubmissionFeeDzd: number;
  paymentInstructionsAr?: string;
  paymentInstructionsFr?: string;
  maxDurationSeconds: number;
  maxFileSizeMb: number;
  requireModerationBeforePublic: boolean;
  requireParentalConsent: boolean;
  isPublic: boolean;
}

