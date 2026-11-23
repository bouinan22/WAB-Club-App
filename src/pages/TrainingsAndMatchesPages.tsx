import React, { useEffect, useState } from 'react';
import { Calendar, Edit3, MapPin, Plus, Trash2, Trophy, XCircle } from 'lucide-react';
import { AvatarBadge, EmptyState, Modal, PageHeader } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { formatDateAr, MATCH_STATUS_LABELS, TRAINING_STATUS_LABELS } from '../lib/labels.ts';
import type { Category, ClubSettings, MatchRecord, PublicUser, TrainingSession } from '../types/wab.ts';

export const TrainingsPage: React.FC<{ user: PublicUser; club: ClubSettings }> = ({ user, club }) => {
  const canEdit = user.role === 'admin' || user.role === 'coach';
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingSession | null>(null);

  const [form, setForm] = useState({
    title: '',
    categoryId: 'U13',
    date: new Date().toISOString().slice(0, 10),
    startTime: '17:00',
    endTime: '18:30',
    venue: club.venues[0] || 'الملعب البلدي بوعنان',
    objectives: '',
    notes: '',
    status: 'scheduled' as TrainingSession['status'],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [trns, cats] = await Promise.all([api.getTrainings(), api.getCategories()]);
      const allowedCats =
        user.role === 'coach' ? cats.filter((c) => user.categoryIds.includes(c.id)) : cats;
      setSessions(trns);
      setCategories(allowedCats);
      if (allowedCats[0] && !allowedCats.some((c) => c.id === form.categoryId)) {
        setForm((prev) => ({ ...prev, categoryId: allowedCats[0].id }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user.id]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: '',
      categoryId: categories[0]?.id || 'U13',
      date: new Date().toISOString().slice(0, 10),
      startTime: '17:00',
      endTime: '18:30',
      venue: club.venues[0] || 'الملعب البلدي بوعنان',
      objectives: '',
      notes: '',
      status: 'scheduled',
    });
    setModalOpen(true);
  };

  const openEdit = (t: TrainingSession) => {
    setEditing(t);
    setForm({
      title: t.title,
      categoryId: t.categoryId,
      date: t.date,
      startTime: t.startTime,
      endTime: t.endTime,
      venue: t.venue,
      objectives: t.objectives,
      notes: t.notes || '',
      status: t.status,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.updateTraining(editing.id, form);
    } else {
      await api.createTraining(form);
    }
    setModalOpen(false);
    await load();
  };

  const handleCancelSession = async (t: TrainingSession) => {
    await api.updateTraining(t.id, { status: 'cancelled' });
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteTraining(id);
    await load();
  };

  const filtered = catFilter === 'all' ? sessions : sessions.filter((s) => s.categoryId === catFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.role === 'parent' ? 'جدول تدريبات الأبناء' : 'برامج والحصص التدريبية'}
        subtitle="تنظيم الحصص، الملاعب، والأهداف الفنية لكل فئة"
        actions={
          canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>برمجة حصة تدريبية</span>
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-1.5 bg-slate-100 border border-slate-200 p-1 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setCatFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
            catFilter === 'all' ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
          }`}
        >
          كل الفئات
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatFilter(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono-num ${
              catFilter === c.id ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            {c.code}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-slate-200/70" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="لا توجد تدريبات مبرمجة."
          description="ستظهر الحصص التدريبية المبرمجة لكل فئة هنا."
          action={
            canEdit ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>برمجة أول حصة تدريبية</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <div key={t.id} className="wab-card rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-mono-num font-extrabold text-[#14532D]">{t.categoryId}</div>
                  <h3 className="text-base font-extrabold text-[#111827] mt-0.5">{t.title}</h3>
                </div>
                <span
                  className={`text-xs font-bold ${
                    t.status === 'scheduled'
                      ? 'text-emerald-700'
                      : t.status === 'cancelled'
                        ? 'text-[#14532D]'
                        : 'text-slate-500'
                  }`}
                >
                  {TRAINING_STATUS_LABELS[t.status]}
                </span>
              </div>

              <div className="text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-[#14532D]" />
                  <span className="font-mono-num font-semibold text-[#111827]">
                    {formatDateAr(t.date)} · {t.startTime} – {t.endTime}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{t.venue}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <AvatarBadge name={t.coachName || 'مدرب'} photoUrl={t.coachPhotoUrl} size="sm" />
                  <span>
                    المدرب: <strong className="text-[#111827]">{t.coachName}</strong>
                  </span>
                </div>
              </div>

              {t.objectives && (
                <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[#111827] font-bold">أهداف الحصة: </span>
                  {t.objectives}
                </p>
              )}

              {t.notes && <p className="text-xs text-slate-500">ملاحظة: {t.notes}</p>}

              {canEdit && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                  {t.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => handleCancelSession(t)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 min-h-[40px]"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>إلغاء الحصة</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="mr-auto p-2 rounded-xl border border-red-200 bg-red-50 text-[#DC2626] hover:border-[#DC2626]"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title={editing ? 'تعديل حصة تدريبية' : 'برمجة حصة تدريبية جديدة'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الحصة *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الفئة العمرية *</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">من الساعة</label>
                <input
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="wab-input font-mono-num px-2"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">إلى الساعة</label>
                <input
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  className="wab-input font-mono-num px-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الملعب / المكان</label>
              <select
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                className="wab-input"
              >
                {club.venues.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الحالة</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TrainingSession['status'] })}
                className="wab-input"
              >
                <option value="scheduled">مبرمجة</option>
                <option value="completed">منتهية</option>
                <option value="cancelled">ملغاة</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">أهداف الحصة</label>
            <textarea
              rows={2}
              value={form.objectives}
              onChange={(e) => setForm({ ...form, objectives: e.target.value })}
              className="wab-input"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="wab-input"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ الحصة
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const MatchesPage: React.FC<{ user: PublicUser; club: ClubSettings }> = ({ user, club }) => {
  const canEdit = user.role === 'admin' || user.role === 'coach';
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MatchRecord | null>(null);

  const [form, setForm] = useState({
    opponent: '',
    categoryId: 'U15',
    date: new Date().toISOString().slice(0, 10),
    time: '15:00',
    venue: club.venues[0] || 'الملعب البلدي بوعنان',
    locationType: 'home' as MatchRecord['locationType'],
    status: 'scheduled' as MatchRecord['status'],
    goalsFor: 0,
    goalsAgainst: 0,
    technicalNotes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [mats, cats] = await Promise.all([api.getMatches(), api.getCategories()]);
      const allowedCats =
        user.role === 'coach' ? cats.filter((c) => user.categoryIds.includes(c.id)) : cats;
      setMatches(mats);
      setCategories(allowedCats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user.id]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      opponent: '',
      categoryId: categories[0]?.id || 'U15',
      date: new Date().toISOString().slice(0, 10),
      time: '15:00',
      venue: club.venues[0] || 'الملعب البلدي بوعنان',
      locationType: 'home',
      status: 'scheduled',
      goalsFor: 0,
      goalsAgainst: 0,
      technicalNotes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (m: MatchRecord) => {
    setEditing(m);
    setForm({
      opponent: m.opponent,
      categoryId: m.categoryId,
      date: m.date,
      time: m.time,
      venue: m.venue,
      locationType: m.locationType,
      status: m.status,
      goalsFor: m.goalsFor,
      goalsAgainst: m.goalsAgainst,
      technicalNotes: m.technicalNotes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) await api.updateMatch(editing.id, form);
    else await api.createMatch(form);
    setModalOpen(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteMatch(id);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز المباريات والنتائج"
        subtitle="جدول المواجهات الرسمية والودية، النتائج، والملاحظات الفنية"
        actions={
          canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مباراة</span>
            </button>
          )
        }
      />

      {loading ? (
        <div className="h-44 rounded-2xl bg-slate-200/70" />
      ) : matches.length === 0 ? (
        <EmptyState
          title="لا توجد مباريات مسجلة."
          description="ستظهر مباريات النادي القادمة والسابقة ونتائجها هنا."
          action={
            canEdit ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول مباراة</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {matches.map((m) => (
            <div key={m.id} className="wab-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  <strong className="text-[#14532D] font-mono-num">{m.categoryId}</strong> ·{' '}
                  {m.locationType === 'home' ? 'داخل الديار' : 'خارج الديار'} · {m.venue}
                </span>
                <span className="font-bold text-[#111827]">{MATCH_STATUS_LABELS[m.status]}</span>
              </div>

              {/* Crisp Carbon Black Scoreboard Match Strip */}
              <div className="rounded-2xl bg-[#111827] p-4 grid grid-cols-3 items-center text-center gap-2 text-white">
                <div className="flex flex-col items-center gap-1.5">
                  <img
                    src={club.logoUrl}
                    alt={club.clubShortName}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-contain bg-white p-0.5"
                  />
                  <span className="text-xs font-bold text-white">{club.clubShortName}</span>
                </div>

                <div>
                  {m.status === 'completed' ? (
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono-num text-white">
                      {m.goalsFor} <span className="text-[#14532D]">:</span> {m.goalsAgainst}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="text-lg font-extrabold font-mono-num text-[#14532D]">{m.time}</div>
                      <div className="text-[11px] font-mono-num text-slate-300">{formatDateAr(m.date)}</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-slate-200" />
                  </div>
                  <span className="text-xs font-bold text-slate-100 truncate max-w-full">{m.opponent}</span>
                </div>
              </div>

              {m.technicalNotes && (
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[#111827] font-bold">ملاحظات فنية: </span>
                  {m.technicalNotes}
                </p>
              )}

              {canEdit && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#14532D]" />
                    <span>تعديل / تسجيل النتيجة</span>
                  </button>
                  {user.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      className="p-2 rounded-xl border border-red-200 bg-red-50 text-[#DC2626] hover:border-[#DC2626]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title={editing ? 'تحديث بيانات المباراة' : 'إضافة مباراة جديدة'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفريق المنافس *</label>
              <input
                type="text"
                required
                value={form.opponent}
                onChange={(e) => setForm({ ...form, opponent: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الفئة العمرية *</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="wab-input"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المباراة *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">التوقيت *</label>
              <input
                type="time"
                required
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الملعب</label>
              <input
                type="text"
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مكان المواجهة</label>
              <select
                value={form.locationType}
                onChange={(e) => setForm({ ...form, locationType: e.target.value as MatchRecord['locationType'] })}
                className="wab-input"
              >
                <option value="home">داخل الديار</option>
                <option value="away">خارج الديار</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الحالة</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as MatchRecord['status'] })}
                className="wab-input"
              >
                <option value="scheduled">قادمة</option>
                <option value="completed">منتهية</option>
                <option value="postponed">مؤجلة</option>
                <option value="cancelled">ملغاة</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أهدافنا</label>
                <input
                  type="number"
                  min={0}
                  value={form.goalsFor}
                  onChange={(e) => setForm({ ...form, goalsFor: Number(e.target.value) })}
                  className="wab-input font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أهداف المنافس</label>
                <input
                  type="number"
                  min={0}
                  value={form.goalsAgainst}
                  onChange={(e) => setForm({ ...form, goalsAgainst: Number(e.target.value) })}
                  className="wab-input font-mono-num"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الملاحظات الفنية</label>
            <textarea
              rows={2}
              value={form.technicalNotes}
              onChange={(e) => setForm({ ...form, technicalNotes: e.target.value })}
              className="wab-input"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ المباراة
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
