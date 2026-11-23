import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { EmptyState, Modal, PageHeader } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { ANNOUNCEMENT_TYPE_LABELS, formatDateAr } from '../lib/labels.ts';
import type { Announcement, Category, NotificationItem, PublicUser } from '../types/wab.ts';

export const AnnouncementsPage: React.FC<{ user: PublicUser }> = ({ user }) => {
  const isAdmin = user.role === 'admin';
  const [list, setList] = useState<Announcement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'general' as Announcement['type'],
    targetAudience: 'all' as Announcement['targetAudience'],
    targetCategoryId: 'U13',
    pinned: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [anns, cats] = await Promise.all([api.getAnnouncements(), api.getCategories()]);
      setList(anns);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createAnnouncement(form);
    setModalOpen(false);
    setForm({
      title: '',
      body: '',
      type: 'general',
      targetAudience: 'all',
      targetCategoryId: 'U13',
      pinned: false,
    });
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteAnnouncement(id);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإعلانات والبلاغات الرسمية"
        subtitle="البلاغات العامة، إعلانات الفئات، تعديلات البرامج، وإلغاءات التدريب"
        actions={
          isAdmin && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>نشر إعلان جديد</span>
            </button>
          )
        }
      />

      {loading ? (
        <div className="h-44 rounded-2xl bg-slate-200/70" />
      ) : list.length === 0 ? (
        <EmptyState
          title="لا توجد إعلانات حالياً."
          description="ستظهر إعلانات إدارة النادي وبلاغاته الرسمية هنا فور نشرها."
          action={
            isAdmin ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>نشر أول إعلان</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {list.map((ann) => (
            <div key={ann.id} className="wab-card rounded-2xl p-5 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {ann.pinned && (
                      <span className="inline-flex items-center gap-1 text-[#14532D] font-bold">
                        <Pin className="w-3.5 h-3.5" />
                        <span>مثبت</span>
                      </span>
                    )}
                    <span className="font-bold text-[#14532D]">
                      {ANNOUNCEMENT_TYPE_LABELS[ann.type] || ann.type}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-slate-600 font-semibold">
                      {ann.targetAudience === 'all'
                        ? 'للجميع'
                        : ann.targetAudience === 'coaches'
                          ? 'للمدربين'
                          : ann.targetAudience === 'parents'
                            ? 'للأولياء'
                            : `فئة ${ann.targetCategoryId}`}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="font-mono-num text-slate-500">{formatDateAr(ann.createdAt)}</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-[#111827]">{ann.title}</h3>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(ann.id)}
                    className="p-2 rounded-xl border border-red-200 bg-red-50 text-[#DC2626] hover:border-[#DC2626]"
                    title="حذف الإعلان"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{ann.body}</p>
              <div className="text-[11px] text-slate-500 pt-1">المرسل: {ann.authorName}</div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="نشر إعلان جديد" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الإعلان *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="wab-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع الإعلان</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Announcement['type'] })}
                className="wab-input"
              >
                <option value="general">إعلان عام</option>
                <option value="category">خاص بفئة معينة</option>
                <option value="training_cancel">إلغاء تدريب</option>
                <option value="match">موعد مباراة</option>
                <option value="program_change">تغيير في البرنامج</option>
                <option value="admin_notice">إعلان إداري هام</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الجهة المستهدفة</label>
              <select
                value={form.targetAudience}
                onChange={(e) =>
                  setForm({ ...form, targetAudience: e.target.value as Announcement['targetAudience'] })
                }
                className="wab-input"
              >
                <option value="all">الجميع (المدربون والأولياء)</option>
                <option value="parents">الأولياء فقط</option>
                <option value="coaches">المدربون فقط</option>
                <option value="category">فئة عمرية محددة</option>
              </select>
            </div>
          </div>

          {form.targetAudience === 'category' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اختر الفئة المستهدفة</label>
              <select
                value={form.targetCategoryId}
                onChange={(e) => setForm({ ...form, targetCategoryId: e.target.value })}
                className="wab-input"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">نص الإعلان *</label>
            <textarea
              rows={4}
              required
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="wab-input"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="accent-[#14532D] w-4 h-4"
            />
            <span>تثبيت الإعلان في الأعلى وإرسال إشعار فوري للمستهدفين</span>
          </label>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Megaphone className="w-4 h-4" />
              <span>نشر الإعلان</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const NotificationsPage: React.FC<{ onUnreadCountChange?: (count: number) => void }> = ({
  onUnreadCountChange,
}) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [tab, setTab] = useState<'unread' | 'read' | 'all'>('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setItems(data);
      onUnreadCountChange?.(data.filter((n) => !n.read).length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    await load();
  };

  const markAll = async () => {
    await api.markAllNotificationsRead();
    await load();
  };

  const unreadList = items.filter((n) => !n.read);
  const readList = items.filter((n) => n.read);
  const shown = tab === 'unread' ? unreadList : tab === 'read' ? readList : items;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز الإشعارات"
        subtitle="الإشعارات الجديدة، المقروءة، وسجل التنبيهات"
        actions={
          unreadList.length > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
            >
              <CheckCheck className="w-4 h-4 text-[#14532D]" />
              <span>تحديد الكل كمقروء</span>
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-1.5 bg-slate-100 border border-slate-200 p-1 rounded-xl w-fit">
        {[
          { id: 'all', label: `سجل الإشعارات (${items.length})` },
          { id: 'unread', label: `الجديدة (${unreadList.length})` },
          { id: 'read', label: `المقروءة (${readList.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === t.id ? 'bg-[#14532D] text-white' : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-slate-200/70" />
      ) : shown.length === 0 ? (
        <EmptyState title="لا توجد إشعارات في هذا القسم" description="ستصلك إشعارات فورية عند صدور أي تحديث يخصك." />
      ) : (
        <div className="space-y-2.5">
          {shown.map((n) => (
            <div
              key={n.id}
              className={`wab-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                !n.read ? 'border-[#14532D]/40' : 'opacity-85'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    !n.read ? 'bg-[#DCFCE7] text-[#14532D]' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#111827]">{n.title}</div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                  <div className="text-[11px] font-mono-num text-slate-500 mt-1">{formatDateAr(n.createdAt)}</div>
                </div>
              </div>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#111827] hover:border-[#14532D] shrink-0 min-h-[40px]"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>تمت القراءة</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
