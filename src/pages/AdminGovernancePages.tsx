import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Download,
  Edit3,
  KeyRound,
  Plus,
  Power,
  Printer,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import { EmptyState, Modal, PageHeader } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { exportToExcel, printArabicPdfReport } from '../lib/export.ts';
import { useLang } from '../lib/i18n.tsx';
import {
  ATTENDANCE_STATUS_LABELS,
  formatDateAr,
  formatMoney,
  MATCH_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PLAYER_STATUS_LABELS,
  ROLE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '../lib/labels.ts';
import type {
  ActivityLog,
  Category,
  ClubSettings,
  CoachReport,
  Player,
  PublicUser,
  UserRole,
} from '../types/wab.ts';

export const AccountsPage: React.FC = () => {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'parent' as UserRole,
    categoryIds: [] as string[],
    linkedPlayerIds: [] as string[],
  });

  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'parent' as UserRole,
    categoryIds: [] as string[],
    linkedPlayerIds: [] as string[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [u, c, pls] = await Promise.all([api.getUsers(), api.getCategories(), api.getPlayers()]);
      setUsers(u);
      setCategories(c);
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
      await api.createUser(form);
      setModalOpen(false);
      setForm({
        fullName: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        role: 'parent',
        categoryIds: [],
        linkedPlayerIds: [],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب.');
    }
  };

  const openEditModal = (u: PublicUser) => {
    setError(null);
    const linkedIds = players.filter((p) => p.parentUserId === u.id).map((p) => p.id);
    setEditTarget(u);
    setEditForm({
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      categoryIds: [...u.categoryIds],
      linkedPlayerIds: linkedIds,
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setError(null);
    try {
      await api.updateUser(editTarget.id, {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        categoryIds: editForm.role === 'coach' ? editForm.categoryIds : [],
        linkedPlayerIds: editForm.role === 'parent' ? editForm.linkedPlayerIds : undefined,
      });
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث الحساب.');
    }
  };

  const toggleActive = async (u: PublicUser) => {
    setError(null);
    try {
      await api.updateUser(u.id, { active: !u.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير حالة الحساب.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || newPassword.length < 6) return;
    await api.updateUser(resetTarget.id, { password: newPassword });
    setResetTarget(null);
    setNewPassword('');
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الحسابات والصلاحيات"
        subtitle="إدارة حسابات الإدارة، المدربين، والأولياء وربط الأبناء — محمية بصلاحيات الإدارة فقط"
        actions={
          <button
            type="button"
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء حساب جديد</span>
          </button>
        }
      />

      {error && !modalOpen && !editTarget && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-[#DC2626]">{error}</div>
      )}

      {loading ? (
        <div className="h-44 rounded-xl bg-gray-200/70" />
      ) : users.length === 0 ? (
        <EmptyState
          title="لا توجد حسابات مسجلة حالياً."
          description="أنشئ حسابات المدربين والأولياء من هنا للتحكم في صلاحيات الدخول."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء أول حساب</span>
            </button>
          }
        />
      ) : (
        <div className="wab-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                <tr>
                  <th className="py-3 px-4 font-bold">الاسم الكامل</th>
                  <th className="py-3 px-4 font-bold">البريد / المعرّف</th>
                  <th className="py-3 px-4 font-bold">الصلاحية</th>
                  <th className="py-3 px-4 font-bold">الفئات / الأبناء المرتبطون</th>
                  <th className="py-3 px-4 font-bold">الحالة</th>
                  <th className="py-3 px-4 font-bold text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-xs">
                {users.map((u) => {
                  const linkedKids = players.filter((p) => p.parentUserId === u.id);
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#111827]">{u.fullName}</div>
                        {u.phone && <div className="text-gray-500 font-mono-num">{u.phone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-gray-700 font-medium">{u.email}</div>
                        <div className="text-gray-400 font-mono-num">{u.username}</div>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-[#14532D]">{ROLE_LABELS[u.role]}</td>
                      <td className="py-3 px-4 text-gray-700">
                        {u.role === 'coach' ? (
                          <span className="font-mono-num font-semibold">
                            {u.categoryIds.length > 0 ? u.categoryIds.join(', ') : 'بدون فئة'}
                          </span>
                        ) : u.role === 'parent' ? (
                          <span>
                            {linkedKids.length > 0
                              ? linkedKids.map((k) => `${k.fullName} (${k.categoryId})`).join('، ')
                              : 'بدون أبناء مرتبطين'}
                          </span>
                        ) : (
                          'صلاحيات كاملة'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={u.active ? 'text-[#16A34A] font-bold' : 'text-[#DC2626] font-bold'}>
                          {u.active ? 'مفعل' : 'معطل'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-[#111827] hover:border-[#14532D]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetTarget(u);
                              setNewPassword('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-[#111827] hover:border-[#14532D]"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>كلمة المرور</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:border-[#14532D]"
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{u.active ? 'تعطيل' : 'تفعيل'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal open={modalOpen} title="إنشاء حساب مستخدم جديد" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-[#DC2626]">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الاسم الكامل *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">نوع الصلاحية *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="wab-input"
              >
                <option value="parent">ولي أمر (فضاء الأولياء)</option>
                <option value="coach">مدرب (فضاء المدربين)</option>
                <option value="admin">مدير نادي (إدارة كاملة)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">البريد الإلكتروني *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@wab-bouanan.dz"
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">كلمة المرور * (6 أحرف على الأقل)</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">اسم المستخدم (اختياري)</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="يُشتق تلقائياً إذا تُرك فارغاً"
                className="wab-input"
              />
            </div>
          </div>

          {form.role === 'coach' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">الفئات المسندة للمدرب</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const sel = form.categoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          categoryIds: sel
                            ? prev.categoryIds.filter((id) => id !== c.id)
                            : [...prev.categoryIds, c.id],
                        }))
                      }
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border ${
                        sel ? 'bg-[#14532D] border-[#14532D] text-white' : 'bg-white border-gray-300 text-gray-700'
                      }`}
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.role === 'parent' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">ربط الأبناء بحساب الولي (اختياري)</label>
              {players.length === 0 ? (
                <p className="text-xs text-gray-500">لا يوجد لاعبون مسجلون حالياً للربط؛ يمكنك ربطهم لاحقاً من هنا أو من صفحة اللاعبين.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                  {players.map((p) => {
                    const checked = form.linkedPlayerIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-[#111827] cursor-pointer p-1.5 rounded-lg hover:bg-white">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              linkedPlayerIds: checked
                                ? prev.linkedPlayerIds.filter((id) => id !== p.id)
                                : [...prev.linkedPlayerIds, p.id],
                            }))
                          }
                          className="accent-[#14532D]"
                        />
                        <span className="font-semibold">
                          {p.fullName} (<span className="font-mono-num text-[#14532D] font-bold">{p.categoryId}</span>)
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              إنشاء الحساب
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User & Linkages Modal */}
      <Modal
        open={!!editTarget}
        title={`تعديل الحساب والارتباطات: ${editTarget?.fullName || ''}`}
        onClose={() => setEditTarget(null)}
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-[#DC2626]">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الاسم الكامل *</label>
              <input
                type="text"
                required
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الصلاحية</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                className="wab-input"
              >
                <option value="parent">ولي أمر</option>
                <option value="coach">مدرب</option>
                <option value="admin">مدير نادي</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">البريد الإلكتروني *</label>
              <input
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="wab-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">الهاتف</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="wab-input font-mono-num"
              />
            </div>
          </div>

          {editForm.role === 'coach' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">الفئات المسندة للمدرب</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const sel = editForm.categoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          categoryIds: sel
                            ? prev.categoryIds.filter((id) => id !== c.id)
                            : [...prev.categoryIds, c.id],
                        }))
                      }
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border ${
                        sel ? 'bg-[#14532D] border-[#14532D] text-white' : 'bg-white border-gray-300 text-gray-700'
                      }`}
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {editForm.role === 'parent' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">الأبناء المرتبطون بهذا الولي</label>
              {players.length === 0 ? (
                <p className="text-xs text-gray-500">لا يوجد لاعبون مسجلون حالياً.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2.5 rounded-xl bg-gray-50 border border-gray-200">
                  {players.map((p) => {
                    const checked = editForm.linkedPlayerIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-[#111827] cursor-pointer p-1.5 rounded-lg hover:bg-white">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEditForm((prev) => ({
                              ...prev,
                              linkedPlayerIds: checked
                                ? prev.linkedPlayerIds.filter((id) => id !== p.id)
                                : [...prev.linkedPlayerIds, p.id],
                            }))
                          }
                          className="accent-[#14532D]"
                        />
                        <span className="font-semibold">
                          {p.fullName} (<span className="font-mono-num text-[#14532D] font-bold">{p.categoryId}</span>)
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              حفظ التعديلات
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={!!resetTarget}
        title={`تعيين كلمة مرور جديدة: ${resetTarget?.fullName}`}
        onClose={() => setResetTarget(null)}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">كلمة المرور الجديدة (6 أحرف على الأقل)</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="wab-input"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]">
              تحديث كلمة المرور
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const SettingsPage: React.FC<{
  club: ClubSettings;
  onClubUpdated: (next: ClubSettings) => void;
}> = ({ club, onClubUpdated }) => {
  const [form, setForm] = useState<ClubSettings>({ ...club });
  const [venuesText, setVenuesText] = useState(club.venues.join('\n'));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('فشل قراءة الصورة'));
      reader.readAsDataURL(file);
    });
    const { url } = await api.uploadImage(dataUrl, 'logo');
    setForm((prev) => ({ ...prev, logoUrl: url }));
  };

  const [downloadingBackup, setDownloadingBackup] = useState(false);

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setSavedMsg(null);
    try {
      const [
        clubSettings,
        categories,
        players,
        coaches,
        parents,
        subscriptions,
        payments,
        financeEntries,
        attendance,
        matches,
        trainings,
        evaluations,
        announcements,
        coachReports,
        activityLogs,
      ] = await Promise.all([
        api.getSettings(),
        api.getCategories(),
        api.getPlayers(),
        api.getCoaches(),
        api.getParents(),
        api.getSubscriptions(),
        api.getPayments(),
        api.getFinanceEntries(),
        api.getAttendance(),
        api.getMatches(),
        api.getTrainings(),
        api.getEvaluations(),
        api.getAnnouncements(),
        api.getCoachReports(),
        api.getActivityLogs(),
      ]);

      const backupData = {
        app: 'W.A.B Club Management',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        clubSettings,
        categories,
        players,
        coaches,
        parents,
        subscriptions,
        payments,
        financeEntries,
        attendance,
        matches,
        trainings,
        evaluations,
        announcements,
        coachReports,
        activityLogs,
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `WAB-Club-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSavedMsg('تم تحميل النسخة الاحتياطية (JSON) بنجاح وتخزينها محلياً على جهازك.');
    } catch (err) {
      setSavedMsg(err instanceof Error ? `خطأ أثناء إنشاء النسخة الاحتياطية: ${err.message}` : 'تعذر تحميل النسخة الاحتياطية.');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      const venues = venuesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await api.updateSettings({ ...form, venues });
      onClubUpdated(updated);
      setSavedMsg('تم حفظ إعدادات النادي والموسم الرياضي بنجاح وتطبيقها في المنصة والوصولات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات النادي والموسم الرياضي"
        subtitle="تخصيص اسم النادي، الشعار الرسمي، تواريخ الموسم والاشتراكات السنوية، وأماكن التدريب"
      />

      <form onSubmit={handleSave} className="wab-card rounded-2xl p-5 sm:p-6 space-y-5">
        {savedMsg && (
          <div className="rounded-xl border border-emerald-200 bg-[#DCFCE7] p-3 text-xs font-semibold text-[#14532D]">
            {savedMsg}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-gray-200">
          <img
            src={form.logoUrl}
            alt={form.clubName}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-2xl object-contain bg-white border border-gray-200 p-1"
          />
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-[#111827] cursor-pointer hover:border-[#14532D] min-h-[44px]">
              <Upload className="w-4 h-4 text-[#14532D]" />
              <span>تغيير شعار النادي</span>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            <p className="text-xs text-gray-500">يظهر الشعار تلقائياً في رأس المنصة، التقارير، ووصولات الدفع.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">اسم النادي</label>
            <input
              type="text"
              required
              value={form.clubName}
              onChange={(e) => setForm({ ...form, clubName: e.target.value })}
              className="wab-input"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">الاختصار الرسمي</label>
            <input
              type="text"
              required
              value={form.clubShortName}
              onChange={(e) => setForm({ ...form, clubShortName: e.target.value })}
              className="wab-input"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">الموسم الرياضي النشط</label>
            <input
              type="text"
              required
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ بداية الموسم</label>
            <input
              type="date"
              value={form.seasonStartDate}
              onChange={(e) => setForm({ ...form, seasonStartDate: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ نهاية الموسم</label>
            <input
              type="date"
              value={form.seasonEndDate}
              onChange={(e) => setForm({ ...form, seasonEndDate: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">رسوم الاشتراك السنوي الافتراضية ({form.currency})</label>
            <input
              type="number"
              min={0}
              value={form.defaultAnnualFee}
              onChange={(e) => setForm({ ...form, defaultAnnualFee: Number(e.target.value) })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">بداية صلاحية الاشتراكات</label>
            <input
              type="date"
              value={form.subscriptionStartDate}
              onChange={(e) => setForm({ ...form, subscriptionStartDate: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">نهاية صلاحية الاشتراكات</label>
            <input
              type="date"
              value={form.subscriptionEndDate}
              onChange={(e) => setForm({ ...form, subscriptionEndDate: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">العملة</label>
            <input
              type="text"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="wab-input"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">الهاتف</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="wab-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="wab-input"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">عنوان النادي</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="wab-input"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">اللون الأساسي (الأخضر الداكن)</label>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              className="w-full h-11 rounded-xl bg-white border border-gray-300 px-1 py-1"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">اللون الثانوي (الأخضر الفاتح)</label>
            <input
              type="color"
              value={form.secondaryColor}
              onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
              className="w-full h-11 rounded-xl bg-white border border-gray-300 px-1 py-1"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowInstallments}
                onChange={(e) => setForm({ ...form, allowInstallments: e.target.checked })}
                className="accent-[#14532D] w-4 h-4"
              />
              <span>السماح بالدفع بالتقسيط للاشتراكات السنوية</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">أماكن وملاعب التدريب (سطر لكل ملعب)</label>
          <textarea
            rows={3}
            value={venuesText}
            onChange={(e) => setVenuesText(e.target.value)}
            className="wab-input"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ إعدادات النادي'}</span>
          </button>
        </div>
      </form>

      {/* Local JSON Backup Download Card */}
      <div className="wab-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#14532D] flex items-center justify-center shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">النسخ الاحتياطي لبيانات النادي (ملف JSON)</h3>
            <p className="text-xs text-gray-500">تحميل نسخة احتياطية كاملة وشاملة لجميع بيانات النادي (اللاعبين، المدربين، الاشتراكات، الحسابات، والحركات المالية) لتخزينها محلياً على هاتفك أو حاسوبك.</p>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={downloadingBackup}
            className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>{downloadingBackup ? 'جاري تحضير النسخة الاحتياطية...' : 'تحميل النسخة الاحتياطية (ملف JSON)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    api.getActivityLogs().then(setLogs);
  }, []);

  const filtered = roleFilter === 'all' ? logs : logs.filter((l) => l.actorRole === roleFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل النشاطات والعمليات الحساسة"
        subtitle="مراقبة أمنية وتشغيلية لجميع التغييرات في النادي"
        actions={
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl bg-white border border-gray-300 px-3 py-2 text-xs font-bold text-[#111827] min-h-[44px]"
          >
            <option value="all">جميع المستخدمين</option>
            <option value="admin">الإدارة</option>
            <option value="coach">المدربون</option>
          </select>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState title="لا توجد نشاطات" description="ستظهر هنا كل العمليات المنفذة في النظام." />
      ) : (
        <div className="wab-card rounded-2xl divide-y divide-gray-200">
          {filtered.map((l) => (
            <div key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-start gap-3">
                <Activity className="w-4 h-4 text-[#14532D] mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-[#111827]">
                    {l.action} · <span className="text-gray-600 font-normal">{l.actorName}</span>
                  </div>
                  <div className="text-gray-500 mt-0.5">{l.details}</div>
                </div>
              </div>
              <div className="font-mono-num text-gray-500 shrink-0">{formatDateAr(l.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ReportsPage: React.FC<{ user: PublicUser; club: ClubSettings }> = ({ user, club }) => {
  const { t } = useLang();
  const isAdmin = user.role === 'admin';
  const [busy, setBusy] = useState<string | null>(null);

  // Coach Reports to Administration
  const [coachReports, setCoachReports] = useState<CoachReport[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reportForm, setReportForm] = useState({
    categoryId: user.categoryIds[0] || '',
    title: '',
    summary: '',
    recommendations: '',
  });
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const loadCoachReports = async () => {
    try {
      const [reps, cats] = await Promise.all([api.getCoachReports(), api.getCategories()]);
      setCoachReports(reps);
      const allowedCats = isAdmin ? cats : cats.filter((c) => user.categoryIds.includes(c.id));
      setCategories(allowedCats);
      if (!reportForm.categoryId && allowedCats[0]) {
        setReportForm((prev) => ({ ...prev, categoryId: allowedCats[0].id }));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadCoachReports();
  }, [user.id, user.role]);

  const handleSubmitCoachReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportFeedback(null);
    setReportBusy(true);
    try {
      await api.createCoachReport(reportForm);
      setReportFeedback({ ok: true, text: 'تم إرسال التقرير الفني إلى إدارة النادي بنجاح.' });
      setReportForm((prev) => ({ ...prev, title: '', summary: '', recommendations: '' }));
      await loadCoachReports();
    } catch (err) {
      setReportFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'تعذر إرسال التقرير.',
      });
    } finally {
      setReportBusy(false);
    }
  };

  const handleMarkReviewed = async (id: string) => {
    setReportBusy(true);
    try {
      await api.reviewCoachReport(id, { status: 'reviewed', adminNote: reviewNotes[id] || '' });
      await loadCoachReports();
    } finally {
      setReportBusy(false);
    }
  };

  const runReport = async (key: string, format: 'excel' | 'pdf') => {
    setBusy(`${key}-${format}`);
    try {
      if (key === 'players') {
        const pls = await api.getPlayers();
        if (format === 'excel') {
          exportToExcel(
            pls.map((p) => ({
              'الاسم': p.fullName,
              'الفئة': p.categoryId,
              'تاريخ الميلاد': p.birthDate,
              'تاريخ التسجيل': p.registrationDate,
              'الولي': p.parentName,
              'الهاتف': p.parentPhone,
              'الحالة': PLAYER_STATUS_LABELS[p.status],
            })),
            'تقرير-تسجيل-اللاعبين',
            'اللاعبون',
          );
        } else {
          printArabicPdfReport({
            title: 'تقرير تسجيل اللاعبين',
            club,
            columns: ['الاسم', 'الفئة', 'تاريخ التسجيل', 'الولي', 'الحالة'],
            rows: pls.map((p) => [p.fullName, p.categoryId, p.registrationDate, p.parentName, PLAYER_STATUS_LABELS[p.status]]),
          });
        }
      } else if (key === 'attendance') {
        const att = await api.getAttendance();
        if (format === 'excel') {
          exportToExcel(
            att.map((a) => ({
              'اللاعب': a.playerName,
              'الفئة': a.categoryId,
              'الحصة': a.sessionTitle,
              'التاريخ': a.date,
              'الحالة': ATTENDANCE_STATUS_LABELS[a.status],
            })),
            'تقرير-الحضور-والغياب',
            'الحضور',
          );
        } else {
          printArabicPdfReport({
            title: 'تقرير الحضور والغياب الشامل',
            club,
            columns: ['اللاعب', 'الفئة', 'الحصة', 'التاريخ', 'الحالة'],
            rows: att.map((a) => [a.playerName, a.categoryId, a.sessionTitle, a.date, ATTENDANCE_STATUS_LABELS[a.status]]),
          });
        }
      } else if (key === 'subscriptions' || key === 'revenue' || key === 'debts') {
        const subs = await api.getSubscriptions();
        const filtered =
          key === 'revenue'
            ? subs.filter((s) => s.paidAmount > 0)
            : key === 'debts'
              ? subs.filter((s) => s.status !== 'paid' && s.status !== 'exempt' && s.remainingAmount > 0)
              : subs;
        const titleMap: Record<string, string> = {
          subscriptions: 'تقرير الاشتراكات السنوية الشامل',
          revenue: 'تقرير المداخيل المحصلة من الاشتراكات',
          debts: 'تقرير الديون والمبالغ المتبقية للاشتراكات',
        };
        if (format === 'excel') {
          exportToExcel(
            filtered.map((s) => ({
              'اللاعب': s.playerName,
              'الفئة': s.categoryId,
              'الموسم': s.seasonName,
              'الرسوم السنوية': s.totalFee,
              'المدفوع': s.paidAmount,
              'المتبقي': s.remainingAmount,
              'الحالة': SUBSCRIPTION_STATUS_LABELS[s.status],
            })),
            `تقرير-${key}`,
            'الاشتراكات',
          );
        } else {
          printArabicPdfReport({
            title: titleMap[key],
            club,
            columns: ['اللاعب', 'الفئة', 'الموسم', 'الرسوم السنوية', 'المدفوع', 'المتبقي', 'الحالة'],
            rows: filtered.map((s) => [
              s.playerName,
              s.categoryId,
              s.seasonName,
              formatMoney(s.totalFee, club.currency),
              formatMoney(s.paidAmount, club.currency),
              formatMoney(s.remainingAmount, club.currency),
              SUBSCRIPTION_STATUS_LABELS[s.status],
            ]),
          });
        }
      } else if (key === 'finance_ledger') {
        const entries = await api.getFinanceEntries();
        if (format === 'excel') {
          exportToExcel(
            entries.map((e) => ({
              'النوع': e.kind === 'expense' ? 'مصروف' : 'مدخول إضافي',
              'التصنيف': e.category,
              'البيان': e.title,
              'الموسم': e.seasonName,
              'التاريخ': e.date,
              'المبلغ': e.amount,
              'الطريقة': PAYMENT_METHOD_LABELS[e.method] || e.method,
              'المرجع': e.receiptNumber || '—',
            })),
            'تقرير-المصاريف-والمداخيل',
            'المالية',
          );
        } else {
          printArabicPdfReport({
            title: 'تقرير سجل المصاريف والمداخيل الإضافية',
            club,
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
        }
      } else if (key === 'coaches') {
        const [coaches, logs] = await Promise.all([api.getCoaches(), api.getActivityLogs()]);
        const rows = coaches.map((c) => [
          { text: c.fullName, avatarUrl: c.photoUrl },
          c.categoryIds.join(', ') || '—',
          c.specialty,
          c.phone || '—',
          String(logs.filter((l) => l.actorId === c.userId).length),
          c.active ? 'مفعل' : 'معطل',
        ]);
        if (format === 'excel') {
          exportToExcel(
            coaches.map((c) => ({
              'المدرب': c.fullName,
              'الفئات': c.categoryIds.join(', '),
              'التخصص': c.specialty,
              'الهاتف': c.phone,
              'البريد الإلكتروني': c.email,
              'العمليات المسجلة': logs.filter((l) => l.actorId === c.userId).length,
              'الحالة': c.active ? 'مفعل' : 'معطل',
            })),
            'تقرير-نشاط-المدربين',
            'المدربون',
          );
        } else {
          printArabicPdfReport({
            title: 'تقرير الطاقم الفني ونشاط المدربين',
            club,
            columns: ['المدرب', 'الفئات المسندة', 'التخصص', 'الهاتف', 'العمليات', 'الحالة'],
            rows,
          });
        }
      } else if (key === 'categories') {
        const [cats, pls] = await Promise.all([api.getCategories(), api.getPlayers()]);
        const rows = cats.map((c) => {
          const base = [
            c.code,
            c.name,
            c.ageRange,
            String(pls.filter((p) => p.categoryId === c.id && p.status !== 'archived').length),
          ];
          return isAdmin ? [...base, formatMoney(c.annualFee ?? c.monthlyFee ?? 0, club.currency)] : base;
        });
        if (format === 'excel') {
          exportToExcel(
            cats.map((c) => {
              const row: Record<string, string | number> = {
                'الرمز': c.code,
                'الفئة': c.name,
                'النطاق العمري': c.ageRange,
                'عدد اللاعبين': pls.filter((p) => p.categoryId === c.id && p.status !== 'archived').length,
              };
              if (isAdmin) {
                row['الاشتراك السنوي'] = c.annualFee ?? c.monthlyFee ?? 0;
              }
              return row;
            }),
            'تقرير-إحصائيات-الفئات',
            'الفئات',
          );
        } else {
          printArabicPdfReport({
            title: 'تقرير إحصائيات الفئات العمرية',
            club,
            columns: isAdmin
              ? ['الرمز', 'الفئة', 'النطاق العمري', 'عدد اللاعبين', 'الاشتراك السنوي']
              : ['الرمز', 'الفئة', 'النطاق العمري', 'عدد اللاعبين'],
            rows,
          });
        }
      } else if (key === 'matches') {
        const mats = await api.getMatches();
        if (format === 'excel') {
          exportToExcel(
            mats.map((m) => ({
              'الفئة': m.categoryId,
              'المنافس': m.opponent,
              'التاريخ': m.date,
              'النتيجة': m.status === 'completed' ? `${m.goalsFor} - ${m.goalsAgainst}` : 'لم تلعب',
              'الحالة': MATCH_STATUS_LABELS[m.status],
            })),
            'تقرير-نتائج-المباريات',
            'المباريات',
          );
        } else {
          printArabicPdfReport({
            title: 'تقرير جدول ونتائج المباريات',
            club,
            columns: ['الفئة', 'المنافس', 'التاريخ', 'الملعب', 'النتيجة', 'الحالة'],
            rows: mats.map((m) => [
              m.categoryId,
              m.opponent,
              m.date,
              m.venue,
              m.status === 'completed' ? `${m.goalsFor} - ${m.goalsAgainst}` : '—',
              MATCH_STATUS_LABELS[m.status],
            ]),
          });
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const reportCards = [
    { key: 'players', title: 'تقرير تسجيل اللاعبين', desc: 'قائمة اللاعبين وحالاتهم وبيانات الأولياء', adminOnly: false },
    { key: 'attendance', title: 'تقرير الحضور والغياب', desc: 'تفاصيل الحضور والغياب والمبررات لكل حصة', adminOnly: false },
    { key: 'matches', title: 'تقرير نتائج المباريات', desc: 'جدول المباريات والنتائج والملاحظات الفنية', adminOnly: false },
    {
      key: 'categories',
      title: 'تقرير إحصائيات الفئات',
      desc: isAdmin ? 'توزيع اللاعبين والتسعيرة السنوية لكل فئة' : 'توزيع اللاعبين حسب كل فئة عمرية',
      adminOnly: false,
    },
    { key: 'subscriptions', title: 'تقرير الاشتراكات السنوية', desc: 'ملفات الاشتراكات الموسمية والمدفوع والمتبقي', adminOnly: true },
    { key: 'revenue', title: 'تقرير مداخيل الاشتراكات', desc: 'الاشتراكات المحصلة كلياً أو جزئياً', adminOnly: true },
    { key: 'debts', title: 'تقرير الديون والمبالغ المتبقية', desc: 'الاشتراكات غير المسددة والجزئية قيد التحصيل', adminOnly: true },
    { key: 'finance_ledger', title: 'تقرير المصاريف والمداخيل', desc: 'سجل النفقات والتجهيزات والإعانات المالية', adminOnly: true },
    { key: 'coaches', title: 'تقرير نشاط المدربين', desc: 'الفئات المسندة والعمليات الفنية للمدربين', adminOnly: true },
  ].filter((r) => isAdmin || !r.adminOnly);

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير والإحصائيات الرسمية"
        subtitle={
          isAdmin
            ? 'مراجعة تقارير المدربين، وتصدير ملفات Excel ووثائق PDF بهوية النادي'
            : 'إرسال التقارير الفنية للإدارة وتصدير إحصائيات الفئات المسندة'
        }
      />

      {/* Coach Submission Form (Coach Space) */}
      {user.role === 'coach' && (
        <div className="wab-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[#111827]">{t.sendReportToAdmin}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                أرسل ملخصاً فنياً أو تقرير انضباط وحضور لإحدى الفئات المسندة إليك مباشرة إلى لوحة الإدارة.
              </p>
            </div>
          </div>

          {reportFeedback && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
                reportFeedback.ok
                  ? 'border-emerald-200 bg-[#DCFCE7] text-[#14532D]'
                  : 'border-red-200 bg-red-50 text-[#DC2626]'
              }`}
            >
              {reportFeedback.text}
            </div>
          )}

          {categories.length === 0 ? (
            <p className="text-xs text-gray-500">لا توجد فئات مسندة لحسابك حالياً لإرسال تقارير.</p>
          ) : (
            <form onSubmit={handleSubmitCoachReport} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الفئة العمرية *</label>
                  <select
                    value={reportForm.categoryId}
                    onChange={(e) => setReportForm({ ...reportForm, categoryId: e.target.value })}
                    required
                    className="wab-input"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">عنوان التقرير *</label>
                  <input
                    type="text"
                    required
                    value={reportForm.title}
                    onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                    placeholder="مثال: تقرير التحضير البدني الأسبوعي لفئة U13"
                    className="wab-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الملخص الفني والملاحظات *</label>
                <textarea
                  rows={3}
                  required
                  value={reportForm.summary}
                  onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })}
                  placeholder="اكتب ملاحظات التدريب، مستوى اللاعبين، والحضور..."
                  className="wab-input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">التوصيات للإدارة (اختياري)</label>
                <input
                  type="text"
                  value={reportForm.recommendations}
                  onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })}
                  placeholder="احتياجات عتاد، برمجة مباراة ودية..."
                  className="wab-input"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={reportBusy}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] hover:bg-[#166534] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60 min-h-[44px]"
                >
                  <Send className="w-4 h-4" />
                  <span>{reportBusy ? 'جاري الإرسال...' : 'إرسال التقرير للإدارة'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Coach Reports List (Visible to Admin & Submitting Coach) */}
      <div className="wab-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-[#111827]">
            {isAdmin ? 'تقارير المدربين الواردة للإدارة' : t.coachReportsTitle}
          </h2>
          <span className="text-xs font-mono-num font-bold text-[#14532D] bg-[#DCFCE7] px-2.5 py-1 rounded-lg">
            {coachReports.length}
          </span>
        </div>

        {coachReports.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">
            {isAdmin ? 'لم يرسل المدربون تقارير جديدة بعد.' : 'لم ترسل أي تقارير بعد.'}
          </p>
        ) : (
          <div className="space-y-3">
            {coachReports.map((rep) => (
              <div key={rep.id} className="rounded-xl border border-gray-200 bg-[#F8FAFC] p-4 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-num text-xs font-extrabold text-[#14532D] bg-[#DCFCE7] px-2 py-0.5 rounded-md">
                      {rep.categoryId}
                    </span>
                    <h3 className="text-sm font-extrabold text-[#111827]">{rep.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold ${
                        rep.status === 'reviewed'
                          ? 'bg-[#DCFCE7] text-[#14532D]'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rep.status === 'reviewed' ? 'تمت المراجعة' : 'قيد المراجعة'}
                    </span>
                    <span className="font-mono-num text-gray-500">{formatDateAr(rep.createdAt)}</span>
                  </div>
                </div>

                <div className="text-xs text-gray-500 font-semibold">المدرب: {rep.coachName}</div>
                <p className="text-xs text-gray-700 leading-relaxed">{rep.summary}</p>
                {rep.recommendations && (
                  <p className="text-xs text-[#14532D] font-semibold">التوصيات: {rep.recommendations}</p>
                )}
                {rep.adminNote && (
                  <div className="rounded-lg bg-white border border-gray-200 p-2.5 text-xs text-gray-700">
                    <strong className="text-[#14532D]">ملاحظة الإدارة:</strong> {rep.adminNote}
                  </div>
                )}

                {isAdmin && rep.status === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-200">
                    <input
                      type="text"
                      value={reviewNotes[rep.id] || ''}
                      onChange={(e) => setReviewNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))}
                      placeholder="ملاحظة أو توجيه للمدرب (اختياري)"
                      className="wab-input flex-1"
                    />
                    <button
                      type="button"
                      disabled={reportBusy}
                      onClick={() => handleMarkReviewed(rep.id)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#14532D] hover:bg-[#166534] px-4 py-2 text-xs font-bold text-white min-h-[40px]"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد المراجعة</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exportable PDF / Excel Reports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportCards.map((r) => (
          <div key={r.key} className="wab-card rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-base font-extrabold text-[#111827]">{r.title}</h3>
              <p className="text-xs text-gray-600 mt-1">{r.desc}</p>
            </div>
            <div className="flex items-center gap-2.5 pt-2 border-t border-gray-200">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => runReport(r.key, 'excel')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-2.5 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
              >
                <Download className="w-3.5 h-3.5 text-[#14532D]" />
                <span>تصدير Excel</span>
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => runReport(r.key, 'pdf')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#14532D] py-2.5 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>استخراج PDF</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
