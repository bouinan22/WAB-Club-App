import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  Calendar,
  CheckSquare,
  Edit3,
  Eye,
  IdCard,
  Link2,
  Lock,
  Plus,
  Power,
  Trophy,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  Trash2,
} from 'lucide-react';
import { CoachProfileModal } from '../components/CoachProfileModal.tsx';
import { PhotoUploader } from '../components/PhotoUploader.tsx';
import { AvatarBadge, EmptyState, Modal, PageHeader, StatCard } from '../components/UI.tsx';
import { api, type CategoryOverview, type ParentWithChildren } from '../lib/api.ts';
import {
  ATTENDANCE_STATUS_LABELS,
  formatDateAr,
  formatMoney,
  MATCH_STATUS_LABELS,
  PLAYER_STATUS_LABELS,
  TRAINING_STATUS_LABELS,
} from '../lib/labels.ts';
import type { ActivityLog, Category, ClubSettings, Coach, Player } from '../types/wab.ts';

export const CoachesPage: React.FC<{ club: ClubSettings }> = ({ club }) => {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coach | null>(null);
  const [profileTarget, setProfileTarget] = useState<Coach | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    phone: '',
    specialty: '',
    trainingProgram: '',
    categoryIds: [] as string[],
    photoUrl: '',
    allowCoachPhotoEdit: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [c, cats, l] = await Promise.all([
        api.getCoaches(),
        api.getCategories(),
        api.getActivityLogs(),
      ]);
      setCoaches(c);
      setCategories(cats);
      setLogs(l);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setError(null);
    setForm({
      fullName: '',
      username: '',
      email: '',
      password: '',
      phone: '',
      specialty: '',
      trainingProgram: '',
      categoryIds: [],
      photoUrl: '',
      allowCoachPhotoEdit: false,
    });
    setModalOpen(true);
  };

  const openEdit = (c: Coach) => {
    setEditing(c);
    setError(null);
    setForm({
      fullName: c.fullName,
      username: '',
      email: c.email,
      password: '',
      phone: c.phone,
      specialty: c.specialty,
      trainingProgram: c.trainingProgram,
      categoryIds: [...c.categoryIds],
      photoUrl: c.photoUrl || '',
      allowCoachPhotoEdit: Boolean(c.allowCoachPhotoEdit),
    });
    setModalOpen(true);
  };

  const toggleCat = (catId: string) => {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(catId)
        ? prev.categoryIds.filter((id) => id !== catId)
        : [...prev.categoryIds, catId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.updateCoach(editing.id, {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          specialty: form.specialty,
          trainingProgram: form.trainingProgram,
          categoryIds: form.categoryIds,
          photoUrl: form.photoUrl,
          allowCoachPhotoEdit: form.allowCoachPhotoEdit,
        });
      } else {
        await api.createCoach(form);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ بيانات المدرب.');
    }
  };

  const toggleActive = async (c: Coach) => {
    await api.updateCoach(c.id, { active: !c.active });
    await load();
  };

  const deleteCoachHandler = async (c: Coach) => {
    if (!window.confirm(`هل أنت متأكد من حذف المدرب ${c.fullName}؟`)) return;
    try {
      await api.deleteCoach(c.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل حذف المدرب.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة المدربين والطاقم الفني"
        subtitle="تعيين الفئات العمرية، البرامج التدريبية، وتفعيل حسابات المدربين"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
          >
            <UserPlus className="w-4 h-4" />
            <span>إنشاء حساب مدرب</span>
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : coaches.length === 0 ? (
        <EmptyState
          title="لم تتم إضافة أي مدرب بعد."
          description="أنشئ أول حساب مدرب وأسند إليه فئة أو أكثر للبدء في تسجيل الحضور والتقييمات."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة أول مدرب</span>
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {coaches.map((c) => {
            const coachLogsCount = logs.filter((l) => l.actorId === c.userId).length;
            return (
              <div key={c.id} className="wab-card rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <AvatarBadge name={c.fullName} photoUrl={c.photoUrl} size="lg" />
                    <div className="min-w-0 space-y-0.5">
                      <h3 className="text-base font-extrabold text-[#111827] truncate">{c.fullName}</h3>
                      <p className="text-xs font-bold text-[#14532D] truncate">{c.specialty}</p>
                      <p className="text-xs font-mono-num text-slate-600 truncate">{c.phone || 'بدون هاتف'}</p>
                      <p className="text-[11px] font-mono-num text-slate-500 truncate">{c.email}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0 space-y-1">
                    <div className={`text-xs font-bold ${c.active ? 'text-emerald-700' : 'text-[#14532D]'}`}>
                      {c.active ? 'حساب مفعل' : 'معطل'}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                      {c.allowCoachPhotoEdit ? (
                        <>
                          <Unlock className="w-3 h-3 text-emerald-700" />
                          <span>صورة ذاتية</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>إدارة فقط</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">الفئات المشرف عليها:</span>
                    <span className="font-mono-num font-extrabold text-[#14532D]">
                      {c.categoryIds.length > 0 ? c.categoryIds.join(' · ') : 'لم تسند فئة بعد'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">برنامج التدريب:</span>
                    <span className="text-[#111827] font-semibold truncate">{c.trainingProgram || 'غير محدد'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">النشاطات المسجلة:</span>
                    <span className="font-mono-num font-bold text-[#111827]">{coachLogsCount} عملية</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setProfileTarget(c)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#14532D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
                  >
                    <IdCard className="w-3.5 h-3.5" />
                    <span>بطاقة المدرب</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(c)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-[#14532D] min-h-[44px]"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{c.active ? 'تعطيل' : 'تفعيل'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCoachHandler(c)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 min-h-[44px]"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CoachProfileModal
        coach={profileTarget}
        club={club}
        logsCount={profileTarget ? logs.filter((l) => l.actorId === profileTarget.userId).length : 0}
        onClose={() => setProfileTarget(null)}
        onEdit={openEdit}
      />

      <Modal
        open={modalOpen}
        title={editing ? `تعديل بيانات المدرب: ${editing.fullName}` : 'إنشاء حساب مدرب جديد'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-[#DC2626]">{error}</div>}

          <PhotoUploader
            name={form.fullName || 'مدرب'}
            value={form.photoUrl}
            onChange={(url) => setForm((prev) => ({ ...prev, photoUrl: url }))}
            prefix="coach"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم *</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="coach_username"
                className="wab-input"
              />
            </div>
            {!editing && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور (6 أحرف+) *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="wab-input"
                />
              </div>
            )}
            <div className={editing ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-bold text-slate-700 mb-1">التخصص / الشهادة</label>
              <input
                type="text"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                placeholder="مثال: مدرب فئات شبانية / CAF C"
                className="wab-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">الفئات العمرية المسندة</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = form.categoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[40px] ${
                      selected
                        ? 'bg-[#14532D] border-[#14532D] text-white'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-[#14532D]'
                    }`}
                  >
                    {cat.code}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">برنامج التدريب المعتمد</label>
            <textarea
              rows={2}
              value={form.trainingProgram}
              onChange={(e) => setForm({ ...form, trainingProgram: e.target.value })}
              className="wab-input"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowCoachPhotoEdit}
              onChange={(e) => setForm({ ...form, allowCoachPhotoEdit: e.target.checked })}
              className="accent-[#14532D] w-4 h-4"
            />
            <span>السماح للمدرب بتعديل أو تغيير صورته الشخصية من لوحته الخاصة</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]"
            >
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              {editing ? 'حفظ التغييرات' : 'إنشاء الحساب'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const ParentsPage: React.FC = () => {
  const [parents, setParents] = useState<ParentWithChildren[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [linkingParent, setLinkingParent] = useState<ParentWithChildren | null>(null);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [pars, pls] = await Promise.all([api.getParents(), api.getPlayers()]);
      setParents(pars);
      setPlayers(pls.filter((p) => p.status !== 'archived'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser({ ...form, role: 'parent' });
      setModalOpen(false);
      setForm({ fullName: '', email: '', phone: '', password: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب الولي.');
    }
  };

  const toggleStatus = async (p: ParentWithChildren) => {
    await api.updateUser(p.id, { active: !p.active });
    await load();
  };

  const openLinkModal = (par: ParentWithChildren) => {
    setLinkingParent(par);
    setSelectedChildIds(par.children.map((c) => c.id));
  };

  const handleSaveLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingParent) return;
    await api.updateUser(linkingParent.id, { linkedPlayerIds: selectedChildIds });
    setLinkingParent(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الأولياء"
        subtitle="إنشاء حسابات الأولياء وربطهم بأبنائهم في النادي ومتابعة وضعيتهم"
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة حساب ولي</span>
          </button>
        }
      />

      {loading ? (
        <div className="h-44 rounded-2xl bg-slate-200/70" />
      ) : parents.length === 0 ? (
        <EmptyState
          title="لا توجد حسابات أولياء مسجلة حالياً."
          description="أنشئ أول حساب ولي أمر ثم اربطه بأبنائه اللاعبين ليتمكن من متابعتهم عبر فضاء الأولياء."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-sm font-bold text-white min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أول ولي</span>
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {parents.map((par) => (
            <div key={par.id} className="wab-card rounded-2xl p-5 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarBadge name={par.fullName} />
                  <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-[#111827] truncate">{par.fullName}</h3>
                    <div className="text-xs font-mono-num text-slate-500 truncate">
                      {par.email} · {par.phone || '—'}
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-bold shrink-0 ${par.active ? 'text-emerald-700' : 'text-[#14532D]'}`}>
                  {par.active ? 'مفعل' : 'معطل'}
                </span>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 text-xs">
                <div className="font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#14532D]" />
                    <span>الأبناء المسجلون ({par.children.length}):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openLinkModal(par)}
                    className="inline-flex items-center gap-1 text-[#14532D] font-bold hover:underline"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>ربط الأبناء</span>
                  </button>
                </div>
                {par.children.length === 0 ? (
                  <p className="text-slate-500">لا يوجد أبناء مرتبطون بهذا الحساب بعد.</p>
                ) : (
                  <ul className="space-y-1 text-[#111827] font-semibold">
                    {par.children.map((ch) => (
                      <li key={ch.id} className="flex items-center justify-between">
                        <span>{ch.fullName}</span>
                        <span className="font-mono-num text-[#14532D] font-extrabold">{ch.categoryId}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                <span className={par.unpaidCount > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                  {par.unpaidCount > 0 ? `${par.unpaidCount} اشتراك غير مكتمل` : 'الوضعية المالية مسواة'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleStatus(par)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
                >
                  {par.active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="إنشاء حساب ولي أمر" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-[#DC2626]">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور (6 أحرف+) *</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="wab-input"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              إنشاء حساب الولي
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!linkingParent}
        title={`ربط الأبناء بحساب: ${linkingParent?.fullName}`}
        onClose={() => setLinkingParent(null)}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveLinks} className="space-y-4">
          {players.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              لا يوجد لاعبون مسجلون حالياً. أضف لاعباً أولاً ثم قم بربطه بالولي.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2">
              {players.map((p) => {
                const checked = selectedChildIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs cursor-pointer ${
                      checked ? 'border-[#DC2626] bg-red-50/70' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedChildIds((prev) =>
                            checked ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                          )
                        }
                        className="accent-[#14532D] w-4 h-4"
                      />
                      <span className="font-bold text-[#111827]">{p.fullName}</span>
                    </span>
                    <span className="font-mono-num text-[#14532D] font-extrabold">{p.categoryId}</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLinkingParent(null)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]"
            >
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ الارتباط
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const CategoriesPage: React.FC<{ club: ClubSettings }> = ({ club }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', ageRange: '', annualFee: 16000, description: '' });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [overview, setOverview] = useState<CategoryOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'players' | 'coaches' | 'trainings' | 'matches' | 'attendance' | 'evaluations'>('players');

  const load = async () => {
    const [cats, pls, chs] = await Promise.all([api.getCategories(), api.getPlayers(), api.getCoaches()]);
    setCategories(cats);
    setPlayers(pls);
    setCoaches(chs);
  };

  useEffect(() => {
    load();
  }, []);

  const openCategoryDetail = async (catId: string) => {
    setSelectedCategoryId(catId);
    setDetailTab('players');
    setOverviewLoading(true);
    try {
      setOverview(await api.getCategoryOverview(catId));
    } finally {
      setOverviewLoading(false);
    }
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      ageRange: cat.ageRange,
      annualFee: cat.annualFee,
      description: cat.description,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await api.updateCategory(editing.id, form);
    setEditing(null);
    await load();
    if (selectedCategoryId === editing.id) {
      await openCategoryDetail(editing.id);
    }
  };

  if (selectedCategoryId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={overview ? `فئة ${overview.category.code} — ${overview.category.name}` : `فئة ${selectedCategoryId}`}
          subtitle={
            overview
              ? `${overview.category.ageRange} · الاشتراك السنوي: ${formatMoney(overview.category.annualFee, club.currency)}`
              : 'جاري تحميل تفاصيل الفئة...'
          }
          actions={
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId(null);
                setOverview(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <ArrowRight className="w-4 h-4 text-[#14532D]" />
              <span>العودة إلى قائمة الفئات</span>
            </button>
          }
        />

        {overviewLoading || !overview ? (
          <div className="h-64 rounded-2xl bg-slate-200/70" />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="اللاعبون المسجلون"
                value={overview.stats.totalPlayers}
                hint={`${overview.stats.activePlayers} لاعب نشط`}
                icon={<Users className="w-5 h-5" />}
              />
              <StatCard
                label="المدربون المشرفون"
                value={overview.coaches.length}
                hint={overview.coaches.map((c) => c.fullName).join(' · ') || 'غير معين'}
                icon={<UserCheck className="w-5 h-5" />}
              />
              <StatCard
                label="نسبة حضور الفئة"
                value={`${overview.stats.attendanceRate}%`}
                hint={`${overview.stats.trainingsCount} حصة · ${overview.stats.matchesCount} مباراة`}
                accent
                icon={<CheckSquare className="w-5 h-5" />}
              />
              <StatCard
                label="تحصيل اشتراكات الموسم"
                value={formatMoney(overview.stats.collectedRevenue, club.currency)}
                hint={`المتبقي: ${formatMoney(overview.stats.remainingDebt, club.currency)}`}
                icon={<Award className="w-5 h-5" />}
              />
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-100 border border-slate-200 p-1 rounded-xl w-fit">
              {[
                { id: 'players', label: `اللاعبون (${overview.players.length})` },
                { id: 'coaches', label: `المدربون (${overview.coaches.length})` },
                { id: 'trainings', label: `التدريبات (${overview.trainings.length})` },
                { id: 'matches', label: `المباريات (${overview.matches.length})` },
                { id: 'attendance', label: `الحضور (${overview.attendance.length})` },
                { id: 'evaluations', label: `التقييمات (${overview.evaluations.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id as typeof detailTab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    detailTab === t.id ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="wab-card rounded-2xl p-5">
              {detailTab === 'players' && (
                overview.players.length === 0 ? (
                  <EmptyState title="لا يوجد لاعبون في هذه الفئة" description="سجل أول لاعب في هذه الفئة من قسم اللاعبين." />
                ) : (
                  <div className="divide-y divide-slate-200 text-xs">
                    {overview.players.map((p) => (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <AvatarBadge name={p.fullName} photoUrl={p.photoUrl} size="sm" />
                          <div>
                            <div className="font-bold text-[#111827] text-sm">{p.fullName}</div>
                            <div className="text-slate-500">
                              {p.position || 'لاعب'} · الولي: {p.parentName || '—'}
                            </div>
                          </div>
                        </div>
                        <span className="font-bold text-emerald-700">{PLAYER_STATUS_LABELS[p.status]}</span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailTab === 'coaches' && (
                overview.coaches.length === 0 ? (
                  <EmptyState title="لا يوجد مدربون معينون لهذه الفئة" description="أسند هذه الفئة إلى مدرب من قسم إدارة المدربين." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {overview.coaches.map((c) => (
                      <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3.5 text-xs">
                        <AvatarBadge name={c.fullName} photoUrl={c.photoUrl} size="md" />
                        <div className="min-w-0 space-y-1">
                          <div className="text-sm font-extrabold text-[#111827] truncate">{c.fullName}</div>
                          <div className="text-[#14532D] font-bold">{c.specialty}</div>
                          <div className="text-slate-500 font-mono-num">{c.phone || '—'} · {c.email}</div>
                          <div className="text-slate-700">البرنامج: {c.trainingProgram || 'غير محدد'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailTab === 'trainings' && (
                overview.trainings.length === 0 ? (
                  <EmptyState title="لا توجد تدريبات مبرمجة لهذه الفئة" description="برمج حصة تدريبية من قسم برامج التدريب." />
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {overview.trainings.map((t) => (
                      <div key={t.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <AvatarBadge name={t.coachName || 'مدرب'} photoUrl={t.coachPhotoUrl} size="sm" />
                          <div className="min-w-0">
                            <div className="font-bold text-[#111827] text-sm flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                              <span className="truncate">{t.title}</span>
                            </div>
                            <div className="text-slate-500 mt-1">
                              {formatDateAr(t.date)} · {t.startTime}–{t.endTime} · {t.venue} · المدرب: {t.coachName}
                            </div>
                          </div>
                        </div>
                        <span className="font-bold text-slate-700 shrink-0">{TRAINING_STATUS_LABELS[t.status]}</span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailTab === 'matches' && (
                overview.matches.length === 0 ? (
                  <EmptyState title="لا توجد مباريات لهذه الفئة" description="أضف مباراة جديدة من قسم المباريات." />
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {overview.matches.map((m) => (
                      <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-[#111827] text-sm flex items-center gap-2">
                            <Trophy className="w-3.5 h-3.5 text-[#14532D]" />
                            <span>W.A.B ضد {m.opponent}</span>
                          </div>
                          <div className="text-slate-500 mt-1">
                            {formatDateAr(m.date)} · {m.venue}
                          </div>
                        </div>
                        <div className="text-left">
                          {m.status === 'completed' && (
                            <div className="font-mono-num font-extrabold text-[#111827] text-sm">
                              {m.goalsFor} - {m.goalsAgainst}
                            </div>
                          )}
                          <div className="text-slate-600 font-semibold">{MATCH_STATUS_LABELS[m.status]}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailTab === 'attendance' && (
                overview.attendance.length === 0 ? (
                  <EmptyState title="لا توجد سجلات حضور لهذه الفئة" description="ستظهر هنا جميع سجلات الحضور والغياب." />
                ) : (
                  <div className="divide-y divide-slate-200 text-xs">
                    {overview.attendance.map((a) => (
                      <div key={a.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[#111827]">{a.playerName}</span> ·{' '}
                          <span className="text-slate-600">{a.sessionTitle}</span> ·{' '}
                          <span className="font-mono-num text-slate-500">{formatDateAr(a.date)}</span>
                        </div>
                        <span
                          className={`font-bold ${
                            a.status === 'present'
                              ? 'text-emerald-700'
                              : a.status === 'excused'
                                ? 'text-amber-700'
                                : 'text-[#14532D]'
                          }`}
                        >
                          {ATTENDANCE_STATUS_LABELS[a.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailTab === 'evaluations' && (
                overview.evaluations.length === 0 ? (
                  <EmptyState title="لا توجد تقييمات فنية لهذه الفئة" description="ستظهر هنا التقييمات الفنية للاعبي الفئة." />
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {overview.evaluations.map((e) => (
                      <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-[#111827] text-sm">{e.playerName}</div>
                          <div className="text-slate-500">
                            {e.period} · المدرب: {e.coachName} · {formatDateAr(e.date)}
                          </div>
                        </div>
                        <div className="font-mono-num text-base font-extrabold text-[#14532D]">
                          {e.overallAverage} / 10
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفئات العمرية"
        subtitle="هيكلة الفئات الشبابية في نادي وداد أمل بوعنان (U7 إلى U17) مع صفحة تفصيلية لكل فئة"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const count = players.filter((p) => p.categoryId === cat.id && p.status !== 'archived').length;
          const catCoaches = coaches.filter((c) => c.categoryIds.includes(cat.id));
          return (
            <div key={cat.id} className="wab-card rounded-2xl p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-extrabold font-mono-num text-[#14532D]">{cat.code}</span>
                  <span className="text-xs font-mono-num font-bold text-slate-700">
                    {formatMoney(cat.annualFee, club.currency)} / موسم
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-[#111827]">{cat.name}</h3>
                <p className="text-xs text-slate-500">الفئة العمرية: {cat.ageRange}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{cat.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">عدد اللاعبين المسجلين</span>
                  <span className="font-mono-num font-extrabold text-[#111827]">{count}</span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-slate-600 block">المدربون المشرفون</span>
                  {catCoaches.length === 0 ? (
                    <span className="text-slate-400">غير معين</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {catCoaches.map((c) => (
                        <div
                          key={c.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1"
                        >
                          <AvatarBadge name={c.fullName} photoUrl={c.photoUrl} size="sm" />
                          <span className="text-[#111827] font-bold">{c.fullName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => openCategoryDetail(cat.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#14532D] text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>صفحة الفئة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(cat)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    تعديل التسعيرة
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} title={`تعديل فئة ${editing?.code}`} onClose={() => setEditing(null)} maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفئة</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="wab-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">النطاق العمري</label>
              <input
                type="text"
                required
                value={form.ageRange}
                onChange={(e) => setForm({ ...form, ageRange: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاشتراك السنوي ({club.currency})</label>
              <input
                type="number"
                required
                min={0}
                value={form.annualFee}
                onChange={(e) => setForm({ ...form, annualFee: Number(e.target.value) })}
                className="wab-input font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">وصف البرنامج التكويني</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="wab-input"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
