import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarRange,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Plus,
  Printer,
  Receipt,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { CategoryBarChart, MonthlyTrendChart } from '../components/Charts.tsx';
import { ReceiptModal } from '../components/ReceiptModal.tsx';
import { EmptyState, Modal, PageHeader, StatCard } from '../components/UI.tsx';
import { api, type FinanceSummary } from '../lib/api.ts';
import { exportToExcel, printArabicPdfReport } from '../lib/export.ts';
import {
  EXPENSE_CATEGORIES,
  formatDateAr,
  formatMoney,
  INCOME_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '../lib/labels.ts';
import type {
  AnnualSubscription,
  Category,
  ClubSettings,
  FinanceEntry,
  FinanceEntryKind,
  PaymentRecord,
  Player,
  PublicUser,
  SeasonRecord,
  SubscriptionStatus,
} from '../types/wab.ts';

function statusColorClass(status: SubscriptionStatus): string {
  switch (status) {
    case 'paid':
      return 'text-emerald-700';
    case 'partial':
      return 'text-amber-700';
    case 'exempt':
      return 'text-sky-700';
    case 'expired':
      return 'text-slate-500';
    default:
      return 'text-[#14532D]';
  }
}

export const SubscriptionsPage: React.FC<{
  user: PublicUser;
  club: ClubSettings;
}> = ({ user, club }) => {
  const isAdmin = user.role === 'admin';
  const [seasons, setSeasons] = useState<SeasonRecord[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [subscriptions, setSubscriptions] = useState<AnnualSubscription[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<AnnualSubscription | null>(null);
  const [editTarget, setEditTarget] = useState<AnnualSubscription | null>(null);
  const [seasonsModalOpen, setSeasonsModalOpen] = useState(false);

  const [createForm, setCreateForm] = useState({
    playerId: '',
    seasonId: '',
    totalFee: club.defaultAnnualFee || 16000,
    paidAmount: 0,
    status: 'unpaid' as SubscriptionStatus,
    method: 'cash' as PaymentRecord['method'],
    paymentDate: new Date().toISOString().slice(0, 10),
    startDate: club.subscriptionStartDate || '',
    endDate: club.subscriptionEndDate || '',
    notes: '',
  });

  const [payForm, setPayForm] = useState({
    amount: 0,
    method: 'cash' as PaymentRecord['method'],
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    totalFee: 0,
    status: 'unpaid' as SubscriptionStatus,
    startDate: '',
    endDate: '',
    notes: '',
  });

  const [newSeasonForm, setNewSeasonForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    subscriptionStartDate: '',
    subscriptionEndDate: '',
    defaultAnnualFee: club.defaultAnnualFee || 16000,
    allowInstallments: true,
    archivePrevious: true,
  });

  const load = async (overrideSeasonId?: string) => {
    setLoading(true);
    try {
      const [seas, pls, cats] = await Promise.all([
        api.getSeasons(),
        api.getPlayers(),
        api.getCategories(),
      ]);
      setSeasons(seas);
      const activePls = pls.filter((p) => p.status !== 'archived');
      setPlayers(activePls);
      setCategories(cats);

      const activeSeason = seas.find((s) => s.status === 'active') || seas[0];
      const targetSeason =
        overrideSeasonId !== undefined
          ? overrideSeasonId
          : selectedSeasonId || activeSeason?.id || 'all';
      if (!selectedSeasonId && targetSeason) {
        setSelectedSeasonId(targetSeason);
      }

      const querySeason = targetSeason === 'all' ? undefined : targetSeason;
      const [subs, pays] = await Promise.all([
        api.getSubscriptions({ seasonId: querySeason }),
        api.getPayments(querySeason),
      ]);
      setSubscriptions(subs);
      setPayments(pays);

      if (!createForm.playerId && activePls.length > 0) {
        const firstCat = cats.find((c) => c.id === activePls[0].categoryId);
        setCreateForm((prev) => ({
          ...prev,
          playerId: activePls[0].id,
          seasonId: activeSeason?.id || prev.seasonId,
          totalFee: firstCat?.annualFee ?? activeSeason?.defaultAnnualFee ?? 16000,
          startDate: activeSeason?.subscriptionStartDate || prev.startDate,
          endDate: activeSeason?.subscriptionEndDate || prev.endDate,
        }));
      } else if (!createForm.seasonId && activeSeason) {
        setCreateForm((prev) => ({
          ...prev,
          seasonId: activeSeason.id,
          startDate: activeSeason.subscriptionStartDate,
          endDate: activeSeason.subscriptionEndDate,
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user.id]);

  const handleSeasonSwitch = async (nextSeasonId: string) => {
    setSelectedSeasonId(nextSeasonId);
    await load(nextSeasonId);
  };

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) || seasons.find((s) => s.status === 'active'),
    [seasons, selectedSeasonId],
  );

  const filteredSubscriptions = useMemo(() => {
    if (statusFilter === 'all') return subscriptions;
    return subscriptions.filter((s) => s.status === statusFilter);
  }, [subscriptions, statusFilter]);

  const kpis = useMemo(() => {
    const nonExempt = subscriptions.filter((s) => s.status !== 'exempt');
    return {
      expected: nonExempt.reduce((sum, s) => sum + s.totalFee, 0),
      collected: subscriptions.reduce((sum, s) => sum + s.paidAmount, 0),
      remaining: nonExempt.reduce((sum, s) => sum + s.remainingAmount, 0),
      paidCount: subscriptions.filter((s) => s.status === 'paid').length,
      unpaidCount: subscriptions.filter((s) => s.status === 'unpaid' || s.status === 'partial' || s.status === 'expired').length,
    };
  }, [subscriptions]);

  const handlePlayerSelect = (pid: string) => {
    const pl = players.find((p) => p.id === pid);
    const cat = categories.find((c) => c.id === pl?.categoryId);
    const sea = seasons.find((s) => s.id === createForm.seasonId) || selectedSeason;
    const fee = cat?.annualFee ?? sea?.defaultAnnualFee ?? club.defaultAnnualFee ?? 16000;
    setCreateForm((prev) => ({
      ...prev,
      playerId: pid,
      totalFee: fee,
    }));
  };

  const openCreateModal = () => {
    setFeedback(null);
    const activeSea = seasons.find((s) => s.id === (selectedSeasonId === 'all' ? '' : selectedSeasonId)) || seasons.find((s) => s.status === 'active') || seasons[0];
    const firstPl = players[0];
    const firstCat = categories.find((c) => c.id === firstPl?.categoryId);
    setCreateForm({
      playerId: firstPl?.id || '',
      seasonId: activeSea?.id || '',
      totalFee: firstCat?.annualFee ?? activeSea?.defaultAnnualFee ?? 16000,
      paidAmount: 0,
      status: 'unpaid',
      method: 'cash',
      paymentDate: new Date().toISOString().slice(0, 10),
      startDate: activeSea?.subscriptionStartDate || club.subscriptionStartDate,
      endDate: activeSea?.subscriptionEndDate || club.subscriptionEndDate,
      notes: '',
    });
    setCreateModalOpen(true);
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await api.createSubscription(createForm);
      setCreateModalOpen(false);
      setFeedback({
        type: 'ok',
        text: res.payment
          ? `تم تسجيل الاشتراك السنوي وإصدار وصل الدفع رقم ${res.payment.receiptNumber}.`
          : 'تم تسجيل ملف الاشتراك السنوي بنجاح.',
      });
      await load(selectedSeasonId);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تسجيل الاشتراك.' });
    }
  };

  const handleGenerateSeason = async () => {
    const targetId = selectedSeasonId && selectedSeasonId !== 'all' ? selectedSeasonId : seasons.find((s) => s.status === 'active')?.id;
    if (!targetId) return;
    setFeedback(null);
    try {
      const res = await api.generateSeasonSubscriptions(targetId);
      setFeedback({
        type: 'ok',
        text:
          res.createdCount > 0
            ? `تم توليد ${res.createdCount} ملف اشتراك سنوي للاعبين النشطين في هذا الموسم.`
            : 'جميع اللاعبين النشطين لديهم ملفات اشتراك مسجلة لهذا الموسم.',
      });
      await load(selectedSeasonId);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر توليد الاشتراكات.' });
    }
  };

  const openPayModal = (sub: AnnualSubscription) => {
    setPayTarget(sub);
    setPayForm({
      amount: sub.remainingAmount,
      method: 'cash',
      paymentDate: new Date().toISOString().slice(0, 10),
      notes: '',
    });
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setFeedback(null);
    try {
      const res = await api.paySubscription(payTarget.id, payForm);
      setPayTarget(null);
      setFeedback({
        type: 'ok',
        text: `تم تسجيل الدفعة وإصدار الوصل رقم ${res.payment.receiptNumber}.`,
      });
      setSelectedReceipt(res.payment);
      await load(selectedSeasonId);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر تسجيل الدفعة.' });
    }
  };

  const openEditModal = (sub: AnnualSubscription) => {
    setEditTarget(sub);
    setEditForm({
      totalFee: sub.totalFee,
      status: sub.status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      notes: sub.notes || '',
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    await api.updateSubscription(editTarget.id, editForm);
    setEditTarget(null);
    await load(selectedSeasonId);
  };

  const handleDeleteSubscription = async (id: string) => {
    await api.deleteSubscription(id);
    await load(selectedSeasonId);
  };

  const handleDeletePayment = async (id: string) => {
    await api.deletePayment(id);
    await load(selectedSeasonId);
  };

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = await api.createSeason(newSeasonForm);
      setNewSeasonForm({
        name: '',
        startDate: '',
        endDate: '',
        subscriptionStartDate: '',
        subscriptionEndDate: '',
        defaultAnnualFee: club.defaultAnnualFee || 16000,
        allowInstallments: true,
        archivePrevious: true,
      });
      setSelectedSeasonId(created.id);
      setSeasonsModalOpen(false);
      setFeedback({ type: 'ok', text: `تم إطلاق الموسم الرياضي الجديد ${created.name} وأرشفة المواسم السابقة.` });
      await load(created.id);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'تعذر إنشاء الموسم الرياضي.' });
    }
  };

  const handleToggleInstallments = async (season: SeasonRecord) => {
    await api.updateSeason(season.id, { allowInstallments: !season.allowInstallments });
    await load(selectedSeasonId);
  };

  const handleActivateSeason = async (season: SeasonRecord) => {
    await api.updateSeason(season.id, { status: 'active' });
    setSelectedSeasonId(season.id);
    await load(season.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الاشتراكات السنوية ووصولات الدفع"
        subtitle={
          isAdmin
            ? 'إدارة الاشتراكات الموسمية، الدفع الكلي أو بالتقسيط، المواسم الرياضية، وإصدار الوصولات الرسمية'
            : 'متابعة حالة الاشتراك السنوي لأبنائك وتحميل وصولات الدفع الرسمية'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSeasonId}
              onChange={(e) => handleSeasonSwitch(e.target.value)}
              className="rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-bold text-[#111827] min-h-[44px]"
            >
              <option value="all">جميع المواسم</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  موسم {s.name} ({s.status === 'active' ? 'نشط' : 'مؤرشف'})
                </option>
              ))}
            </select>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setSeasonsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                >
                  <CalendarRange className="w-4 h-4 text-[#14532D]" />
                  <span>المواسم الرياضية</span>
                </button>
                <button
                  type="button"
                  onClick={handleGenerateSeason}
                  disabled={players.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] disabled:opacity-40 min-h-[44px]"
                >
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>توليد اشتراكات الموسم</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateModal}
                  disabled={players.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] disabled:opacity-40 min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل اشتراك سنوي</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {feedback && (
        <div
          className={`rounded-xl border p-3.5 text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-[#DC2626]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Seasonal KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي المتوقع للموسم"
          value={formatMoney(kpis.expected, club.currency)}
          hint={selectedSeason ? `موسم ${selectedSeason.name}` : undefined}
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          label="المبلغ المحصل فعلياً"
          value={formatMoney(kpis.collected, club.currency)}
          accent
          hint={`${kpis.paidCount} اشتراك مدفوع بالكامل`}
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <StatCard
          label="المتبقي قيد التحصيل"
          value={formatMoney(kpis.remaining, club.currency)}
          hint={`${kpis.unpaidCount} اشتراك غير مسدد / جزئي`}
          icon={<CreditCard className="w-5 h-5" />}
        />
        <StatCard
          label="وصولات الدفع المصدرة"
          value={payments.length}
          hint={selectedSeason?.allowInstallments ? 'الدفع بالتقسيط مفعل' : 'دفع كلي فقط'}
          icon={<Receipt className="w-5 h-5" />}
        />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 border border-slate-200 p-1 rounded-xl w-fit">
        {(
          [
            { id: 'all', label: `الكل (${subscriptions.length})` },
            { id: 'paid', label: 'مدفوع' },
            { id: 'partial', label: 'مدفوع جزئياً' },
            { id: 'unpaid', label: 'غير مدفوع' },
            { id: 'exempt', label: 'معفى' },
            { id: 'expired', label: 'منتهي' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === tab.id ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-slate-200/70" />
      ) : filteredSubscriptions.length === 0 ? (
        <EmptyState
          title="لا توجد اشتراكات سنوية أو مدفوعات مسجلة."
          description={
            players.length === 0
              ? 'أضف أول لاعب في النادي أولاً لتتمكن من تسجيل وتوليد الاشتراكات السنوية.'
              : isAdmin
                ? 'يمكنك توليد ملفات الاشتراكات لجميع اللاعبين النشطين أو تسجيل اشتراك سنوي يدوياً.'
                : 'ستظهر تفاصيل الاشتراك السنوي الخاصة بأبنائك هنا فور تسجيلها من الإدارة.'
          }
          action={
            isAdmin && players.length > 0 ? (
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleGenerateSeason}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                >
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>توليد اشتراكات الموسم للجميع</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل أول اشتراك سنوي</span>
                </button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="wab-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-bold">اللاعب</th>
                  <th className="py-3 px-4 font-bold">الفئة</th>
                  <th className="py-3 px-4 font-bold">الموسم</th>
                  <th className="py-3 px-4 font-bold">الرسوم السنوية</th>
                  <th className="py-3 px-4 font-bold">المدفوع</th>
                  <th className="py-3 px-4 font-bold">المتبقي</th>
                  <th className="py-3 px-4 font-bold">الصلاحية</th>
                  <th className="py-3 px-4 font-bold">الحالة</th>
                  {isAdmin && <th className="py-3 px-4 font-bold text-left">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredSubscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-[#111827]">{sub.playerName}</td>
                    <td className="py-3 px-4 font-mono-num text-[#14532D] font-extrabold">{sub.categoryId}</td>
                    <td className="py-3 px-4 font-mono-num text-slate-600">{sub.seasonName}</td>
                    <td className="py-3 px-4 font-mono-num font-semibold text-[#111827]">{formatMoney(sub.totalFee, club.currency)}</td>
                    <td className="py-3 px-4 font-mono-num font-bold text-emerald-700">
                      {formatMoney(sub.paidAmount, club.currency)}
                    </td>
                    <td className="py-3 px-4 font-mono-num font-bold text-amber-700">
                      {formatMoney(sub.remainingAmount, club.currency)}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-slate-500">
                      {sub.startDate} → {sub.endDate}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-bold ${statusColorClass(sub.status)}`}>
                        {SUBSCRIPTION_STATUS_LABELS[sub.status]}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {sub.status !== 'paid' && sub.status !== 'exempt' && sub.remainingAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => openPayModal(sub)}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>دفع / قسط</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(sub)}
                            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-[#14532D]"
                            title="تعديل الحالة أو الرسوم"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubscription(sub.id)}
                            className="p-2 rounded-lg border border-red-200 bg-red-50 text-[#DC2626] hover:border-[#DC2626]"
                            title="حذف السجل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Receipts Log */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#111827]">وصولات الدفع الرسمية الصادرة</h2>
            <p className="text-xs text-slate-600 mt-0.5">جميع الدفعات الكلية والجزئية المسجلة مع أرقام الوصولات للطباعة والتحميل</p>
          </div>
          <span className="text-xs font-mono-num font-bold text-slate-600">{payments.length} وصل</span>
        </div>

        {payments.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">لا توجد وصولات دفع مصدرة لهذا الموسم بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-bold">رقم الوصل</th>
                  <th className="py-2.5 px-3 font-bold">اللاعب</th>
                  <th className="py-2.5 px-3 font-bold">الموسم</th>
                  <th className="py-2.5 px-3 font-bold">التاريخ</th>
                  <th className="py-2.5 px-3 font-bold">الطريقة</th>
                  <th className="py-2.5 px-3 font-bold">المبلغ المدفوع</th>
                  <th className="py-2.5 px-3 font-bold text-left">الوصل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono-num font-extrabold text-[#111827]">{pay.receiptNumber}</td>
                    <td className="py-2.5 px-3 font-bold text-[#111827]">{pay.playerName}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-600">{pay.seasonName}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-600">{formatDateAr(pay.paymentDate)}</td>
                    <td className="py-2.5 px-3 text-slate-700">{PAYMENT_METHOD_LABELS[pay.method] || pay.method}</td>
                    <td className="py-2.5 px-3 font-mono-num font-bold text-emerald-700">
                      {formatMoney(pay.amount, club.currency)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(pay)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-[#111827] hover:border-[#14532D]"
                        >
                          <Receipt className="w-3.5 h-3.5 text-[#14532D]" />
                          <span>عرض / طباعة</span>
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(pay.id)}
                            className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-[#DC2626] hover:border-[#DC2626]"
                            title="إلغاء وحذف الوصل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Annual Subscription Modal */}
      <Modal open={createModalOpen} title="تسجيل اشتراك سنوي جديد" onClose={() => setCreateModalOpen(false)} maxWidth="max-w-xl">
        <form onSubmit={handleCreateSubscription} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اللاعب *</label>
              <select
                value={createForm.playerId}
                onChange={(e) => handlePlayerSelect(e.target.value)}
                required
                className="wab-input"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.categoryId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الموسم الرياضي *</label>
              <select
                value={createForm.seasonId}
                onChange={(e) => {
                  const s = seasons.find((x) => x.id === e.target.value);
                  setCreateForm((prev) => ({
                    ...prev,
                    seasonId: e.target.value,
                    startDate: s?.subscriptionStartDate || prev.startDate,
                    endDate: s?.subscriptionEndDate || prev.endDate,
                  }));
                }}
                required
                className="wab-input"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status === 'active' ? 'نشط' : 'مؤرشف'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">قيمة الاشتراك السنوي ({club.currency}) *</label>
              <input
                type="number"
                required
                min={0}
                value={createForm.totalFee}
                onChange={(e) => setCreateForm({ ...createForm, totalFee: Number(e.target.value) })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع حالياً ({club.currency})</label>
              <input
                type="number"
                min={0}
                value={createForm.paidAmount}
                onChange={(e) => setCreateForm({ ...createForm, paidAmount: Number(e.target.value) })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الحالة الأولية</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as SubscriptionStatus })}
                className="wab-input"
              >
                <option value="unpaid">غير مدفوع</option>
                <option value="partial">مدفوع جزئياً</option>
                <option value="paid">مدفوع</option>
                <option value="exempt">معفى</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع (عند وجود دفعة)</label>
              <select
                value={createForm.method}
                onChange={(e) => setCreateForm({ ...createForm, method: e.target.value as PaymentRecord['method'] })}
                className="wab-input"
              >
                <option value="cash">نقداً</option>
                <option value="ccp">بريدي موب / CCP</option>
                <option value="bank_transfer">تحويل بنكي</option>
                <option value="check">شيك</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">بداية صلاحية الاشتراك</label>
              <input
                type="date"
                value={createForm.startDate}
                onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نهاية صلاحية الاشتراك</label>
              <input
                type="date"
                value={createForm.endDate}
                onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              className="wab-input"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ الاشتراك
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Installment / Settle Modal */}
      <Modal
        open={!!payTarget}
        title={`تسجيل دفعة اشتراك: ${payTarget?.playerName || ''}`}
        onClose={() => setPayTarget(null)}
        maxWidth="max-w-md"
      >
        {payTarget && (
          <form onSubmit={handlePaySubmit} className="space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">الرسوم السنوية:</span>
                <span className="font-mono-num font-bold text-[#111827]">{formatMoney(payTarget.totalFee, club.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">المدفوع سابقاً:</span>
                <span className="font-mono-num font-bold text-emerald-700">{formatMoney(payTarget.paidAmount, club.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">المبلغ المتبقي:</span>
                <span className="font-mono-num font-extrabold text-amber-700">{formatMoney(payTarget.remainingAmount, club.currency)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع ({club.currency}) *</label>
              <input
                type="number"
                required
                min={1}
                max={payTarget.remainingAmount}
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                className="wab-input font-mono-num"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                <select
                  value={payForm.method}
                  onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentRecord['method'] })}
                  className="wab-input"
                >
                  <option value="cash">نقداً</option>
                  <option value="ccp">بريدي موب / CCP</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="check">شيك</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الدفع</label>
                <input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                  className="wab-input font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
              <input
                type="text"
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                placeholder="مثال: القسط الثاني من الاشتراك السنوي"
                className="wab-input"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
                إلغاء
              </button>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 min-h-[44px]">
                تأكيد الدفع وإصدار الوصل
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit Subscription Status / Fee Modal */}
      <Modal
        open={!!editTarget}
        title={`تعديل ملف الاشتراك: ${editTarget?.playerName || ''}`}
        onClose={() => setEditTarget(null)}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">إجمالي الرسوم السنوية ({club.currency})</label>
            <input
              type="number"
              min={0}
              value={editForm.totalFee}
              onChange={(e) => setEditForm({ ...editForm, totalFee: Number(e.target.value) })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">حالة الاشتراك</label>
            <select
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value as SubscriptionStatus })}
              className="wab-input"
            >
              <option value="unpaid">غير مدفوع</option>
              <option value="partial">مدفوع جزئياً</option>
              <option value="paid">مدفوع</option>
              <option value="exempt">معفى</option>
              <option value="expired">منتهي</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ البداية</label>
              <input
                type="date"
                value={editForm.startDate}
                onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الانتهاء</label>
              <input
                type="date"
                value={editForm.endDate}
                onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="wab-input"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ التعديلات
            </button>
          </div>
        </form>
      </Modal>

      {/* Seasons Management & Archiving Modal */}
      <Modal open={seasonsModalOpen} title="إدارة المواسم الرياضية السنوية" onClose={() => setSeasonsModalOpen(false)}>
        <div className="space-y-6">
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700">المواسم المسجلة (الحالية والمؤرشفة)</h3>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 overflow-hidden">
              {seasons.map((s) => (
                <div key={s.id} className="p-3 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-[#111827] flex items-center gap-2">
                      <span className="font-mono-num">موسم {s.name}</span>
                      <span className={s.status === 'active' ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                        ({s.status === 'active' ? 'الموسم النشط' : 'مؤرشف'})
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono-num mt-0.5">
                      الاشتراكات: {s.subscriptionStartDate} → {s.subscriptionEndDate} · الافتراضي:{' '}
                      {formatMoney(s.defaultAnnualFee, club.currency)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleInstallments(s)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${
                        s.allowInstallments
                          ? 'border-emerald-200 text-emerald-800 bg-emerald-50'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {s.allowInstallments ? 'التقسيط مفعل' : 'دفع كلي فقط'}
                    </button>
                    {s.status !== 'active' && (
                      <button
                        type="button"
                        onClick={() => handleActivateSeason(s)}
                        className="px-3 py-1.5 rounded-lg bg-[#14532D] text-[11px] font-bold text-white"
                      >
                        تفعيل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreateSeason} className="space-y-3 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-extrabold text-[#111827] flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-[#14532D]" />
              <span>إطلاق موسم رياضي جديد (مع الاحتفاظ بأرشيف المواسم السابقة)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموسم * (مثال: 2027-2028)</label>
                <input
                  type="text"
                  required
                  value={newSeasonForm.name}
                  onChange={(e) => setNewSeasonForm({ ...newSeasonForm, name: e.target.value })}
                  className="wab-input text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرسوم السنوية الافتراضية ({club.currency})</label>
                <input
                  type="number"
                  min={0}
                  value={newSeasonForm.defaultAnnualFee}
                  onChange={(e) => setNewSeasonForm({ ...newSeasonForm, defaultAnnualFee: Number(e.target.value) })}
                  className="wab-input text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">بداية الموسم *</label>
                <input
                  type="date"
                  required
                  value={newSeasonForm.startDate}
                  onChange={(e) =>
                    setNewSeasonForm({
                      ...newSeasonForm,
                      startDate: e.target.value,
                      subscriptionStartDate: newSeasonForm.subscriptionStartDate || e.target.value,
                    })
                  }
                  className="wab-input text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نهاية الموسم *</label>
                <input
                  type="date"
                  required
                  value={newSeasonForm.endDate}
                  onChange={(e) =>
                    setNewSeasonForm({
                      ...newSeasonForm,
                      endDate: e.target.value,
                      subscriptionEndDate: newSeasonForm.subscriptionEndDate || e.target.value,
                    })
                  }
                  className="wab-input text-xs font-mono-num"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newSeasonForm.allowInstallments}
                onChange={(e) => setNewSeasonForm({ ...newSeasonForm, allowInstallments: e.target.checked })}
                className="accent-[#14532D]"
              />
              <span>السماح بالدفع بالتقسيط (أقساط سنوية)</span>
            </label>
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2.5 rounded-xl bg-[#14532D] text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]">
                بدء الموسم الجديد
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <ReceiptModal payment={selectedReceipt} club={club} onClose={() => setSelectedReceipt(null)} />
    </div>
  );
};

export const FinancePage: React.FC<{ club: ClubSettings }> = ({ club }) => {
  const [seasons, setSeasons] = useState<SeasonRecord[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryModalOpen, setEntryModalOpen] = useState(false);

  const [entryForm, setEntryForm] = useState({
    kind: 'expense' as FinanceEntryKind,
    category: EXPENSE_CATEGORIES[0],
    title: '',
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    method: 'cash' as FinanceEntry['method'],
    receiptNumber: '',
    notes: '',
  });

  const load = async (overrideSeasonId?: string) => {
    setLoading(true);
    try {
      const seas = await api.getSeasons();
      setSeasons(seas);
      const activeSeason = seas.find((s) => s.status === 'active') || seas[0];
      const target =
        overrideSeasonId !== undefined ? overrideSeasonId : selectedSeasonId || activeSeason?.id || 'all';
      if (!selectedSeasonId && target) setSelectedSeasonId(target);

      const querySeason = target === 'all' ? undefined : target;
      const [sum, ents] = await Promise.all([
        api.getFinanceSummary(target),
        api.getFinanceEntries({ seasonId: querySeason }),
      ]);
      setSummary(sum);
      setEntries(ents);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSeasonChange = async (nextId: string) => {
    setSelectedSeasonId(nextId);
    await load(nextId);
  };

  const openEntryModal = (kind: FinanceEntryKind = 'expense') => {
    setEntryForm({
      kind,
      category: kind === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0],
      title: '',
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      method: 'cash',
      receiptNumber: '',
      notes: '',
    });
    setEntryModalOpen(true);
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createFinanceEntry({
      ...entryForm,
      seasonId: selectedSeasonId && selectedSeasonId !== 'all' ? selectedSeasonId : undefined,
    });
    setEntryModalOpen(false);
    await load(selectedSeasonId);
  };

  const handleDeleteEntry = async (id: string) => {
    await api.deleteFinanceEntry(id);
    await load(selectedSeasonId);
  };

  if (loading || !summary) {
    return <div className="h-64 rounded-2xl bg-slate-200/70" />;
  }

  const handleExportExcel = () => {
    exportToExcel(
      entries.map((e) => ({
        'النوع': e.kind === 'expense' ? 'مصروف' : 'مدخول إضافي',
        'التصنيف': e.category,
        'البيان': e.title,
        'التاريخ': formatDateAr(e.date),
        'المبلغ': e.amount,
        'الطريقة': PAYMENT_METHOD_LABELS[e.method] || e.method,
        'رقم المرجع': e.receiptNumber || '—',
      })),
      `السجل-المالي-WAB-${summary.seasonName}`,
      'المالية',
    );
  };

  const handlePrintPdf = () => {
    printArabicPdfReport({
      title: 'التقرير المالي السنوي الشامل لنادي وداد أمل بوعنان',
      subtitle: `الموسم الرياضي ${summary.seasonName}`,
      club,
      summaryItems: [
        { label: 'إجمالي المداخيل', value: formatMoney(summary.totalIncome, club.currency) },
        { label: 'إجمالي المصاريف', value: formatMoney(summary.expensesTotal, club.currency) },
        { label: 'الرصيد الصافي', value: formatMoney(summary.netBalance, club.currency) },
        { label: 'متبقي الاشتراكات', value: formatMoney(summary.subscriptionRemaining, club.currency) },
      ],
      columns: ['النوع', 'التصنيف', 'البيان', 'التاريخ', 'المبلغ', 'المرجع'],
      rows: entries.map((e) => [
        e.kind === 'expense' ? 'مصروف' : 'مدخول',
        e.category,
        e.title,
        e.date,
        formatMoney(e.amount, club.currency),
        e.receiptNumber || '—',
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإدارة المالية والميزانية"
        subtitle="متابعة مداخيل الاشتراكات السنوية، التمويلات، المصاريف، والرصيد الصافي للنادي"
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedSeasonId}
              onChange={(e) => handleSeasonChange(e.target.value)}
              className="rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-bold text-[#111827] min-h-[44px]"
            >
              <option value="all">جميع المواسم</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  موسم {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => openEntryModal('expense')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل مصروف / مدخول</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <Download className="w-4 h-4 text-[#14532D]" />
              <span>تصدير Excel</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <Printer className="w-4 h-4 text-[#14532D]" />
              <span>تقرير PDF</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي المداخيل"
          value={formatMoney(summary.totalIncome, club.currency)}
          hint={`اشتراكات: ${formatMoney(summary.subscriptionCollected, club.currency)}`}
          accent
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          label="إجمالي المصاريف"
          value={formatMoney(summary.expensesTotal, club.currency)}
          hint={`${entries.filter((e) => e.kind === 'expense').length} عملية صرف`}
          icon={<TrendingDown className="w-5 h-5" />}
        />
        <StatCard
          label="الرصيد الصافي"
          value={formatMoney(summary.netBalance, club.currency)}
          hint={summary.netBalance >= 0 ? 'فائض في الصندوق' : 'عجز في الميزانية'}
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          label="متبقي الاشتراكات"
          value={formatMoney(summary.subscriptionRemaining, club.currency)}
          hint={`من أصل ${formatMoney(summary.subscriptionExpected, club.currency)} متوقعة`}
          icon={<Receipt className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 wab-card rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold text-[#111827]">تطور المداخيل والمصاريف (آخر 6 أشهر)</h2>
          <MonthlyTrendChart
            series={summary.monthlySeries.map((m) => ({
              label: m.month.slice(5),
              primary: m.income,
              secondary: m.expense,
            }))}
            primaryLabel="المداخيل المحصلة"
            secondaryLabel="المصاريف المسجلة"
          />
        </div>

        <div className="lg:col-span-5 wab-card rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-extrabold text-[#111827]">تحصيل الاشتراكات حسب الفئة العمرية</h2>
          <CategoryBarChart
            data={summary.byCategory.map((c, idx) => ({
              label: c.categoryName,
              value: c.collectedAmount,
              accent: idx % 2 === 0,
            }))}
            unit={club.currency}
          />
        </div>
      </div>

      {/* Finance Ledger */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#111827]">سجل المصاريف والمداخيل الإضافية</h2>
            <p className="text-xs text-slate-600 mt-0.5">التجهيزات، كراء الملاعب، التنقلات، الإعانات، والرعاية</p>
          </div>
          <span className="text-xs font-mono-num font-bold text-slate-600">{entries.length} حركة</span>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            title="لا توجد حركات مالية إضافية مسجلة."
            description="يمكنك تسجيل مصاريف النادي أو المداخيل الإضافية مثل الرعاية والإعانات لمتابعة الرصيد الصافي بدقة."
            action={
              <button
                type="button"
                onClick={() => openEntryModal('expense')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل أول مصروف أو مدخول</span>
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-bold">النوع</th>
                  <th className="py-2.5 px-3 font-bold">التصنيف</th>
                  <th className="py-2.5 px-3 font-bold">البيان</th>
                  <th className="py-2.5 px-3 font-bold">التاريخ</th>
                  <th className="py-2.5 px-3 font-bold">الطريقة</th>
                  <th className="py-2.5 px-3 font-bold">المرجع</th>
                  <th className="py-2.5 px-3 font-bold">المبلغ</th>
                  <th className="py-2.5 px-3 font-bold text-left">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <span className={`font-bold ${e.kind === 'income' ? 'text-emerald-700' : 'text-[#DC2626]'}`}>
                        {e.kind === 'income' ? 'مدخول' : 'مصروف'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{e.category}</td>
                    <td className="py-2.5 px-3 font-bold text-[#111827]">{e.title}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-600">{formatDateAr(e.date)}</td>
                    <td className="py-2.5 px-3 text-slate-700">{PAYMENT_METHOD_LABELS[e.method] || e.method}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-500">{e.receiptNumber || '—'}</td>
                    <td className={`py-2.5 px-3 font-mono-num font-extrabold ${e.kind === 'income' ? 'text-emerald-700' : 'text-[#DC2626]'}`}>
                      {e.kind === 'income' ? '+' : '-'} {formatMoney(e.amount, club.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(e.id)}
                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-[#DC2626] hover:border-[#DC2626]"
                        title="حذف الحركة المالية"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Finance Entry Modal */}
      <Modal open={entryModalOpen} title="تسجيل مصروف أو مدخول إضافي" onClose={() => setEntryModalOpen(false)} maxWidth="max-w-lg">
        <form onSubmit={handleCreateEntry} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() =>
                setEntryForm((prev) => ({
                  ...prev,
                  kind: 'expense',
                  category: EXPENSE_CATEGORIES[0],
                }))
              }
              className={`py-2.5 rounded-xl text-xs font-bold border min-h-[44px] ${
                entryForm.kind === 'expense'
                  ? 'bg-[#DC2626] border-[#DC2626] text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              تسجيل مصروف (-)
            </button>
            <button
              type="button"
              onClick={() =>
                setEntryForm((prev) => ({
                  ...prev,
                  kind: 'income',
                  category: INCOME_CATEGORIES[0],
                }))
              }
              className={`py-2.5 rounded-xl text-xs font-bold border min-h-[44px] ${
                entryForm.kind === 'income'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              تسجيل مدخول إضافي (+)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التصنيف *</label>
              <select
                value={entryForm.category}
                onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}
                className="wab-input"
              >
                {(entryForm.kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ ({club.currency}) *</label>
              <input
                type="number"
                required
                min={1}
                value={entryForm.amount || ''}
                onChange={(e) => setEntryForm({ ...entryForm, amount: Number(e.target.value) })}
                className="wab-input font-mono-num"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">البيان / الوصف *</label>
              <input
                type="text"
                required
                value={entryForm.title}
                onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
                placeholder={entryForm.kind === 'expense' ? 'مثال: شراء كرات ومستلزمات تدريب' : 'مثال: دعم بلدي أو مساهمة راعي'}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
              <input
                type="date"
                required
                value={entryForm.date}
                onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
              <select
                value={entryForm.method}
                onChange={(e) => setEntryForm({ ...entryForm, method: e.target.value as FinanceEntry['method'] })}
                className="wab-input"
              >
                <option value="cash">نقداً</option>
                <option value="ccp">بريدي موب / CCP</option>
                <option value="bank_transfer">تحويل بنكي</option>
                <option value="check">شيك</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفاتورة / المرجع (اختياري)</label>
            <input
              type="text"
              value={entryForm.receiptNumber}
              onChange={(e) => setEntryForm({ ...entryForm, receiptNumber: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
            <textarea
              rows={2}
              value={entryForm.notes}
              onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
              className="wab-input"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEntryModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ العملية
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
