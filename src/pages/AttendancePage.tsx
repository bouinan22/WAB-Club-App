import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, Printer, Save, X } from 'lucide-react';
import { EmptyState, PageHeader, StatCard } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { exportToExcel, printArabicPdfReport } from '../lib/export.ts';
import { ATTENDANCE_STATUS_LABELS, formatDateAr } from '../lib/labels.ts';
import type {
  AttendanceRecord,
  Category,
  ClubSettings,
  Player,
  PublicUser,
  TrainingSession,
} from '../types/wab.ts';

export const AttendancePage: React.FC<{
  user: PublicUser;
  club: ClubSettings;
}> = ({ user, club }) => {
  const canEdit = user.role === 'admin' || user.role === 'coach';
  const [categories, setCategories] = useState<Category[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));

  const [draftEntries, setDraftEntries] = useState<
    Record<string, { status: 'present' | 'absent' | 'excused'; notes: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cats, pls, trns, att] = await Promise.all([
        api.getCategories(),
        api.getPlayers(),
        api.getTrainings(),
        api.getAttendance(),
      ]);
      const allowedCats =
        user.role === 'coach' ? cats.filter((c) => user.categoryIds.includes(c.id)) : cats;
      setCategories(allowedCats);
      setPlayers(pls.filter((p) => p.status !== 'archived'));
      setSessions(trns);
      setRecords(att);

      const defaultCat = selectedCategory || allowedCats[0]?.id || '';
      setSelectedCategory(defaultCat);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user.id]);

  const categorySessions = useMemo(
    () => sessions.filter((s) => s.categoryId === selectedCategory),
    [sessions, selectedCategory],
  );

  useEffect(() => {
    if (categorySessions.length > 0 && !categorySessions.some((s) => s.id === selectedSession)) {
      setSelectedSession(categorySessions[0].id);
    } else if (categorySessions.length === 0) {
      setSelectedSession('');
    }
  }, [categorySessions]);

  const categoryPlayers = useMemo(
    () => players.filter((p) => p.categoryId === selectedCategory && p.status === 'active'),
    [players, selectedCategory],
  );

  useEffect(() => {
    const nextDraft: Record<string, { status: 'present' | 'absent' | 'excused'; notes: string }> = {};
    for (const p of categoryPlayers) {
      const existing = records.find(
        (r) => r.playerId === p.id && r.sessionId === selectedSession && r.date === selectedDate,
      );
      nextDraft[p.id] = existing
        ? { status: existing.status, notes: existing.notes || '' }
        : { status: 'present', notes: '' };
    }
    setDraftEntries(nextDraft);
  }, [categoryPlayers, selectedSession, selectedDate, records]);

  const playerAttendanceStats = useMemo(() => {
    const map = new Map<
      string,
      { monthlyRate: number; annualRate: number; total: number; present: number }
    >();
    for (const p of players) {
      const pRecs = records.filter((r) => r.playerId === p.id);
      const present = pRecs.filter((r) => r.status === 'present').length;
      const annualRate = pRecs.length > 0 ? Math.round((present / pRecs.length) * 100) : 0;

      const mRecs = pRecs.filter((r) => r.date.startsWith(reportMonth));
      const mPresent = mRecs.filter((r) => r.status === 'present').length;
      const monthlyRate = mRecs.length > 0 ? Math.round((mPresent / mRecs.length) * 100) : 0;

      map.set(p.id, { monthlyRate, annualRate, total: pRecs.length, present });
    }
    return map;
  }, [players, records, reportMonth]);

  const monthlyRecords = useMemo(
    () => records.filter((r) => r.date.startsWith(reportMonth)),
    [records, reportMonth],
  );

  const overallMonthlyRate = useMemo(() => {
    if (monthlyRecords.length === 0) return 0;
    const p = monthlyRecords.filter((r) => r.status === 'present').length;
    return Math.round((p / monthlyRecords.length) * 100);
  }, [monthlyRecords]);

  const overallAnnualRate = useMemo(() => {
    if (records.length === 0) return 0;
    const p = records.filter((r) => r.status === 'present').length;
    return Math.round((p / records.length) * 100);
  }, [records]);

  const handleSaveBatch = async () => {
    if (!selectedCategory || !selectedSession || categoryPlayers.length === 0) return;
    setSaving(true);
    setFeedback(null);
    try {
      const entries = categoryPlayers.map((p) => ({
        playerId: p.id,
        status: draftEntries[p.id]?.status || 'present',
        notes: draftEntries[p.id]?.notes || '',
      }));
      const res = await api.saveAttendanceBatch({
        categoryId: selectedCategory,
        sessionId: selectedSession,
        date: selectedDate,
        entries,
      });
      setFeedback(`تم حفظ سجل الحضور (${res.saved} لاعباً) بنجاح ومنع التكرار.`);
      await loadAll();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'تعذر حفظ الحضور.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportMonthlyExcel = () => {
    const rows = monthlyRecords.map((r) => ({
      'اللاعب': r.playerName,
      'الفئة': r.categoryId,
      'الحصة': r.sessionTitle,
      'التاريخ': r.date,
      'الحالة': ATTENDANCE_STATUS_LABELS[r.status] || r.status,
      'الملاحظات': r.notes || '—',
      'المسجل': r.recordedByName,
    }));
    exportToExcel(rows, `تقرير-الحضور-${reportMonth}`, 'الحضور الشهري');
  };

  const handlePrintMonthlyPdf = () => {
    printArabicPdfReport({
      title: `التقرير الشهري للحضور والغياب (${reportMonth})`,
      subtitle: `إجمالي السجلات: ${monthlyRecords.length}`,
      club,
      columns: ['اللاعب', 'الفئة', 'الحصة التدريبية', 'التاريخ', 'الحالة', 'ملاحظات'],
      rows: monthlyRecords.map((r) => [
        r.playerName,
        r.categoryId,
        r.sessionTitle,
        r.date,
        ATTENDANCE_STATUS_LABELS[r.status] || r.status,
        r.notes || '—',
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="نظام الحضور والغياب"
        subtitle={
          canEdit
            ? 'تسجيل حضور الحصص التدريبية وحساب النسبة الشهرية والسنوية مع منع التكرار التلقائي'
            : 'متابعة سجل حضور وغياب أبنائك في الحصص التدريبية'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="rounded-xl bg-white border border-slate-300 px-3 py-2 text-xs font-mono-num text-[#111827] min-h-[44px]"
            />
            <button
              type="button"
              onClick={handleExportMonthlyExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <Download className="w-4 h-4 text-[#14532D]" />
              <span>تصدير شهري Excel</span>
            </button>
            <button
              type="button"
              onClick={handlePrintMonthlyPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <Printer className="w-4 h-4 text-[#14532D]" />
              <span>تقرير PDF</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`نسبة الحضور للشهر (${reportMonth})`}
          value={`${overallMonthlyRate}%`}
          hint={`${monthlyRecords.length} سجل مسجل في هذا الشهر`}
          accent
        />
        <StatCard
          label="نسبة الحضور السنوية للموسم"
          value={`${overallAnnualRate}%`}
          hint={`${records.length} إجمالي سجلات الحضور`}
        />
        <StatCard
          label="نسبة الغياب المبرر / غير المبرر"
          value={`${records.length > 0 ? 100 - overallAnnualRate : 0}%`}
          hint={`${records.filter((r) => r.status === 'absent').length} غياب · ${records.filter((r) => r.status === 'excused').length} مبرر`}
        />
      </div>

      {canEdit && (
        <div className="wab-card rounded-2xl p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">الفئة العمرية</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="wab-input"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">الحصة التدريبية</label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="wab-input"
              >
                {categorySessions.length === 0 ? (
                  <option value="">لا توجد حصص لهذه الفئة — أنشئ حصة أولاً</option>
                ) : (
                  categorySessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.date})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ الحضور</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="wab-input font-mono-num"
              />
            </div>
          </div>

          {feedback && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              {feedback}
            </div>
          )}

          {loading ? (
            <div className="h-36 rounded-2xl bg-slate-200/70" />
          ) : categoryPlayers.length === 0 ? (
            <EmptyState
              title="لا يوجد لاعبون نشطون في هذه الفئة"
              description="أضف لاعبين نشطين لهذه الفئة من قسم إدارة اللاعبين."
            />
          ) : !selectedSession ? (
            <EmptyState
              title="يرجى برمجة حصة تدريبية أولاً"
              description="لا يمكن تسجيل الحضور بدون اختيار حصة تدريبية من برنامج الفئة."
            />
          ) : (
            <div className="space-y-3">
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                {categoryPlayers.map((p) => {
                  const entry = draftEntries[p.id] || { status: 'present', notes: '' };
                  const stats = playerAttendanceStats.get(p.id);
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#111827]">{p.fullName}</div>
                        <div className="text-xs text-slate-600">
                          الشهري:{' '}
                          <span className="font-mono-num text-[#111827] font-bold">
                            {stats ? `${stats.monthlyRate}%` : '0%'}
                          </span>
                          {' · '}
                          السنوي:{' '}
                          <span className="font-mono-num text-[#111827] font-bold">
                            {stats ? `${stats.annualRate}% (${stats.present}/${stats.total})` : '0%'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftEntries((prev) => ({
                                ...prev,
                                [p.id]: { ...entry, status: 'present' },
                              }))
                            }
                            className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[44px] ${
                              entry.status === 'present'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-600'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حاضر</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setDraftEntries((prev) => ({
                                ...prev,
                                [p.id]: { ...entry, status: 'absent' },
                              }))
                            }
                            className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[44px] ${
                              entry.status === 'absent'
                                ? 'bg-[#DC2626] border-[#DC2626] text-white'
                                : 'bg-white border-slate-300 text-slate-700 hover:border-[#DC2626]'
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>غائب</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setDraftEntries((prev) => ({
                                ...prev,
                                [p.id]: { ...entry, status: 'excused' },
                              }))
                            }
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[44px] whitespace-nowrap ${
                              entry.status === 'excused'
                                ? 'bg-amber-600 border-amber-600 text-white'
                                : 'bg-white border-slate-300 text-slate-700 hover:border-amber-600'
                            }`}
                          >
                            مبرر
                          </button>
                        </div>

                        <input
                          type="text"
                          value={entry.notes}
                          onChange={(e) =>
                            setDraftEntries((prev) => ({
                              ...prev,
                              [p.id]: { ...entry, notes: e.target.value },
                            }))
                          }
                          placeholder="ملاحظة..."
                          className="wab-input sm:w-44 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveBatch}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[44px]"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'جاري الحفظ...' : 'حفظ سجل الحضور'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historical Attendance Log */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#111827]">سجل الحضور السابق ({records.length})</h2>
        </div>
        {records.length === 0 ? (
          <EmptyState title="لا توجد سجلات حضور مسجلة" description="ستظهر السجلات هنا بمجرد تسجيل حضور أول حصة." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-bold">اللاعب</th>
                  <th className="py-2.5 px-3 font-bold">الفئة</th>
                  <th className="py-2.5 px-3 font-bold">الحصة</th>
                  <th className="py-2.5 px-3 font-bold">التاريخ</th>
                  <th className="py-2.5 px-3 font-bold">الحالة</th>
                  <th className="py-2.5 px-3 font-bold">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {records.slice(0, 50).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-[#111827]">{r.playerName}</td>
                    <td className="py-2.5 px-3 font-mono-num text-[#14532D] font-extrabold">{r.categoryId}</td>
                    <td className="py-2.5 px-3 text-slate-700">{r.sessionTitle}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-600">{formatDateAr(r.date)}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold ${
                          r.status === 'present'
                            ? 'text-emerald-700'
                            : r.status === 'excused'
                              ? 'text-amber-700'
                              : 'text-[#DC2626]'
                        }`}
                      >
                        {ATTENDANCE_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
