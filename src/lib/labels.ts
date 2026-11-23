import type { EvaluationScores, SubscriptionStatus, UserRole } from '../types/wab.ts';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'إدارة النادي',
  coach: 'فضاء المدربين',
  parent: 'فضاء الأولياء',
};

export const PLAYER_STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  inactive: 'متوقف مؤقتاً',
  archived: 'مؤرشف',
};

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  excused: 'غياب مبرر',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'مدفوع',
  unpaid: 'غير مدفوع',
  partial: 'مدفوع جزئياً',
  expired: 'منتهي',
  exempt: 'معفى',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  paid: 'مدفوع',
  unpaid: 'غير مدفوع',
  expired: 'منتهي',
  exempt: 'معفى',
  partial: 'مدفوع جزئياً',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً',
  bank_transfer: 'تحويل بنكي',
  check: 'شيك',
  ccp: 'بريدي موب / CCP',
};

export const EXPENSE_CATEGORIES = [
  'تجهيزات وبدلات رياضية',
  'كراء الملاعب والمنشآت',
  'مصاريف التنقل والمباريات',
  'تعويضات الطاقم الفني',
  'مستلزمات طبية وإسعافات',
  'مصاريف إدارية وتنظيمية',
  'أخرى',
];

export const INCOME_CATEGORIES = [
  'إعانات ودعم محلي',
  'رعاية وتمويل (Sponsoring)',
  'تبرعات ومساهمات',
  'مداخيل دورات رياضية',
  'أخرى',
];

export const TRAINING_STATUS_LABELS: Record<string, string> = {
  scheduled: 'مبرمجة',
  completed: 'منتهية',
  cancelled: 'ملغاة',
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: 'قادمة',
  completed: 'منتهية',
  cancelled: 'ملغاة',
  postponed: 'مؤجلة',
};

export const ANNOUNCEMENT_TYPE_LABELS: Record<string, string> = {
  general: 'إعلان عام',
  category: 'خاص بفئة',
  training_cancel: 'إلغاء تدريب',
  match: 'موعد مباراة',
  program_change: 'تغيير في البرنامج',
  admin_notice: 'إعلان إداري هام',
};

export const EVALUATION_CRITERIA: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'technical', label: 'المهارات الفنية' },
  { key: 'passing', label: 'دقة التمرير' },
  { key: 'ballControl', label: 'التحكم بالكرة' },
  { key: 'shooting', label: 'التسديد والإنهاء' },
  { key: 'tactical', label: 'الفهم التكتيكي' },
  { key: 'fitness', label: 'اللياقة البدنية' },
  { key: 'discipline', label: 'الانضباط والسلوك' },
  { key: 'teamwork', label: 'العمل الجماعي' },
  { key: 'development', label: 'تطور المستوى' },
];

export function formatMoney(amount: number, currency = 'دج'): string {
  return `${new Intl.NumberFormat('ar-DZ').format(amount)} ${currency}`;
}

export function formatDateAr(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' });
}
