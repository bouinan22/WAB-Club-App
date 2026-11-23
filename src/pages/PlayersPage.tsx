import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Download,
  Edit3,
  Eye,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { PhotoUploader } from '../components/PhotoUploader.tsx';
import { PlayerProfileModal } from '../components/PlayerProfileModal.tsx';
import { AvatarBadge, ConfirmModal, EmptyState, Modal, PageHeader } from '../components/UI.tsx';
import { api, type ParentWithChildren } from '../lib/api.ts';
import { exportToExcel, printArabicPdfReport } from '../lib/export.ts';
import { formatDateAr, PLAYER_STATUS_LABELS } from '../lib/labels.ts';
import type { Category, ClubSettings, Player, PublicUser } from '../types/wab.ts';

export const PlayersPage: React.FC<{
  user: PublicUser;
  club: ClubSettings;
}> = ({ user, club }) => {
  const isAdmin = user.role === 'admin';
  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [parents, setParents] = useState<ParentWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);

  const [form, setForm] = useState<Partial<Player>>({
    fullName: '',
    photoUrl: '',
    birthDate: '2014-01-01',
    categoryId: 'U13',
    parentName: '',
    parentPhone: '',
    parentUserId: '',
    address: '',
    registrationDate: new Date().toISOString().slice(0, 10),
    status: 'active',
    jerseyNumber: undefined,
    position: '',
    adminNotes: '',
    medicalNotes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pls, cats] = await Promise.all([api.getPlayers(), api.getCategories()]);
      setPlayers(pls);
      setCategories(cats);
      if (isAdmin) {
        const pars = await api.getParents();
        setParents(pars);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q) {
        const match =
          p.fullName.toLowerCase().includes(q) ||
          p.parentName.toLowerCase().includes(q) ||
          p.parentPhone.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [players, search, categoryFilter, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setForm({
      fullName: '',
      photoUrl: '',
      birthDate: '2014-01-01',
      categoryId: categories[0]?.id || 'U13',
      parentName: '',
      parentPhone: '',
      parentUserId: '',
      address: '',
      registrationDate: new Date().toISOString().slice(0, 10),
      status: 'active',
      jerseyNumber: undefined,
      position: '',
      adminNotes: '',
      medicalNotes: '',
    });
    setFormOpen(true);
  };

  const openEdit = (p: Player) => {
    setEditing(p);
    setFormError(null);
    setForm({ ...p });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.updatePlayer(editing.id, form);
      } else {
        await api.createPlayer(form);
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر حفظ بيانات اللاعب.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: Player) => {
    await api.updatePlayer(p.id, { status: p.status === 'archived' ? 'active' : 'archived' });
    await loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.deletePlayer(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const handleExportExcel = () => {
    const rows = filtered.map((p) => ({
      'الاسم الكامل': p.fullName,
      'الفئة': p.categoryId,
      'تاريخ الميلاد': p.birthDate,
      'المركز': p.position || '—',
      'رقم القميص': p.jerseyNumber || '—',
      'اسم الولي': p.parentName,
      'هاتف الولي': p.parentPhone,
      'العنوان': p.address || '—',
      'تاريخ التسجيل': p.registrationDate,
      'الحالة': PLAYER_STATUS_LABELS[p.status] || p.status,
    }));
    exportToExcel(rows, `قائمة-اللاعبين-${categoryFilter}`, 'اللاعبون');
  };

  const handlePrintPdf = () => {
    printArabicPdfReport({
      title: 'القائمة الرسمية للاعبي النادي',
      subtitle: `الفئة: ${categoryFilter === 'all' ? 'جميع الفئات' : categoryFilter} · عدد اللاعبين: ${filtered.length}`,
      club,
      columns: ['الاسم الكامل', 'الفئة', 'تاريخ الميلاد', 'المركز', 'الولي', 'الهاتف', 'الحالة'],
      rows: filtered.map((p) => [
        p.fullName,
        p.categoryId,
        p.birthDate,
        p.position || '—',
        p.parentName || '—',
        p.parentPhone || '—',
        PLAYER_STATUS_LABELS[p.status] || p.status,
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.role === 'parent' ? 'أبنائي المسجلون في النادي' : 'إدارة اللاعبين'}
        subtitle={`إجمالي القائمة المعروضة: ${filtered.length} لاعب`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {filtered.length > 0 && (
              <>
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
                  <span>طباعة / PDF</span>
                </button>
              </>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة لاعب جديد</span>
              </button>
            )}
          </div>
        }
      />

      {/* Search & Filters */}
      <div className="wab-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، اسم الولي، أو رقم الهاتف..."
            className="wab-input pr-10"
          />
        </div>

        <div className="md:col-span-4">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="wab-input"
          >
            <option value="all">جميع الفئات العمرية</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="wab-input"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">متوقف مؤقتاً</option>
            {isAdmin && <option value="archived">مؤرشف</option>}
          </select>
        </div>
      </div>

      {/* Players Table / Cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <EmptyState
          title="لا يوجد لاعبون مسجلون حالياً."
          description={
            isAdmin
              ? 'ابدأ بإضافة أول لاعب إلى سجلات النادي وتعيين فئته العمرية وحساب ولي أمره.'
              : 'لم يتم تسجيل أي لاعبين في الفئات المخصصة لك حتى الآن.'
          }
          action={
            isAdmin && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول لاعب</span>
              </button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="لا يوجد لاعبون مطابقون للبحث"
          description="قم بتغيير معايير البحث أو التصفية لعرض نتائج أخرى."
        />
      ) : (
        <div className="wab-card rounded-2xl overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-3.5 px-4 font-bold">اللاعب</th>
                  <th className="py-3.5 px-4 font-bold">الفئة</th>
                  <th className="py-3.5 px-4 font-bold">تاريخ الميلاد</th>
                  <th className="py-3.5 px-4 font-bold">الولي والاتصال</th>
                  <th className="py-3.5 px-4 font-bold">الحالة</th>
                  <th className="py-3.5 px-4 font-bold text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <AvatarBadge name={p.fullName} photoUrl={p.photoUrl} size="sm" />
                        <div>
                          <button
                            type="button"
                            onClick={() => setProfilePlayerId(p.id)}
                            className="font-bold text-[#111827] hover:text-[#14532D] transition-colors text-right"
                          >
                            {p.fullName}
                          </button>
                          <div className="text-xs text-slate-500">
                            {p.position || 'لاعب'} {p.jerseyNumber ? `· رقم ${p.jerseyNumber}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono-num font-extrabold text-[#14532D]">{p.categoryId}</td>
                    <td className="py-3.5 px-4 font-mono-num text-slate-700">{formatDateAr(p.birthDate)}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#111827]">{p.parentName || '—'}</div>
                      <div className="text-xs font-mono-num text-slate-500">{p.parentPhone}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-bold ${
                          p.status === 'active'
                            ? 'text-emerald-700'
                            : p.status === 'inactive'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {PLAYER_STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setProfilePlayerId(p.id)}
                          className="p-2 rounded-lg border border-slate-200 bg-white hover:border-[#14532D] text-slate-700"
                          title="الملف الشخصي"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="p-2 rounded-lg border border-slate-200 bg-white hover:border-[#111827] text-slate-700"
                              title="تعديل"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchive(p)}
                              className="p-2 rounded-lg border border-slate-200 bg-white hover:border-amber-500 text-amber-700"
                              title={p.status === 'archived' ? 'استرجاع' : 'أرشفة'}
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              className="p-2 rounded-lg border border-red-200 bg-red-50 hover:border-[#DC2626] text-[#DC2626]"
                              title="حذف نهائي"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-slate-200">
            {filtered.map((p) => (
              <div key={p.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarBadge name={p.fullName} photoUrl={p.photoUrl} size="md" />
                    <div className="min-w-0">
                      <div className="font-bold text-[#111827] truncate">{p.fullName}</div>
                      <div className="text-xs text-slate-600">
                        <span className="text-[#14532D] font-extrabold font-mono-num">{p.categoryId}</span> ·{' '}
                        {PLAYER_STATUS_LABELS[p.status]}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfilePlayerId(p.id)}
                    className="px-3.5 py-2 rounded-xl bg-[#14532D] text-xs font-bold text-white shrink-0 min-h-[40px]"
                  >
                    الملف
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>الولي: {p.parentName || '—'}</span>
                  <span className="font-mono-num">{p.parentPhone}</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#111827] min-h-[44px]"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(p)}
                      className="flex-1 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-800 min-h-[44px]"
                    >
                      {p.status === 'archived' ? 'تفعيل' : 'أرشفة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="px-3.5 py-2.5 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-[#DC2626] min-h-[44px]"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Player Modal */}
      <Modal
        open={formOpen}
        title={editing ? `تعديل بيانات: ${editing.fullName}` : 'تسجيل لاعب جديد'}
        onClose={() => setFormOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-[#DC2626]">
              {formError}
            </div>
          )}

          <PhotoUploader
            name={form.fullName || 'لاعب'}
            value={form.photoUrl || ''}
            onChange={(url) => setForm((prev) => ({ ...prev, photoUrl: url }))}
            prefix="player"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم واللقب *</label>
              <input
                type="text"
                required
                value={form.fullName || ''}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="wab-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الميلاد *</label>
              <input
                type="date"
                required
                value={form.birthDate || ''}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الفئة العمرية *</label>
              <select
                value={form.categoryId || 'U13'}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">حالة اللاعب</label>
              <select
                value={form.status || 'active'}
                onChange={(e) => setForm({ ...form, status: e.target.value as Player['status'] })}
                className="wab-input"
              >
                <option value="active">نشط</option>
                <option value="inactive">متوقف مؤقتاً</option>
                <option value="archived">مؤرشف</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب الولي المرتبط</label>
              <select
                value={form.parentUserId || ''}
                onChange={(e) => {
                  const selected = parents.find((par) => par.id === e.target.value);
                  setForm({
                    ...form,
                    parentUserId: e.target.value,
                    parentName: selected ? selected.fullName : form.parentName,
                    parentPhone: selected ? selected.phone : form.parentPhone,
                  });
                }}
                className="wab-input"
              >
                <option value="">— بدون ربط بحساب ولي —</option>
                {parents.map((par) => (
                  <option key={par.id} value={par.id}>
                    {par.fullName} ({par.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الولي</label>
              <input
                type="text"
                value={form.parentName || ''}
                onChange={(e) => setForm({ ...form, parentName: e.target.value })}
                className="wab-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم هاتف الولي</label>
              <input
                type="text"
                value={form.parentPhone || ''}
                onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ التسجيل</label>
              <input
                type="date"
                value={form.registrationDate || ''}
                onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">عنوان السكن</label>
              <input
                type="text"
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="مثال: حي 5 جويلية، بوعنان"
                className="wab-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المركز في الملعب</label>
              <input
                type="text"
                value={form.position || ''}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder="مثال: وسط ميدان"
                className="wab-input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم القميص</label>
              <input
                type="number"
                min={1}
                max={99}
                value={form.jerseyNumber || ''}
                onChange={(e) =>
                  setForm({ ...form, jerseyNumber: e.target.value ? Number(e.target.value) : undefined })
                }
                className="wab-input font-mono-num"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الملاحظات الطبية والجاهزية (محمية)
            </label>
            <textarea
              rows={2}
              value={form.medicalNotes || ''}
              onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
              className="wab-input"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إدارية</label>
            <textarea
              rows={2}
              value={form.adminNotes || ''}
              onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
              className="wab-input"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[44px]"
            >
              {saving ? 'جاري الحفظ...' : editing ? 'حفظ التعديلات' : 'تسجيل اللاعب'}
            </button>
          </div>
        </form>
      </Modal>

      <PlayerProfileModal
        playerId={profilePlayerId}
        role={user.role}
        club={club}
        onClose={() => setProfilePlayerId(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="تأكيد حذف اللاعب"
        message={`هل أنت متأكد من حذف ملف اللاعب "${deleteTarget?.fullName}" نهائياً؟ يفضل الأرشفة للاحتفاظ بالسجلات.`}
        confirmLabel="حذف نهائي"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
